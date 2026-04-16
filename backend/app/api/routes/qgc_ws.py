from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Body
from datetime import datetime, timezone, timedelta
import asyncio

from app.mavlink.manager import get_vehicle_registry

router = APIRouter()


@router.post("/telemetry/push")
async def push_telemetry(data: dict = Body(...)):
    registry = get_vehicle_registry()

    # ★ agent.py offline 신호 처리 (ok=false 또는 online=false)
    # agent.py가 기체 연결 끊김을 감지하면 이 신호를 보냄
    if data.get("ok") is False or data.get("online") is False:
        lte_ip   = data.get("lte_ip")
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
            # lte_ip 기준으로 조회 (없으면 최신 기체)
            if lte_ip:
                payload = registry.latest_flattened_by_lte_ip(lte_ip)
            else:
                payload = registry.latest_flattened()

            if payload:
                # 정상 데이터 전송
                out = dict(payload)
                out["server_ts"] = datetime.now(
                    timezone(timedelta(hours=9))
                ).isoformat()
                await websocket.send_json(out)
            else:
                # ★ 데이터 없음 → 프론트엔드에 명시적으로 no_data 전송
                # 프론트는 이 신호를 받으면 즉시 offline 처리
                await websocket.send_json({
                    "ok":    False,
                    "error": "no_data",
                    "lte_ip": lte_ip,
                    "server_ts": datetime.now(
                        timezone(timedelta(hours=9))
                    ).isoformat(),
                })

            await asyncio.sleep(0.1)  # 10Hz

    except WebSocketDisconnect:
        pass