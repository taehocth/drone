"""
app/cbm/failsafe.py

역할:
  1. evaluator.py 의 통합 alerts 를 받아 피처별 Failsafe 점수 산출
  2. 물리 임계값 직접 체크 (전압·전류·자세·자이로·가속도·고도·PWM)
  3. CNN-LSTM alerts 의 level 을 점수로 환산
  4. 복합 위험 점수 합산 → 단계 판정 (monitor / rtl / land)
  5. 히스테리시스 적용 (단계 하락 시 유예 시간 적용)
  6. 드론별 상태 유지 (싱글턴 딕셔너리)

반환 예시:
  {
    "level":        "rtl",          # "normal" | "monitor" | "rtl" | "land"
    "total_score":  5,
    "details": [
      {"feature": "배터리 전압",  "stage": "warning", "score": 2, "value": 19.2},
      {"feature": "자이로 X",    "stage": "caution",  "score": 1, "value": 0.23},
    ],
    "action_msg":   "RTL 귀환 권고 — 경고 단계 진입, 귀환 명령 실행 필요",
  }
"""

from __future__ import annotations

import math
import time
from collections import deque
from typing import Dict, List, Optional

from app.cbm.thresholds import (
    FAILSAFE_VOLTAGE,
    FAILSAFE_CURRENT_RATIO,
    FAILSAFE_ATTITUDE_DEG,
    FAILSAFE_GYRO,
    FAILSAFE_ACCEL_XY,
    FAILSAFE_ACCEL_Z,
    FAILSAFE_ALTITUDE,
    FAILSAFE_PWM,
    FAILSAFE_SCORE,
    FAILSAFE_TOTAL,
    FAILSAFE_HYSTERESIS_SEC,
)


# ════════════════════════════════════════════════════════
# 유틸: 3단계 판정
# ════════════════════════════════════════════════════════
def _stage(value: float, limits: dict, higher_is_worse: bool = True) -> Optional[str]:
    """
    value 와 limits(caution/warning/danger) 비교 → 단계 반환.
    higher_is_worse=True  : value가 클수록 위험 (자이로, 가속도, PWM 편차 등)
    higher_is_worse=False : value가 작을수록 위험 (전압 등)
    """
    d = limits["danger"]
    w = limits["warning"]
    c = limits["caution"]

    if higher_is_worse:
        if value >= d:
            return "danger"
        if value >= w:
            return "warning"
        if value >= c:
            return "caution"
    else:
        if value <= d:
            return "danger"
        if value <= w:
            return "warning"
        if value <= c:
            return "caution"
    return None


def _score(stage: Optional[str]) -> int:
    return FAILSAFE_SCORE.get(stage, 0) if stage else 0


# ════════════════════════════════════════════════════════
# 드론별 상태 (호버링 전류 기준값 학습 + 히스테리시스)
# ════════════════════════════════════════════════════════
class _FailsafeState:
    def __init__(self):
        # 호버링 전류 기준값 (초기 10초 평균)
        self._hover_current_samples: deque = deque(maxlen=100)
        self._hover_current_locked: bool   = False
        self.hover_current: float          = 0.0

        # 이전 고도 (변화율 계산용)
        self._prev_altitude: Optional[float] = None
        self._prev_alt_time: Optional[float] = None

        # 히스테리시스
        self._current_level: str      = "normal"
        self._downgrade_since: Optional[float] = None   # 하락 감지 시각

    def update_hover_current(self, current: float) -> None:
        if self._hover_current_locked:
            return
        self._hover_current_samples.append(current)
        if len(self._hover_current_samples) >= 100:
            self.hover_current      = float(sum(self._hover_current_samples) / len(self._hover_current_samples))
            self._hover_current_locked = True

    def get_altitude_rate(self, altitude: float) -> Optional[float]:
        """고도 변화율 (m/s) 반환. 이전 값 없으면 None."""
        now = time.monotonic()
        rate = None
        if self._prev_altitude is not None and self._prev_alt_time is not None:
            dt = now - self._prev_alt_time
            if dt > 0:
                rate = abs(altitude - self._prev_altitude) / dt
        self._prev_altitude = altitude
        self._prev_alt_time = now
        return rate

    def apply_hysteresis(self, new_level: str) -> str:
        """
        단계 상향은 즉각 반영.
        단계 하락은 FAILSAFE_HYSTERESIS_SEC 초 유지 후 반영.
        """
        order = {"normal": 0, "monitor": 1, "rtl": 2, "land": 3}

        if order[new_level] >= order[self._current_level]:
            # 상향 또는 유지 → 즉각 반영
            self._current_level   = new_level
            self._downgrade_since = None
        else:
            # 하락 → 유예 시간 체크
            if self._downgrade_since is None:
                self._downgrade_since = time.monotonic()
            elapsed = time.monotonic() - self._downgrade_since
            if elapsed >= FAILSAFE_HYSTERESIS_SEC:
                self._current_level   = new_level
                self._downgrade_since = None

        return self._current_level

    def reset(self) -> None:
        self._hover_current_samples.clear()
        self._hover_current_locked = False
        self.hover_current         = 0.0
        self._prev_altitude        = None
        self._prev_alt_time        = None
        self._current_level        = "normal"
        self._downgrade_since      = None


