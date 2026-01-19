# app/mavlink/manager.py

import time
import threading
from typing import Optional, Dict

import requests
from pymavlink import mavutil

from app.core.config import settings


# =====================================================
# Render Telemetry PUSH 설정
# =====================================================

RENDER_TELEMETRY_PUSH_URL = getattr(
    settings,
    "RENDER_TELEMETRY_PUSH_URL",
    "https://drone-5-2qlc.onrender.com/api/v1/qgc/telemetry/push",
)

PUSH_INTERVAL_SEC = 0.2      # 5Hz
STALE_THRESHOLD_SEC = 1.0    # 1초 이상이면 끊긴 기체로 판단

# 🔴 고정 MAVLink 포트 (Windows)
MAVLINK_PORT = getattr(settings, "MAVLINK_PORT", "COM5")
MAVLINK_BAUD = getattr(settings, "MAVLINK_BAUD", 115200)


# =====================================================
# Vehicle Registry
# =====================================================

class VehicleRegistry:
    def __init__(self):
        self._vehicles: Dict[int, dict] = {}
        self._lock = threading.Lock()

    def get_or_create(self, sysid: int) -> dict:
        with self._lock:
            if sysid not in self._vehicles:
                self._vehicles[sysid] = {
                    "sysid": sysid,
                    "heartbeat": None,
                    "position": None,     # lat/lon/alt (최종 위치)
                    "velocity": None,     # NED velocity
                    "attitude": None,     # roll/pitch/yaw
                    "battery": None,
                    "gps": None,          # 🔴 GPS_RAW_INT 상태
                    "last_seen": None,
                }
            return self._vehicles[sysid]

    def handle_message(self, msg) -> None:
        sysid = msg.get_srcSystem()
        vehicle = self.get_or_create(sysid)
        vehicle["last_seen"] = time.time()

        msg_type = msg.get_type()

        # -------------------------
        # HEARTBEAT
        # -------------------------
        if msg_type == "HEARTBEAT":
            vehicle["heartbeat"] = {
                "type": msg.type,
                "autopilot": msg.autopilot,
                "base_mode": msg.base_mode,
                "custom_mode": msg.custom_mode,
                "system_status": msg.system_status,
            }

        # -------------------------
        # GLOBAL POSITION (GPS + EKF 완료 후)
        # -------------------------
        elif msg_type == "GLOBAL_POSITION_INT":
            vehicle["position"] = {
                "lat": msg.lat / 1e7,
                "lon": msg.lon / 1e7,
                "alt": msg.relative_alt / 1000,
            }

        # -------------------------
        # GPS RAW (GPS FIX 단계)
        # -------------------------
        elif msg_type == "GPS_RAW_INT":
            vehicle["gps"] = {
                "fix_type": msg.fix_type,
                "satellites": msg.satellites_visible,
                "lat": msg.lat / 1e7 if msg.lat != 0 else None,
                "lon": msg.lon / 1e7 if msg.lon != 0 else None,
                "alt": msg.alt / 1000 if msg.alt != 0 else None,
            }

            # 🔴 GLOBAL_POSITION_INT가 아직 없을 때 fallback
            if vehicle["position"] is None and msg.fix_type >= 3:
                vehicle["position"] = {
                    "lat": msg.lat / 1e7,
                    "lon": msg.lon / 1e7,
                    "alt": msg.alt / 1000,
                }

        # -------------------------
        # LOCAL VELOCITY
        # -------------------------
        elif msg_type == "LOCAL_POSITION_NED":
            vehicle["velocity"] = {
                "vx": msg.vx,
                "vy": msg.vy,
                "vz": msg.vz,
            }

        # -------------------------
        # ATTITUDE (R/P/Y)
        # -------------------------
        elif msg_type == "ATTITUDE":
            vehicle["attitude"] = {
                "roll": msg.roll,
                "pitch": msg.pitch,
                "yaw": msg.yaw,
            }

        # -------------------------
        # BATTERY
        # -------------------------
        elif msg_type == "SYS_STATUS":
            vehicle["battery"] = {
                "voltage": msg.voltage_battery / 1000,
                "current": msg.current_battery / 100,
                "remaining": msg.battery_remaining,
            }

        # -------------------------
        # ALTITUDE fallback (실내 / 무GPS)
        # -------------------------
        elif msg_type == "ALTITUDE":
            if vehicle["position"] is None:
                vehicle["position"] = {
                    "lat": None,
                    "lon": None,
                    "alt": msg.altitude_relative,
                }

    def latest_flattened(self) -> Optional[dict]:
        with self._lock:
            if not self._vehicles:
                return None

            v = next(iter(self._vehicles.values()))

            # 🔴 최근에 살아있는 기체만 유효
            if not v["last_seen"] or time.time() - v["last_seen"] > STALE_THRESHOLD_SEC:
                return None

            return {
                "sysid": v["sysid"],
                "heartbeat": v["heartbeat"],
                "position": v["position"],
                "velocity": v["velocity"],
                "attitude": v["attitude"],
                "battery": v["battery"],
                "gps": v["gps"],          # 🔴 프론트에서 GPS 상태 표시 가능
                "last_seen": v["last_seen"],
            }


_registry = VehicleRegistry()


def get_vehicle_registry() -> VehicleRegistry:
    return _registry


# =====================================================
# MAVLink Listen / PUSH
# =====================================================

_connected = False
_lock = threading.Lock()


def _listen_loop(mav: mavutil.mavfile):
    print(f"[MAVLink] Listening on {MAVLINK_PORT}")
    registry = get_vehicle_registry()

    while True:
        try:
            msg = mav.recv_match(blocking=True, timeout=3)
            if msg:
                registry.handle_message(msg)
        except Exception as e:
            print(f"[MAVLink] Disconnected: {e}")
            break


def _mavlink_connect_loop():
    global _connected

    while True:
        with _lock:
            if _connected:
                time.sleep(2)
                continue

        try:
            mav = mavutil.mavlink_connection(
                MAVLINK_PORT,
                baud=MAVLINK_BAUD,
                timeout=5,
            )
            mav.wait_heartbeat(timeout=5)

            with _lock:
                _connected = True

            print(
                f"[MAVLink] Connected on {MAVLINK_PORT} "
                f"(SYSID={mav.target_system}, COMPID={mav.target_component})"
            )

            threading.Thread(
                target=_listen_loop,
                args=(mav,),
                daemon=True,
            ).start()

        except Exception as e:
            print(f"[MAVLink] Connection failed on {MAVLINK_PORT}: {e}")
            time.sleep(2)


def _push_telemetry_loop():
    registry = get_vehicle_registry()
    last_push = 0.0

    while True:
        now = time.time()

        if now - last_push >= PUSH_INTERVAL_SEC:
            payload = registry.latest_flattened()
            if payload:
                try:
                    requests.post(
                        RENDER_TELEMETRY_PUSH_URL,
                        json=payload,
                        timeout=1,
                    )
                except Exception as e:
                    print(f"[Telemetry PUSH] Failed: {e}")

            last_push = now

        time.sleep(0.05)


# =====================================================
# Public Entry Point
# =====================================================

_threads_started = False


def start_mavlink_background():
    global _threads_started

    # 🔴 Render 보호 장치 (가장 중요)
    if not getattr(settings, "MAVLINK_ENABLED", False):
        print("[MAVLink] Disabled (Render mode)")
        return

    if _threads_started:
        return

    _threads_started = True

    threading.Thread(target=_mavlink_connect_loop, daemon=True).start()
    threading.Thread(target=_push_telemetry_loop, daemon=True).start()
