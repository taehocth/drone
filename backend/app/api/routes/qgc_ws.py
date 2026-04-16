from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Body
from datetime import datetime, timezone, timedelta
import asyncio

from app.mavlink.manager import get_vehicle_registry

router = APIRouter()


@router.post("/telemetry/push")
async def push_telemetry(data: dict = Body(...)):
    registry = get_vehicle_registry()

    # ── offline 신호 처리 ──────────────────────────────────────
    # agent.py가 ok=False로 보내면 offline 처리
    if data.get("ok") is False:
        lte_ip   = data.get("lte_ip")
        drone_id = data.get("drone_id")
        if lte_ip or drone_id:
            registry.mark_offline(lte_ip=lte_ip, drone_id=drone_id)
        return {"ok": True, "note": "marked offline"}

    # ── 정상 텔레메트리 처리 ──────────────────────────────────
    lte_ip   = data.get("lte_ip")
    drone_id = data.get("drone_id")
    sysid    = data.get("sysid")

    if sysid is None and not (lte_ip and drone_id):
        return {"ok": False, "error": "missing sysid and identifiers"}

    # ★ 정상 데이터 수신 → forced_offline 즉시 해제 (재연결 핵심)
    if lte_ip or drone_id:
        registry.clear_forced_offline(lte_ip=lte_ip, drone_id=drone_id)

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

            if payload:
                out = dict(payload)
                out["server_ts"] = datetime.now(
                    timezone(timedelta(hours=9))
                ).isoformat()
                await websocket.send_json(out)
            else:
                await websocket.send_json({
                    "ok":        False,
                    "error":     "no_data",
                    "lte_ip":    lte_ip,
                    "server_ts": datetime.now(
                        timezone(timedelta(hours=9))
                    ).isoformat(),
                })

            await asyncio.sleep(0.1)

    except WebSocketDisconnect:
        pass