# ════════════════════════════════════════════════════════
# 드론별 상태 저장소
# ════════════════════════════════════════════════════════
_states: Dict[str, _FailsafeState] = {}

def _get_state(drone_id: str) -> _FailsafeState:
    if drone_id not in _states:
        _states[drone_id] = _FailsafeState()
    return _states[drone_id]


# ════════════════════════════════════════════════════════
# 물리 임계값 직접 체크
# ════════════════════════════════════════════════════════
def _check_physical(data, state: _FailsafeState) -> List[dict]:
    """
    텔레메트리 data(SimpleNamespace) 에서 직접 수치를 읽어
    Failsafe 물리 임계값과 비교. 피처별 점수 리스트 반환.
    """
    details = []

    def _add(feature: str, stage: str, score: int, value):
        details.append({
            "feature": feature,
            "stage":   stage,
            "score":   score,
            "value":   round(float(value), 4),
            "source":  "physical",
        })

    # ── 배터리 전압 ──────────────────────────────────────
    v = getattr(data, "voltage", None)
    if v is not None:
        state.update_hover_current(getattr(data, "current", 0.0) or 0.0)
        s = _stage(v, FAILSAFE_VOLTAGE, higher_is_worse=False)
        if s:
            _add("배터리 전압", s, _score(s), v)

    # ── 배터리 전류 (호버링 대비 비율) ───────────────────
    curr = getattr(data, "current", None)
    if curr is not None and state.hover_current > 0:
        ratio = curr / state.hover_current
        s = _stage(ratio, FAILSAFE_CURRENT_RATIO, higher_is_worse=True)
        if s:
            _add("배터리 전류", s, _score(s), curr)

    # ── 자세 피치 (degree 변환) ──────────────────────────
    pitch = getattr(data, "pitch", None)
    if pitch is not None:
        pitch_deg = abs(math.degrees(pitch))
        s = _stage(pitch_deg, FAILSAFE_ATTITUDE_DEG, higher_is_worse=True)
        if s:
            _add("자세 피치", s, _score(s), pitch_deg)

    # ── 자세 롤 (degree 변환) ────────────────────────────
    roll = getattr(data, "roll", None)
    if roll is not None:
        roll_deg = abs(math.degrees(roll))
        s = _stage(roll_deg, FAILSAFE_ATTITUDE_DEG, higher_is_worse=True)
        if s:
            _add("자세 롤", s, _score(s), roll_deg)

    # ── 피치 + 롤 동시 warning 이상 → 단계 상향 ─────────
    pitch_stage = next((d["stage"] for d in details if d["feature"] == "자세 피치"), None)
    roll_stage  = next((d["stage"] for d in details if d["feature"] == "자세 롤"),  None)
    order_map   = {"caution": 1, "warning": 2, "danger": 3}
    if (order_map.get(pitch_stage, 0) >= 2 and order_map.get(roll_stage, 0) >= 2):
        for d in details:
            if d["feature"] in ("자세 피치", "자세 롤"):
                stages = ["caution", "warning", "danger"]
                idx    = stages.index(d["stage"])
                if idx < 2:
                    d["stage"] = stages[idx + 1]
                    d["score"] = _score(d["stage"])

    # ── 자이로 X/Y/Z ─────────────────────────────────────
    for attr, label in [("gyro_x", "자이로 X"), ("gyro_y", "자이로 Y"), ("gyro_z", "자이로 Z")]:
        val = getattr(data, attr, None)
        if val is not None:
            s = _stage(abs(val), FAILSAFE_GYRO, higher_is_worse=True)
            if s:
                _add(label, s, _score(s), val)

    # ── 가속도 X/Y ───────────────────────────────────────
    for attr, label in [("accel_x", "가속도 X"), ("accel_y", "가속도 Y")]:
        val = getattr(data, attr, None)
        if val is not None:
            s = _stage(abs(val), FAILSAFE_ACCEL_XY, higher_is_worse=True)
            if s:
                _add(label, s, _score(s), val)

    # ── 가속도 Z (정상 -9.8 대비 편차) ───────────────────
    accel_z = getattr(data, "accel_z", None)
    if accel_z is not None:
        deviation = abs(accel_z - (-9.8))
        s = _stage(deviation, FAILSAFE_ACCEL_Z, higher_is_worse=True)
        if s:
            _add("가속도 Z", s, _score(s), accel_z)

    # ── GPS 고도 ─────────────────────────────────────────
    alt        = getattr(data, "altitude", None)
    target_alt = getattr(data, "target_altitude", None)
    if alt is not None and target_alt is not None:
        deviation = abs(alt - target_alt)
        s = _stage(deviation, FAILSAFE_ALTITUDE, higher_is_worse=True)
        if s:
            _add("GPS 고도", s, _score(s), alt)

        # 고도 변화율 추가 감지
        rate = state.get_altitude_rate(alt)
        if rate is not None and rate > FAILSAFE_ALTITUDE["rate_danger"]:
            _add("GPS 고도 변화율", "danger", _score("danger"), rate)

    # ── 모터 PWM 편차 ────────────────────────────────────
    pwms = [getattr(data, f"pwm{i}", None) for i in range(1, 5)]
    pwms_valid = [p for p in pwms if p is not None]
    if len(pwms_valid) == 4:
        spread = max(pwms_valid) - min(pwms_valid)
        s = _stage(spread, FAILSAFE_PWM, higher_is_worse=True)
        if s:
            _add("모터 PWM 편차", s, _score(s), spread)

        # 단일 모터 한계값 체크
        for i, p in enumerate(pwms_valid, 1):
            if p > FAILSAFE_PWM["single_high"] or p < FAILSAFE_PWM["single_low"]:
                _add(f"모터 {i}번 PWM", "danger", _score("danger"), p)

    return details


