"""
app/cbm/collector.py  (14-feature 배포 버전)

역할:
  1. vehicle_registry 에서 실시간 드론 데이터를 가져옴
  2. CNN-LSTM 입력 피처를 매핑·추출
     - 내부적으로 학습 CSV(ulg_to_csv v3, 43컬럼)와 같은 43개 슬롯을 만들되,
       AI(CNN-LSTM)에 넘기는 윈도우는 AI_FEATURE_COLS 14개만 슬라이스한다.
     - 실시간으로 계산 불가한 슬롯(고주파 진동 34~36, 제어기 적분항 39~41 등)은 0 으로 채움.
       → 이 슬롯들은 AI_FEATURE_COLS 에 포함하지 않으므로 모델 입력에 영향 없음.
  3. 드론 ID별 슬라이딩 윈도우 버퍼(deque, win_s=20) 관리 → AI용 14피처
  4. 규칙 기반 evaluator 용 SimpleNamespace 도 함께 반환

[중요] AI 학습(cnnlstm_retrain.py) / 추론(inference.py) 과 반드시 동일해야 하는 약속:
  AI_FEATURE_COLS = [0,1,5,6,7,8,9,10, 27,28,29,30, 37,38]
  = volt, current, 자세6, pwm_dev1~4(모터 편차), accel_vib_metric, gyro_vib_metric
  이 순서가 그대로 AI 새 인덱스 0~13 이 된다.

[파생 피처 계산 공식 — ulg_to_csv.py v3 와 동일해야 함]
  pwm_dev_i = pwm_i − mean(pwm1..pwm4)                 (i = 1..4)
  accel_vib_metric / gyro_vib_metric = MAVLink VIBRATION 메시지 (PX4 vehicle_imu_status 값)

[샘플링 주기]
  update_window() 는 cbm_ws.py 가 SAMPLE_INTERVAL(1초) 마다 호출한다 (학습 데이터 1Hz 와 일치).
"""

from __future__ import annotations

from collections import deque
from datetime import datetime
from types import SimpleNamespace
from typing import Dict, Optional, List
import numpy as np

from app.mavlink.manager import get_vehicle_registry

# ── 상수 ────────────────────────────────────────────────
WIN_SIZE = 20              # CNN-LSTM 윈도우 크기 (학습 시 win_s=20)
NUM_FEATURES_RAW = 43      # _extract_features_raw 가 만드는 원본 슬롯 수 (학습 CSV 43컬럼과 동일)

# ── AI(CNN-LSTM)에 실제로 넘길 원본 컬럼 인덱스 ──────────
#   cnnlstm_retrain.py 의 FEATURE_COLS, inference.py 의 FEATURE_NAMES 와 100% 동일해야 함.
AI_FEATURE_COLS = [0, 1, 5, 6, 7, 8, 9, 10,     # volt, current, att_cmd(yaw,pitch,roll), att_state(yaw,pitch,roll)
                   27, 28, 29, 30,               # pwm_dev1~4
                   37, 38]                       # accel_vib_metric, gyro_vib_metric
NUM_FEATURES = len(AI_FEATURE_COLS)   # = 14

# ── 모터 번호 ↔ 물리 위치 (PX4 Quad X 표준, 사고 조사 보고서 §5 와 동일) ──
MOTOR_POSITION = {
    1: "전방 우측",
    2: "후방 좌측",
    3: "전방 좌측",
    4: "후방 우측",
}

# ── 드론별 슬라이딩 윈도우 버퍼 ─────────────────────────
_window_buffers: Dict[str, deque] = {}

# ── 규칙 기반용 최신 텔레메트리 ─────────────────────────
_latest_telemetry: Optional[SimpleNamespace] = None

# ── 드론별 결측 피처 (텔레메트리 소스 미수신 → AI 판정 제외 + 화면 '수신 없음') ──
_missing_features: Dict[str, set] = {}


