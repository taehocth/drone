"""
app/api/routes/cbm_ws.py

변경사항 (이번 수정):
  ★ Jev 판단 보조(advisor) 연동
     - 1초 판정 블록에서 alerts 를 advisor.evaluate_advisor_async() 에 넘겨 결과를 payload["advisor"] 로 전송.
     - 이상이 없으면 호출하지 않음(idle), API 키가 없으면 disabled, 실패 시 unavailable.
       어느 경우에도 기존 알람·판정 흐름에는 영향 없음 (표시 전용, 명령 없음).
     - POST /cbm/advisor/feedback  — 운용자 동의/비동의 기록
     - GET  /cbm/advisor/log       — 판단 기록(JSONL) 최근 N건 조회
  ★ 버퍼 21행 반영: 워밍업 판정 기준을 20 → BUF_SIZE(21) 로 (collector/inference 수정과 짝)
  ★ GET /cbm/status 가 evaluate_cbm_state() 를 다시 돌려 fail_count/CUSUM 을 중복 누적하던 문제 제거:
     WebSocket 루프가 캐시한 최근 결과를 반환(조회 전용).

이전 변경사항:
  - 샘플링 주기(1초) / 송신 주기(0.5·1·2초) 분리, 연결 종료 처리 개선 (내용 동일)
"""

from __future__ import annotations

import asyncio
import json
import time
from datetime import datetime
from typing import Dict, Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from pydantic import BaseModel

from app.cbm.collector import (
    get_latest_telemetry,
    update_window,
    get_window_size,
    list_active_drones,
    get_missing_features,
    BUF_SIZE,
)
from app.cbm.evaluator import evaluate_cbm_state
from app.cbm.inference import get_inference_engine
from app.cbm.failsafe import reset_failsafe
from app.cbm.advisor import (
    evaluate_advisor_async,
    record_feedback,
    read_log_tail,
    reset_advisor,
    advisor_enabled,
)

router = APIRouter()

# ── 윈도우 샘플링 · AI 판정 주기 (초) ──────────────────
#   학습 데이터(ulg_to_csv: 약 1초/줄)와 반드시 동일해야 함. 상태에 따라 바꾸지 말 것.
SAMPLE_INTERVAL = 1.0

# ── WebSocket 송신 주기 (초) — UI 반응성용, 샘플링과 무관 ──
NORMAL_INTERVAL = 2.0   # 정상 상태
ALERT_INTERVAL  = 0.5   # 이상 감지 중 (화면 빠른 갱신)
WARMUP_INTERVAL = 1.0   # 윈도우 미충족

# ── 드론별 최근 판정 캐시 (REST /status 조회용 — 판정을 다시 돌리지 않는다) ──
_last_results: Dict[str, dict] = {}
_last_advisor: Dict[str, dict] = {}


def _is_connected(websocket: WebSocket) -> bool:
    """WebSocket 이 아직 CONNECTED(1) 상태인지 확인."""
    try:
        return websocket.application_state.value == 1
    except Exception:
        return False


# ════════════════════════════════════════════════════════
# WebSocket — 실시간 CBM 스트림
# ════════════════════════════════════════════════════════
@router.websocket("/ws/cbm")
async def cbm_ws(websocket: WebSocket):
    """
    CBM 실시간 상태 WebSocket 엔드포인트.

    쿼리 파라미터:
        drone_id (선택): 특정 드론 지정. 없으면 가장 최근 드론 자동 선택.
    """
    drone_id = websocket.query_params.get("drone_id")
    await websocket.accept()
    print(f"📡 CBM WebSocket 연결 시작 drone_id={drone_id or 'auto'} "
          f"advisor={'on' if advisor_enabled() else 'off (no API key)'}")

    engine = get_inference_engine()

    last_sample_t: float = 0.0
    active_id: str = drone_id or "unknown"
    results: dict | None = None
    advisor: dict = {"status": "idle"}

    try:
        while True:
            if not _is_connected(websocket):
                print("⚠️ CBM 클라이언트 연결 끊김 감지 → 루프 종료")
                break

            try:
                now = time.monotonic()

                # ── 1. 샘플링 주기(1초)에 도달했을 때만: 윈도우 갱신 + 판정 1회 + Jev 보조 판단
                if results is None or (now - last_sample_t) >= SAMPLE_INTERVAL:
                    resolved_id = update_window(drone_id)
                    active_id   = resolved_id or drone_id or "unknown"
                    data        = get_latest_telemetry()
                    results     = evaluate_cbm_state(data, drone_id=active_id)
                    last_sample_t = now

                    # Jev: alerts 가 있을 때만 실제 호출됨. 스레드풀 실행 + 0.8초 타임아웃이라
                    # 1초 주기 안에 끝난다. 실패해도 예외를 던지지 않는다.
                    advisor = await evaluate_advisor_async(
                        active_id, data, results["alerts"], engine,
                        get_missing_features(active_id),
                    )

                    _last_results[active_id] = results
                    _last_advisor[active_id] = advisor

                win_size    = get_window_size(active_id)
                model_ready = engine.ready

                alerts         = results["alerts"]
                failsafe       = results["failsafe"]
                has_alert      = len(alerts) > 0
                failsafe_level = failsafe["level"]

                payload = {
                    "timestamp":   datetime.now().isoformat(),
                    "drone_id":    active_id,
                    "window_size": win_size,
                    "window_full": BUF_SIZE,
                    "model_ready": model_ready,
                    "has_alert":   has_alert,
                    "systems":     alerts,
                    "failsafe":    failsafe,
                    # ★ Jev 판단 보조 (표시 전용). status: disabled | idle | unavailable | ok
                    "advisor":     advisor,
                    "feature_errors": (engine.get_last_errors(active_id) or {}) if model_ready else {},
                    "missing_features": sorted(get_missing_features(active_id)),
                }

                if not _is_connected(websocket):
                    break
                await websocket.send_text(json.dumps(payload, ensure_ascii=False))

                if failsafe_level in ("rtl", "land"):
                    print(f"🚨 FAILSAFE [{failsafe_level.upper()}] → drone={active_id} "
                          f"score={failsafe['total_score']} msg={failsafe['action_msg']}")
                elif has_alert:
                    adv = (f"advisor={advisor.get('action')}({advisor.get('confidence')})"
                           if advisor.get("status") == "ok" else f"advisor={advisor.get('status')}")
                    print(f"⚠️  CBM 이상 감지 → drone={active_id} alerts={len(alerts)}개 "
                          f"failsafe={failsafe_level} {adv}")
                else:
                    print(f"📤 CBM 정상 → drone={active_id} window={win_size}/{BUF_SIZE}")

                # ── 송신 주기 조정 (UI 용 — 샘플링 주기와 무관)
                if win_size < BUF_SIZE:
                    await asyncio.sleep(WARMUP_INTERVAL)
                elif failsafe_level in ("rtl", "land") or has_alert:
                    await asyncio.sleep(ALERT_INTERVAL)
                else:
                    await asyncio.sleep(NORMAL_INTERVAL)

            except WebSocketDisconnect:
                print("❌ CBM WebSocket 연결 종료됨 (클라이언트 측)")
                break
            except (RuntimeError, ConnectionError) as conn_err:
                print(f"ℹ️  CBM WS 연결 종료 감지 → 루프 종료: {conn_err}")
                break
            except Exception as loop_err:
                print(f"⚠️ CBM 내부 루프 오류: {loop_err}")
                await asyncio.sleep(1)
                continue

    except Exception as e:
        print(f"💥 CBM WebSocket 전체 오류: {e}")

    finally:
        try:
            if _is_connected(websocket):
                await websocket.close()
        except Exception:
            pass
        print(f"🧹 CBM WebSocket 정리 완료 drone_id={drone_id or 'auto'}")


