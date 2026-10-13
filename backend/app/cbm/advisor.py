"""
app/cbm/advisor.py  — Jev(TypeSafe System One) 판단 보조 모듈

역할:
  1. 탐지 결과(규칙 + CNN-LSTM alerts)와 텔레메트리를 영문 상태 JSON 으로 정리
  2. 이상이 있을 때만 Jev(/v1/systemone)에 질문 5개를 보내 확률·신뢰도를 받음
  3. 결과를 WebSocket 페이로드의 "advisor" 필드 형태로 반환 (명령 없음, 표시 전용)
  4. 모든 판단을 JSONL 로 기록하고, 운용자 동의/비동의 피드백을 같은 파일에 덧붙임

원칙:
  - 명령을 만들지 않는다. 화면 표시용 권고와 확률만 돌려준다.
  - API 키가 없거나 호출이 실패해도 예외를 밖으로 던지지 않는다 → status 로 알린다.
  - 매초 부르지 않는다. alert 가 없으면 호출하지 않고(idle), 상태 서명이 같으면 직전 결과를 재사용한다.
  - 호출은 동기(requests) 이므로 cbm_ws 에서는 evaluate_advisor_async() 를 쓴다(스레드풀).

환경변수:
  TYPESAFE_API_KEY      필수. 없으면 status="disabled"
  TYPESAFE_BASE_URL     기본 https://api.typesafe.ai  (OpenRouter 등 호환 게이트웨이면 교체)
  JEV_MODEL             기본 jev-latest
  ADVISOR_TIMEOUT_SEC   기본 0.8  (1초 샘플링 주기 안에 끝나도록)
  ADVISOR_LOG_PATH      기본 app/cbm/advisor_logs/decisions.jsonl
  ADVISOR_UNCERTAIN     기본 0.5  (최고 확률이 이 값 미만이면 "판단 불확실")

반환 advisor dict (status 별):
  disabled    : {"status": "disabled", "reason": "..."}
  idle        : {"status": "idle"}                       # 이상 없음 → 호출 안 함
  unavailable : {"status": "unavailable", "reason": "..."}  # 호출 실패/타임아웃/쿨다운
  ok          : {"status": "ok", "decision_id", "action", "action_probs", "confidence",
                 "uncertain", "severity", "severity_probs", "causes": {...},
                 "latency_ms", "cached", "model", "asked_at"}
"""

from __future__ import annotations

import hashlib
import json
import os
import threading
import time
import uuid
from collections import deque
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Deque, Dict, List, Optional

import requests
from fastapi.concurrency import run_in_threadpool

# ── 설정 ────────────────────────────────────────────────
API_KEY        = os.getenv("TYPESAFE_API_KEY", "").strip()
BASE_URL       = os.getenv("TYPESAFE_BASE_URL", "https://api.typesafe.ai").rstrip("/")
MODEL          = os.getenv("JEV_MODEL", "jev-latest")
TIMEOUT_SEC    = float(os.getenv("ADVISOR_TIMEOUT_SEC", "0.8"))
UNCERTAIN_BELOW = float(os.getenv("ADVISOR_UNCERTAIN", "0.5"))
LOG_PATH       = Path(os.getenv("ADVISOR_LOG_PATH", str(Path(__file__).parent / "advisor_logs" / "decisions.jsonl")))

CACHE_TTL_SEC   = 5.0    # 같은 상태 서명이면 이 시간 동안 직전 결과 재사용
FAIL_COOLDOWN   = 10.0   # 호출 실패 후 이 시간 동안 재시도 안 함
HISTORY_SEC     = 30     # 상태 JSON 에 넣는 최근 알람 이력 길이

KST = timezone(timedelta(hours=9))

# 모터 위치 (영문) — collector.MOTOR_POSITION 과 같은 번호 체계 (PX4 Quad X)
MOTOR_POSITION_EN = {1: "front-right", 2: "rear-left", 3: "front-left", 4: "rear-right"}

ACTIONS = ["normal", "monitor", "rtl", "land"]

