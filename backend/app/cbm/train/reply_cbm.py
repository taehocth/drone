# -*- coding: utf-8 -*-
"""
replay_cbm.py — 사고/의심 비행 .ulg 를 CNN-LSTM CBM 판정 로직에
오프라인으로 통과시켜 "언제 어떤 알람이 났을지"를 재생하는 스크립트.

배포된 inference.py 와 동일한 판정을 재현합니다:
  - UNIFIED 모델 + stats (models/UNIFIED/)
  - 8피처, yaw unwrap, 20윈도우 → 다음 프레임 예측
  - fail-count (임계 10회 연속, FAIL_THRESHOLDS_OVERRIDE 동일)
  - CUSUM (THRESHOLD 30 / DRIFT 0.25 / MU0_MARGIN 3.0 / MU0_MULT 동일)
  - volt 는 AI 제외(현행과 동일) — 단, 참고용으로 오차는 계산·표시함

사용법 (train 폴더에서):
    cd backend/app/cbm/train
    python replay_cbm.py "C:\\경로\\사고비행.ulg"

⚠️ 사고 로그는 ulog_files/ 나 csv_output/ 에 넣지 마세요 (학습 오염 방지).

출력:
  - 콘솔: 알람 타임라인 (비행 시작 후 몇 초에 어떤 피처가 알람)
  - replay_result.png : 피처별 오차 vs 임계값 그래프 (알람 시점 표시)
"""

import sys
import os
import numpy as np
import torch
import torch.nn as nn
import pickle
import matplotlib
matplotlib.rc("font", family="Malgun Gothic")
matplotlib.rc("axes", unicode_minus=False)

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from pyulog import ULog

# ══════════════════════════════════════════════
# 경로 (train 폴더 기준 상대경로 — inference 배포본과 동일 모델 사용)
# ══════════════════════════════════════════════
MODEL_PATH = "../models/UNIFIED/UNIFIED_best_model.pth"
PKL_PATH = "../models/UNIFIED/UNIFIED_stats.pkl"

# ══════════════════════════════════════════════
# 판정 파라미터 — inference.py 배포본과 반드시 동일하게 유지
# ══════════════════════════════════════════════
WIN_S = 20
DETECT_FAIL_CNT = 10
CUSUM_THRESHOLD = 30.0
CUSUM_DRIFT = 0.25
CUSUM_MU0_MARGIN = 3.0

FEATURE_COLS = [0, 1, 5, 6, 7, 8, 9, 10]  # 원본 27컬럼 중 8피처
YAW_COLS_ORIG = [5, 8]                     # 원본 좌표계 yaw (unwrap 대상)

FEATURE_NAMES = [
    "volt", "current",
    "att_cmd_yaw", "att_cmd_pitch", "att_cmd_roll",
    "att_state_yaw", "att_state_pitch", "att_state_roll",
]

AI_DISABLED_FEATURES = {"volt"}  # 현행 배포와 동일 (참고용 계산은 함)

FAIL_THRESHOLDS_OVERRIDE = {
    0: 0.8, 1: 0.5,
    2: 1.2, 3: 0.6, 4: 0.6,
    5: 1.2, 6: 0.6, 7: 0.6,
}

FEATURE_MU0_MULT = {
    "volt": 2.0, "current": 2.0,
    "att_cmd_yaw": 1.4, "att_cmd_pitch": 1.4, "att_cmd_roll": 1.4,
    "att_state_yaw": 1.4, "att_state_pitch": 1.4, "att_state_roll": 1.4,
}


# ══════════════════════════════════════════════
# .ulg → 27컬럼 배열 (ulg_to_csv.py 와 동일 로직, 품질필터 없음)
#   사고 로그는 짧거나 끊겨도 그대로 재생해야 하므로 필터를 걸지 않는다.
# ══════════════════════════════════════════════
def get_topic(ulog, name, multi_id=0):
    count = 0
    for d in ulog.data_list:
        if d.name == name:
            if count == multi_id:
                return d
            count += 1
    return None


def resample(ts_ref, ts_src, values):
    idx = np.searchsorted(ts_src, ts_ref, side="left")
    idx = np.clip(idx, 0, len(ts_src) - 1)
    return values[idx]


