import time
import threading
from typing import Optional, Dict

from app.core.config import settings


# =====================================================
# CONFIG
# =====================================================

STALE_THRESHOLD_SEC = 1.5   # 🔴 heartbeat 기준 (1~2초 권장)


# =====================================================
# Vehicle Registry (SERVER 진실 소스)
# =====================================================

class VehicleRegistry:
    """
    서버의 단일 진실 소스 (Single Source of Truth)

    - Local Telemetry Agent가 PUSH한 데이터만 저장
    - sysid 기준으로 telemetry 누적
    - last_seen 기반 alive 판정
    """

    def __init__(self):
        self._vehicles: Dict[int, dict] = {}
        self._lock = threading.Lock()

    # -------------------------------------------------
    # 🔹 Agent → Server 진입점 (핵심)
    # -------------------------------------------------
    def ingest_from_agent(self, data: dict) -> None:
        sysid = data.get("sysid")
        if sysid is None:
            return

        now = time.time()

        with self._lock:
            if sysid not in self._vehicles:
                self._vehicles[sysid] = {
                    "sysid": sysid,
                    "position": None,
                    "velocity": None,
                    "attitude": None,
                    "battery": None,
                    "gps": None,
                    "last_seen": now,
                }

            v = self._vehicles[sysid]

            # 🔴 누적 업데이트 (덮어쓰기 금지)
            if "position" in data:
                v["position"] = data["position"]

            if "velocity" in data:
                v["velocity"] = data["velocity"]

            if "attitude" in data:
                v["attitude"] = data["attitude"]

            if "battery" in data:
                v["battery"] = data["battery"]

            if "gps" in data:
                v["gps"] = data["gps"]

            v["last_seen"] = now

    # -------------------------------------------------
    # 🔹 WebSocket 소비용 (QGC-style)
    # -------------------------------------------------
    def latest_flattened(self) -> Optional[dict]:
        now = time.time()

        with self._lock:
            alive = [
                v for v in self._vehicles.values()
                if v.get("last_seen") and now - v["last_seen"] < STALE_THRESHOLD_SEC
            ]

            if not alive:
                return None

            v = alive[0]  # 🔴 현재는 1대만

            # 🔹 flatten (프론트 기대 구조)
            payload = {
                "sysid": v["sysid"],
                "position": v.get("position"),
                "velocity": v.get("velocity"),
                "attitude": v.get("attitude"),
                "battery": v.get("battery"),
                "gps": v.get("gps"),
            }

            return payload


# =====================================================
# Singleton
# =====================================================

_registry = VehicleRegistry()


def get_vehicle_registry() -> VehicleRegistry:
    return _registry
