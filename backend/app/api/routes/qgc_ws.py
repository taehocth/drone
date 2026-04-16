from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Body
from datetime import datetime, timezone, timedelta
import asyncio

from app.mavlink.manager import get_vehicle_registry

router = APIRouter()


@router.post("/telemetry/push")
async def push_telemetry(data: dict = Body(...)):
    registry = get_vehicle_registry()

    # agent.py offline 신호 처리
    if data.get("ok") is False or data.get("online") is False:
        lte_ip = data.get("lte_ip")
        drone_id = data.get("drone_id")
        if lte_ip or drone_id:
            registry.mark_offline(lte_ip=lte_ip, drone_id=drone_id)
        return {"ok": True, "note": "marked offline"}

    sysid = data.get("sysid")
    if sysid is None:
        return {"ok": False, "error": "missing sysid"}

    registry.ingest_from_agent(data)
    return {"ok": True}


@router.websocket("/ws/qgc")
async def qgc_ws(websocket: WebSocket):
    lte_ip = websocket.query_params.get("lte_ip")
    await websocket.accept()

    registry = get_vehicle_registry()

    try:
        while True:
            if lte_ip:
                payload = registry.latest_flattened_by_lte_ip(lte_ip)
            else:
                payload = registry.latest_flattened()

            out = dict(payload) if payload else {
                "ok": False,
                "online": False,
                "error": "no_data",
                "lte_ip": lte_ip,
            }

            out["server_ts"] = datetime.now(
                timezone(timedelta(hours=9))
            ).isoformat()

            await websocket.send_json(out)
            await asyncio.sleep(0.1)

    except WebSocketDisconnect:
        pass