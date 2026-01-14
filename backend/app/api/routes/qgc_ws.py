from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Body
from datetime import datetime, timezone, timedelta
import asyncio

router = APIRouter()

# =====================================================
# 🔴 실데이터 저장소 (PUSH로만 갱신됨)
# =====================================================
latest_telemetry: dict | None = None


# =====================================================
# 1️⃣ 실데이터 수신 API (로컬 → Render)
# =====================================================
@router.post("/telemetry/push")
async def push_telemetry(data: dict = Body(...)):
    """
    드론이 연결된 로컬 PC에서
    실제 MAVLink 텔레메트리를 PUSH
    """
    global latest_telemetry
    latest_telemetry = data
    return {"ok": True}


# =====================================================
# 2️⃣ WebSocket (프론트엔드용 중계)
# =====================================================
@router.websocket("/ws/qgc")
async def qgc_ws(websocket: WebSocket):
    print("🚀 /api/v1/qgc/ws/qgc (Render) 연결")
    await websocket.accept()

    try:
        while True:
            if latest_telemetry is not None:
                await websocket.send_json({
                    "timestamp": datetime.now(
                        timezone(timedelta(hours=9))
                    ).isoformat(),
                    **latest_telemetry,
                })
            await asyncio.sleep(0.1)  # 10Hz

    except WebSocketDisconnect:
        print("🔌 WebSocket 종료")

    except Exception as e:
        print(f"⚠️ WebSocket 오류: {e}")
