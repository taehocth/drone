# from fastapi import APIRouter, WebSocket
# from pymavlink import mavutil
# from datetime import datetime
# import asyncio
# import socket

# socket.AF_INET6 = socket.AF_INET

# router = APIRouter()

# @router.websocket("/ws/telemetry")
# async def telemetry_ws(websocket: WebSocket):
#     print("🚀 /api/v1/qgc/ws/telemetry 핸들러 진입")
#     await websocket.accept()

#     try:
#         # ✅ IPv4 강제 설정 (WSL2 환경에서 IPv6 바인딩 방지)
#         socket.AF_INET6 = socket.AF_INET

#         # ✅ MAVLink UDP 수신용 설정
#         connection_str = "udp:127.0.0.1:14445"
#         print(f"📡 MAVLink UDP 연결 시도 → {connection_str}")
#         mav = mavutil.mavlink_connection("udp:127.0.0.1:14445", source_system=255, dialect="common")

#         # ✅ Heartbeat 대기 (연결 재시도 포함)
#         print("⏳ Heartbeat 수신 대기 중...")
#         for attempt in range(3):
#             hb = mav.recv_match(type="HEARTBEAT", blocking=True, timeout=5)
#             if hb:
#                 print("✅ Heartbeat 수신 (Telemetry 연결 OK)")
#                 break
#             else:
#                 print(f"⚠️ Heartbeat 미수신 → 재시도 중 ({attempt+1}/3)")
#         else:
#             raise TimeoutError("Heartbeat 미수신: 드론 또는 QGC 연결 확인 필요")

#         # ✅ 초기 상태
#         latest = {
#             "altitude": 0.0,
#             "speed": 0.0,
#             "battery": 0,
#             "latitude": 0.0,
#             "longitude": 0.0,
#             "roll": 0.0,
#             "pitch": 0.0,
#             "yaw": 0.0,
#         }

#         last_send = asyncio.get_event_loop().time()
#         send_interval = 0.3  # 약 3.3Hz 전송 속도
#         print("🛰️ MAVLink 수신 루프 시작...")

#         # ✅ MAVLink 데이터 수신 루프
#         while True:
#             if websocket.client_state.name != "CONNECTED":
#                 print("🔚 WebSocket 끊김 감지 → 루프 종료")
#                 break

#             msg = mav.recv_match(blocking=False)
#             if not msg:
#                 await asyncio.sleep(0.01)
#                 continue

#             mtype = msg.get_type()

#             if mtype == "GLOBAL_POSITION_INT":
#                 latest["latitude"] = getattr(msg, "lat", 0) / 1e7
#                 latest["longitude"] = getattr(msg, "lon", 0) / 1e7
#                 latest["altitude"] = getattr(msg, "alt", 0) / 1000.0

#             elif mtype == "VFR_HUD":
#                 latest["speed"] = getattr(msg, "groundspeed", 0.0)
#                 latest["altitude"] = getattr(msg, "alt", 0.0)
#                 latest["battery"] = getattr(msg, "battery_remaining", latest["battery"])

#             elif mtype == "ATTITUDE":
#                 latest["roll"] = getattr(msg, "roll", 0.0)
#                 latest["pitch"] = getattr(msg, "pitch", 0.0)
#                 latest["yaw"] = getattr(msg, "yaw", 0.0)

#             now = asyncio.get_event_loop().time()
#             if now - last_send >= send_interval:
#                 await websocket.send_json({
#                     "timestamp": datetime.utcnow().isoformat(),
#                     **latest
#                 })
#                 last_send = now

#     except Exception as e:
#         print(f"❌ Telemetry 오류: {e}")
#         try:
#             await websocket.send_json({"error": str(e)})
#         except Exception:
#             pass

#     finally:
#         try:
#             mav.close()
#         except Exception:
#             pass
#         await websocket.close()
#         print("🔒 Telemetry WebSocket 종료 완료")