def ulg_to_array(path):
    ulog = ULog(path)
    bat = get_topic(ulog, "battery_status")
    gps = get_topic(ulog, "vehicle_global_position")
    attsp = get_topic(ulog, "vehicle_attitude_setpoint")
    att = get_topic(ulog, "vehicle_attitude")
    ekf = get_topic(ulog, "estimator_sensor_bias")
    gyro = get_topic(ulog, "sensor_gyro")
    accel = get_topic(ulog, "sensor_accel")
    act = get_topic(ulog, "actuator_outputs")

    required = {"battery_status": bat, "vehicle_global_position": gps,
                "vehicle_attitude_setpoint": attsp, "vehicle_attitude": att,
                "estimator_sensor_bias": ekf, "sensor_gyro": gyro,
                "sensor_accel": accel, "actuator_outputs": act}
    missing = [k for k, v in required.items() if v is None]
    if missing:
        raise RuntimeError(f"필수 토픽 없음: {missing} — 이 로그로는 재생 불가")

    ref_ts = gyro.data["timestamp"]

    q0 = resample(ref_ts, att.data["timestamp"], att.data["q[0]"])
    q1 = resample(ref_ts, att.data["timestamp"], att.data["q[1]"])
    q2 = resample(ref_ts, att.data["timestamp"], att.data["q[2]"])
    q3 = resample(ref_ts, att.data["timestamp"], att.data["q[3]"])
    yaw = np.arctan2(2 * (q0 * q3 + q1 * q2), 1 - 2 * (q2**2 + q3**2))
    pitch = np.arcsin(np.clip(2 * (q0 * q2 - q3 * q1), -1, 1))
    roll = np.arctan2(2 * (q0 * q1 + q2 * q3), 1 - 2 * (q1**2 + q2**2))

    cols = [
        resample(ref_ts, bat.data["timestamp"], bat.data["voltage_filtered_v"]),   # 0 volt
        resample(ref_ts, bat.data["timestamp"], bat.data["current_filtered_a"]),   # 1 current
        resample(ref_ts, gps.data["timestamp"], gps.data["lat"]),                  # 2
        resample(ref_ts, gps.data["timestamp"], gps.data["lon"]),                  # 3
        resample(ref_ts, gps.data["timestamp"], gps.data["alt"]),                  # 4
        resample(ref_ts, attsp.data["timestamp"], attsp.data["yaw_body"]),         # 5 cmd_yaw
        resample(ref_ts, attsp.data["timestamp"], attsp.data["pitch_body"]),       # 6
        resample(ref_ts, attsp.data["timestamp"], attsp.data["roll_body"]),        # 7
        yaw,                                                                        # 8 state_yaw
        pitch,                                                                      # 9
        roll,                                                                       # 10
    ]
    # 11~26 은 8피처 판정에 안 쓰이므로 0으로 채움 (컬럼 수만 맞춤)
    n = len(ref_ts)
    data = np.zeros((n, 27), dtype=np.float64)
    for i, c in enumerate(cols):
        data[:, i] = c
    t_sec = (ref_ts - ref_ts[0]) / 1e6  # 비행 시작 기준 초
    return data, t_sec


# ══════════════════════════════════════════════
# yaw unwrap (학습/추론과 동일 알고리즘, 원본 좌표계에서)
# ══════════════════════════════════════════════
def convert_yaw_sign(X, yaw_cols):
    X = X.copy()
    for col in yaw_cols:
        sign = X[0, col] >= 0
        for j in range(1, X.shape[0]):
            if not sign and X[j, col] > 0:
                t = X[j, col] - 2 * np.pi
                if abs(X[j, col] - X[j - 1, col]) > abs(t - X[j - 1, col]):
                    X[j, col] = t
            elif sign and X[j, col] < 0:
                t = X[j, col] + 2 * np.pi
                if abs(X[j, col] - X[j - 1, col]) > abs(t - X[j - 1, col]):
                    X[j, col] = t
    return X


