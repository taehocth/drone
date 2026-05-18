"""
app/api/routes/cbm_ws.py

변경사항:
  1. drone_id 쿼리 파라미터 수신 → collector / inference 에 전달
  2. update_window() 호출로 슬라이딩 윈도우 버퍼 갱신
  3. 이상 감지 시 즉시 전송 / 정상 시 2초 주기 유지
  4. 윈도우 충족 상태(버퍼 크기) 페이로드에 포함
  5. GET /cbm/status          — 현재 상태 REST 조회
  6. POST /cbm/reset/{drone_id} — 세션 전환 시 CUSUM·버퍼 초기화
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

router = APIRouter()

# 정상 상태 전송 주기 (초)
NORMAL_INTERVAL   = 2.0
# 이상 감지 후 재확인 주기 (초) — 즉시 전송 후 짧게 대기
ALERT_INTERVAL    = 0.5
# 윈도우 미충족 시 전송 주기 (초)
WARMUP_INTERVAL   = 1.0


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
        "window_size":  20,           # 현재 버퍼 크기 (20 미만이면 워밍업 중)
        "model_ready":  true,         # CNN-LSTM 모델 로드 여부
        "has_alert":    true,
        "systems": [
            {
                "system":  "Gyro",
                "level":   "danger",
                "source":  "cnn_lstm",
                "method":  "fail_count",
                "feature": "sensor_gyro_x",
                "msg":     "Gyro X 각속도 이상 감지"
            },
            ...
        ]
    }
    """
    drone_id = websocket.query_params.get("drone_id")
    await websocket.accept()
    print(f"📡 CBM WebSocket 연결 시작 drone_id={drone_id or 'auto'}")

    engine = get_inference_engine()

    try:
        while True:
            # ── 연결 상태 확인
            if websocket.application_state.value != 1:
                print("⚠️ CBM 클라이언트 연결 끊김 감지 → 루프 종료")
                break

            try:
                # ── 1. 슬라이딩 윈도우 버퍼 갱신
                resolved_id = update_window(drone_id)

                # 실제로 데이터를 받은 drone_id 사용
                active_id  = resolved_id or drone_id or "unknown"
                win_size   = get_window_size(active_id)
                model_ready = engine.ready

                # ── 2. 최신 텔레메트리 + 통합 평가
                data    = get_latest_telemetry()
                results = evaluate_cbm_state(data, drone_id=active_id)

                has_alert = len(results) > 0

                # ── 3. 페이로드 구성
                payload = {
                    "timestamp":   datetime.now().isoformat(),
                    "drone_id":    active_id,
                    "window_size": win_size,          # 20 미만: 워밍업 중
                    "model_ready": model_ready,
                    "has_alert":   has_alert,
                    "systems":     results,
                }

                # ── 4. 전송
                await websocket.send_text(
                    json.dumps(payload, ensure_ascii=False)
                )

                if has_alert:
                    print(
                        f"🚨 CBM 이상 감지 전송 → drone={active_id} "
                        f"alerts={len(results)}개"
                    )
                else:
                    print(
                        f"📤 CBM 정상 전송 → drone={active_id} "
                        f"window={win_size}/20"
                    )

                # ── 5. 전송 주기 조정
                if win_size < 20:
                    # 워밍업 중: 빠르게 버퍼 채움
                    await asyncio.sleep(WARMUP_INTERVAL)
                elif has_alert:
                    # 이상 감지: 빠르게 재확인
                    await asyncio.sleep(ALERT_INTERVAL)
                else:
                    # 정상: 2초 주기
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
    """
    현재 CBM 상태 REST 조회.

    쿼리 파라미터:
        drone_id (선택): 특정 드론 지정
    """
    engine     = get_inference_engine()
    active_id  = update_window(drone_id) or drone_id or "unknown"
    win_size   = get_window_size(active_id)

    data    = get_latest_telemetry()
    results = evaluate_cbm_state(data, drone_id=active_id)

    return {
        "timestamp":    datetime.now().isoformat(),
        "drone_id":     active_id,
        "window_size":  win_size,
        "model_ready":  engine.ready,
        "has_alert":    len(results) > 0,
        "systems":      results,
        # 디버그 정보
        "cusum_values": engine.get_cusum_values(active_id) if engine.ready else None,
        "fail_counts":  engine.get_fail_counts(active_id)  if engine.ready else None,
        "active_drones": list_active_drones(),
    }


# ════════════════════════════════════════════════════════
# REST — 드론 세션 초기화
# ════════════════════════════════════════════════════════
@router.post("/reset/{drone_id}")
async def reset_cbm_session(drone_id: str):
    """
    비행 세션 전환 시 특정 드론의 CUSUM·버퍼 초기화.

    사용 시점:
        - 새 비행 시작 전
        - 착륙 후 재이륙 전
        - 이상 탐지 확인 후 리셋
    """
    engine = get_inference_engine()

    if not engine.ready:
        raise HTTPException(status_code=503, detail="CNN-LSTM 모델 미준비")

    engine.reset(drone_id)

    return {
        "ok":       True,
        "drone_id": drone_id,
        "msg":      f"{drone_id} CBM 세션 초기화 완료",
    }