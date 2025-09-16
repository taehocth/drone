# backend/app/api/routes/telemetry.py
from fastapi import APIRouter, WebSocket
from typing import List
from pymavlink import mavutil
import asyncio

router = APIRouter()

connected_clients: List[WebSocket] = []

async def mavlink_loop():
    # QGC UDP 포트 14551 연결
    master = mavutil.mavlink_connection('udp:localhost:14551')
    while True:
        msg = master.recv_match(blocking=True)
        if msg:
            data = {
                "type": "mavlink_data",
                "lat": getattr(msg, 'lat', None),
                "lon": getattr(msg, 'lon', None),
                "alt": getattr(msg, 'alt', None)
            }
            # WebSocket으로 프론트엔드에 전송
            for ws in connected_clients:
                try:
                    await ws.send_json(data)
                except:
                    connected_clients.remove(ws)
        await asyncio.sleep(0.01)  # CPU 부담 줄이기

@router.websocket("/ws/qgc")
async def qgc_ws(websocket: WebSocket):
    await websocket.accept()
    print("✅ 실제 드론 WebSocket 연결됨")

    try:
        # MAVLink 연결
        master = mavutil.mavlink_connection("udp:127.0.0.1:14551")
        print(" MAVLink 연결 시도 중...")
        
        # 타임아웃 설정 (5초)
        master.wait_heartbeat(timeout=5)
        print("✅ 실제 드론 연결 성공")

        # 양방향 통신
        telemetry_task = asyncio.create_task(handle_real_telemetry(websocket, master))
        command_task = asyncio.create_task(handle_real_commands(websocket, master))
        
        await asyncio.gather(telemetry_task, command_task)
        
    except Exception as e:
        print(f"❌ MAVLink 연결 실패: {e}")
        # 연결 실패 시 에러 메시지를 프론트엔드로 전송
        await websocket.send_json({
            "type": "error",
            "message": f"MAVLink 연결 실패: {str(e)}"
        })
        await websocket.close()

# 서버 시작 시 MAVLink loop 백그라운드 실행
import asyncio
asyncio.create_task(mavlink_loop())
