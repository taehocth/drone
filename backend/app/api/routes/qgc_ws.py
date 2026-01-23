# backend/app/api/routes/qgc_ws.py

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Body
from datetime import datetime, timezone, timedelta
import asyncio

from app.mavlink.manager import get_vehicle_registry

router = APIRouter()


# =====================================================
# 1️⃣ Local Telemetry Agent → Server
# =====================================================

@router.post("/telemetry/push")
async def push_telemetry(data: dict = Body(...)):
    """
    Local Telemetry Agent가 실제 기체 데이터를 PUSH
    """
    registry = get_vehicle_registry()

    sysid = data.get("sysid")
    if sysid is None:
        return {"ok": False, "error": "missing sysid"}

    registry.ingest_from_agent(data)

    return {"ok": True}


# =====================================================
# 2️⃣ WebSocket → Frontend (QGC-style)
# =====================================================

@router.websocket("/ws/qgc")
async def qgc_ws(websocket: WebSocket):
    await websocket.accept()

    registry = get_vehicle_registry()

    try:
        while True:
            payload = registry.latest_flattened()

            if payload:
                payload = dict(payload)
                payload["server_ts"] = datetime.now(
                    timezone(timedelta(hours=9))
                ).isoformat()

                await websocket.send_json(payload)

            else:
                await websocket.send_json({
                    "status": "waiting",
                    "server_ts": datetime.now(
                        timezone(timedelta(hours=9))
                    ).isoformat(),
                })

            await asyncio.sleep(0.05)

    except WebSocketDisconnect:
        pass