# ════════════════════════════════════════════════════════
# CNN-LSTM alerts → Failsafe 점수 환산
# ════════════════════════════════════════════════════════
def _convert_ai_alerts(alerts: List[dict]) -> List[dict]:
    """
    evaluator.py 의 CNN-LSTM alerts 를 Failsafe 점수 형식으로 변환.
    level "danger"  → stage "danger"  (score 3)
    level "warning" → stage "warning" (score 2)
    source "rule"   → stage "caution" (score 1) — 규칙 기반 보조
    """
    details = []
    for a in alerts:
        source = a.get("source", "")
        level  = a.get("level", "")
        feat   = a.get("feature", a.get("system", "unknown"))
        msg    = a.get("msg", "")

        if source == "cnn_lstm":
            stage = "danger" if level == "danger" else "warning"
        elif source == "rule":
            stage = "danger" if level == "danger" else "caution"
        else:
            continue

        details.append({
            "feature": feat,
            "stage":   stage,
            "score":   _score(stage),
            "msg":     msg,
            "source":  source,
            "method":  a.get("method", ""),
        })
    return details


# ════════════════════════════════════════════════════════
# 단계 판정
# ════════════════════════════════════════════════════════
_ACTION_MESSAGES = {
    "normal":  "정상 — 이상 없음",
    "monitor": "모니터링 강화 — 주의 단계 진입, 운용자 확인 필요",
    "rtl":     "RTL 귀환 권고 — 경고 단계 진입, 귀환 명령 실행 필요",
    "land":    "즉시 착륙 권고 — 위험 단계 진입, 즉각 대응 필요",
}

def _determine_level(total_score: int) -> str:
    if total_score >= FAILSAFE_TOTAL["land"]:
        return "land"
    if total_score >= FAILSAFE_TOTAL["rtl"]:
        return "rtl"
    if total_score >= FAILSAFE_TOTAL["monitor"]:
        return "monitor"
    return "normal"


# ════════════════════════════════════════════════════════
# 공개 API
# ════════════════════════════════════════════════════════
def evaluate_failsafe(
    data,
    alerts: List[dict],
    drone_id: str,
) -> dict:
    """
    물리 임계값 체크 + CNN-LSTM alerts 를 합산하여
    Failsafe 단계와 행동 메시지 반환.

    Args:
        data:     collector.get_latest_telemetry() 반환값 (SimpleNamespace)
        alerts:   evaluator.evaluate_cbm_state() 반환값
        drone_id: 드론 ID

    Returns:
        {
            "level":       "normal" | "monitor" | "rtl" | "land",
            "total_score": int,
            "details":     [...],
            "action_msg":  str,
        }
    """
    state = _get_state(drone_id)

    # ── 1. 물리 임계값 직접 체크
    physical_details = _check_physical(data, state)

    # ── 2. CNN-LSTM / 규칙 기반 alerts → 점수 변환
    ai_details = _convert_ai_alerts(alerts)

    # ── 3. 전체 합산
    all_details = physical_details + ai_details
    total_score = sum(d["score"] for d in all_details)

    # ── 4. 단계 판정
    raw_level = _determine_level(total_score)

    # ── 5. 히스테리시스 적용
    final_level = state.apply_hysteresis(raw_level)

    return {
        "level":       final_level,
        "total_score": total_score,
        "details":     all_details,
        "action_msg":  _ACTION_MESSAGES[final_level],
    }


def reset_failsafe(drone_id: str) -> None:
    """드론 세션 초기화 시 Failsafe 상태도 함께 초기화."""
    if drone_id in _states:
        _states[drone_id].reset()