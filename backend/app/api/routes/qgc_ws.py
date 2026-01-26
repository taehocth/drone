# backend/app/api/routes/qgc_ws.py

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Body
from datetime import datetime, timezone, timedelta
import asyncio

from app.mavlink.manager import get_vehicle_registry

router = APIRouter()


@router.post("/telemetry/push")
async def push_telemetry(data: dict = Body(...)):
    registry = get_vehicle_registry()

    sysid = data.get("sysid")
    if sysid is None:
        return {"ok": False, "error": "missing sysid"}

    registry.ingest_from_agent(data)
    return {"ok": True}


@router.websocket("/ws/qgc")
async def qgc_ws(websocket: WebSocket):
    await websocket.accept()

    registry = get_vehicle_registry()
    last_payload = None  # 🔥 핵심

    try:
        while True:
            payload = registry.latest_flattened()

            if payload:
                last_payload = payload

            # ❌ waiting 절대 보내지 않음
            if last_payload:
                out = dict(last_payload)
                out["server_ts"] = datetime.now(
                    timezone(timedelta(hours=9))
                ).isoformat()
                await websocket.send_json(out)

            await asyncio.sleep(0.1)  # 10Hz

    except WebSocketDisconnect:
        pass