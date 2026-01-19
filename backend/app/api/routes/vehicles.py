from fastapi import APIRouter, HTTPException
from app.mavlink.manager import get_vehicle_registry
import time

router = APIRouter(tags=["vehicles"])

STALE_THRESHOLD_SEC = 2.0


@router.get("/vehicles")
def list_vehicles():
    """
    현재 살아있는 기체 목록 (SYSID 기준)
    """
    registry = get_vehicle_registry()
    now = time.time()

    vehicles = []

    for sysid, v in registry._vehicles.items():
        last_seen = v.get("last_seen")

        # 🔴 오래된 기체 제외
        if not last_seen or now - last_seen > STALE_THRESHOLD_SEC:
            continue

        vehicles.append(v)

    return vehicles


@router.get("/vehicles/{sysid}")
def get_vehicle(sysid: int):
    """
    특정 기체 상태
    """
    registry = get_vehicle_registry()
    v = registry._vehicles.get(sysid)

    if not v:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    return v