def _f(v, default=0.0) -> float:
    try:
        return float(v) if v is not None else default
    except (TypeError, ValueError):
        return default


# ════════════════════════════════════════════════════════
# 내부 헬퍼: registry 데이터 → 43개 원본 슬롯 벡터
# ════════════════════════════════════════════════════════
def _extract_features_raw(snap: dict) -> Optional[List[float]]:
    """
    vehicle_registry.latest_flattened() 스냅샷에서 43개 원본 슬롯을 만든다.
    (학습 CSV ulg_to_csv v3 의 컬럼 순서와 동일)

     0  volt                  1  current
     2~4  gps lat/lon/alt                          (AI 미사용)
     5~7  att_cmd yaw/pitch/roll   (ATTITUDE_TARGET)
     8~10 att_state yaw/pitch/roll (ATTITUDE)
    11~16 EKF variance (자리만 유지, AI 미사용)
    17~19 gyro x/y/z  (RAW_IMU)   20~22 accel x/y/z (RAW_IMU)   ← 규칙용
    23~26 pwm1~4      (SERVO_OUTPUT_RAW)                          ← 규칙 + 파생 계산용
    27~30 pwm_dev1~4  = pwm_i − mean(pwm1..4)                     ← AI 사용
    31~33 gyro_vib x/y/z   (실시간 계산 불가 → 0)
    34~36 accel_vib x/y/z  (실시간 계산 불가 → 0)
    37    accel_vib_metric (VIBRATION.vibration_x)               ← AI 사용
    38    gyro_vib_metric  (VIBRATION.vibration_y)               ← AI 사용
    39~41 rate_integ roll/pitch/yaw (텔레메트리 없음 → 0)
    42    volt_cell = volt / 추정 셀 수                            (AI 미사용, 참고)
    """
    try:
        battery      = snap.get("battery")      or {}
        position     = snap.get("position")     or {}
        attitude     = snap.get("attitude")     or {}
        att_target   = snap.get("att_target")   or {}
        raw_imu      = snap.get("raw_imu")      or {}
        ekf_bias     = snap.get("ekf_bias")     or {}
        servo_output = snap.get("servo_output") or {}
        vibration    = snap.get("vibration")    or {}

        volt = _f(battery.get("voltage"))

        features = [0.0] * NUM_FEATURES_RAW

        # 0~1 전원
        features[0] = volt
        features[1] = _f(battery.get("current"))
        # 2~4 GPS
        features[2] = _f(position.get("lat"))
        features[3] = _f(position.get("lon"))
        features[4] = _f(position.get("alt"))
        # 5~7 자세 명령
        features[5] = _f(att_target.get("yaw"))
        features[6] = _f(att_target.get("pitch"))
        features[7] = _f(att_target.get("roll"))
        # 8~10 자세 상태
        features[8]  = _f(attitude.get("yaw"))
        features[9]  = _f(attitude.get("pitch"))
        features[10] = _f(attitude.get("roll"))
        # 11~16 EKF (자리 유지)
        features[11] = _f(ekf_bias.get("velocity_variance"))
        features[12] = _f(ekf_bias.get("pos_horiz_variance"))
        features[13] = _f(ekf_bias.get("pos_vert_variance"))
        features[14] = _f(ekf_bias.get("compass_variance"))
        features[15] = _f(ekf_bias.get("terrain_alt_variance"))
        features[16] = _f(ekf_bias.get("flags"))
        # 17~22 IMU 원시 (규칙용)
        features[17] = _f(raw_imu.get("gyro_x") if raw_imu else att_target.get("body_roll_rate"))
        features[18] = _f(raw_imu.get("gyro_y") if raw_imu else att_target.get("body_pitch_rate"))
        features[19] = _f(raw_imu.get("gyro_z") if raw_imu else att_target.get("body_yaw_rate"))
        features[20] = _f(raw_imu.get("accel_x"))
        features[21] = _f(raw_imu.get("accel_y"))
        features[22] = _f(raw_imu.get("accel_z"))
        # 23~26 PWM 원시
        pwm = [_f(servo_output.get(f"pwm{i}")) for i in (1, 2, 3, 4)]
        features[23:27] = pwm

        missing = set()
        # 27~30 pwm_dev (추력 비대칭) — 4개 중 하나라도 0(미수신)이면 편차 0 + 결측 표시
        if all(p > 0 for p in pwm):
            pwm_mean = sum(pwm) / 4.0
            features[27:31] = [p - pwm_mean for p in pwm]
        else:
            features[27:31] = [0.0, 0.0, 0.0, 0.0]
            missing.update({"pwm_dev1", "pwm_dev2", "pwm_dev3", "pwm_dev4"})

        # 31~36 고주파 진동 (실시간 계산 불가 → 0, AI 미사용)
        # 37~38 PX4 진동 메트릭 (VIBRATION 메시지) — 미수신이면 결측 표시
        if vibration and vibration.get("accel_metric") is not None:
            features[37] = _f(vibration.get("accel_metric"))
            features[38] = _f(vibration.get("gyro_metric"))
        else:
            missing.update({"accel_vib_metric", "gyro_vib_metric"})
        if not battery or battery.get("current") is None:
            missing.add("current")
        _missing_features[snap.get("drone_id", "unknown")] = missing

        # 39~41 제어기 적분항 (텔레메트리 없음 → 0, AI 미사용)
        # 42 셀당 전압 (참고)
        n_cells = max(1, int(round(volt / 3.85))) if volt > 5.0 else 1
        features[42] = volt / n_cells

        return features  # len == 43

    except Exception as e:
        print(f"[collector] _extract_features_raw 오류: {e}")
        return None