# ── Jev 에 보내는 질문 (원자적으로 유지, 영문) ───────────
QUESTIONS: Dict[str, Dict[str, Any]] = {
    "action": {
        "type": "choice",
        "instructions": (
            "A quadcopter drone is in flight. Given the anomaly alerts and telemetry in the state, "
            "which action should the ground operator consider? Pick the least drastic action that "
            "is still safe."
        ),
        "criteria": {
            "normal":  "No action needed; continue the mission.",
            "monitor": "Keep flying but watch the flagged features closely.",
            "rtl":     "Return to launch now while the aircraft is still controllable.",
            "land":    "Land immediately at the current position; continuing is unsafe.",
        },
    },
    "severity": {
        "type": "score",
        "instructions": "How severe is the current situation for flight safety?",
        "criteria": [
            "Normal, no concern.",
            "Caution: minor anomaly, likely recoverable.",
            "Warning: a fault is likely developing.",
            "Danger: immediate response required.",
        ],
    },
    "motor_failure": {
        "type": "noul",
        "instructions": "A specific motor or propeller is physically failing (thrust asymmetry, vibration).",
    },
    "false_alarm": {
        "type": "noul",
        "instructions": "The alerts are most likely sensor noise or a transient maneuver rather than a real fault.",
    },
    "battery_related": {
        "type": "noul",
        "instructions": "The anomaly is caused by the battery (low cell voltage or abnormal current).",
    },
}


# ════════════════════════════════════════════════════════
# 드론별 상태 (캐시, 쿨다운, 알람 이력)
# ════════════════════════════════════════════════════════
class _DroneAdvisorState:
    def __init__(self):
        self.last_sig: Optional[str] = None
        self.last_result: Optional[dict] = None
        self.last_call_t: float = 0.0
        self.cooldown_until: float = 0.0
        self.history: Deque[tuple] = deque()   # (monotonic_t, [feature,...], action)


_states: Dict[str, _DroneAdvisorState] = {}
_guard = threading.Lock()


def _state_for(drone_id: str) -> _DroneAdvisorState:
    with _guard:
        s = _states.get(drone_id)
        if s is None:
            s = _states[drone_id] = _DroneAdvisorState()
        return s


def reset_advisor(drone_id: str) -> None:
    with _guard:
        _states.pop(drone_id, None)


# ════════════════════════════════════════════════════════
# 상태 JSON 구성 (영문 키/값)
# ════════════════════════════════════════════════════════
def _motor_en(feature: str) -> Optional[str]:
    if feature.startswith("pwm_dev"):
        try:
            return MOTOR_POSITION_EN.get(int(feature[-1]))
        except ValueError:
            return None
    return None


def _alert_to_en(a: dict) -> dict:
    """evaluator 의 alert → Jev 용 영문 요약. 한국어 msg/position 은 제외."""
    feat = a.get("feature") or a.get("system", "unknown")
    out: Dict[str, Any] = {
        "feature": feat,
        "source":  a.get("source", ""),            # rule | cnn_lstm
        "method":  a.get("method", "threshold"),   # fail_count | severe | cusum | threshold
        "level":   a.get("level", ""),             # warning | danger
    }
    thr = a.get("threshold")
    err = a.get("err")
    if isinstance(err, (int, float)) and isinstance(thr, (int, float)) and thr > 0:
        out["error_over_threshold"] = round(float(err) / float(thr), 2)
    if "severity_ratio" in a:
        out["error_over_threshold"] = a["severity_ratio"]
    if "cusum" in a:
        out["cusum"] = a["cusum"]
    pos = _motor_en(feat)
    if pos:
        out["motor"] = pos
    return out


