"""
app/api/routes/cbm_ws.py

변경사항:
  1. drone_id 쿼리 파라미터 수신 → collector / inference 에 전달
  2. update_window() 호출로 슬라이딩 윈도우 버퍼 갱신
  3. 이상 감지 시 즉시 전송 / 정상 시 2초 주기 유지
  4. 윈도우 충족 상태(버퍼 크기) 페이로드에 포함
  5. Failsafe 판정 결과 페이로드에 추가
  6. GET /cbm/status            — 현재 상태 REST 조회
  7. POST /cbm/reset/{drone_id} — 세션 전환 시 CUSUM·버퍼·Failsafe 초기화

  ★ 연결 종료 처리 개선:
     - 이미 닫힌 소켓에 전송 시 발생하던
       "unable to perform operation ... the handler is closed" 무한 반복 제거.
     - RuntimeError/ConnectionError 는 continue 가 아니라 break 로 루프 종료.
     - 전송 직전에도 연결 상태를 재확인.
"""

from __future__ import annotations

import asyncio
import json
from datetime import datetime

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException

from app.cbm.collector import (
    get_latest_telemetry,
    update_window,
    get_window_size,
    list_active_drones,
)
from app.cbm.evaluator import evaluate_cbm_state
from app.cbm.inference import get_inference_engine
from app.cbm.failsafe import reset_failsafe

router = APIRouter()

# 정상 상태 전송 주기 (초)
NORMAL_INTERVAL = 2.0
# 이상 감지 후 재확인 주기 (초)
ALERT_INTERVAL  = 0.5
# 윈도우 미충족 시 전송 주기 (초)
WARMUP_INTERVAL = 1.0


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
    print(f"📡 CBM WebSocket 연결 시작 drone_id={drone_id or 'auto'}")

    engine = get_inference_engine()

    try:
        while True:
            # ── 연결이 살아있는지 먼저 확인 (닫혔으면 조용히 종료) ──
            if not _is_connected(websocket):
                print("⚠️ CBM 클라이언트 연결 끊김 감지 → 루프 종료")
                break

            try:
                # ── 1. 슬라이딩 윈도우 버퍼 갱신
                resolved_id = update_window(drone_id)
                active_id   = resolved_id or drone_id or "unknown"
                win_size    = get_window_size(active_id)
                model_ready = engine.ready

                # ── 2. 최신 텔레메트리 + 통합 평가 + Failsafe 판정
                data    = get_latest_telemetry()
                results = evaluate_cbm_state(data, drone_id=active_id)

                alerts         = results["alerts"]
                failsafe       = results["failsafe"]
                has_alert      = len(alerts) > 0
                failsafe_level = failsafe["level"]

                # ── 3. 페이로드 구성
                payload = {
                    "timestamp":   datetime.now().isoformat(),
                    "drone_id":    active_id,
                    "window_size": win_size,
                    "model_ready": model_ready,
                    "has_alert":   has_alert,
                    "systems":     alerts,
                    "failsafe":    failsafe,
                }

                # ── 4. 전송 직전 재확인 후 전송
                if not _is_connected(websocket):
                    break
                await websocket.send_text(
                    json.dumps(payload, ensure_ascii=False)
                )

                if failsafe_level in ("rtl", "land"):
                    print(
                        f"🚨 FAILSAFE [{failsafe_level.upper()}] → drone={active_id} "
                        f"score={failsafe['total_score']} "
                        f"msg={failsafe['action_msg']}"
                    )
                elif has_alert:
                    print(
                        f"⚠️  CBM 이상 감지 → drone={active_id} "
                        f"alerts={len(alerts)}개 failsafe={failsafe_level}"
                    )
                else:
                    print(
                        f"📤 CBM 정상 → drone={active_id} "
                        f"window={win_size}/20"
                    )

                # ── 5. 전송 주기 조정
                if win_size < 20:
                    await asyncio.sleep(WARMUP_INTERVAL)
                elif failsafe_level in ("rtl", "land") or has_alert:
                    await asyncio.sleep(ALERT_INTERVAL)
                else:
                    await asyncio.sleep(NORMAL_INTERVAL)

            except WebSocketDisconnect:
                print("❌ CBM WebSocket 연결 종료됨 (클라이언트 측)")
                break
            except (RuntimeError, ConnectionError) as conn_err:
                # 이미 닫힌 소켓에 쓰기 시도 등 — continue 하면 무한 반복되므로 break!
                # ("unable to perform operation on ... the handler is closed" 방지)
                print(f"ℹ️  CBM WS 연결 종료 감지 → 루프 종료: {conn_err}")
                break
            except Exception as loop_err:
                # 그 외 일시적 오류만 재시도
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
# REST — 현재 CBM 상태 조회
# ════════════════════════════════════════════════════════
@router.get("/status")
async def get_cbm_status(drone_id: str | None = None):
    engine    = get_inference_engine()
    active_id = update_window(drone_id) or drone_id or "unknown"
    win_size  = get_window_size(active_id)

    data    = get_latest_telemetry()
    results = evaluate_cbm_state(data, drone_id=active_id)

    return {
        "timestamp":     datetime.now().isoformat(),
        "drone_id":      active_id,
        "window_size":   win_size,
        "model_ready":   engine.ready,
        "has_alert":     len(results["alerts"]) > 0,
        "systems":       results["alerts"],
        "failsafe":      results["failsafe"],
        # 디버그 정보
        "cusum_values":  engine.get_cusum_values(active_id) if engine.ready else None,
        "fail_counts":   engine.get_fail_counts(active_id)  if engine.ready else None,
        "active_drones": list_active_drones(),
    }


# ════════════════════════════════════════════════════════
# REST — 드론 세션 초기화
# ════════════════════════════════════════════════════════
@router.post("/reset/{drone_id}")
async def reset_cbm_session(drone_id: str):
    """
    비행 세션 전환 시 특정 드론의
    CUSUM · 버퍼 · Failsafe 상태 초기화.
    """
    engine = get_inference_engine()

    if not engine.ready:
        raise HTTPException(status_code=503, detail="CNN-LSTM 모델 미준비")

    engine.reset(drone_id)
    reset_failsafe(drone_id)

    return {
        "ok":       True,
        "drone_id": drone_id,
        "msg":      f"{drone_id} CBM + Failsafe 세션 초기화 완료",
    }