# ════════════════════════════════════════════════════════
# REST — 현재 CBM 상태 조회 (조회 전용: 판정을 다시 돌리지 않음)
# ════════════════════════════════════════════════════════
@router.get("/status")
async def get_cbm_status(drone_id: str | None = None):
    engine    = get_inference_engine()
    actives   = list_active_drones()
    active_id = drone_id or (actives[-1] if actives else "unknown")
    win_size  = get_window_size(active_id)

    # WebSocket 루프가 캐시한 최근 판정. 루프가 아직 안 돌았으면 빈 결과.
    results = _last_results.get(active_id) or {
        "alerts": [],
        "failsafe": {"level": "normal", "total_score": 0, "details": [], "action_msg": "판정 대기"},
    }
    advisor = _last_advisor.get(active_id) or {"status": "idle"}

    return {
        "timestamp":     datetime.now().isoformat(),
        "drone_id":      active_id,
        "window_size":   win_size,
        "window_full":   BUF_SIZE,
        "model_ready":   engine.ready,
        "has_alert":     len(results["alerts"]) > 0,
        "systems":       results["alerts"],
        "failsafe":      results["failsafe"],
        "advisor":       advisor,
        "advisor_enabled": advisor_enabled(),
        "cusum_values":  engine.get_cusum_values(active_id) if engine.ready else None,
        "fail_counts":   engine.get_fail_counts(active_id)  if engine.ready else None,
        "active_drones": actives,
    }


# ════════════════════════════════════════════════════════
# REST — 드론 세션 초기화
# ════════════════════════════════════════════════════════
@router.post("/reset/{drone_id}")
async def reset_cbm_session(drone_id: str):
    engine = get_inference_engine()
    if not engine.ready:
        raise HTTPException(status_code=503, detail="CNN-LSTM 모델 미준비")

    engine.reset(drone_id)
    reset_failsafe(drone_id)
    reset_advisor(drone_id)
    _last_results.pop(drone_id, None)
    _last_advisor.pop(drone_id, None)

    return {"ok": True, "drone_id": drone_id, "msg": f"{drone_id} CBM + Failsafe + Advisor 세션 초기화 완료"}


# ════════════════════════════════════════════════════════
# REST — Jev 판단 보조: 운용자 피드백 / 기록 조회
# ════════════════════════════════════════════════════════
class AdvisorFeedback(BaseModel):
    decision_id: str
    drone_id: str
    verdict: str            # "agree" | "disagree"
    comment: Optional[str] = ""


@router.post("/advisor/feedback")
async def post_advisor_feedback(body: AdvisorFeedback):
    """화면의 동의/비동의 버튼 → JSONL 기록 (향후 로컬 모델 파인튜닝 라벨)."""
    if body.verdict not in ("agree", "disagree"):
        raise HTTPException(status_code=400, detail="verdict must be 'agree' or 'disagree'")
    rec = record_feedback(body.decision_id, body.drone_id, body.verdict, body.comment or "")
    return {"ok": True, "recorded": rec}


@router.get("/advisor/log")
async def get_advisor_log(n: int = 200):
    """판단 기록 최근 n건 (decision + feedback). 검증·분석용."""
    return {"count": min(n, 1000), "items": read_log_tail(min(n, 1000))}