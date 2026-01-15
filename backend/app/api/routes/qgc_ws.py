# app/api/routes/qgc_ws.py

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Body
from datetime import datetime, timezone, timedelta
import asyncio
import time

router = APIRouter()

# =====================================================
# 최신 텔레메트리 저장소
# =====================================================

latest_telemetry: dict | None = None
latest_telemetry_ts: float | None = None

STALE_THRESHOLD_SEC = 1.0


# =====================================================
# 1️⃣ 로컬 → 서버 텔레메트리 PUSH
# =====================================================

@router.post("/telemetry/push")
async def push_telemetry(data: dict = Body(...)):
    global latest_telemetry, latest_telemetry_ts
    latest_telemetry = data
    latest_telemetry_ts = time.time()
    return {"ok": True}


# =====================================================
# 2️⃣ WebSocket (프론트엔드 중계)
# =====================================================

@router.websocket("/ws/qgc")
async def qgc_ws(websocket: WebSocket):
    await websocket.accept()

    try:
        while True:
            now = time.time()

            if (
                latest_telemetry
                and latest_telemetry_ts
                and now - latest_telemetry_ts < STALE_THRESHOLD_SEC
            ):
                # 🔴 기존 timestamp 덮어쓰기 문제 해결
                payload = dict(latest_telemetry)
                payload["server_ts"] = datetime.now(
                    timezone(timedelta(hours=9))
                ).isoformat()

                await websocket.send_json(payload)

            else:
                # 🔴 데이터 없을 때도 상태 패킷 전송 (React 리렌더 유도)
                await websocket.send_json({
                    "status": "waiting",
                    "server_ts": datetime.now(
                        timezone(timedelta(hours=9))
                    ).isoformat(),
                })

            await asyncio.sleep(0.1)  # 10Hz

    except WebSocketDisconnect:
        pass
