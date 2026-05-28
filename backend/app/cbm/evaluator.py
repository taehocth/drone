"""
app/cbm/evaluator.py

역할:
  1. 규칙 기반 이상 탐지 (전압/온도/GPS 등 즉각 반응)
  2. CNN-LSTM 추론 결과 통합
  3. 두 결과를 source 필드로 구분하여 합산 반환
  4. Failsafe 알고리즘 연동 (인지 → 판단 → 대처 3단계)
"""

from __future__ import annotations

from typing import List, Optional

from app.cbm.thresholds import BATTERY_LIMITS, ESC_LIMITS, FCC_LIMITS, GNSS_LIMITS
from app.cbm.inference import get_inference_engine
from app.cbm.failsafe import evaluate_failsafe


# ════════════════════════════════════════════════════════
# 규칙 기반 평가
# ════════════════════════════════════════════════════════
def _evaluate_rules(data) -> List[dict]:
    """
    기존 규칙 기반 이상 탐지.
    즉각 반응이 필요한 전압 / 온도 / GPS 항목 유지.
    모든 alert 에 source="rule" 추가.
    """
    alerts = []

    def _a(system, level, msg):
        alerts.append({
            "system": system,
            "level":  level,
            "source": "rule",
            "msg":    msg,
        })

    # ── 전압 / 전류 ──────────────────────────────────────
    v = getattr(data, "voltage", None)
    if v is not None:
        if v <= BATTERY_LIMITS["voltage_danger"]:
            _a("Battery", "danger",  f"전압 낮음 ({v:.1f}V)")
        elif v <= BATTERY_LIMITS["voltage_warning"]:
            _a("Battery", "warning", f"전압 낮음 ({v:.1f}V)")

    # ── 배터리 온도 ──────────────────────────────────────
    t = getattr(data, "temp", None)
    if t is not None and t > 0:
        if t >= BATTERY_LIMITS["temp_danger"]:
            _a("Battery", "danger",  f"온도 과열 ({t:.1f}℃)")
        elif t >= BATTERY_LIMITS["temp_warning"]:
            _a("Battery", "warning", f"온도 상승 ({t:.1f}℃)")

    # ── ESC 온도 ─────────────────────────────────────────
    et = getattr(data, "esc_temp", None)
    if et is not None and et > 0:
        if et >= ESC_LIMITS["temp_danger"]:
            _a("ESC", "danger",  f"ESC 온도 과다 ({et:.1f}℃)")
        elif et >= ESC_LIMITS["temp_warning"]:
            _a("ESC", "warning", f"ESC 온도 상승 ({et:.1f}℃)")

    # ── 모터 RPM 불균형 ──────────────────────────────────
    rpm = getattr(data, "rpm_variation", None)
    if rpm is not None and abs(rpm) >= ESC_LIMITS["rpm_diff_warning"]:
        _a("Motor", "warning", f"모터 RPM 불균형 ({rpm * 100:.0f}%)")

    # ── FCC CPU 부하 ─────────────────────────────────────
    cpu = getattr(data, "cpu_load", None)
    if cpu is not None and cpu > 0:
        if cpu >= FCC_LIMITS["cpu_danger"]:
            _a("FCC", "danger",  f"CPU 부하 심각 ({cpu * 100:.0f}%)")
        elif cpu >= FCC_LIMITS["cpu_warning"]:
            _a("FCC", "warning", f"CPU 부하 높음 ({cpu * 100:.0f}%)")

    # ── IMU 온도 ─────────────────────────────────────────
    imu_t = getattr(data, "imu_temp", None)
    if imu_t is not None and imu_t > 0:
        if imu_t >= FCC_LIMITS["imu_temp_danger"]:
            _a("FCC", "danger",  f"IMU 과열 ({imu_t:.1f}℃)")
        elif imu_t >= FCC_LIMITS["imu_temp_warning"]:
            _a("FCC", "warning", f"IMU 온도 상승 ({imu_t:.1f}℃)")

    # ── GPS 위성 수 ──────────────────────────────────────
    sats = getattr(data, "satellites", None)
    if sats is not None:
        if sats <= GNSS_LIMITS["sat_danger"]:
            _a("GNSS", "danger",  f"위성 신호 부족 ({sats}개)")
        elif sats <= GNSS_LIMITS["sat_warning"]:
            _a("GNSS", "warning", f"위성 신호 약함 ({sats}개)")

    # ── HDOP ────────────────────────────────────────────
    hdop = getattr(data, "hdop", None)
    if hdop is not None and hdop < 90:
        if hdop >= GNSS_LIMITS["hdop_danger"]:
            _a("GNSS", "danger",  f"HDOP 높음 ({hdop:.2f})")
        elif hdop >= GNSS_LIMITS["hdop_warning"]:
            _a("GNSS", "warning", f"HDOP 상승 ({hdop:.2f})")

    # ── 배터리 잔량 ──────────────────────────────────────
    pct = getattr(data, "battery_pct", None)
    if pct is not None and pct > 0:
        if pct <= 20:
            _a("Battery", "danger",  f"배터리 위험 ({pct}%) — 즉시 귀환")
        elif pct <= 35:
            _a("Battery", "warning", f"배터리 부족 ({pct}%) — 귀환 준비")

    return alerts