# ══════════════════════════════════════════════
# 모델 (inference.py 와 동일 구조)
# ══════════════════════════════════════════════
class CNNLSTM(nn.Module):
    def __init__(self, win_s, num_features, output_dim,
                 filter_size=(3, 1), num_filters=32, lstm_hidden=128):
        super().__init__()
        self.conv = nn.Sequential(
            nn.Conv2d(1, num_filters, kernel_size=filter_size, padding="same"),
            nn.ReLU(),
            nn.Conv2d(num_filters, num_filters * 2, kernel_size=filter_size, padding="same"),
            nn.ReLU(),
        )
        self.lstm = nn.LSTM(num_filters * 2 * num_features, lstm_hidden, batch_first=True)
        self.fc = nn.Linear(lstm_hidden, output_dim)

    def forward(self, x):
        x = x.unsqueeze(1)
        x = self.conv(x)
        b, C, T, F = x.shape
        x = x.permute(0, 2, 1, 3).contiguous().view(b, T, C * F)
        _, (hn, _) = self.lstm(x)
        return self.fc(hn[-1])


# ══════════════════════════════════════════════
# 메인 리플레이
# ══════════════════════════════════════════════
def main():
    if len(sys.argv) < 2:
        print("사용법: python replay_cbm.py <사고비행.ulg 경로>")
        sys.exit(1)
    ulg_path = sys.argv[1]
    if not os.path.exists(ulg_path):
        print(f"파일 없음: {ulg_path}")
        sys.exit(1)

    print("=" * 60)
    print(" CBM 오프라인 리플레이 — 배포본과 동일 판정 로직")
    print("=" * 60)

    # ── 데이터 준비 ──────────────────────────
    print(f"[1/4] 로그 변환 중: {os.path.basename(ulg_path)}")
    data, t_sec = ulg_to_array(ulg_path)
    print(f"      행 {len(data)}개 / 비행 길이 {t_sec[-1]:.0f}초")
    print(f"      volt 평균 {data[:,0].mean():.1f}V / current 평균 {data[:,1].mean():.1f}A")

    # yaw unwrap → 8피처 슬라이스 (학습과 동일 순서)
    data_u = convert_yaw_sign(data, YAW_COLS_ORIG)
    feats = data_u[:, FEATURE_COLS]  # (N, 8)

    # ── 모델/통계 로드 ────────────────────────
    print("[2/4] 모델 로드 (models/UNIFIED — 배포본과 동일)")
    with open(PKL_PATH, "rb") as f:
        stats = pickle.load(f)
    mu = np.array(stats["mu"]).squeeze()
    sig = np.array(stats["sig"]).squeeze()
    sig[sig == 0] = 1e-7

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    ckpt = torch.load(MODEL_PATH, map_location=device, weights_only=False)
    n_out = ckpt["model_state_dict"]["fc.weight"].shape[0]
    model = CNNLSTM(WIN_S, len(FEATURE_COLS), n_out).to(device)
    model.load_state_dict(ckpt["model_state_dict"])
    model.eval()

    rmse_train = np.array(ckpt["rmse_train_list"], dtype=np.float32)
    n = min(n_out, len(FEATURE_COLS))

    # 임계값/기준선 — inference.py 와 동일 계산
    thresholds = rmse_train[:n] + sig[:n]
    for i, v in FAIL_THRESHOLDS_OVERRIDE.items():
        if i < n:
            thresholds[i] = v
    cusum_mu0 = (rmse_train[:n] / sig[:n] * CUSUM_MU0_MARGIN).astype(np.float32)
    for i in range(n):
        cusum_mu0[i] *= FEATURE_MU0_MULT.get(FEATURE_NAMES[i], 1.0)

    # ── 전체 윈도우 배치 추론 ────────────────
    print("[3/4] 윈도우 추론 중...")
    N = len(feats)
    if N < WIN_S + 1:
        print("행이 너무 적어 윈도우를 만들 수 없습니다.")
        sys.exit(1)

    X_norm = (feats - mu) / sig
    windows = np.stack([X_norm[k:k + WIN_S] for k in range(N - WIN_S)])   # (M, 20, 8)
    y_true_n = X_norm[WIN_S:]                                             # (M, 8)
    win_t = t_sec[WIN_S:]                                                 # 각 판정 시점(초)

    preds = []
    BATCH = 512
    with torch.no_grad():
        for i in range(0, len(windows), BATCH):
            xb = torch.tensor(windows[i:i + BATCH], dtype=torch.float32).to(device)
            preds.append(model(xb).cpu().numpy())
    y_pred_n = np.concatenate(preds)

    err = np.abs((y_pred_n - y_true_n) * sig[:n])   # 원본 스케일 오차
    err_norm = np.abs(y_pred_n - y_true_n)          # 정규화 오차 (CUSUM용)

    # ── 순차 판정 재생 (fail-count + CUSUM 상태 머신) ──
    print("[4/4] 판정 재생 중...")
    fail_cnt = np.zeros(n, dtype=int)
    S = np.zeros(n, dtype=np.float32)
    alarms = []  # (t, feature, method, value)

    for k in range(len(err)):
        for j in range(n):
            name = FEATURE_NAMES[j]
            skip = name in AI_DISABLED_FEATURES
            # fail-count
            if not skip:
                if err[k, j] >= thresholds[j]:
                    fail_cnt[j] += 1
                    if fail_cnt[j] >= DETECT_FAIL_CNT:
                        alarms.append((win_t[k], name, "fail_count", err[k, j]))
                        fail_cnt[j] = 0
                else:
                    fail_cnt[j] = 0
                # CUSUM
                S[j] = max(0.0, S[j] + (err_norm[k, j] - cusum_mu0[j] - CUSUM_DRIFT))
                if S[j] > CUSUM_THRESHOLD:
                    alarms.append((win_t[k], name, "cusum", S[j]))
                    S[j] = 0.0

    # ── 결과 출력 ─────────────────────────────
    print()
    print("=" * 60)
    print(f" 알람 타임라인 (총 {len(alarms)}건)")
    print("=" * 60)
    if not alarms:
        print(" (알람 없음 — 현행 임계값 기준으로는 이상 미탐지)")
    else:
        # 같은 피처 연속 알람은 묶어서 표시
        last = {}
        for t, name, method, val in alarms:
            key = (name, method)
            if key in last and t - last[key] < 5:
                last[key] = t
                continue
            last[key] = t
            unit = "V" if name == "volt" else ("A" if name == "current" else "")
            print(f"  [{t:7.1f}초] {name:16s} {method:10s} 값={val:.3f}{unit}")

    # volt 참고 정보 (AI 제외지만 오차는 보여줌)
    print()
    print(f" [참고] volt 오차 (AI 제외 상태): 평균 {err[:,0].mean():.2f}V / 최대 {err[:,0].max():.2f}V (임계 0.8V)")

    # ── 그래프 저장 ───────────────────────────
    fig, axes = plt.subplots(4, 2, figsize=(16, 14), sharex=True)
    for j in range(n):
        ax = axes[j // 2][j % 2]
        ax.plot(win_t, err[:, j], linewidth=0.7, label="err")
        ax.axhline(thresholds[j], color="r", linestyle="--", linewidth=1,
                   label=f"threshold {thresholds[j]:.2f}")
        # 알람 시점 마킹
        marks = [t for (t, nm, m, v) in alarms if nm == FEATURE_NAMES[j]]
        for m in marks:
            ax.axvline(m, color="orange", alpha=0.5, linewidth=0.8)
        title = FEATURE_NAMES[j]
        if FEATURE_NAMES[j] in AI_DISABLED_FEATURES:
            title += " (AI 제외 — 참고용)"
        ax.set_title(title)
        ax.legend(fontsize=8)
        ax.grid(alpha=0.3)
    axes[-1][0].set_xlabel("비행 시간 (초)")
    axes[-1][1].set_xlabel("비행 시간 (초)")
    plt.tight_layout()
    out_png = "replay_result.png"
    plt.savefig(out_png, dpi=120)
    print(f"\n 그래프 저장: {out_png}")
    print(" → 사고 발생 시각과 그래프의 오차 급등/알람 시점을 대조해보세요.")


if __name__ == "__main__":
    main()