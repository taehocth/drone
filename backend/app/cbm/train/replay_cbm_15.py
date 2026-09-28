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
import matplotlib.ticker as mticker
from pyulog import ULog

# ══════════════════════════════════════════════
# 경로 (train 폴더 기준 상대경로 — inference 배포본과 동일 모델 사용)
# ══════════════════════════════════════════════
# ⚠️ 15피처 실험용 (기존 8 + pwm_dev4 + gyro_vib3, 원시 제외) — trainResult 현재본 사용 (배포본 아님)
MODEL_PATH = "trainResult/UNIFIED_best_model.pth"
PKL_PATH = "pkl_files/UNIFIED_stats.pkl"

# ══════════════════════════════════════════════
# 판정 파라미터 — inference.py 배포본과 반드시 동일하게 유지
# ══════════════════════════════════════════════
WIN_S = 20
DETECT_FAIL_CNT = 10   # 기본 연속 횟수 (기존 8피처 및 미지정 피처)

# ── 파생 피처 전용 튠 상수 (조기 경보 실험용) ─────────────
#   ※ 사고 로그(확정 시각)와 정상 로그(오탐 0 유지)를 반드시 쌍으로 검증할 것.
#   1.0 / 10 으로 두면 원안과 동일.
#   [실험 이력] thr×0.8 + M-of-N(3/6) → 정상 로그 오탐 86건 → 폐기.
#   현재: 임계 원안(×1.0), M-of-N 비활성, pwm_dev/gyro_vib 연속 횟수만 5 로 시험.
PWM_DEV_FAIL_CNT   = 5      # pwm_dev1~4 연속 횟수 (기본 10) — 정상 스파이크(1~2초)엔 안 걸릴 것으로 기대
PWM_DEV_THR_SCALE  = 1.0    # pwm_dev1~4 fail 임계 배율 (1.0 = 원안)
GYRO_VIB_FAIL_CNT  = 5      # gyro_vib_x/y/z 연속 횟수 (기본 10)
GYRO_VIB_THR_SCALE = 1.0    # gyro_vib 임계 배율

# ── "M of N" 빈도 판정 (파생 피처 전용, 연속 조건 보완) ──────
#   최근 N개 샘플 중 M개 이상이 임계를 넘으면 알람.
#   간헐적 스파이크로 시작되는 전조(사고 로그 822~836초 pwm_dev1·3)를 잡기 위한 규칙.
#   연속(fail_count)은 중간에 한 번만 내려가도 리셋되어 이런 전조를 놓친다.
#   (M, N) = (0, 0) 이면 비활성. 정상 로그 오탐 0 유지 여부를 반드시 확인할 것.
PWM_DEV_M_OF_N  = (0, 0)    # 비활성 — (3, 6)은 정상 로그에서 오탐 86건으로 폐기
GYRO_VIB_M_OF_N = (0, 0)    # 비활성
MOFN_COOLDOWN   = 6         # 한 번 알람 후 같은 피처 재알람까지 최소 간격(샘플) — 도배 방지

def _m_of_n_for(name: str):
    if name.startswith("pwm_dev"):
        return PWM_DEV_M_OF_N
    if name.startswith("gyro_vib"):
        return GYRO_VIB_M_OF_N
    return (0, 0)

def _fail_cnt_for(name: str) -> int:
    if name.startswith("pwm_dev"):
        return PWM_DEV_FAIL_CNT
    if name.startswith("gyro_vib"):
        return GYRO_VIB_FAIL_CNT
    return DETECT_FAIL_CNT
CUSUM_THRESHOLD = 30.0
CUSUM_DRIFT = 0.25
CUSUM_MU0_MARGIN = 3.0

FEATURE_COLS = [0, 1, 5, 6, 7, 8, 9, 10,
                27, 28, 29, 30,
                31, 32, 33]
YAW_COLS_ORIG = [5, 8]                     # 원본 좌표계 yaw (unwrap 대상)

FEATURE_NAMES = [
    "volt", "current",
    "att_cmd_yaw", "att_cmd_pitch", "att_cmd_roll",
    "att_state_yaw", "att_state_pitch", "att_state_roll",
    "pwm_dev1", "pwm_dev2", "pwm_dev3", "pwm_dev4",
    "gyro_vib_x", "gyro_vib_y", "gyro_vib_z",
]

AI_DISABLED_FEATURES = {"volt"}  # 현행 배포와 동일 (참고용 계산은 함)

