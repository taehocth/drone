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


# ════════════════════════════════════════════════════════
# WebSocket — 실시간 CBM 스트림
# ════════════════════════════════════════════════════════
@router.websocket("/ws/cbm")
async def cbm_ws(websocket: WebSocket):
    """
    CBM 실시간 상태 WebSocket 엔드포인트.

    쿼리 파라미터:
        drone_id (선택): 특정 드론 지정. 없으면 가장 최근 드론 자동 선택.

    전송 페이로드:
    {
        "timestamp":    "2025-...",
        "drone_id":     "drone-001",
        "window_size":  20,
        "model_ready":  true,
        "has_alert":    true,
        "systems": [...],        # 기존 이상 탐지 alerts
        "failsafe": {
            "level":       "rtl",
            "total_score": 5,
            "details": [
                {"feature": "배터리 전압", "stage": "warning", "score": 2, "value": 19.2, "source": "physical"},
                {"feature": "sensor_gyro_x", "stage": "warning", "score": 2, "source": "cnn_lstm", ...},
            ],
            "action_msg": "RTL 귀환 권고 — 경고 단계 진입, 귀환 명령 실행 필요"
        }
    }
    """
    drone_id = websocket.query_params.get("drone_id")
    await websocket.accept()
    print(f"📡 CBM WebSocket 연결 시작 drone_id={drone_id or 'auto'}")

    engine = get_inference_engine()

    try:
        while True:
            if websocket.application_state.value != 1:
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

                # ── 4. 전송
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
            except Exception as loop_err:
                print(f"⚠️ CBM 내부 루프 오류: {loop_err}")
                await asyncio.sleep(1)
                continue

    except Exception as e:
        print(f"💥 CBM WebSocket 전체 오류: {e}")

    finally:
        if websocket.application_state.value == 1:
            await websocket.close()
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