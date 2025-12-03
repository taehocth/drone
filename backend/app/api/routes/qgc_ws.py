from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pymavlink import mavutil
from datetime import datetime, timezone, timedelta
import asyncio
from app.core.config import settings

router = APIRouter()

SERIAL_PORT = settings.MAVLINK_CONNECTION or "/dev/ttyUSB0"
BAUD_RATE = int(getattr(settings, "MAVLINK_BAUD", 57600))


# -----------------------------------------------------
# PX4 스트림 속도 설정
# -----------------------------------------------------
def set_stream_params(master):
    params = {
        "MAV_0_MODE": 0,
        "MAV_0_RATE": 1200,
    }
    for name, value in params.items():
        try:
            master.mav.param_set_send(
                master.target_system,
                master.target_component,
                name.encode("utf-8"),
                float(value),
                mavutil.mavlink.MAV_PARAM_TYPE_REAL32,
            )
            print(f"✅ {name} = {value} 설정 완료")
        except Exception as e:
            print(f"⚠️ {name} 설정 실패: {e}")


# -----------------------------------------------------
# WebSocket 핸들러
# -----------------------------------------------------
@router.websocket("/ws/qgc")
async def qgc_ws(websocket: WebSocket):
    print("🚀 /api/v1/qgc/ws/qgc 진입")
    await websocket.accept()

    mav = None
    altitude_offset = None

    # PX4 캘리 명령 번호
    CMD_CALIBRATE = mavutil.mavlink.MAV_CMD_PREFLIGHT_CALIBRATION

    # 텔레메트리 기본값 (연결 실패해도 UI가 깨지지 않음)
    latest = {
        "roll": 0.0, "pitch": 0.0, "yaw": 0.0,
        "speed": 0.0, "altitude": 0.0,
        "heading": 0.0, "throttle": 0.0,
        "battery": 0.0,
        "latitude": 0.0, "longitude": 0.0,
        "satellites": 0,
    }

    pending_calibration = False
    calibration_start_time = None

    # -----------------------------------------------------
    # PX4 연결 시도 (실패해도 서버는 정상)
    # -----------------------------------------------------
    try:
        print(f"🔌 Pixhawk 연결 시도 → {SERIAL_PORT} (baud={BAUD_RATE})")

        # USB 경로이거나 LTE 경로든 시도
        mav = await asyncio.to_thread(
            mavutil.mavlink_connection,
            SERIAL_PORT,
            baud=BAUD_RATE if SERIAL_PORT.startswith("/dev/") else None
        )

        print("⏳ Heartbeat 대기...")
        await asyncio.to_thread(mav.wait_heartbeat, timeout=10)
        print("✅ Heartbeat OK")

        await asyncio.to_thread(set_stream_params, mav)
        await websocket.send_json({"status": "connected"})

    except Exception as e:
        print(f"❌ PX4 연결 실패: {e}")
        mav = None
        await websocket.send_json({"status": "disconnected"})

    print("🛰️ MAVLink 루프 시작 (PX4 연결 여부와 무관하게 실행됨)")

    # WebSocket 메시지 수신 Queue
    command_queue = asyncio.Queue()

    # -----------------------------------------------------
    # WebSocket 메시지 받기
    # -----------------------------------------------------
    async def receive_ws():
        print("🔄 WS 수신 시작")
        while True:
            try:
                data = await websocket.receive_json()
                await command_queue.put(data)
            except WebSocketDisconnect:
                print("🔌 WebSocket 종료됨")
                break
            except Exception as e:
                print(f"⚠️ WS 수신 오류: {e}")
                await asyncio.sleep(0.1)

    asyncio.create_task(receive_ws())

    last_send_time = asyncio.get_event_loop().time()

    # -----------------------------------------------------
    # 메인 루프
    # -----------------------------------------------------
    try:
        while True:

            # --------------------------
            # 1) 명령 처리
            # --------------------------
            try:
                data = command_queue.get_nowait()
                action = data.get("action")

                print(f"🔧 명령 처리: {action}")

                if mav is None:
                    print("⚠️ MAVLink 연결 없음 → 명령 무시")
                    continue

                if action == "calibrate_level":
                    pending_calibration = True
                    calibration_start_time = asyncio.get_event_loop().time()

                    mav.mav.command_long_send(
                        mav.target_system, mav.target_component,
                        CMD_CALIBRATE, 0,
                        0,0,0,0,
                        1,  # Level only
                        0,0
                    )

                    print("📐 수평 캘리 명령 전송")

                elif action == "reset_altitude_zero":
                    altitude_offset = None

            except asyncio.QueueEmpty:
                pass

            # --------------------------
            # 2) MAVLink 메시지 수신
            # --------------------------
            if mav:
                msg = mav.recv_match(type=None, blocking=False)
            else:
                msg = None

            if msg:
                mtype = msg.get_type()

                if mtype == "ATTITUDE":
                    latest["roll"] = msg.roll * 180 / 3.14159
                    latest["pitch"] = msg.pitch * 180 / 3.14159
                    latest["yaw"] = msg.yaw * 180 / 3.14159

                elif mtype == "VFR_HUD":
                    latest["speed"] = msg.groundspeed
                    if altitude_offset is None:
                        altitude_offset = msg.alt
                    latest["altitude"] = msg.alt - altitude_offset
                    latest["throttle"] = msg.throttle
                    latest["heading"] = msg.heading

                elif mtype == "GPS_RAW_INT":
                    latest["latitude"] = msg.lat / 1e7
                    latest["longitude"] = msg.lon / 1e7
                    latest["satellites"] = msg.satellites_visible

            # --------------------------
            # 3) 10Hz 텔레메트리 전송
            # --------------------------
            now = asyncio.get_event_loop().time()
            if now - last_send_time >= 0.1:
                await websocket.send_json({
                    "timestamp": datetime.now(timezone(timedelta(hours=9))).isoformat(),
                    **latest,
                })
                last_send_time = now

    except WebSocketDisconnect:
        print("🔌 WebSocket 종료됨")

    finally:
        if mav:
            try:
                mav.close()
            except:
                pass
        print("🔒 Pixhawk 연결 종료")