def build_state(drone_id: str, data, alerts: List[dict], engine=None,
                missing: Optional[set] = None, hist: Optional[_DroneAdvisorState] = None) -> dict:
    """Jev 에 보낼 상태. 원시 센서 배열 대신 요약값만 넣는다(모델은 긴 숫자열에 약함)."""
    volt = float(getattr(data, "voltage", 0.0) or 0.0)
    n_cells = max(1, int(round(volt / 3.85))) if volt > 5.0 else 1
    cell_v = round(volt / n_cells, 2) if volt > 0 else None

    state: Dict[str, Any] = {
        "vehicle": "quadcopter",
        "drone_id": drone_id,
        "battery": {
            "cell_voltage": cell_v,
            "percent": getattr(data, "battery_pct", None),
            "current_a": round(float(getattr(data, "current", 0.0) or 0.0), 1),
        },
        "gnss": {"satellites": getattr(data, "satellites", None)},
        "alerts": [_alert_to_en(a) for a in alerts],
        "alert_count": len(alerts),
    }

    # 탐지 엔진 내부값 (있으면) — 어느 피처가 임계 아래서 누적 중인지
    if engine is not None and getattr(engine, "ready", False):
        try:
            cus = engine.get_cusum_values(drone_id) or {}
            fc  = engine.get_fail_counts(drone_id) or {}
            state["building_up"] = {
                k: {"consecutive_over_threshold": fc.get(k, 0), "cusum": round(v, 1)}
                for k, v in cus.items()
                if (fc.get(k, 0) > 0 or v > 5.0)
            }
        except Exception:
            pass

    if missing:
        state["telemetry_missing"] = sorted(missing)

    if hist is not None and hist.history:
        state["recent_30s"] = {
            "alerted_features": sorted({f for _, feats, _ in hist.history for f in feats}),
            "previous_recommendations": [act for _, _, act in hist.history if act][-5:],
        }
    return state


def _signature(state: dict) -> str:
    """캐시용 서명: 알람 구성이 바뀔 때만 달라지도록 거친 값만 사용."""
    key = [(a["feature"], a["method"], a.get("level"),
            round(a.get("error_over_threshold", 0) * 2) / 2)  # 0.5 단위
           for a in state.get("alerts", [])]
    key.sort()
    raw = json.dumps({"alerts": key, "cells": state["battery"].get("cell_voltage")}, sort_keys=True)
    return hashlib.md5(raw.encode()).hexdigest()


# ════════════════════════════════════════════════════════
# Jev 호출
# ════════════════════════════════════════════════════════
def _call_jev(state: dict) -> dict:
    r = requests.post(
        f"{BASE_URL}/v1/systemone",
        headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"},
        json={"model": MODEL, "state": state, "questions": QUESTIONS},
        timeout=TIMEOUT_SEC,
    )
    r.raise_for_status()
    return r.json()


def _parse(resp: dict) -> dict:
    ans = resp.get("answers", {})
    act = ans.get("action", {})
    sev = ans.get("severity", {})
    probs = {k: round(float(v), 3) for k, v in (act.get("probabilities") or {}).items()}
    top = max(probs.values()) if probs else 0.0
    return {
        "action":         act.get("choice"),
        "action_probs":   probs,
        "confidence":     round(float(act.get("confidence", 0.0)), 3),
        "uncertain":      top < UNCERTAIN_BELOW,
        "severity":       round(float(sev.get("score", 0.0)), 2),
        "severity_probs": {k: round(float(v), 3) for k, v in (sev.get("probabilities") or {}).items()},
        "causes": {
            "motor_failure":   round(float((ans.get("motor_failure") or {}).get("noul", 0.0)), 3),
            "false_alarm":     round(float((ans.get("false_alarm") or {}).get("noul", 0.0)), 3),
            "battery_related": round(float((ans.get("battery_related") or {}).get("noul", 0.0)), 3),
        },
        "model": resp.get("model", MODEL),
        "usage": resp.get("usage"),
    }


# ════════════════════════════════════════════════════════
# 기록 (JSONL)
# ════════════════════════════════════════════════════════
_log_lock = threading.Lock()


