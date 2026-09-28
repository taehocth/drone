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
# ⚠️ 20피처 실험용 (volt + current + 자세6 + pwm_dev4 + accel_vib3 + PX4 진동메트릭2 + 제어기 적분항3)
#    ※ 학습이 FEATURE_COLS 첫 원소 0(원시 volt)로 수행됨 — volt 는 6S/12S 혼재로 AI 제외 유지
#    ulg_to_csv.py 43컬럼판(v3)과 동일 계산. trainResult 현재본 사용 (배포본 아님)
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
#   [830초대 확정 시도] 사고 로그 줌: rate_integ_pitch 835초 0.09(임계 0.038), pwm_dev4 834초 ~100(임계 76)
#     → 적분항 임계 ×0.5 + 연속 3, pwm_dev 임계 ×0.7 + 연속 4  ⇒ 835~836초 확정 기대.
#     ※ 정상 로그 오탐 재검증 필수 (임계 하향은 오탐과 직결).
PWM_DEV_FAIL_CNT   = 4      # pwm_dev1~4 연속 횟수
PWM_DEV_THR_SCALE  = 0.7    # pwm_dev1~4 fail 임계 배율 (76 → 53)
GYRO_VIB_FAIL_CNT  = 5      # 진동 계열 연속 횟수
GYRO_VIB_THR_SCALE = 1.0    # 진동 계열 임계 배율
INTEG_FAIL_CNT     = 3      # rate_integ roll/pitch/yaw 연속 횟수
INTEG_THR_SCALE    = 0.5    # rate_integ 임계 배율 (0.038 → 0.019)

# ── 심각도 가중 확정 (Severity-weighted confirmation) ─────────
#   오차가 임계의 SEVERE_MULT 배 이상이면 SEVERE_FAIL_CNT 회 연속만으로 확정.
#   근거(사고 로그 줌 그래프): rate_integ_pitch 가 836초에 임계 2.4배로 수직 상승했으나
#   fail_cnt 5 때문에 841초에야 확정 — 지연의 전부가 '연속 5회' 대기였음.
#   정상 비행 스파이크는 대개 임계 1~1.3배 단발이라 이 조건에 걸리지 않음.
#   적용: 파생 피처(pwm_dev, accel_vib, vib metric, rate_integ)만. (0/0 이면 비활성)
SEVERE_MULT     = 2.0
SEVERE_FAIL_CNT = 2

def _severe_applies(name: str) -> bool:
    return name.startswith(("pwm_dev", "accel_vib", "gyro_vib", "rate_integ"))

# ── 2단계 경보: 적응형 "주의"(warning) ─────────────────────
#   고정 임계(위험) 이전 단계. 그 비행의 '직전 WARN_BASE_SEC 동안의 오차 분포'(인과적 이동 기준선)
#   대비 mean + WARN_SIGMA·σ 를 WARN_CONSEC 회 연속 초과하면 '주의' 발령.
#   사고 로그: rate_integ roll/pitch 가 833~834초(물리 사건 836.5 이전, 가속 하중 구간)에 해당.
#   정상 로그(onset 표): 100~700초 구간 반응 0건 → 오탐 위험 낮을 것으로 기대 (검증 필수).
#   실시간에서도 같은 방식(과거 데이터만 사용)으로 구현 가능.
WARN_ENABLE    = False   # 사용자 요청으로 비활성 — 위험 경보 자체를 앞당기는 방향으로 시험
WARN_BASE_SEC  = 300.0   # 기준선 창 길이 (초) — 직전 5분
WARN_GAP_SEC   = 10.0    # 기준선 창과 현재 사이 공백 (초) — 현재 이상이 기준선을 오염시키지 않게
WARN_SIGMA     = 3.0
WARN_CONSEC    = 4       # 연속 초과 요구 샘플 수
WARN_MIN_BASE  = 60      # 기준선 최소 샘플 수 (이륙 직후 미성숙 구간 억제)
WARN_COOLDOWN  = 15      # 같은 피처 재발령 최소 간격 (샘플)

def _warn_applies(name: str) -> bool:
    return name.startswith(("pwm_dev", "accel_vib", "gyro_vib", "rate_integ"))

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
    if name.startswith("rate_integ"):
        return INTEG_FAIL_CNT
    if name.startswith(("gyro_vib", "accel_vib")):
        return GYRO_VIB_FAIL_CNT
    return DETECT_FAIL_CNT
