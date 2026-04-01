# backend/app/api/routes/qgc_ws.py

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Body
from pydantic import BaseModel
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional
import asyncio

from app.mavlink.manager import get_vehicle_registry

router = APIRouter()


# =====================================================
# Pydantic 스키마
# =====================================================

class MissionWaypoint(BaseModel):
    index:   int
    command: int
    lat:     float
    lng:     float
    alt:     float


class MissionPushPayload(BaseModel):
    drone_id:  str
    lte_ip:    str
    waypoints: List[MissionWaypoint]


# =====================================================
# 텔레메트리 push (agent → 서버)
# =====================================================

@router.post("/telemetry/push")
async def push_telemetry(data: dict = Body(...)):
    registry = get_vehicle_registry()

    sysid = data.get("sysid")
    if sysid is None:
        return {"ok": False, "error": "missing sysid"}

    registry.ingest_from_agent(data)
    return {"ok": True}


# =====================================================
# ★ 미션 push (agent → 서버, 별도 엔드포인트)
#   agent 가 텔레메트리 payload 에 미션을 포함해서 보내는 경우엔
#   이 엔드포인트 없이도 동작하지만, 별도로 push 할 때도 사용 가능
# =====================================================

@router.post("/mission/push")
async def push_mission(payload: MissionPushPayload):
    """
    agent 가 기체에서 미션을 다운로드한 뒤 서버로 전달.
    VehicleRegistry 에 저장 → WebSocket 을 통해 프론트로 전달.
    """
    registry = get_vehicle_registry()
    waypoints = [wp.model_dump() for wp in payload.waypoints]
    registry.ingest_mission(
        drone_id=payload.drone_id,
        lte_ip=payload.lte_ip,
        waypoints=waypoints,
    )
    return {
        "ok":       True,
        "drone_id": payload.drone_id,
        "wp_count": len(waypoints),
    }


# =====================================================
# ★ 미션 조회 REST API (프론트에서 직접 GET 가능)
# =====================================================

@router.get("/mission/{drone_id}")
async def get_mission(drone_id: str):
    """
    프론트에서 기체 연결 시 한 번 호출해서 미션 경로를 받아갈 수 있음.
    GET /api/v1/qgc/mission/{drone_id}
    """
    registry  = get_vehicle_registry()
    waypoints = registry.get_mission_by_drone_id(drone_id)
    return {
        "drone_id":  drone_id,
        "waypoints": waypoints,
        "wp_count":  len(waypoints),
    }


@router.get("/mission/by-lte/{lte_ip:path}")
async def get_mission_by_lte(lte_ip: str):
    """
    lte_ip 로 미션 조회.
    GET /api/v1/qgc/mission/by-lte/3.36.81.238:51067
    """
    registry  = get_vehicle_registry()
    waypoints = registry.get_mission_by_lte_ip(lte_ip)
    return {
        "lte_ip":    lte_ip,
        "waypoints": waypoints,
        "wp_count":  len(waypoints),
    }


# =====================================================
# WebSocket (프론트 → 실시간 텔레메트리 + 미션 수신)
# =====================================================

@router.websocket("/ws/qgc")
async def qgc_ws(websocket: WebSocket):
    """
    쿼리 파라미터: ?lte_ip=3.36.81.238:51067
    프론트(DroneSimulation.tsx)가 lte_ip 로 드론을 구분해서 연결.

    응답 payload 에 mission_waypoints 가 포함됨:
    {
      "sysid": 1,
      "lte_ip": "...",
      "position": { "lat": ..., "lon": ..., "alt": ... },
      "battery":  { "remaining": 80 },
      ...
      "mission_waypoints": [
        { "index": 0, "command": 22, "lat": 36.788, "lng": 126.466, "alt": 50 },
        { "index": 1, "command": 16, "lat": 36.791, "lng": 126.470, "alt": 50 },
        ...
      ]
    }
    """
    await websocket.accept()

    # lte_ip 파라미터로 드론 식별
    lte_ip   = websocket.query_params.get("lte_ip")
    registry = get_vehicle_registry()

    last_payload      = None
    last_mission_hash = None   # 미션 변경 감지용

    try:
        while True:
            # lte_ip 가 있으면 해당 드론만, 없으면 가장 최근 드론
            if lte_ip:
                payload = registry.latest_flattened_by_lte_ip(lte_ip)
            else:
                payload = registry.latest_flattened()

            if payload:
                last_payload = payload

            if last_payload:
                out             = dict(last_payload)
                out["server_ts"] = datetime.now(
                    timezone(timedelta(hours=9))
                ).isoformat()

                # ★ mission_waypoints 는 manager 에서 이미 포함시켜 줌
                # 없으면 빈 배열로 보장
                if "mission_waypoints" not in out:
                    out["mission_waypoints"] = []

                await websocket.send_json(out)

            await asyncio.sleep(0.1)   # 10Hz

    except WebSocketDisconnect:
        pass