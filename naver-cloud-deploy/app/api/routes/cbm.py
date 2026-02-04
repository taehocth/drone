from fastapi import APIRouter
from app.cbm.collector import get_latest_telemetry
from app.cbm.evaluator import evaluate_cbm_state

router = APIRouter()

@router.get("/cbm/status")
async def get_cbm_status():
    data = get_latest_telemetry()
    results = evaluate_cbm_state(data)
    return {
        "timestamp": data.timestamp,
        "systems": results
    }
