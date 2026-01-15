# app/api/routes/qgc_ws.py

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Body
from datetime import datetime, timezone, timedelta
import asyncio
import time

router = APIRouter()

latest_telemetry: dict | None = None
latest_telemetry_ts: float | None = None

STALE_THRESHOLD_SEC = 1.0


@router.post("/telemetry/push")
async def push_telemetry(data: dict = Body(...)):
    global latest_telemetry, latest_telemetry_ts
    latest_telemetry = data
    latest_telemetry_ts = time.time()
    return {"ok": True}


@router.websocket("/ws/qgc")
async def qgc_ws(websocket: WebSocket):
    await websocket.accept()

    try:
        while True:
            if (
                latest_telemetry
                and latest_telemetry_ts
                and time.time() - latest_telemetry_ts < STALE_THRESHOLD_SEC
            ):
                await websocket.send_json({
                    "timestamp": datetime.now(
                        timezone(timedelta(hours=9))
                    ).isoformat(),
                    **latest_telemetry,
                })
            # ❌ 기체 없으면 아무 것도 안 보냄

            await asyncio.sleep(0.1)

    except WebSocketDisconnect:
        pass