CUSUM_THRESHOLD = 30.0
CUSUM_DRIFT = 0.25
CUSUM_MU0_MARGIN = 3.0

FEATURE_COLS = [0, 1, 5, 6, 7, 8, 9, 10,
                27, 28, 29, 30,
                34, 35, 36,
                37, 38,
                39, 40, 41]
YAW_COLS_ORIG = [5, 8]                     # 원본 좌표계 yaw (unwrap 대상)

FEATURE_NAMES = [
    "volt", "current",
    "att_cmd_yaw", "att_cmd_pitch", "att_cmd_roll",
    "att_state_yaw", "att_state_pitch", "att_state_roll",
    "pwm_dev1", "pwm_dev2", "pwm_dev3", "pwm_dev4",
    "accel_vib_x", "accel_vib_y", "accel_vib_z",
    "accel_vib_metric", "gyro_vib_metric",
    "rate_integ_roll", "rate_integ_pitch", "rate_integ_yaw",
]

AI_DISABLED_FEATURES = {"volt"}  # 6S/12S 혼재 → 원시 volt 는 AI 제외 유지 (volt_cell 라운드에서 복귀 시험)

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
                 "att_state_roll", "att_state_pitch", "att_state_yaw",
                 "rate_integ_roll", "rate_integ_pitch", "rate_integ_yaw"]   # 10개 (5행×2열)

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
    rcs = get_topic(ulog, "rate_ctrl_status")
    imus = get_topic(ulog, "vehicle_imu_status")
    scomb = get_topic(ulog, "sensor_combined")

    # v3: 배터리 인스턴스 자동 선택 (실제 연결된 채널 = 최고 평균 전압)
    best, best_v = None, -1.0
    for d in ulog.data_list:
        if d.name == "battery_status":
            try:
                v = float(np.nanmean(d.data["voltage_v"]))
            except Exception:
                v = -1.0
            if v > best_v:
                best, best_v = d, v
    bat = best

    required = {"battery_status": bat, "vehicle_global_position": gps,
                "vehicle_attitude_setpoint": attsp, "vehicle_attitude": att,
                "estimator_sensor_bias": ekf, "sensor_gyro": gyro,
                "sensor_accel": accel, "actuator_outputs": act,
                "rate_ctrl_status": rcs, "vehicle_imu_status": imus}
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
    data = np.zeros((n, 43), dtype=np.float64)
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
    # 31~36 진동: sensor_combined(고주파) 1초 창 표준편차 — ulg_to_csv v3 와 동일
    def _windowed_std(ts_ref, ts_hr, vals, win_us=1_000_000):
        v = np.asarray(vals, dtype=np.float64); ts_hr = np.asarray(ts_hr)
        cs = np.concatenate([[0.0], np.cumsum(v)]); cs2 = np.concatenate([[0.0], np.cumsum(v * v)])
        hi = np.searchsorted(ts_hr, ts_ref, side="right"); lo = np.searchsorted(ts_hr, ts_ref - win_us, side="left")
        nn = np.maximum(hi - lo, 1); mean = (cs[hi] - cs[lo]) / nn
        out = np.sqrt(np.maximum((cs2[hi] - cs2[lo]) / nn - mean * mean, 0.0)); out[(hi - lo) < 2] = 0.0
        return out
    if scomb is not None:
        ts_hr = scomb.data["timestamp"]
        for i_ in range(3):
            data[:, 31 + i_] = _windowed_std(ref_ts, ts_hr, scomb.data[f"gyro_rad[{i_}]"])
            data[:, 34 + i_] = _windowed_std(ref_ts, ts_hr, scomb.data[f"accelerometer_m_s2[{i_}]"])
    else:
        for k_, col_ in enumerate([17, 18, 19]):
            data[:, 31 + k_] = _pd.Series(data[:, col_]).rolling(win, min_periods=1).std().fillna(0.0).to_numpy()
        for k_, col_ in enumerate([20, 21, 22]):
            data[:, 34 + k_] = _pd.Series(data[:, col_]).rolling(win, min_periods=1).std().fillna(0.0).to_numpy()
    # 37~38 PX4 진동 메트릭, 39~41 제어기 적분항
    data[:, 37] = resample(ref_ts, imus.data["timestamp"], imus.data["accel_vibration_metric"])
    data[:, 38] = resample(ref_ts, imus.data["timestamp"], imus.data["gyro_vibration_metric"])
    data[:, 39] = resample(ref_ts, rcs.data["timestamp"], rcs.data["rollspeed_integ"])
    data[:, 40] = resample(ref_ts, rcs.data["timestamp"], rcs.data["pitchspeed_integ"])
    data[:, 41] = resample(ref_ts, rcs.data["timestamp"], rcs.data["yawspeed_integ"])
    # 42 셀당 전압 (파일 중간 전압 ÷ 셀 수)
    n_cells = max(1, int(round(float(np.nanmedian(data[:, 0])) / 3.85)))
    data[:, 42] = data[:, 0] / n_cells
    print(f"      배터리 {float(np.nanmedian(data[:, 0])):.1f}V → {n_cells}S 판정 → volt_cell 중간 {float(np.nanmedian(data[:, 42])):.2f} V/cell")

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
        elif FEATURE_NAMES[i].startswith(("gyro_vib", "accel_vib")):
            thresholds[i] *= GYRO_VIB_THR_SCALE
        elif FEATURE_NAMES[i].startswith("rate_integ"):
            thresholds[i] *= INTEG_THR_SCALE
    print(f"      튠: pwm_dev fail_cnt={PWM_DEV_FAIL_CNT}, thr×{PWM_DEV_THR_SCALE} | "
          f"rate_integ fail_cnt={INTEG_FAIL_CNT}, thr×{INTEG_THR_SCALE} | "
          f"vib fail_cnt={GYRO_VIB_FAIL_CNT}, thr×{GYRO_VIB_THR_SCALE} | 기타 fail_cnt={DETECT_FAIL_CNT}")
    print(f"      M-of-N: pwm_dev {PWM_DEV_M_OF_N}, gyro_vib {GYRO_VIB_M_OF_N}, cooldown={MOFN_COOLDOWN}")
    print(f"      Severe fast path: 임계×{SEVERE_MULT:g} 이상 {SEVERE_FAIL_CNT}회 연속 → 즉시 확정 (파생 피처)")
    print(f"      적응형 주의: 직전 {WARN_BASE_SEC:.0f}s 기준선 mean+{WARN_SIGMA:g}σ, {WARN_CONSEC}회 연속 (enable={WARN_ENABLE})")
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
    severe_cnt = np.zeros(n, dtype=int)

    # 적응형 주의: 인과적 이동 기준선 (과거 [t-BASE-GAP, t-GAP] 구간의 mean/σ) 사전 계산
    warn_thr = np.full_like(err, np.inf, dtype=np.float64)
    if WARN_ENABLE:
        cs  = np.concatenate([np.zeros((1, n)), np.cumsum(err, axis=0)])
        cs2 = np.concatenate([np.zeros((1, n)), np.cumsum(err * err, axis=0)])
        hi_idx = np.searchsorted(win_t, win_t - WARN_GAP_SEC, side="right")
        lo_idx = np.searchsorted(win_t, win_t - WARN_GAP_SEC - WARN_BASE_SEC, side="left")
        for k in range(len(err)):
            lo, hi = lo_idx[k], hi_idx[k]
            cnt = hi - lo
            if cnt >= WARN_MIN_BASE:
                m_ = (cs[hi] - cs[lo]) / cnt
                v_ = np.maximum((cs2[hi] - cs2[lo]) / cnt - m_ * m_, 0.0)
                warn_thr[k] = m_ + WARN_SIGMA * np.sqrt(v_)
    warn_cnt = np.zeros(n, dtype=int)
    warn_cool = np.zeros(n, dtype=int)
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
                # 적응형 '주의': 직전 5분 기준선 mean+3σ 를 WARN_CONSEC회 연속 초과
                if WARN_ENABLE and _warn_applies(name):
                    if warn_cool[j] > 0:
                        warn_cool[j] -= 1
                    if err[k, j] > warn_thr[k, j]:
                        warn_cnt[j] += 1
                        if warn_cnt[j] >= WARN_CONSEC and warn_cool[j] == 0:
                            alarms.append((win_t[k], name, "WARN(adaptive)", err[k, j]))
                            warn_cool[j] = WARN_COOLDOWN
                            warn_cnt[j] = 0
                    else:
                        warn_cnt[j] = 0
                # 심각도 가중 fast path: 임계 SEVERE_MULT배 이상이 SEVERE_FAIL_CNT회 연속
                if SEVERE_FAIL_CNT > 0 and _severe_applies(name):
                    if err[k, j] >= SEVERE_MULT * thresholds[j]:
                        severe_cnt[j] += 1
                        if severe_cnt[j] >= SEVERE_FAIL_CNT:
                            alarms.append((win_t[k], name, f"severe(x{SEVERE_MULT:g})", err[k, j]))
                            severe_cnt[j] = 0
                            fail_cnt[j] = 0   # 중복 확정 방지
                    else:
                        severe_cnt[j] = 0
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
            tag = "⚠ 주의" if method.startswith("WARN") else "🚨 위험"
            print(f"  [{t:7.1f}초] {tag} {name:16s} {method:14s} 값={val:.3f}{unit}")

    # 첫 경보 요약 (주의 / 위험)
    first_warn = next((a for a in alarms if a[2].startswith("WARN")), None)
    first_dang = next((a for a in alarms if not a[2].startswith("WARN")), None)
    print()
    if first_warn:
        print(f" ▶ 첫 '주의' : {first_warn[0]:.1f}초 ({first_warn[1]})  — GPS 상실({ONSET_REF_T}) 대비 {first_warn[0]-ONSET_REF_T:+.1f}초")
    if first_dang:
        print(f" ▶ 첫 '위험' : {first_dang[0]:.1f}초 ({first_dang[1]}, {first_dang[2]})  — GPS 상실 대비 {first_dang[0]-ONSET_REF_T:+.1f}초")

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
            for (t_, nm, m, v) in alarms:
                if nm == fname and ZOOM_RANGE[0] <= t_ <= ZOOM_RANGE[1]:
                    ax.axvline(t_, color=("gold" if m.startswith("WARN") else "orange"),
                               alpha=0.7, linewidth=(1.6 if m.startswith("WARN") else 1.0),
                               linestyle=("--" if m.startswith("WARN") else "-"))
            ax.set_title(f"{fname} — 사고 직전 확대", fontsize=10)
            ax.xaxis.set_major_locator(mticker.MultipleLocator(10))
            ax.tick_params(labelbottom=True, labelsize=8)
            ax.grid(alpha=0.3)
            ax.legend(fontsize=7)
        for k_ in range(len(zoom_feats), rows_z * 2):
            axz[k_ // 2][k_ % 2].set_visible(False)
        figz.suptitle(f"사고 직전 확대 ({ZOOM_RANGE[0]:.0f}~{ZOOM_RANGE[1]:.0f}초) — 파랑점선=GPS 상실, 빨강파선=알람 임계, 주황=알람", fontsize=12)
        figz.tight_layout(rect=[0, 0, 1, 0.96])
        zoom_png = "replay_zoom_20feat.png"
        figz.savefig(zoom_png, dpi=130)
        print(f"\n 확대 그래프 저장: {zoom_png}")

    # ── 그래프 저장 ───────────────────────────
    fig, axes = plt.subplots(7, 3, figsize=(20, 22), sharex=True)
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
        if 8 <= j < 12:
            title += " [모터 편차]"
        elif 12 <= j < 17:
            title += " [진동]"
        elif j >= 17:
            title += " [제어기 적분항]"
        ax.set_title(title)
        ax.legend(fontsize=8)
        ax.grid(alpha=0.3)
        # 모든 패널에 x축 값 표시 (100초 간격 눈금)
        ax.xaxis.set_major_locator(mticker.MultipleLocator(100))
        ax.tick_params(labelbottom=True, labelsize=8)
    for c_ in range(3):
        axes[-1][c_].set_xlabel("비행 시간 (초)")
    # 남는 축(25번째 이후) 숨김
    for k_ in range(n, 21):
        axes[k_ // 3][k_ % 3].set_visible(False)  # 20피처 → 마지막 1칸 숨김
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
    out_png = "replay_result_20feat.png"
    plt.savefig(out_png, dpi=120)
    print(f"\n 그래프 저장: {out_png}")
    print(" → 사고 발생 시각과 그래프의 오차 급등/알람 시점을 대조해보세요.")


if __name__ == "__main__":
    main()