def _slice_ai_features(raw: List[float]) -> List[float]:
    """43개 원본 슬롯에서 AI용 14개만 추출 (AI_FEATURE_COLS 순서)."""
    return [raw[i] for i in AI_FEATURE_COLS]


# ════════════════════════════════════════════════════════
# 내부 헬퍼: 규칙 기반 evaluator 용 SimpleNamespace
# ════════════════════════════════════════════════════════
def _build_rule_namespace(snap: dict, raw: Optional[List[float]] = None) -> SimpleNamespace:
    """기존 규칙 기반 evaluator 가 요구하는 필드 구조 유지.
       raw(43개)가 주어지면 PWM/accel/pwm_dev/진동 도 함께 실어 규칙·표시에 활용."""
    battery  = snap.get("battery")  or {}
    gps      = snap.get("gps")      or {}
    raw_imu  = snap.get("raw_imu")  or {}

    if raw is not None and len(raw) >= NUM_FEATURES_RAW:
        accel_x, accel_y, accel_z = raw[20], raw[21], raw[22]
        pwm1, pwm2, pwm3, pwm4    = raw[23], raw[24], raw[25], raw[26]
        pwm_dev = (raw[27], raw[28], raw[29], raw[30])
        accel_vib_metric, gyro_vib_metric = raw[37], raw[38]
    else:
        accel_x = accel_y = accel_z = 0.0
        pwm1 = pwm2 = pwm3 = pwm4 = 0.0
        pwm_dev = (0.0, 0.0, 0.0, 0.0)
        accel_vib_metric = gyro_vib_metric = 0.0

    return SimpleNamespace(
        timestamp     = datetime.now().isoformat(),
        drone_id      = snap.get("drone_id", "unknown"),
        voltage       = _f(battery.get("voltage")),
        current       = _f(battery.get("current")),
        battery_pct   = _f(battery.get("remaining")),
        temp          = 0.0,
        esc_temp      = 0.0,
        imu_temp      = 0.0,
        rpm_variation = 0.0,
        cpu_load      = 0.0,
        satellites    = int(gps.get("satellites") or 0),
        hdop          = 99.9,
        gyro_x        = _f(raw_imu.get("gyro_x")),
        gyro_y        = _f(raw_imu.get("gyro_y")),
        gyro_z        = _f(raw_imu.get("gyro_z")),
        accel_x       = accel_x,
        accel_y       = accel_y,
        accel_z       = accel_z,
        pwm1          = pwm1,
        pwm2          = pwm2,
        pwm3          = pwm3,
        pwm4          = pwm4,
        # 신규: 모터 편차·진동 메트릭 (표시/규칙용)
        pwm_dev1      = pwm_dev[0],
        pwm_dev2      = pwm_dev[1],
        pwm_dev3      = pwm_dev[2],
        pwm_dev4      = pwm_dev[3],
        accel_vib_metric = accel_vib_metric,
        gyro_vib_metric  = gyro_vib_metric,
    )


