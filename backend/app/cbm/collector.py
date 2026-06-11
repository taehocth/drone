"""
app/cbm/collector.py

역할:
  1. vehicle_registry 에서 실시간 드론 데이터를 가져옴
  2. CNN-LSTM 입력 피처를 매핑·추출
     - 내부적으로는 27개 원본 피처를 모두 만들되,
       AI(CNN-LSTM)에 넘기는 윈도우는 11개만 슬라이스한다.
     - PWM·accel·GPS·EKF 는 규칙/물리 임계값(evaluator/failsafe)에서 별도 사용.
  3. 드론 ID별 슬라이딩 윈도우 버퍼(deque, win_s=20) 관리  → AI용 11피처
  4. 규칙 기반 evaluator 용 SimpleNamespace 도 함께 반환

[중요] AI 학습(cnnlstm_retrain.py) / 추론(inference.py) 과 반드시 동일해야 하는 약속:
  AI_FEATURE_COLS = [0,1,5,6,7,8,9,10]
  = 원본 27개 중 8개 (volt,current, 자세6). gyro(17~19)는 물리 임계로 이관
  이 순서가 그대로 AI 새 인덱스 0~10 이 된다.
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
NUM_FEATURES_RAW = 27      # _extract_features 가 만드는 원본 피처 수 (규칙용 포함)

# ── AI(CNN-LSTM)에 실제로 넘길 원본 컬럼 인덱스 ──────────
#   cnnlstm_retrain.py 의 FEATURE_COLS, inference.py 의 AI_FEATURE_COLS 와 100% 동일해야 함.
AI_FEATURE_COLS = [0, 1, 5, 6, 7, 8, 9, 10]
NUM_FEATURES = len(AI_FEATURE_COLS)   # = 8  (외부 호환용 이름 유지)

# ── 드론별 슬라이딩 윈도우 버퍼 ─────────────────────────
# { drone_id: deque(maxlen=WIN_SIZE) }  각 원소는 길이 11 의 list (AI용)
_window_buffers: Dict[str, deque] = {}

# ── 규칙 기반용 최신 텔레메트리 (기존 구조 호환) ────────
_latest_telemetry: Optional[SimpleNamespace] = None


# ════════════════════════════════════════════════════════
# 내부 헬퍼: registry 데이터 → 27개 원본 피처 벡터
# ════════════════════════════════════════════════════════
def _extract_features_raw(snap: dict) -> Optional[List[float]]:
    """
    vehicle_registry.latest_flattened() 스냅샷에서 27개 원본 피처를 추출.
    (AI 슬라이스 전 단계. PWM/accel/GPS/EKF 도 포함해 규칙/디버그에 활용 가능)

    원본 피처 순서 (기존 학습 데이터 컬럼 순서와 동일):
     0  volt                  1  current
     2  gps lat   3 gps lon   4 gps alt
     5  att_cmd_yaw   6 att_cmd_pitch   7 att_cmd_roll      (ATTITUDE_TARGET)
     8  att_state_yaw 9 att_state_pitch 10 att_state_roll   (ATTITUDE)
    11~16 EKF bias/variance (※ AI 미사용·제거 대상)
    17~19 sensor_gyro x/y/z   (RAW_IMU)        ← AI 사용
    20~22 sensor_accel x/y/z  (RAW_IMU)        ← 규칙 사용
    23~26 pwm 1~4             (SERVO_OUTPUT)   ← 규칙 사용
    """
    try:
        battery      = snap.get("battery")      or {}
        position     = snap.get("position")     or {}
        attitude     = snap.get("attitude")     or {}
        att_target   = snap.get("att_target")   or {}
        raw_imu      = snap.get("raw_imu")      or {}
        ekf_bias     = snap.get("ekf_bias")     or {}
        servo_output = snap.get("servo_output") or {}

        def _f(v, default=0.0) -> float:
            try:
                return float(v) if v is not None else default
            except (TypeError, ValueError):
                return default

        features = [
            # 0  volt
            _f(battery.get("voltage")),
            # 1  current
            _f(battery.get("current")),
            # 2~4  gps (lat/lon/alt)  ※ AI 미사용 (failsafe/지도에서 별도 사용)
            _f(position.get("lat")),
            _f(position.get("lon")),
            _f(position.get("alt")),
            # 5~7  att_cmd (yaw/pitch/roll) ← ATTITUDE_TARGET
            _f(att_target.get("yaw")),
            _f(att_target.get("pitch")),
            _f(att_target.get("roll")),
            # 8~10 att_state (yaw/pitch/roll) ← ATTITUDE
            _f(attitude.get("yaw")),
            _f(attitude.get("pitch")),
            _f(attitude.get("roll")),
            # 11~16 EKF (※ AI 미사용·제거 대상 — 자리만 유지)
            _f(ekf_bias.get("velocity_variance")),
            _f(ekf_bias.get("pos_horiz_variance")),
            _f(ekf_bias.get("pos_vert_variance")),
            _f(ekf_bias.get("compass_variance")),
            _f(ekf_bias.get("terrain_alt_variance")),
            _f(ekf_bias.get("flags")),
            # 17~19 sensor_gyro (x/y/z) ← RAW_IMU   ← AI 사용
            #   (fallback 의 body_rate 는 '명령 각속도'라 의미가 약간 다름. raw_imu 있을 때 정상)
            _f(raw_imu.get("gyro_x") if raw_imu else att_target.get("body_roll_rate")),
            _f(raw_imu.get("gyro_y") if raw_imu else att_target.get("body_pitch_rate")),
            _f(raw_imu.get("gyro_z") if raw_imu else att_target.get("body_yaw_rate")),
            # 20~22 sensor_accel (x/y/z) ← RAW_IMU   ← 규칙 사용
            #   (accel_z fallback 은 원본 roll 중복 버그였으므로 pitch 로 바로잡되, AI 미사용이라 영향 적음)
            _f(raw_imu.get("accel_x") if raw_imu else attitude.get("roll")),
            _f(raw_imu.get("accel_y") if raw_imu else attitude.get("pitch")),
            _f(raw_imu.get("accel_z") if raw_imu else attitude.get("pitch")),
            # 23~26 pwm 1~4 ← SERVO_OUTPUT_RAW   ← 규칙 사용
            _f(servo_output.get("pwm1")),
            _f(servo_output.get("pwm2")),
            _f(servo_output.get("pwm3")),
            _f(servo_output.get("pwm4")),
        ]
        return features  # len == 27

    except Exception as e:
        print(f"[collector] _extract_features_raw 오류: {e}")
        return None


def _slice_ai_features(raw: List[float]) -> List[float]:
    """27개 원본에서 AI용 11개만 추출 (AI_FEATURE_COLS 순서)."""
    return [raw[i] for i in AI_FEATURE_COLS]


# ════════════════════════════════════════════════════════
# 내부 헬퍼: 규칙 기반 evaluator 용 SimpleNamespace
# ════════════════════════════════════════════════════════
def _build_rule_namespace(snap: dict, raw: Optional[List[float]] = None) -> SimpleNamespace:
    """기존 규칙 기반 evaluator 가 요구하는 필드 구조 유지.
       raw(27개)가 주어지면 PWM/accel 도 함께 실어 규칙·물리 임계 감시에 활용."""
    battery  = snap.get("battery")  or {}
    gps      = snap.get("gps")      or {}

    def _f(v, default=0.0):
        try:
            return float(v) if v is not None else default
        except (TypeError, ValueError):
            return default

    # PWM 4개 / accel 3개 (raw 가 있으면 거기서, 없으면 0)
    if raw is not None and len(raw) >= 27:
        accel_x, accel_y, accel_z = raw[20], raw[21], raw[22]
        pwm1, pwm2, pwm3, pwm4    = raw[23], raw[24], raw[25], raw[26]
    else:
        accel_x = accel_y = accel_z = 0.0
        pwm1 = pwm2 = pwm3 = pwm4 = 0.0

    return SimpleNamespace(
        timestamp     = datetime.now().isoformat(),
        drone_id      = snap.get("drone_id", "unknown"),
        # 전압 / 전류
        voltage       = _f(battery.get("voltage")),
        current       = _f(battery.get("current")),
        battery_pct   = _f(battery.get("remaining")),
        # 온도류
        temp          = 0.0,
        esc_temp      = 0.0,
        imu_temp      = 0.0,
        # 모터 관련
        rpm_variation = 0.0,
        cpu_load      = 0.0,
        # GPS
        satellites    = int(gps.get("satellites") or 0),
        hdop          = 99.9,
        # IMU (gyro)
        gyro_x        = _f((snap.get("raw_imu") or {}).get("gyro_x")),
        gyro_y        = _f((snap.get("raw_imu") or {}).get("gyro_y")),
        gyro_z        = _f((snap.get("raw_imu") or {}).get("gyro_z")),
        # IMU (accel) — 규칙/물리 임계 감시용 (AI 에서 이관됨)
        accel_x       = accel_x,
        accel_y       = accel_y,
        accel_z       = accel_z,
        # PWM — 규칙/물리 임계 감시용 (AI 에서 이관됨)
        pwm1          = pwm1,
        pwm2          = pwm2,
        pwm3          = pwm3,
        pwm4          = pwm4,
    )


# ════════════════════════════════════════════════════════
# 공개 API
# ════════════════════════════════════════════════════════

def update_window(drone_id: Optional[str] = None) -> Optional[str]:
    """
    vehicle_registry에서 최신 스냅샷을 가져와
    해당 드론의 슬라이딩 윈도우 버퍼(AI용 11피처)에 추가.

    Returns:
        실제로 데이터를 추가한 drone_id, 없으면 None
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

    # 27개 원본 추출 → AI용 11개 슬라이스
    raw = _extract_features_raw(snap)
    if raw is None:
        return None
    ai_features = _slice_ai_features(raw)   # len == 11

    if did not in _window_buffers:
        _window_buffers[did] = deque(maxlen=WIN_SIZE)
    _window_buffers[did].append(ai_features)

    # 규칙 기반용 최신 텔레메트리 갱신 (PWM/accel 포함)
    _latest_telemetry = _build_rule_namespace(snap, raw)

    return did


