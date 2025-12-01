from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pymavlink import mavutil
from datetime import datetime, timezone, timedelta
import asyncio
from app.core.config import settings
from app.cbm.collector import update_latest_telemetry  # ✅ CBM 연동

router = APIRouter()

# ✅ 기본 설정
SERIAL_PORT = settings.MAVLINK_CONNECTION or "/dev/ttyUSB0"
BAUD_RATE = int(getattr(settings, "MAVLINK_BAUD", 57600))


# ✅ MAVLink 스트림 파라미터 세팅
def set_stream_params(master):
    params = {"MAV_0_MODE": 0, "MAV_0_RATE": 1200}
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


@router.websocket("/ws/qgc")
async def qgc_ws(websocket: WebSocket):
    print("🚀 /api/v1/qgc/ws/qgc 핸들러 진입")
    await websocket.accept()

    mav = None
    altitude_offset = None

    try:
        # ✅ Pixhawk 연결
        print(f"🔌 Pixhawk 연결 시도 → {SERIAL_PORT} (baud={BAUD_RATE})")
        mav = await asyncio.to_thread(mavutil.mavlink_connection, SERIAL_PORT, baud=BAUD_RATE)
        print("⏳ Heartbeat 수신 대기 중...")
        await asyncio.to_thread(mav.wait_heartbeat, timeout=10)
        print("✅ Heartbeat 수신 (Pixhawk 연결 OK)")
        await asyncio.to_thread(set_stream_params, mav)

        await websocket.send_json({"status": "connected"})
        print("🛰️ MAVLink 수신 루프 시작")

        latest = {
            "roll": 0.0, "pitch": 0.0, "yaw": 0.0,
            "speed": 0.0, "altitude": 0.0, "heading": 0.0,
            "throttle": 0.0, "battery": 0.0,
            "latitude": 0.0, "longitude": 0.0,
            "satellites": 0,  # ✅ GPS 위성 개수
        }

        last_send_time = asyncio.get_event_loop().time()

        # ✅ 수신 루프
        while True:
            msg = mav.recv_match(type=None, blocking=False)
            if not msg:
                await asyncio.sleep(0.01)
                continue

            mtype = msg.get_type()

            # ✅ 비행 HUD 데이터
            if mtype == "VFR_HUD":
                latest["speed"] = getattr(msg, "groundspeed", latest["speed"])
                hud_alt = getattr(msg, "alt", None)
                if hud_alt is not None:
                    if altitude_offset is None:
                        altitude_offset = hud_alt
                    latest["altitude"] = hud_alt - altitude_offset
                latest["throttle"] = getattr(msg, "throttle", latest["throttle"])
                latest["heading"] = getattr(msg, "heading", latest["heading"])

            # ✅ 자세 데이터 (Roll, Pitch, Yaw)
            elif mtype == "ATTITUDE":
                latest["roll"] = getattr(msg, "roll", latest["roll"]) * 180.0 / 3.14159  # rad → deg
                latest["pitch"] = getattr(msg, "pitch", latest["pitch"]) * 180.0 / 3.14159  # rad → deg
                latest["yaw"] = getattr(msg, "yaw", latest["yaw"]) * 180.0 / 3.14159  # rad → deg

            # ✅ 배터리 상태 (BATTERY_STATUS 메시지에서 퍼센트 직접 가져오기)
            elif mtype == "BATTERY_STATUS":
                battery_remaining = getattr(msg, "battery_remaining", -1)
                if battery_remaining >= 0:
                    latest["battery"] = battery_remaining  # 이미 퍼센트 (0-100)
                # 전압도 함께 저장 (참고용)
                voltage = getattr(msg, "voltages", [0])[0] / 1000.0 if hasattr(msg, "voltages") and len(getattr(msg, "voltages", [])) > 0 else 0.0
                if voltage > 0 and latest["battery"] == 0:
                    # 전압 기반 폴백 계산 (4S LiPo 기준)
                    cell_count = max(1, int(voltage / 4.2))
                    cell_voltage = voltage / cell_count
                    latest["battery"] = max(0, min(100, ((cell_voltage - 3.0) / (4.2 - 3.0)) * 100))

            # ✅ 배터리 상태 (SYS_STATUS 폴백 - 전압만 있는 경우)
            elif mtype == "SYS_STATUS":
                voltage = getattr(msg, "voltage_battery", 0.0) / 1000.0  # mV → V
                if voltage > 0 and latest["battery"] == 0:
                    # 전압 기반 폴백 계산 (4S LiPo 기준)
                    cell_count = max(1, int(voltage / 4.2))
                    cell_voltage = voltage / cell_count
                    latest["battery"] = max(0, min(100, ((cell_voltage - 3.0) / (4.2 - 3.0)) * 100))

            # ✅ GPS 정보 (GPS_RAW_INT)
            elif mtype == "GPS_RAW_INT":
                latest["latitude"] = getattr(msg, "lat", 0) / 1e7
                latest["longitude"] = getattr(msg, "lon", 0) / 1e7
                satellites = getattr(msg, "satellites_visible", 0)
                latest["satellites"] = satellites  # ✅ latest에 저장
                hdop = getattr(msg, "eph", 99.9) / 100.0  # eph = HDOP * 100
                print(f"🛰️ GPS_RAW_INT: 위도={latest['latitude']:.6f}, 경도={latest['longitude']:.6f}, 위성={satellites}개")
                
            # ✅ GPS 정보 (GLOBAL_POSITION_INT - 위치만 있는 경우)
            elif mtype == "GLOBAL_POSITION_INT":
                latest["latitude"] = getattr(msg, "lat", 0) / 1e7
                latest["longitude"] = getattr(msg, "lon", 0) / 1e7
                # satellites는 이전 값 유지 (GLOBAL_POSITION_INT에는 위성 수 정보 없음)
                satellites = latest.get("satellites", 0)
                hdop = 99.9
                print(f"📍 GLOBAL_POSITION_INT: 위도={latest['latitude']:.6f}, 경도={latest['longitude']:.6f}")
            else:
                # 다른 메시지 타입일 때는 이전 값 유지
                satellites = latest.get("satellites", 0)
                hdop = 99.9

            # ✅ IMU 온도
            if mtype == "SCALED_IMU":
                imu_temp = getattr(msg, "temperature", 0.0) / 100.0
            else:
                imu_temp = 0.0

            # ✅ CBM Collector 연동
            update_latest_telemetry({
                "battery_voltage": latest["battery"],
                "battery_temp": 35.0,  # 추정값
                "esc_temp": 40.0,
                "rpm_variation": 0.02,
                "cpu_load": 0.5,
                "imu_temp": imu_temp,
                "satellites": satellites,
                "hdop": hdop,
            })

            # ✅ 주기적 송신 (10Hz)
            now = asyncio.get_event_loop().time()
            if now - last_send_time >= 0.1:
                try:
                    await websocket.send_json({
                        "timestamp": datetime.now(timezone(timedelta(hours=9))).isoformat(),
                        **latest,
                    })
                    last_send_time = now
                except WebSocketDisconnect:
                    print("🔌 클라이언트 WebSocket 연결 종료 감지")
                    break
                except Exception as send_err:
                    print(f"⚠️ 데이터 전송 중 예외 발생: {send_err}")
                    break

    except WebSocketDisconnect:
        print("🔌 클라이언트 WebSocket 연결 종료 감지 (예외)")
    except Exception as e:
        print(f"❌ Pixhawk 연결 오류: {e}")

    finally:
        # ✅ 안전하게 종료
        try:
            if websocket.client_state.name != "DISCONNECTED":
                await websocket.close()
        except Exception:
            pass

        if mav:
            try:
                mav.close()
            except Exception:
                pass

        print("🔒 Pixhawk 연결 종료")
