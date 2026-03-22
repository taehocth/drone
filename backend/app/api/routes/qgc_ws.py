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

    drone_id = websocket.query_params.get("drone_id")
    lte_ip = websocket.query_params.get("lte_ip")

    if not drone_id and not lte_ip:
        await websocket.send_json({
            "ok": False,
            "error": "missing drone_id or lte_ip",
        })
        await websocket.close(code=1008)
        return

    try:
        while True:
            # 매 루프마다 registry에서 새로 조회 (캐시 없음)
            payload = None

            if drone_id:
                payload = registry.latest_flattened_by_drone_id(drone_id)
            elif lte_ip:
                payload = registry.latest_flattened_by_lte_ip(lte_ip)

            if payload:
                # 데이터가 있으면 정상 전송
                out = dict(payload)
                out["server_ts"] = datetime.now(
                    timezone(timedelta(hours=9))
                ).isoformat()
                await websocket.send_json(out)
            else:
                # [변경] 데이터 없음 → 명확하게 빈 신호 전송
                # 기존: last_payload 캐시를 계속 보냄 → 다른 기체 선택해도 이전 데이터 표시
                # 변경: 해당 lte_ip/drone_id 기체 데이터가 없으면 ok=False 신호 전송
                #        프론트엔드에서 이 신호를 받으면 "데이터 없음" 상태로 처리
                await websocket.send_json({
                    "ok": False,
                    "error": "no_data",
                    "lte_ip": lte_ip,
                    "drone_id": drone_id,
                })

            await asyncio.sleep(0.1)

    except WebSocketDisconnect:
        pass