def get_window(drone_id: str) -> Optional[np.ndarray]:
    """
    윈도우가 WIN_SIZE(20)개 채워진 경우에만 반환.
    shape: (WIN_SIZE, NUM_FEATURES) = (20, 11)   ← AI용 11피처
    CNN-LSTM 입력 전 정규화는 inference.py 에서 수행.
    """
    buf = _window_buffers.get(drone_id)
    if buf is None or len(buf) < WIN_SIZE:
        return None
    return np.array(list(buf), dtype=np.float32)  # (20, 11)


def get_window_size(drone_id: str) -> int:
    """현재 버퍼에 쌓인 프레임 수 반환 (0 ~ WIN_SIZE)"""
    buf = _window_buffers.get(drone_id)
    return len(buf) if buf else 0


def reset_window(drone_id: str) -> None:
    """비행 세션 전환 시 특정 드론의 윈도우 버퍼 초기화"""
    if drone_id in _window_buffers:
        _window_buffers[drone_id].clear()
        print(f"[collector] {drone_id} 윈도우 버퍼 초기화")


def list_active_drones() -> list:
    """버퍼가 존재하는 드론 ID 목록"""
    return list(_window_buffers.keys())


def get_latest_telemetry() -> SimpleNamespace:
    """
    규칙 기반 evaluator 용 최신 텔레메트리 반환.
    기존 cbm_ws.py / cbm.py 와의 호환성 유지.
    """
    global _latest_telemetry
    if _latest_telemetry is None:
        return SimpleNamespace(
            timestamp   = datetime.now().isoformat(),
            drone_id    = "unknown",
            voltage     = 0.0,
            current     = 0.0,
            battery_pct = 0,
            temp        = 0.0,
            esc_temp    = 0.0,
            imu_temp    = 0.0,
            rpm_variation = 0.0,
            cpu_load    = 0.0,
            satellites  = 0,
            hdop        = 99.9,
            gyro_x=0.0, gyro_y=0.0, gyro_z=0.0,
            accel_x=0.0, accel_y=0.0, accel_z=0.0,
            pwm1=0.0, pwm2=0.0, pwm3=0.0, pwm4=0.0,
        )
    return _latest_telemetry