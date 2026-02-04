from fastapi import APIRouter, UploadFile, File
from fastapi.responses import JSONResponse
import tempfile
import pandas as pd
from pyulog import ULog

router = APIRouter(tags=["logs"])

@router.post("/simple-analyze")
async def simple_analyze(file: UploadFile = File(...)):
    """
    PX4 ULG → 매우 단순한 CSV 변환 (테스트/확인용)
    """
    if not file.filename.endswith(".ulg"):
        return JSONResponse({"error": "Only .ulg files are supported"}, status_code=400)

    with tempfile.NamedTemporaryFile(delete=False, suffix=".ulg") as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        ulog = ULog(tmp_path)

        pos = ulog.get_dataset('vehicle_local_position').data
        bat = ulog.get_dataset('battery_status').data

        pos_df = pd.DataFrame(pos)
        bat_df = pd.DataFrame(bat)

        df = pd.DataFrame({
            "time": pos_df["timestamp"] / 1e6,
            "altitude": pos_df["z"] * -1,
            "vx": pos_df["vx"],
            "vy": pos_df["vy"],
            "speed": (pos_df["vx"]**2 + pos_df["vy"]**2)**0.5,
            "battery_metric": bat_df["voltage_v"] * (bat_df["current_a"] / 100.0),
        })

        return {"data": df.to_dict(orient="records")}

    except Exception as e:
        return JSONResponse({"error": f"ULG parsing failed: {str(e)}"}, status_code=500)