# ── 그래프 이벤트 마커 ──────────────────────────────
#   (시각[초], 라벨, 색) — 모든 패널에 세로 점선으로 표시됨.
#   ※ 로그마다 사건 시각이 다르므로, 다른 로그를 돌릴 땐 수정하거나 비우세요: EVENT_MARKERS = []
EVENT_MARKERS = [
    (841.9, "GPS 상실 (841s)", "blue"),
    (979.0, "추락/로그 종료 (979s)", "black"),
]

# ── 이상 시작 시각(onset) 산출 설정 ──────────────────
#   평시 구간에서 각 피처 오차의 평균+3σ 를 기준선으로 잡고,
#   그 기준선을 K초 연속 초과하기 시작한 첫 시각을 "이상 시작"으로 정의.
ONSET_BASELINE = (100.0, 700.0)  # 평시 구간 (초)
ONSET_K = 5                       # 연속 초과 요구 샘플 수 (≈5초)
ONSET_REF_T = 841.9               # 비교 기준 사건 (GPS 상실)

# ── 사고 직전 확대(줌) 그래프 설정 ───────────────────
ZOOM_RANGE = (780.0, 900.0)       # 확대 구간 (초)
ZOOM_FEATURES = ["pwm_dev1", "pwm_dev2", "pwm_dev3", "pwm_dev4",
                 "gyro_vib_x", "gyro_vib_z", "att_state_roll", "att_cmd_roll"]

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
    data = np.zeros((n, 34), dtype=np.float64)
    for i, c in enumerate(cols):
        data[:, i] = c
    # 신규 피처 원본 컬럼: 17-19 자이로, 20-22 가속도, 23-26 모터출력
    data[:, 17] = gyro.data["x"]
    data[:, 18] = gyro.data["y"]
    data[:, 19] = gyro.data["z"]
    data[:, 20] = resample(ref_ts, accel.data["timestamp"], accel.data["x"])
    data[:, 21] = resample(ref_ts, accel.data["timestamp"], accel.data["y"])
    data[:, 22] = resample(ref_ts, accel.data["timestamp"], accel.data["z"])
    data[:, 23] = resample(ref_ts, act.data["timestamp"], act.data["output[0]"])
    data[:, 24] = resample(ref_ts, act.data["timestamp"], act.data["output[1]"])
    data[:, 25] = resample(ref_ts, act.data["timestamp"], act.data["output[2]"])
    data[:, 26] = resample(ref_ts, act.data["timestamp"], act.data["output[3]"])

    # ── 파생 피처 (27~33): ulg_to_csv.py 34컬럼판과 동일 계산 ──
    #   27~30 pwm_dev1~4: 각 모터 − 4모터 평균 (추력 비대칭)
    #   31~33 gyro_vib:   자이로 1초 이동 표준편차 (진동 세기)
    import pandas as _pd
    dt = np.median(np.diff(ref_ts)) / 1e6
    fs = (1.0 / dt) if dt > 0 else 10.0
    win = max(5, int(round(fs * 1.0)))
    pwm_mean = (data[:, 23] + data[:, 24] + data[:, 25] + data[:, 26]) / 4.0
    for k_ in range(4):
        data[:, 27 + k_] = data[:, 23 + k_] - pwm_mean
    for k_, col_ in enumerate([17, 18, 19]):
        data[:, 31 + k_] = (
            _pd.Series(data[:, col_]).rolling(win, min_periods=1).std().fillna(0.0).to_numpy()
        )
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
    # 파생 피처 임계 배율 적용
    for i in range(n):
        if FEATURE_NAMES[i].startswith("pwm_dev"):
            thresholds[i] *= PWM_DEV_THR_SCALE
        elif FEATURE_NAMES[i].startswith("gyro_vib"):
            thresholds[i] *= GYRO_VIB_THR_SCALE
    print(f"      튠: pwm_dev fail_cnt={PWM_DEV_FAIL_CNT}, thr×{PWM_DEV_THR_SCALE} | "
          f"gyro_vib fail_cnt={GYRO_VIB_FAIL_CNT}, thr×{GYRO_VIB_THR_SCALE} | 기타 fail_cnt={DETECT_FAIL_CNT}")
    print(f"      M-of-N: pwm_dev {PWM_DEV_M_OF_N}, gyro_vib {GYRO_VIB_M_OF_N}, cooldown={MOFN_COOLDOWN}")
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
    from collections import deque as _deque
    mofn_hist = [_deque(maxlen=max(1, _m_of_n_for(FEATURE_NAMES[j])[1])) for j in range(n)]
    mofn_cool = np.zeros(n, dtype=int)
    S = np.zeros(n, dtype=np.float32)
    alarms = []  # (t, feature, method, value)

    for k in range(len(err)):
        for j in range(n):
            name = FEATURE_NAMES[j]
            skip = name in AI_DISABLED_FEATURES
            # fail-count
            if not skip:
                over_thr = err[k, j] >= thresholds[j]
                if over_thr:
                    fail_cnt[j] += 1
                    if fail_cnt[j] >= _fail_cnt_for(name):
                        alarms.append((win_t[k], name, "fail_count", err[k, j]))
                        fail_cnt[j] = 0
                else:
                    fail_cnt[j] = 0
                # M of N (빈도 판정) — 파생 피처만
                M_, N_ = _m_of_n_for(name)
                if N_ > 0:
                    mofn_hist[j].append(1 if over_thr else 0)
                    if mofn_cool[j] > 0:
                        mofn_cool[j] -= 1
                    if len(mofn_hist[j]) == N_ and sum(mofn_hist[j]) >= M_ and mofn_cool[j] == 0:
                        alarms.append((win_t[k], name, f"m_of_n({M_}/{N_})", err[k, j]))
                        mofn_cool[j] = MOFN_COOLDOWN
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
    alarms.sort(key=lambda a: a[0])
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

    # ── 이상 시작 시각(onset) 산출 ─────────────────────
    print()
    print("=" * 74)
    print(f" 이상 시작 시각 — 평시({ONSET_BASELINE[0]:.0f}~{ONSET_BASELINE[1]:.0f}초) 평균+3σ 를 {ONSET_K}초 연속 초과한 첫 시각")
    print(f" 기준 사건: GPS 상실 {ONSET_REF_T}초  (Δ가 음수 = GPS 상실보다 먼저 반응)")
    print("=" * 74)
    base_mask = (win_t >= ONSET_BASELINE[0]) & (win_t <= ONSET_BASELINE[1])
    print(f" {'피처':16s} {'평시평균':>9s} {'기준선':>9s} {'시작시각':>9s} {'Δ(vs GPS)':>10s}")
    print("-" * 74)
    onset_rows = []
    for j in range(n):
        base = err[base_mask, j]
        mu_b, sd_b = float(base.mean()), float(base.std())
        onset_thr = mu_b + 3.0 * sd_b
        over = err[:, j] > onset_thr
        onset_t = None
        run = 0
        for k in range(len(over)):
            if win_t[k] <= ONSET_BASELINE[1]:
                continue  # 평시 구간 이후부터 탐색
            run = run + 1 if over[k] else 0
            if run >= ONSET_K:
                onset_t = win_t[k - ONSET_K + 1]
                break
        name = FEATURE_NAMES[j]
        if onset_t is None:
            print(f" {name:16s} {mu_b:9.3f} {onset_thr:9.3f} {'-':>9s} {'-':>10s}")
        else:
            delta = onset_t - ONSET_REF_T
            mark = " ◀ GPS 이전!" if delta < 0 else ""
            print(f" {name:16s} {mu_b:9.3f} {onset_thr:9.3f} {onset_t:9.1f} {delta:+10.1f}{mark}")
            onset_rows.append((name, onset_t, delta))
    if onset_rows:
        first = min(onset_rows, key=lambda r: r[1])
        print("-" * 74)
        print(f" ▶ 최초 반응 피처: {first[0]}  ({first[1]:.1f}초, GPS 상실 대비 {first[2]:+.1f}초)")

    # ── 사고 직전 확대(줌) 그래프 ──────────────────────
    zmask = (win_t >= ZOOM_RANGE[0]) & (win_t <= ZOOM_RANGE[1])
    zoom_feats = [f for f in ZOOM_FEATURES if f in FEATURE_NAMES]
    if zmask.any() and zoom_feats:
        rows_z = (len(zoom_feats) + 1) // 2
        figz, axz = plt.subplots(rows_z, 2, figsize=(16, 3.2 * rows_z), sharex=True)
        axz = np.atleast_2d(axz)
        for i_, fname in enumerate(zoom_feats):
            j = FEATURE_NAMES.index(fname)
            ax = axz[i_ // 2][i_ % 2]
            ax.plot(win_t[zmask], err[zmask, j], linewidth=1.0, label="err")
            ax.axhline(thresholds[j], color="r", linestyle="--", linewidth=1, label="alarm threshold")
            for t_ev, _lbl, c_ev in EVENT_MARKERS:
                if ZOOM_RANGE[0] <= t_ev <= ZOOM_RANGE[1]:
                    ax.axvline(t_ev, color=c_ev, linestyle=":", linewidth=2.2)
            marks = [t for (t, nm, m, v) in alarms if nm == fname and ZOOM_RANGE[0] <= t <= ZOOM_RANGE[1]]
            for m_ in marks:
                ax.axvline(m_, color="orange", alpha=0.6, linewidth=1.0)
            ax.set_title(f"{fname} — 사고 직전 확대", fontsize=10)
            ax.xaxis.set_major_locator(mticker.MultipleLocator(10))
            ax.tick_params(labelbottom=True, labelsize=8)
            ax.grid(alpha=0.3)
            ax.legend(fontsize=7)
        for k_ in range(len(zoom_feats), rows_z * 2):
            axz[k_ // 2][k_ % 2].set_visible(False)
        figz.suptitle(f"사고 직전 확대 ({ZOOM_RANGE[0]:.0f}~{ZOOM_RANGE[1]:.0f}초) — 파랑점선=GPS 상실, 빨강파선=알람 임계, 주황=알람", fontsize=12)
        figz.tight_layout(rect=[0, 0, 1, 0.96])
        zoom_png = "replay_zoom_15feat.png"
        figz.savefig(zoom_png, dpi=130)
        print(f"\n 확대 그래프 저장: {zoom_png}")

    # ── 그래프 저장 ───────────────────────────
    fig, axes = plt.subplots(5, 3, figsize=(20, 16), sharex=True)
    for j in range(n):
        ax = axes[j // 3][j % 3]
        ax.plot(win_t, err[:, j], linewidth=0.7, label="err")
        ax.axhline(thresholds[j], color="r", linestyle="--", linewidth=1,
                   label=f"threshold {thresholds[j]:.2f}")
        # 알람 시점 마킹
        marks = [t for (t, nm, m, v) in alarms if nm == FEATURE_NAMES[j]]
        for m in marks:
            ax.axvline(m, color="orange", alpha=0.5, linewidth=0.8)
        # 이벤트 마커 (GPS 상실 등)
        for t_ev, _lbl, c_ev in EVENT_MARKERS:
            ax.axvline(t_ev, color=c_ev, linestyle=":", linewidth=2.0, alpha=0.95)
        title = FEATURE_NAMES[j]
        if FEATURE_NAMES[j] in AI_DISABLED_FEATURES:
            title += " (AI 제외 — 참고용)"
        if j >= 8:
            title += " [파생·암대풀림 겨냥]"
        ax.set_title(title)
        ax.legend(fontsize=8)
        ax.grid(alpha=0.3)
        # 모든 패널에 x축 값 표시 (100초 간격 눈금)
        ax.xaxis.set_major_locator(mticker.MultipleLocator(100))
        ax.tick_params(labelbottom=True, labelsize=8)
    for c_ in range(3):
        axes[-1][c_].set_xlabel("비행 시간 (초)")
    # 남는 축(25번째 이후) 숨김
    for k_ in range(n, 15):
        axes[k_ // 3][k_ % 3].set_visible(False)
    # 이벤트 범례 (좌상단 패널에 라벨 표시)
    if EVENT_MARKERS:
        from matplotlib.lines import Line2D
        ev_handles = [
            Line2D([0], [0], color=c_ev, linestyle=":", linewidth=1.6, label=_lbl)
            for (_t, _lbl, c_ev) in EVENT_MARKERS
        ]
        fig.legend(handles=ev_handles, loc="upper center", ncol=len(ev_handles),
                   fontsize=11, frameon=True, bbox_to_anchor=(0.5, 1.0))
    plt.tight_layout(rect=[0, 0, 1, 0.985])
    out_png = "replay_result_15feat.png"
    plt.savefig(out_png, dpi=120)
    print(f"\n 그래프 저장: {out_png}")
    print(" → 사고 발생 시각과 그래프의 오차 급등/알람 시점을 대조해보세요.")


if __name__ == "__main__":
    main()