# ════════════════════════════════════════════════════════
# CNN-LSTM 추론 평가
# ════════════════════════════════════════════════════════
def _evaluate_cnn_lstm(drone_id: str) -> List[dict]:
    """
    inference 엔진에서 CNN-LSTM 추론 결과 가져오기.
    엔진 미준비 or 윈도우 미충족 시 빈 리스트 반환.
    """
    try:
        engine = get_inference_engine()
        if not engine.ready:
            return []
        return engine.run(drone_id)
    except Exception as e:
        print(f"[evaluator] CNN-LSTM 추론 오류 ({drone_id}): {e}")
        return []


# ════════════════════════════════════════════════════════
# 통합 평가 (공개 API)
# ════════════════════════════════════════════════════════
def evaluate_cbm_state(
    data,
    drone_id: Optional[str] = None,
) -> dict:
    """
    규칙 기반 + CNN-LSTM 결과를 통합하고
    Failsafe 단계까지 판정하여 반환.

    Args:
        data:     collector.get_latest_telemetry() 반환값 (SimpleNamespace)
        drone_id: 드론 ID (CNN-LSTM 추론에 필요, None 이면 AI 탐지 스킵)

    Returns:
        {
            "alerts": [...],       # 기존 이상 탐지 alerts
            "failsafe": {
                "level":       "normal" | "monitor" | "rtl" | "land",
                "total_score": int,
                "details":     [...],
                "action_msg":  str,
            }
        }
    """
    # ── 1. 규칙 기반
    rule_alerts = _evaluate_rules(data)

    # ── 2. CNN-LSTM
    ai_alerts = _evaluate_cnn_lstm(drone_id) if drone_id else []

    # ── 3. 중복 제거 (rule 우선)
    merged: List[dict] = list(rule_alerts)
    rule_keys = {(a["system"], a["level"]) for a in rule_alerts}

    for ai in ai_alerts:
        key = (ai["system"], ai["level"])
        if key not in rule_keys:
            merged.append(ai)
        else:
            print(
                f"[evaluator] AI 중복 탐지 (rule 우선): "
                f"system={ai['system']} feature={ai.get('feature')} "
                f"method={ai.get('method')}"
            )

    # ── 4. severity 정렬 (danger → warning 순)
    level_order = {"danger": 0, "warning": 1}
    merged.sort(key=lambda a: level_order.get(a["level"], 2))

    # ── 5. Failsafe 판정
    failsafe_result = (
        evaluate_failsafe(data, merged, drone_id)
        if drone_id
        else {"level": "normal", "total_score": 0, "details": [], "action_msg": "정상 — 이상 없음"}
    )

    return {
        "alerts":   merged,
        "failsafe": failsafe_result,
    }