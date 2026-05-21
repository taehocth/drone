"""
app/cbm/collector.py

역할:
  1. vehicle_registry 에서 실시간 드론 데이터를 가져옴
  2. 27개 CNN-LSTM 피처를 매핑·추출
  3. 드론 ID별 슬라이딩 윈도우 버퍼(deque, win_s=20) 관리
  4. 규칙 기반 evaluator 용 SimpleNamespace 도 함께 반환
"""

from __future__ import annotations

from collections import deque
from datetime import datetime
from types import SimpleNamespace
from typing import Dict, Optional, List
import numpy as np

from app.mavlink.manager import get_vehicle_registry

# ── 상수 ────────────────────────────────────────────────
WIN_SIZE = 20          # CNN-LSTM 윈도우 크기 (학습 시 win_s=20)
NUM_FEATURES = 27      # CNN-LSTM 입력 피처 수

# ── 드론별 슬라이딩 윈도우 버퍼 ─────────────────────────
# { drone_id: deque(maxlen=WIN_SIZE) }  각 원소는 길이 27의 list
_window_buffers: Dict[str, deque] = {}

# ── 규칙 기반용 최신 텔레메트리 (기존 구조 호환) ────────
_latest_telemetry: Optional[SimpleNamespace] = None


# ════════════════════════════════════════════════════════
# 내부 헬퍼: registry 데이터 → 27개 피처 벡터
# ════════════════════════════════════════════════════════
def _extract_features(snap: dict) -> Optional[List[float]]:
    """
    vehicle_registry.latest_flattened() 스냅샷에서
    CNN-LSTM 27개 피처를 순서대로 추출.

    피처 순서 (학습 데이터와 동일하게 유지):
     0  volt
     1  current
     2  esti_gps_pos_north (lat 근사)
     3  esti_gps_pos_east  (lon 근사)
     4  esti_gps_pos_down  (alt)
     5  att_cmd_yaw
     6  att_cmd_pitch
     7  att_cmd_roll
     8  att_state_yaw
     9  att_state_pitch
    10  att_state_roll
    11  esti_gyro_bias_x   (EKF velocity_variance 근사)
    12  esti_gyro_bias_y   (EKF pos_horiz_variance 근사)
    13  esti_gyro_bias_z   (EKF pos_vert_variance  근사)
    14  esti_accel_bias_x  (EKF compass_variance   근사)
    15  esti_accel_bias_y  (EKF terrain_alt_variance 근사)
    16  esti_accel_bias_z  (EKF flags 근사)
    17  sensor_gyro_x
    18  sensor_gyro_y
    19  sensor_gyro_z
    20  sensor_accel_x
    21  sensor_accel_y
    22  sensor_accel_z
    23  pwm1
    24  pwm2
    25  pwm3
    26  pwm4
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
            """None-safe float 변환"""
            try:
                return float(v) if v is not None else default
            except (TypeError, ValueError):
                return default

        features = [
            # 0  volt
            _f(battery.get("voltage")),
            # 1  current
            _f(battery.get("current")),
            # 2~4  esti_gps_pos (north/east/down)
            _f(position.get("lat")),
            _f(position.get("lon")),
            _f(position.get("alt")),
            # 5~7  att_cmd (yaw/pitch/roll)  ← ATTITUDE_TARGET
            _f(att_target.get("yaw")),
            _f(att_target.get("pitch")),
            _f(att_target.get("roll")),
            # 8~10 att_state (yaw/pitch/roll) ← ATTITUDE
            _f(attitude.get("yaw")),
            _f(attitude.get("pitch")),
            _f(attitude.get("roll")),
            # 11~16 esti_gyro/accel_bias ← EKF_STATUS_REPORT
            _f(ekf_bias.get("velocity_variance")),
            _f(ekf_bias.get("pos_horiz_variance")),
            _f(ekf_bias.get("pos_vert_variance")),
            _f(ekf_bias.get("compass_variance")),
            _f(ekf_bias.get("terrain_alt_variance")),
            _f(ekf_bias.get("flags")),
            # 17~19 sensor_gyro (x/y/z) ← RAW_IMU
            _f(raw_imu.get("gyro_x") if raw_imu else att_target.get("body_roll_rate")),
            _f(raw_imu.get("gyro_y") if raw_imu else att_target.get("body_pitch_rate")),
            _f(raw_imu.get("gyro_z") if raw_imu else att_target.get("body_yaw_rate")),  
            # 20~22 sensor_accel (x/y/z) ← RAW_IMU
            _f(raw_imu.get("accel_x") if raw_imu else attitude.get("roll")),
            _f(raw_imu.get("accel_y") if raw_imu else attitude.get("pitch")),
            _f(raw_imu.get("accel_z") if raw_imu else attitude.get("roll")),
            # 23~26 pwm_cmd 1~4 ← SERVO_OUTPUT_RAW
            _f(servo_output.get("pwm1")),
            _f(servo_output.get("pwm2")),
            _f(servo_output.get("pwm3")),
            _f(servo_output.get("pwm4")),
        ]

        print(f"[collector] 피처 수: {len(features)}, raw_imu: {bool(raw_imu)}, servo: {bool(servo_output)}")
        return features  # len == 27

    except Exception as e:
        print(f"[collector] _extract_features 오류: {e}")
        return None


# ════════════════════════════════════════════════════════
# 내부 헬퍼: 규칙 기반 evaluator 용 SimpleNamespace
# ════════════════════════════════════════════════════════
def _build_rule_namespace(snap: dict) -> SimpleNamespace:
    """기존 규칙 기반 evaluator 가 요구하는 필드 구조 유지"""
    battery  = snap.get("battery")  or {}
    gps      = snap.get("gps")      or {}
    raw_imu  = snap.get("raw_imu")  or {}

    def _f(v, default=0.0):
        try:
            return float(v) if v is not None else default
        except (TypeError, ValueError):
            return default

    return SimpleNamespace(
        timestamp     = datetime.now().isoformat(),
        drone_id      = snap.get("drone_id", "unknown"),
        # 전압 / 전류
        voltage       = _f(battery.get("voltage")),
        current       = _f(battery.get("current")),
        battery_pct   = _f(battery.get("remaining")),
        # 온도류 — MAVLink 기본 메시지엔 없으므로 0으로 유지
        # 필요 시 SCALED_PRESSURE / SYS_STATUS 확장 가능
        temp          = 0.0,
        esc_temp      = 0.0,
        imu_temp      = 0.0,
        # 모터 관련 — RPM 직접 노출 없으므로 PWM 분산으로 대체
        rpm_variation = 0.0,
        # FCC
        cpu_load      = 0.0,
        # GPS
        satellites    = int(gps.get("satellites") or 0),
        hdop          = 99.9,   # GPS_RAW_INT에 eph 있으나 별도 파싱 필요
        # IMU (추가 정보)
        gyro_x        = _f((snap.get("raw_imu") or {}).get("gyro_x")),
        gyro_y        = _f((snap.get("raw_imu") or {}).get("gyro_y")),
        gyro_z        = _f((snap.get("raw_imu") or {}).get("gyro_z")),
        accel_x       = _f((snap.get("raw_imu") or {}).get("accel_x")),
        accel_y       = _f((snap.get("raw_imu") or {}).get("accel_y")),
        accel_z       = _f((snap.get("raw_imu") or {}).get("accel_z")),
    )


# ════════════════════════════════════════════════════════
# 공개 API
# ════════════════════════════════════════════════════════

def update_window(drone_id: Optional[str] = None) -> Optional[str]:
    """
    vehicle_registry에서 최신 스냅샷을 가져와
    해당 드론의 슬라이딩 윈도우 버퍼에 추가.

    Returns:
        실제로 데이터를 추가한 drone_id, 없으면 None
    """
    global _latest_telemetry

    registry = get_vehicle_registry()

    # drone_id 지정 여부에 따라 스냅샷 선택
    if drone_id:
        snap = registry.latest_flattened_by_drone_id(drone_id)
    else:
        snap = registry.latest_flattened()

    if snap is None:
        return None

    did = snap.get("drone_id", "unknown")

    # 피처 추출
    features = _extract_features(snap)
    if features is None:
        return None

    # 버퍼 없으면 생성
    if did not in _window_buffers:
        _window_buffers[did] = deque(maxlen=WIN_SIZE)

    _window_buffers[did].append(features)

    # 규칙 기반용 최신 텔레메트리 갱신
    _latest_telemetry = _build_rule_namespace(snap)

    return did


def get_window(drone_id: str) -> Optional[np.ndarray]:
    """
    윈도우가 WIN_SIZE(20)개 채워진 경우에만 반환.
    shape: (WIN_SIZE, NUM_FEATURES) = (20, 27)
    CNN-LSTM 입력 전 정규화는 inference.py 에서 수행.

    Returns:
        np.ndarray or None (아직 윈도우 미충족)
    """
    buf = _window_buffers.get(drone_id)
    if buf is None or len(buf) < WIN_SIZE:
        return None
    return np.array(list(buf), dtype=np.float32)  # (20, 27)


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
        )
    return _latest_telemetry