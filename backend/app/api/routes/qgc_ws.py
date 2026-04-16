from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Body
from datetime import datetime, timezone, timedelta
import asyncio

from app.mavlink.manager import get_vehicle_registry

router = APIRouter()


@router.post("/telemetry/push")
async def push_telemetry(data: dict = Body(...)):
    registry = get_vehicle_registry()

    # ── offline 신호 처리 ──────────────────────────────────────────
    # agent.py가 기체 연결 끊김을 감지하면 ok=False 또는 online=False 전송
    # 단, online=False이면서 sysid가 없는 경우만 offline 처리
    # (정상 데이터에도 online=True가 포함되므로 ok 필드로 구분)
    if data.get("ok") is False:
        lte_ip   = data.get("lte_ip")
        drone_id = data.get("drone_id")
        if lte_ip or drone_id:
            registry.mark_offline(lte_ip=lte_ip, drone_id=drone_id)
        return {"ok": True, "note": "marked offline"}

    # ── 정상 텔레메트리 처리 ──────────────────────────────────────
    lte_ip   = data.get("lte_ip")
    drone_id = data.get("drone_id")
    sysid    = data.get("sysid")

    # sysid가 없어도 lte_ip + drone_id가 있으면 ingest 허용
    # (배터리 재연결 직후 sysid가 늦게 오는 경우 대비)
    if sysid is None and not (lte_ip and drone_id):
        return {"ok": False, "error": "missing sysid and identifiers"}

    # ★ 정상 데이터 수신 시 forced_offline 즉시 해제
    # ingest_from_agent 내부에서도 하지만 sysid 없는 경우를 위해 여기서도 처리
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
            # lte_ip 기준으로 조회 (없으면 최신 기체)
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
                # 데이터 없음 → 프론트엔드에 no_data 전송
                await websocket.send_json({
                    "ok":       False,
                    "error":    "no_data",
                    "lte_ip":   lte_ip,
                    "server_ts": datetime.now(
                        timezone(timedelta(hours=9))
                    ).isoformat(),
                })

            await asyncio.sleep(0.1)  # 10Hz

    except WebSocketDisconnect:
        pass