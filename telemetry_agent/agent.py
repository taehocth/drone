import os
import time
import threading
import math
from typing import Optional, Dict, Any, List

import requests
from pymavlink import mavutil


# =====================================================
# CONFIG
# =====================================================

SERVER_BASE_URL = os.getenv("SERVER_BASE_URL", "https://hanuldrone.duckdns.org")
TELEMETRY_PUSH_URL = f"{SERVER_BASE_URL}/api/v1/qgc/telemetry/push"

PUSH_INTERVAL_SEC = 0.1
HTTP_TIMEOUT_SEC = 5.0
VFR_VEL_FALLBACK_AFTER_SEC = 0.5
LTE_HEARTBEAT_TIMEOUT_SEC = 8.0
LTE_RETRY_SEC = 5.0

# =====================================================
# 기체 목록 (포트 / 이름 여기서 관리)
# =====================================================

DRONE_LIST = [
    {
        "drone_id":       "drone-001",
        "vehicle_name":   "drone-001",
        "lte_connection": "tcp:3.36.81.238:51067",
        "lte_ip":         "3.36.81.238:51067",
    },
    {
        "drone_id":       "drone-002",
        "vehicle_name":   "drone-002",
        "lte_connection": "tcp:3.36.81.238:51568",
        "lte_ip":         "3.36.81.238:51568",
    },
    {
        "drone_id":       "drone-003",
        "vehicle_name":   "drone-003",
        "lte_connection": "tcp:3.36.81.238:51066",
        "lte_ip":         "3.36.81.238:51066",
    },
]


# =====================================================
# UTIL
# =====================================================

def now_ts() -> float:
    return time.time()


def is_num(x) -> bool:
    return isinstance(x, (int, float)) and not isinstance(x, bool)


def fmt_num(v, unit: str = "") -> str:
    if v is None:
        return "None"
    try:
        return f"{float(v):.2f}{unit}"
    except Exception:
        return str(v)


# =====================================================
# Single Drone Agent
# =====================================================

