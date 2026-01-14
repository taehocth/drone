# app/mavlink/manager.py

import sys
import time
import threading
from typing import Optional, Dict

import requests
from pymavlink import mavutil
from serial.tools import list_ports

from app.core.config import settings


# =====================================================
# 🔴 Render Telemetry PUSH 설정
# =====================================================

RENDER_TELEMETRY_PUSH_URL = getattr(
    settings,
    "RENDER_TELEMETRY_PUSH_URL",
    "https://drone-5-2qlc.onrender.com/api/v1/qgc/telemetry/push",
)

PUSH_INTERVAL_SEC = 0.2  # 5Hz


# =====================================================
# Vehicle Registry (Singleton)
# =====================================================

class VehicleRegistry:
    """
    QGC VehicleManager와 동일한 개념
    - SYSID 기준으로 기체 상태 관리
    - MAVLink 메시지를 누적 상태로 보관
    """

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

        elif msg_type == "SYS_STATUS":
            vehicle["battery"] = {
                "voltage": msg.voltage_battery / 1000,
                "current": msg.current_battery / 100,
                "remaining": msg.battery_remaining,
            }

    def snapshot(self) -> Dict[int, dict]:
        with self._lock:
            return dict(self._vehicles)

    def latest_flattened(self) -> Optional[dict]:
        """
        Cloud / Web 전송용 단일 기체 스냅샷
        (현재는 첫 번째 활성 기체 기준)
        """
        with self._lock:
            if not self._vehicles:
                return None

            v = next(iter(self._vehicles.values()))

            return {
                "sysid": v["sysid"],
                "heartbeat": v["heartbeat"],
                "position": v["position"],
                "battery": v["battery"],
                "last_seen": v["last_seen"],
            }


# =====================================================
# ⭐ Singleton Registry
# =====================================================

_registry = VehicleRegistry()


def get_vehicle_registry() -> VehicleRegistry:
    """
    ❗ 반드시 이 함수로만 registry에 접근
    """
    return _registry


# =====================================================
# MAVLink Connection Management
# =====================================================

_connected_ports: set[str] = set()
_threads_started = False
_lock = threading.Lock()


def _is_candidate_port(device: str) -> bool:
    if sys.platform.startswith("win"):
        return device.upper().startswith("COM")

    return (
        device.startswith("/dev/ttyUSB")
        or device.startswith("/dev/ttyACM")
        or device.startswith("/dev/serial/")
    )


def _try_connect_mavlink(device: str, baud: int) -> Optional[mavutil.mavfile]:
    try:
        mav = mavutil.mavlink_connection(device, baud=baud, timeout=3)
        mav.wait_heartbeat(timeout=3)
        return mav
    except Exception:
        return None


def _listen_loop(mav: mavutil.mavfile, device: str) -> None:
    print(f"[MAVLink] Listening on {device}")

    registry = get_vehicle_registry()

    while True:
        try:
            msg = mav.recv_match(blocking=True, timeout=3)
            if msg:
                registry.handle_message(msg)
        except Exception as e:
            print(f"[MAVLink] Disconnected {device}: {e}")
            with _lock:
                _connected_ports.discard(device)
            break


def _discovery_loop() -> None:
    baud = settings.MAVLINK_BAUD

    while True:
        ports = list_ports.comports()

        for p in ports:
            device = p.device

            if not _is_candidate_port(device):
                continue

            with _lock:
                if device in _connected_ports:
                    continue

            mav = _try_connect_mavlink(device, baud)
            if not mav:
                continue

            with _lock:
                _connected_ports.add(device)

            print(
                f"[MAVLink] Connected on {device} "
                f"(SYSID={mav.target_system}, COMPID={mav.target_component})"
            )

            threading.Thread(
                target=_listen_loop,
                args=(mav, device),
                daemon=True,
            ).start()

        time.sleep(2)


# =====================================================
# 🔴 Render Telemetry PUSH Loop
# =====================================================

def _push_telemetry_loop() -> None:
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

def start_mavlink_background() -> None:
    global _threads_started

    with _lock:
        if _threads_started:
            return
        _threads_started = True

    # MAVLink 포트 탐색 + 수신
    threading.Thread(target=_discovery_loop, daemon=True).start()

    # 🔴 실데이터 → Render PUSH
    threading.Thread(target=_push_telemetry_loop, daemon=True).start()
