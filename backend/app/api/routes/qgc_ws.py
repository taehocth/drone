from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Body, Query
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


@router.get("/vehicles")
async def list_vehicles():
    registry = get_vehicle_registry()
    return {
        "ok": True,
        "items": registry.list_vehicles(),
    }


@router.get("/vehicles/by-lte")
async def get_vehicle_by_lte(lte_ip: str = Query(...)):
    registry = get_vehicle_registry()
    payload = registry.latest_flattened_by_lte_ip(lte_ip)

    if not payload:
        return {"ok": False, "error": "vehicle not found"}

    return {"ok": True, "item": payload}


@router.get("/vehicles/{drone_id}")
async def get_vehicle_by_drone_id(drone_id: str):
    registry = get_vehicle_registry()
    payload = registry.latest_flattened_by_drone_id(drone_id)

    if not payload:
        return {"ok": False, "error": "vehicle not found"}

    return {"ok": True, "item": payload}


@router.websocket("/ws/qgc")
async def qgc_ws(websocket: WebSocket):
    await websocket.accept()

    registry = get_vehicle_registry()
    last_payload = None

    drone_id = websocket.query_params.get("drone_id")
    lte_ip = websocket.query_params.get("lte_ip")

    # 최소 하나는 있어야 특정 기체 구독 가능
    if not drone_id and not lte_ip:
        await websocket.send_json({
            "ok": False,
            "error": "missing drone_id or lte_ip",
        })
        await websocket.close(code=1008)
        return

    try:
        while True:
            payload = None

            if drone_id:
                payload = registry.latest_flattened_by_drone_id(drone_id)
            elif lte_ip:
                payload = registry.latest_flattened_by_lte_ip(lte_ip)

            if payload:
                last_payload = payload

            if last_payload:
                out = dict(last_payload)
                out["server_ts"] = datetime.now(
                    timezone(timedelta(hours=9))
                ).isoformat()
                await websocket.send_json(out)

            await asyncio.sleep(0.1)

    except WebSocketDisconnect:
        pass