# ════════════════════════════════════════════════════════
# 공개 API
# ════════════════════════════════════════════════════════

def update_window(drone_id: Optional[str] = None) -> Optional[str]:
    """
    vehicle_registry에서 최신 스냅샷을 가져와
    해당 드론의 슬라이딩 윈도우 버퍼(AI용 14피처)에 추가.
    ※ 호출 주기는 cbm_ws.py 의 SAMPLE_INTERVAL(1초) — 학습 데이터(1Hz)와 동일해야 함.
    """
    global _latest_telemetry

    registry = get_vehicle_registry()

    if drone_id:
        snap = registry.latest_flattened_by_drone_id(drone_id)
    else:
        snap = registry.latest_flattened()

    if snap is None:
        return None

    did = snap.get("drone_id", "unknown")

    raw = _extract_features_raw(snap)
    if raw is None:
        return None
    ai_features = _slice_ai_features(raw)   # len == 14

    if did not in _window_buffers:
        _window_buffers[did] = deque(maxlen=WIN_SIZE)
    _window_buffers[did].append(ai_features)

    _latest_telemetry = _build_rule_namespace(snap, raw)

    return did


def get_window(drone_id: str) -> Optional[np.ndarray]:
    """윈도우가 WIN_SIZE(20)개 채워진 경우에만 반환. shape: (20, 14)"""
    buf = _window_buffers.get(drone_id)
    if buf is None or len(buf) < WIN_SIZE:
        return None
    return np.array(list(buf), dtype=np.float32)


def get_window_size(drone_id: str) -> int:
    buf = _window_buffers.get(drone_id)
    return len(buf) if buf else 0


def reset_window(drone_id: str) -> None:
    if drone_id in _window_buffers:
        _window_buffers[drone_id].clear()
        print(f"[collector] {drone_id} 윈도우 버퍼 초기화")


def list_active_drones() -> list:
    return list(_window_buffers.keys())


def get_missing_features(drone_id: str) -> set:
    """텔레메트리 소스가 없어 값이 0 으로 채워진 피처 집합 (AI 판정 제외 대상)."""
    return set(_missing_features.get(drone_id, set()))


def get_latest_telemetry() -> SimpleNamespace:
    global _latest_telemetry
    if _latest_telemetry is None:
        return SimpleNamespace(
            timestamp   = datetime.now().isoformat(),
            drone_id    = "unknown",
            voltage     = 0.0, current = 0.0, battery_pct = 0,
            temp = 0.0, esc_temp = 0.0, imu_temp = 0.0,
            rpm_variation = 0.0, cpu_load = 0.0,
            satellites  = 0, hdop = 99.9,
            gyro_x=0.0, gyro_y=0.0, gyro_z=0.0,
            accel_x=0.0, accel_y=0.0, accel_z=0.0,
            pwm1=0.0, pwm2=0.0, pwm3=0.0, pwm4=0.0,
            pwm_dev1=0.0, pwm_dev2=0.0, pwm_dev3=0.0, pwm_dev4=0.0,
            accel_vib_metric=0.0, gyro_vib_metric=0.0,
        )
    return _latest_telemetry