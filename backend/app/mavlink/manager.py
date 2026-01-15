# app/mavlink/manager.py

import sys
import time
import threading
from typing import Optional, Dict

import requests
from pymavlink import mavutil
from serial.tools import list_ports

from app.core.config import settings


RENDER_TELEMETRY_PUSH_URL = getattr(
    settings,
    "RENDER_TELEMETRY_PUSH_URL",
    "https://drone-5-2qlc.onrender.com/api/v1/qgc/telemetry/push",
)

PUSH_INTERVAL_SEC = 0.2   # 5Hz
STALE_THRESHOLD_SEC = 1.0  # 🔴 1초 이상이면 끊긴 기체로 판단


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
                    "position": None,
                    "velocity": None,
                    "attitude": None,
                    "battery": None,
                    "last_seen": None,
                }
            return self._vehicles[sysid]

    def handle_message(self, msg) -> None:
        sysid = msg.get_srcSystem()
        vehicle = self.get_or_create(sysid)
        vehicle["last_seen"] = time.time()

        msg_type = msg.get_type()

        if msg_type == "HEARTBEAT":
            vehicle["heartbeat"] = {
                "type": msg.type,
                "autopilot": msg.autopilot,
                "base_mode": msg.base_mode,
                "custom_mode": msg.custom_mode,
                "system_status": msg.system_status,
            }

        elif msg_type == "GLOBAL_POSITION_INT":
            vehicle["position"] = {
                "lat": msg.lat / 1e7,
                "lon": msg.lon / 1e7,
                "alt": msg.relative_alt / 1000,
            }

        elif msg_type == "LOCAL_POSITION_NED":
            vehicle["velocity"] = {
                "vx": msg.vx,
                "vy": msg.vy,
                "vz": msg.vz,
            }

        elif msg_type == "ATTITUDE":
            vehicle["attitude"] = {
                "roll": msg.roll,
                "pitch": msg.pitch,
                "yaw": msg.yaw,
            }

        elif msg_type == "SYS_STATUS":
            vehicle["battery"] = {
                "voltage": msg.voltage_battery / 1000,
                "current": msg.current_battery / 100,
                "remaining": msg.battery_remaining,
            }

    def latest_flattened(self) -> Optional[dict]:
        with self._lock:
            if not self._vehicles:
                return None

            v = next(iter(self._vehicles.values()))

            # 🔴 기체 살아있는지 검증
            if not v["last_seen"] or time.time() - v["last_seen"] > STALE_THRESHOLD_SEC:
                return None

            return {
                "sysid": v["sysid"],
                "heartbeat": v["heartbeat"],
                "position": v["position"],
                "velocity": v["velocity"],
                "attitude": v["attitude"],
                "battery": v["battery"],
                "last_seen": v["last_seen"],
            }


_registry = VehicleRegistry()


def get_vehicle_registry() -> VehicleRegistry:
    return _registry


# =====================================================
# MAVLink Discovery / Listen
# =====================================================

_connected_ports: set[str] = set()
_threads_started = False
_lock = threading.Lock()


def _is_candidate_port(device: str) -> bool:
    if sys.platform.startswith("win"):
        return device.upper().startswith("COM")
    return device.startswith("/dev/ttyUSB") or device.startswith("/dev/ttyACM")


def _try_connect_mavlink(device: str, baud: int):
    try:
        mav = mavutil.mavlink_connection(device, baud=baud, timeout=3)
        mav.wait_heartbeat(timeout=3)
        return mav
    except Exception:
        return None


def _listen_loop(mav, device: str):
    registry = get_vehicle_registry()
    while True:
        msg = mav.recv_match(blocking=True, timeout=3)
        if msg:
            registry.handle_message(msg)


def _discovery_loop():
    baud = settings.MAVLINK_BAUD
    while True:
        for p in list_ports.comports():
            device = p.device
            if not _is_candidate_port(device):
                continue
            if device in _connected_ports:
                continue

            mav = _try_connect_mavlink(device, baud)
            if not mav:
                continue

            _connected_ports.add(device)
            threading.Thread(
                target=_listen_loop,
                args=(mav, device),
                daemon=True,
            ).start()
        time.sleep(2)


def _push_telemetry_loop():
    registry = get_vehicle_registry()
    last_push = 0.0

    while True:
        now = time.time()
        if now - last_push >= PUSH_INTERVAL_SEC:
            payload = registry.latest_flattened()
            if payload:
                requests.post(RENDER_TELEMETRY_PUSH_URL, json=payload, timeout=1)
            last_push = now
        time.sleep(0.05)


def start_mavlink_background():
    global _threads_started
    if _threads_started:
        return
    _threads_started = True

    threading.Thread(target=_discovery_loop, daemon=True).start()
    threading.Thread(target=_push_telemetry_loop, daemon=True).start()
