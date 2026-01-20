# backend/app/mavlink/manager.py

import time
import threading
from typing import Optional, Dict

# ⚠️ 유지 (로컬 Agent 재사용 / 타입 호환 목적)
import requests
from pymavlink import mavutil

from app.core.config import settings


# =====================================================
# Telemetry PUSH (❌ SERVER에서는 사용 안 함)
# =====================================================

RENDER_TELEMETRY_PUSH_URL = settings.RENDER_TELEMETRY_PUSH_URL
PUSH_INTERVAL_SEC = 0.2
STALE_THRESHOLD_SEC = 1.0


# =====================================================
# Vehicle Registry (sysid 기반, SERVER 진실 소스)
# =====================================================

class VehicleRegistry:
    """
    서버의 단일 진실 소스 (Single Source of Truth)

    - Local Telemetry Agent가 PUSH한 데이터만 저장
    - 서버는 MAVLink / USB / Serial을 직접 다루지 않음
    """

    def __init__(self):
        self._vehicles: Dict[int, dict] = {}
        self._lock = threading.Lock()

    # -------------------------------------------------
    # 🔹 Agent → Server 진입점 (핵심)
    # -------------------------------------------------
    def ingest_from_agent(self, data: dict) -> None:
        """
        Local Telemetry Agent가 보내준 payload 저장
        """
        sysid = data.get("sysid")
        if sysid is None:
            return

        with self._lock:
            self._vehicles[sysid] = {
                **data,
                "last_seen": time.time(),
            }

    # -------------------------------------------------
    # 🔹 (호환용) 기존 구조 유지
    # -------------------------------------------------
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

    # -------------------------------------------------
    # ❌ SERVER에서는 사용하지 않음 (보존만)
    # -------------------------------------------------
    def handle_message(self, msg) -> None:
        """
        ⚠️ 서버에서는 호출되지 않음
        (Local Telemetry Agent 전용 로직)
        """
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

    # -------------------------------------------------
    # 🔹 WebSocket 소비용
    # -------------------------------------------------
    def latest_flattened(self) -> Optional[dict]:
        with self._lock:
            now = time.time()

            alive = [
                v for v in self._vehicles.values()
                if v.get("last_seen") and now - v["last_seen"] < STALE_THRESHOLD_SEC
            ]

            if not alive:
                return None

            # 🔴 프론트 구조상 우선 1대
            return alive[0]


# =====================================================
# Singleton
# =====================================================

_registry = VehicleRegistry()


def get_vehicle_registry() -> VehicleRegistry:
    return _registry


# =====================================================
# MAVLink Threads (❌ SERVER 비활성화)
# =====================================================

_connected = False
_lock = threading.Lock()


def _listen_loop(mav):
    """
    ❌ SERVER에서는 실행되지 않음
    (Local Telemetry Agent 전용)
    """
    pass


def _mavlink_connect_loop():
    """
    ❌ SERVER에서는 실행되지 않음
    """
    pass


def _push_telemetry_loop():
    """
    ❌ SERVER에서는 실행되지 않음
    """
    pass


# =====================================================
# Public Entry (SERVER 보호 장치)
# =====================================================

_threads_started = False


def start_mavlink_background():
    """
    ❌ 배포 서버(Render 등)에서는 절대 MAVLink를 시작하지 않음
    """
    print("[MAVLink] Server mode: MAVLink disabled (Agent-only)")
    return