class DroneAgent:
    def __init__(self, drone_id: str, vehicle_name: str, lte_connection: str, lte_ip: str):
        self.drone_id = drone_id
        self.vehicle_name = vehicle_name
        self.lte_connection = lte_connection
        self.lte_ip = lte_ip

        self.mav: Optional[mavutil.mavfile] = None
        self.sysid: Optional[int] = None
        self.running = True

        self._cache: Dict[str, Any] = {
            "sysid":    None,
            "position": None,
            "velocity": None,
            "attitude": None,
            "battery":  None,
            "gps":      None,
        }

        self._last_update: Dict[str, float] = {
            "position": 0.0,
            "velocity": 0.0,
            "attitude": 0.0,
            "battery":  0.0,
            "gps":      0.0,
        }

        self._lock = threading.Lock()
        self._last_push_at = 0.0
        self._session = requests.Session()

    # -------------------------------------------------
    # Connect
    # -------------------------------------------------
    def connect(self) -> bool:
        try:
            print(f"[{self.drone_id}] Trying: {self.lte_connection}")
            mav = mavutil.mavlink_connection(self.lte_connection)
            mav.wait_heartbeat(timeout=LTE_HEARTBEAT_TIMEOUT_SEC)

            hb = mav.recv_match(type="HEARTBEAT", blocking=True, timeout=2)
            sysid = None
            if hb is not None:
                try:
                    sysid = hb.get_srcSystem()
                except Exception:
                    pass

            if sysid is None:
                sysid = getattr(mav, "target_system", None)

            self.mav = mav
            self.sysid = sysid

            with self._lock:
                self._cache["sysid"] = self.sysid

            print(f"[{self.drone_id}] Connected! sysid={self.sysid} lte_ip={self.lte_ip}")
            return True

        except Exception as e:
            print(f"[{self.drone_id}] Connect failed: {e}")
            self.mav = None
            self.sysid = None
            return False

    # -------------------------------------------------
    # Listen Loop
    # -------------------------------------------------
    def listen_loop(self):
        assert self.mav is not None
        while self.running:
            try:
                msg = self.mav.recv_match(blocking=True, timeout=2)
                if not msg:
                    continue
                self._ingest(msg)
            except Exception as e:
                print(f"[{self.drone_id}] listen error: {e}")
                break

        print(f"[{self.drone_id}] listen_loop stopped")
        self.running = False

    # -------------------------------------------------
    # Ingest MAVLink message
    # -------------------------------------------------
    def _ingest(self, msg) -> None:
        t = msg.get_type()
        ts = now_ts()

        with self._lock:
            try:
                self._cache["sysid"] = msg.get_srcSystem()
            except Exception:
                pass

            if t == "ATTITUDE":
                self._cache["attitude"] = {
                    "roll":  float(msg.roll)  if msg.roll  is not None else None,
                    "pitch": float(msg.pitch) if msg.pitch is not None else None,
                    "yaw":   float(msg.yaw)   if msg.yaw   is not None else None,
                }
                self._last_update["attitude"] = ts

            elif t == "SYS_STATUS":
                self._cache["battery"] = {
                    "voltage":   (float(msg.voltage_battery) / 1000.0) if msg.voltage_battery is not None else None,
                    "current":   (float(msg.current_battery) / 100.0)  if msg.current_battery is not None else None,
                    "remaining": int(msg.battery_remaining)             if msg.battery_remaining is not None else None,
                }
                self._last_update["battery"] = ts

            elif t == "GPS_RAW_INT":
                self._cache["gps"] = {
                    "fix_type":   int(msg.fix_type)           if msg.fix_type           is not None else None,
                    "satellites": int(msg.satellites_visible) if msg.satellites_visible is not None else None,
                }
                self._last_update["gps"] = ts

            elif t == "GLOBAL_POSITION_INT":
                rel = (float(msg.relative_alt) / 1000.0) if msg.relative_alt is not None else None
                amsl = (float(msg.alt) / 1000.0)         if msg.alt          is not None else None
                self._cache["position"] = {
                    "lat":          (float(msg.lat) / 1e7) if msg.lat is not None else None,
                    "lon":          (float(msg.lon) / 1e7) if msg.lon is not None else None,
                    "alt":          rel,
                    "relative_alt": rel,
                    "amsl_alt":     amsl,
                }
                self._last_update["position"] = ts

            elif t == "LOCAL_POSITION_NED":
                self._cache["velocity"] = {
                    "vx": float(msg.vx) if msg.vx is not None else None,
                    "vy": float(msg.vy) if msg.vy is not None else None,
                    "vz": float(msg.vz) if msg.vz is not None else None,
                }
                self._last_update["velocity"] = ts

            elif t == "VFR_HUD":
                if self._cache.get("position") is None:
                    self._cache["position"] = {
                        "lat": None, "lon": None, "alt": None,
                        "relative_alt": None, "amsl_alt": None,
                    }
                if getattr(msg, "alt", None) is not None:
                    try:
                        self._cache["position"]["vfr_alt"] = float(msg.alt)
                    except Exception:
                        pass

                try:
                    gs = float(msg.groundspeed) if msg.groundspeed is not None else None
                    if gs is not None:
                        last_vel = self._last_update.get("velocity", 0.0) or 0.0
                        vel_age = (now_ts() - last_vel) if last_vel else 999.0
                        if self._cache.get("velocity") is None or vel_age > VFR_VEL_FALLBACK_AFTER_SEC:
                            self._cache["velocity"] = {"vx": gs, "vy": 0.0, "vz": None}
                            self._last_update["velocity"] = ts
                except Exception:
                    pass

    # -------------------------------------------------
    # Build snapshot
    # -------------------------------------------------
    def build_snapshot(self) -> dict:
        with self._lock:
            vel = self._cache.get("velocity")
            pos = self._cache.get("position")

            speed_m_s = None
            if isinstance(vel, dict):
                vx, vy = vel.get("vx"), vel.get("vy")
                if is_num(vx) and is_num(vy):
                    speed_m_s = math.sqrt(vx * vx + vy * vy)
                elif is_num(vx):
                    speed_m_s = abs(vx)

            snap = {
                "drone_id":     self.drone_id,
                "vehicle_name": self.vehicle_name,
                "lte_ip":       self.lte_ip,
                "sysid":        self._cache.get("sysid"),
                "source":       {"type": "lte", "endpoint": self.lte_connection},
                "attitude":     self._cache.get("attitude"),
                "position":     pos,
                "velocity":     vel,
                "speed_m_s":    speed_m_s,
                "battery":      self._cache.get("battery"),
                "gps":          self._cache.get("gps"),
            }
            snap["_age_sec"] = {
                k: (now_ts() - v) if v else None
                for k, v in self._last_update.items()
            }
            return snap

    # -------------------------------------------------
    # Push Loop
    # -------------------------------------------------
    def push_loop(self):
        while self.running:
            snap = self.build_snapshot()

            if snap.get("sysid") is not None:
                try:
                    res = self._session.post(
                        TELEMETRY_PUSH_URL, json=snap, timeout=HTTP_TIMEOUT_SEC
                    )
                    now = now_ts()
                    if now - self._last_push_at >= 1.0:
                        self._last_push_at = now
                        pos = snap.get("position") or {}
                        print(
                            f"[{self.drone_id}] PUSH status={res.status_code} "
                            f"alt={fmt_num(pos.get('alt'), 'm')} "
                            f"speed={fmt_num(snap.get('speed_m_s'), 'm/s')}"
                        )
                except Exception as e:
                    print(f"[{self.drone_id}] Push failed: {e}")

            time.sleep(PUSH_INTERVAL_SEC)

    # -------------------------------------------------
    # Run (자동 재연결 포함)
    # -------------------------------------------------
    def run(self):
        while True:
            self.running = True
            if self.connect():
                listen_t = threading.Thread(target=self.listen_loop, daemon=True)
                push_t   = threading.Thread(target=self.push_loop,   daemon=True)
                listen_t.start()
                push_t.start()

                # listen_loop 종료 시 running=False → 재연결
                while self.running:
                    time.sleep(1)

                print(f"[{self.drone_id}] Disconnected. Retry in {LTE_RETRY_SEC:.0f}s...")
            else:
                print(f"[{self.drone_id}] Retry in {LTE_RETRY_SEC:.0f}s...")

            time.sleep(LTE_RETRY_SEC)


# =====================================================
# Entry Point
# =====================================================

if __name__ == "__main__":
    print("===================================")
    print(" Multi-Drone Telemetry Agent")
    print("===================================")
    print(f" SERVER : {SERVER_BASE_URL}")
    print(f" 기체 수 : {len(DRONE_LIST)}대")
    for d in DRONE_LIST:
        print(f"  - {d['drone_id']}  {d['lte_connection']}")
    print("===================================\n")

    threads: List[threading.Thread] = []
    for cfg in DRONE_LIST:
        agent = DroneAgent(
            drone_id=cfg["drone_id"],
            vehicle_name=cfg["vehicle_name"],
            lte_connection=cfg["lte_connection"],
            lte_ip=cfg["lte_ip"],
        )
        t = threading.Thread(target=agent.run, daemon=True, name=cfg["drone_id"])
        t.start()
        threads.append(t)

    print("모든 기체 연결 시도 중... (Ctrl+C 로 종료)\n")

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n[Agent] 종료합니다.")