def _append_log(record: dict) -> None:
    try:
        LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        with _log_lock, open(LOG_PATH, "a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
    except Exception as e:
        print(f"[advisor] 기록 실패: {e}")


def record_feedback(decision_id: str, drone_id: str, verdict: str, comment: str = "") -> dict:
    """운용자 동의/비동의. verdict: agree | disagree. 같은 JSONL 에 kind=feedback 으로 추가."""
    rec = {
        "kind": "feedback",
        "ts": datetime.now(KST).isoformat(),
        "decision_id": decision_id,
        "drone_id": drone_id,
        "verdict": verdict,
        "comment": comment,
    }
    _append_log(rec)
    return rec


def read_log_tail(n: int = 200) -> List[dict]:
    if not LOG_PATH.exists():
        return []
    try:
        with open(LOG_PATH, encoding="utf-8") as f:
            lines = f.readlines()[-n:]
        return [json.loads(l) for l in lines if l.strip()]
    except Exception:
        return []


# ════════════════════════════════════════════════════════
# 공개 API
# ════════════════════════════════════════════════════════
def evaluate_advisor(drone_id: str, data, alerts: List[dict], engine=None,
                     missing: Optional[set] = None) -> dict:
    """
    cbm_ws 의 1초 판정 블록에서 호출. 예외를 던지지 않는다.
    """
    if not API_KEY:
        return {"status": "disabled", "reason": "TYPESAFE_API_KEY not set"}

    st = _state_for(drone_id)
    now = time.monotonic()

    # 이력 정리 (30초)
    while st.history and now - st.history[0][0] > HISTORY_SEC:
        st.history.popleft()

    # 이상 없음 → 호출 안 함
    if not alerts:
        st.history.append((now, [], None))
        return {"status": "idle"}

    state = build_state(drone_id, data, alerts, engine, missing, st)
    sig = _signature(state)

    # 같은 상태 서명이면 직전 결과 재사용
    if st.last_result and st.last_sig == sig and now - st.last_call_t < CACHE_TTL_SEC:
        st.history.append((now, [a["feature"] for a in state["alerts"]], st.last_result.get("action")))
        return {**st.last_result, "cached": True}

    # 실패 쿨다운 중
    if now < st.cooldown_until:
        st.history.append((now, [a["feature"] for a in state["alerts"]], None))
        out = {"status": "unavailable", "reason": f"cooldown {int(st.cooldown_until - now)}s"}
        if st.last_result:
            out["last"] = st.last_result
        return out

    t0 = time.monotonic()
    try:
        resp = _call_jev(state)
        parsed = _parse(resp)
    except requests.Timeout:
        st.cooldown_until = now + FAIL_COOLDOWN
        st.history.append((now, [a["feature"] for a in state["alerts"]], None))
        return {"status": "unavailable", "reason": f"timeout >{TIMEOUT_SEC}s"}
    except requests.HTTPError as e:
        code = e.response.status_code if e.response is not None else "?"
        st.cooldown_until = now + (FAIL_COOLDOWN * 3 if code in (401, 402, 403) else FAIL_COOLDOWN)
        st.history.append((now, [a["feature"] for a in state["alerts"]], None))
        detail = ""
        try:
            detail = e.response.text[:200]
        except Exception:
            pass
        print(f"[advisor] HTTP {code}: {detail}")
        return {"status": "unavailable", "reason": f"http {code}"}
    except Exception as e:
        st.cooldown_until = now + FAIL_COOLDOWN
        st.history.append((now, [a["feature"] for a in state["alerts"]], None))
        print(f"[advisor] 호출 오류: {e}")
        return {"status": "unavailable", "reason": str(e)[:120]}

    latency_ms = int((time.monotonic() - t0) * 1000)
    decision_id = uuid.uuid4().hex[:12]
    result = {
        "status": "ok",
        "decision_id": decision_id,
        "asked_at": datetime.now(KST).isoformat(),
        "latency_ms": latency_ms,
        "cached": False,
        **parsed,
    }

    st.last_sig = sig
    st.last_result = result
    st.last_call_t = now
    st.history.append((now, [a["feature"] for a in state["alerts"]], parsed["action"]))

    _append_log({
        "kind": "decision",
        "ts": result["asked_at"],
        "decision_id": decision_id,
        "drone_id": drone_id,
        "state": state,
        "answer": parsed,
        "latency_ms": latency_ms,
    })
    print(f"[advisor] {drone_id} action={parsed['action']} "
          f"p={parsed['action_probs']} conf={parsed['confidence']} {latency_ms}ms")
    return result


async def evaluate_advisor_async(drone_id: str, data, alerts: List[dict], engine=None,
                                 missing: Optional[set] = None) -> dict:
    """async 루프(cbm_ws)용 — 동기 호출을 스레드풀로 넘겨 이벤트 루프를 막지 않는다."""
    return await run_in_threadpool(evaluate_advisor, drone_id, data, alerts, engine, missing)


def advisor_enabled() -> bool:
    return bool(API_KEY)