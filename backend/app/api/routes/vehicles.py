from fastapi import APIRouter
from app.mavlink.manager import get_vehicle_registry

router = APIRouter(tags=["vehicles"])


@router.get("/vehicles")
def list_vehicles():
    """
    현재 연결된 기체 목록 (SYSID 기준)
    """
    registry = get_vehicle_registry()
    return registry.snapshot()


@router.get("/vehicles/{sysid}")
def get_vehicle(sysid: int):
    """
    특정 기체 상태
    """
    registry = get_vehicle_registry()
    return registry.snapshot().get(sysid)
