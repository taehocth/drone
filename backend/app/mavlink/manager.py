# backend/app/mavlink/manager.py

import time
import threading
from typing import Optional, Dict

import requests
from pymavlink import mavutil

from app.core.config import settings


# =====================================================
# Telemetry PUSH (Render Backend)
# =====================================================

RENDER_TELEMETRY_PUSH_URL = settings.RENDER_TELEMETRY_PUSH_URL
PUSH_INTERVAL_SEC = 0.2
STALE_THRESHOLD_SEC = 1.0


# =====================================================
# Vehicle Registry (sysid 기반)
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
                    "position": None,
                    "velocity": None,
                    "attitude": None,
                    "battery": None,
                    "gps": None,
                    "last_seen": None,
                }
            return self._vehicles[sysid]

    def handle_message(self, msg) -> None:
        sysid = msg.get_srcSystem()
        v = self.get_or_create(sysid)
        v["last_seen"] = time.time()

        t = msg.get_type()

        if t == "HEARTBEAT":
            v["heartbeat"] = {
                "system_status": msg.system_status,
            }

        elif t == "GLOBAL_POSITION_INT":
            v["position"] = {
                "lat": msg.lat / 1e7,
                "lon": msg.lon / 1e7,
                "alt": msg.relative_alt / 1000,
            }

        elif t == "GPS_RAW_INT":
            v["gps"] = {
                "fix_type": msg.fix_type,
                "satellites": msg.satellites_visible,
            }

        elif t == "LOCAL_POSITION_NED":
            v["velocity"] = {
                "vx": msg.vx,
                "vy": msg.vy,
                "vz": msg.vz,
            }

        elif t == "ATTITUDE":
            v["attitude"] = {
                "roll": msg.roll,
                "pitch": msg.pitch,
                "yaw": msg.yaw,
            }

        elif t == "SYS_STATUS":
            v["battery"] = {
                "voltage": msg.voltage_battery / 1000,
                "current": msg.current_battery / 100,
                "remaining": msg.battery_remaining,
            }

    def latest_flattened(self) -> Optional[dict]:
        with self._lock:
            now = time.time()

            alive = [
                v for v in self._vehicles.values()
                if v["last_seen"] and now - v["last_seen"] < STALE_THRESHOLD_SEC
            ]

            if not alive:
                return None

            # 🔴 우선 1대 반환 (프론트 구조상)
            return alive[0]


_registry = VehicleRegistry()


def get_vehicle_registry() -> VehicleRegistry:
    return _registry


# =====================================================
# MAVLink Threads
# =====================================================

_connected = False
_lock = threading.Lock()


def _listen_loop(mav):
    print("[MAVLink] Listening for MAVLink messages...")
    registry = get_vehicle_registry()

    while True:
        msg = mav.recv_match(blocking=True, timeout=3)
        if msg:
            registry.handle_message(msg)


def _mavlink_connect_loop():
    global _connected

    # 🔴 연결 문자열 결정
    if settings.MAVLINK_CONNECTION:
        conn = settings.MAVLINK_CONNECTION
    elif settings.MAVLINK_MODE == "udp":
        conn = settings.MAVLINK_UDP_ENDPOINT
    else:
        raise RuntimeError("Serial mode requires MAVLINK_CONNECTION")

    while True:
        with _lock:
            if _connected:
                time.sleep(2)
                continue

        try:
            print(f"[MAVLink] Connecting to {conn} ...")

            mav = mavutil.mavlink_connection(
                conn,
                baud=settings.MAVLINK_BAUD,
                autoreconnect=True,
            )
            mav.wait_heartbeat(timeout=10)

            print(
                f"[MAVLink] Connected: SYSID={mav.target_system}, "
                f"COMPID={mav.target_component}"
            )

            with _lock:
                _connected = True

            threading.Thread(
                target=_listen_loop,
                args=(mav,),
                daemon=True,
            ).start()

        except Exception as e:
            print(f"[MAVLink] Connection failed ({conn}): {e}")
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
# Public Entry
# =====================================================

_threads_started = False


def start_mavlink_background():
    global _threads_started

    if not settings.MAVLINK_ENABLED:
        print("[MAVLink] Disabled by config")
        return

    if _threads_started:
        return

    _threads_started = True

    threading.Thread(target=_mavlink_connect_loop, daemon=True).start()
    threading.Thread(target=_push_telemetry_loop, daemon=True).start()
