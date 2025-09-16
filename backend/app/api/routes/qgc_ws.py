from fastapi import APIRouter, WebSocket
import asyncio
from pymavlink import mavutil
from datetime import datetime
import random
import os

router = APIRouter()

# QGC가 MAVLink UDP를 내보내는 기본 포트
MAVLINK_CONNECTION = "udp:127.0.0.1:14550"

@router.websocket("/ws/telemetry")
async def telemetry_ws(websocket: WebSocket):
    await websocket.accept()
    print("✅ WebSocket 연결됨")

    # 시뮬레이션 모드 확인 (환경변수로 제어)
    simulation_mode = os.getenv("MAVLINK_SIMULATION", "false").lower() == "true"  # 기본값을 false로 변경
    
    if simulation_mode:
        print("🎮 시뮬레이션 모드로 실행")
        await simulation_telemetry(websocket)
    else:
        print("🚁 실제 MAVLink 모드로 실행")
        await real_telemetry(websocket)

async def simulation_telemetry(websocket: WebSocket):
    """시뮬레이션 텔레메트리 데이터 전송"""
    try:
        # 서울 좌표 기준
        base_lat = 37.5665
        base_lon = 126.9780
        base_alt = 100.0
        
        while True:
            # 시뮬레이션 데이터 생성
            telemetry = {
                "timestamp": datetime.utcnow().isoformat(),
                "latitude": base_lat + random.uniform(-0.001, 0.001),
                "longitude": base_lon + random.uniform(-0.001, 0.001),
                "altitude": base_alt + random.uniform(-10, 10),
                "vx": random.uniform(-5, 5),
                "vy": random.uniform(-5, 5),
                "vz": random.uniform(-2, 2),
                "speed": random.uniform(0, 15),
                "heading": random.uniform(0, 360),
                "battery": random.uniform(80, 100),
            }
            
            await websocket.send_json(telemetry)
            print(f"📡 시뮬레이션 데이터 전송: {telemetry['timestamp']}")
            await asyncio.sleep(1)  # 1초마다 전송
            
    except Exception as e:
        print(f"❌ 시뮬레이션 WebSocket 에러: {e}")
        await websocket.close()

async def real_telemetry(websocket: WebSocket):
    """실제 MAVLink 텔레메트리 데이터 전송"""
    try:
        # MAVLink 연결
        master = mavutil.mavlink_connection(MAVLINK_CONNECTION)
        master.wait_heartbeat()  # 드론 연결 확인
        print("✅ MAVLink 연결 성공")

        while True:
            # 위치 및 상태 메시지 받기
            msg = master.recv_match(
                type=["GLOBAL_POSITION_INT", "VFR_HUD"], blocking=True, timeout=1
            )
            if not msg:
                continue

            telemetry = {"timestamp": datetime.utcnow().isoformat()}

            # 위치 메시지
            if msg.get_type() == "GLOBAL_POSITION_INT":
                telemetry.update(
                    {
                        "latitude": msg.lat / 1e7,
                        "longitude": msg.lon / 1e7,
                        "altitude": msg.alt / 1000.0,  # m 단위
                        "vx": msg.vx,
                        "vy": msg.vy,
                        "vz": msg.vz,
                    }
                )

            # 속도/방위/배터리 등
            if msg.get_type() == "VFR_HUD":
                telemetry.update(
                    {
                        "speed": msg.groundspeed,
                        "heading": msg.heading,
                        "battery": 90.0,  # 👉 TODO: 실제 배터리는 SYS_STATUS 메시지에서
                    }
                )

            # 프론트엔드가 기대하는 형식으로 데이터 전송
            await websocket.send_json({
                "type": "mavlink_data",
                "data": telemetry
            })
            await asyncio.sleep(0.1)

    except Exception as e:
        print(f"❌ QGC WebSocket 에러: {e}")
        await websocket.close()

@router.websocket("/ws/qgc")
async def qgc_ws(websocket: WebSocket):
    await websocket.accept()
    print("✅ QGC WebSocket 연결됨")

    # 시뮬레이션 모드 확인
    simulation_mode = os.getenv("MAVLINK_SIMULATION", "false").lower() == "true"
    
    if simulation_mode:
        print("🎮 QGC 시뮬레이션 모드로 실행")
        await simulation_qgc_data(websocket)
    else:
        print("🚁 실제 QGC 모드로 실행")
        await real_qgc_data(websocket)

async def simulation_qgc_data(websocket: WebSocket):
    """시뮬레이션 QGC 데이터 전송"""
    try:
        while True:
            # 시뮬레이션 데이터 생성
            mavlink_data = {
                "altitude": random.uniform(50, 200),
                "speed": random.uniform(0, 15),
                "battery": random.uniform(80, 100),
                "location": {
                    "lat": 37.5665 + random.uniform(-0.001, 0.001),
                    "lng": 126.9780 + random.uniform(-0.001, 0.001)
                },
                "status": "armed" if random.random() > 0.5 else "disarmed"
            }
            
            await websocket.send_json({
                "type": "mavlink_data",
                "data": mavlink_data
            })
            await asyncio.sleep(1)  # 1초마다 전송
            
    except Exception as e:
        print(f"❌ QGC 시뮬레이션 WebSocket 에러: {e}")
        await websocket.close()

async def real_qgc_data(websocket: WebSocket):
    """실제 QGC 데이터 처리"""
    # 기존 실제 드론 연결 코드
    master = mavutil.mavlink_connection("udp:127.0.0.1:14551")  # 다른 포트 사용
    master.wait_heartbeat()
    print("✅ 실제 드론 연결 성공")

    # 양방향 통신
    telemetry_task = asyncio.create_task(handle_real_telemetry(websocket, master))
    command_task = asyncio.create_task(handle_real_commands(websocket, master))
    
    await asyncio.gather(telemetry_task, command_task)

async def handle_real_commands(websocket: WebSocket, master):
    """실제 드론 명령 처리"""
    while True:
        data = await websocket.receive_json()
        command = data.get("command")
        
        if command == "arm":
            master.mav.command_long_send(
                master.target_system, master.target_component,
                mavutil.mavlink.MAV_CMD_COMPONENT_ARM_DISARM, 0,
                1, 0, 0, 0, 0, 0, 0
            )
        elif command == "takeoff":
            altitude = data.get("altitude", 10)
            master.mav.command_long_send(
                master.target_system, master.target_component,
                mavutil.mavlink.MAV_CMD_NAV_TAKEOFF, 0,
                0, 0, 0, 0, 0, 0, altitude
            )
        # ... 기타 명령들

async def handle_real_telemetry(websocket: WebSocket, master):
    """실제 드론 텔레메트리 수신"""
    while True:
        msg = master.recv_match(
            type=["GLOBAL_POSITION_INT", "VFR_HUD", "HEARTBEAT", "SYS_STATUS"], 
            blocking=True, timeout=1
        )
        if msg:
            telemetry = {"timestamp": datetime.utcnow().isoformat()}
            
            if msg.get_type() == "GLOBAL_POSITION_INT":
                telemetry.update({
                    "latitude": msg.lat / 1e7,
                    "longitude": msg.lon / 1e7,
                    "altitude": msg.alt / 1000.0,
                })
            elif msg.get_type() == "HEARTBEAT":
                telemetry.update({
                    "armed": bool(msg.base_mode & mavutil.mavlink.MAV_MODE_FLAG_SAFETY_ARMED),
                })
            
            await websocket.send_json(telemetry)
