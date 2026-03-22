import os
import time
import threading
import math
from typing import Optional, Dict, Any

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
LTE_RETRY_SEC = 3.0

# ✅ 기체 식별 / 검색용
DRONE_ID = os.getenv("DRONE_ID", "drone-001")
VEHICLE_NAME = os.getenv("VEHICLE_NAME", DRONE_ID)

# ✅ 실제 pymavlink 접속용 문자열
#    예: tcp:3.36.81.238:51067
LTE_CONNECTION = os.getenv("LTE_CONNECTION", "").strip()

# ✅ 웹페이지 검색용 LTE IP (포트 포함)
#
#    [변경 사항]
#    기존: LTE_IP = "3.36.81.238"          → 포트 없이 IP만 저장
#    변경: LTE_IP = "3.36.81.238:51067"    → 포트 포함하여 저장
#
#    이유: 같은 IP(3.36.81.238)에 포트가 다른 기체 3대가 존재하므로
#          IP만으로는 기체를 구분할 수 없음.
#          LTE_IP에 포트를 포함시켜 각 기체를 고유하게 식별함.
#
#    설정 방법 (각 기체 agent 실행 시 환경변수로 지정):
#      기체 1: LTE_IP=3.36.81.238:51067  LTE_CONNECTION=tcp:3.36.81.238:51067
#      기체 2: LTE_IP=3.36.81.238:51568  LTE_CONNECTION=tcp:3.36.81.238:51568
#      기체 3: LTE_IP=3.36.81.238:52066  LTE_CONNECTION=tcp:3.36.81.238:52066
#
#    LTE_IP 미설정 시 LTE_CONNECTION에서 자동 추출 (tcp: 제거)
if os.getenv("LTE_IP", "").strip():
    LTE_IP = os.getenv("LTE_IP", "").strip()
elif LTE_CONNECTION:
    # tcp:3.36.81.238:51067 → 3.36.81.238:51067
    LTE_IP = LTE_CONNECTION.replace("tcp:", "").replace("udp:", "").strip()
else:
    LTE_IP = ""


# =====================================================
# UTIL
# =====================================================

def now_ts() -> float:
    return time.time()


def is_num(x) -> bool:
    return isinstance(x, (int, float)) and not isinstance(x, bool)


def fmt_age(v) -> str:
    if v is None:
        return "None"
    try:
        return f"{v:.2f}s"
    except Exception:
        return str(v)


def fmt_num(v, unit: str = "") -> str:
    if v is None:
        return "None"
    try:
        return f"{float(v):.2f}{unit}"
    except Exception:
        return str(v)


# =====================================================
# Telemetry Agent (LTE ONLY)
# =====================================================

class TelemetryAgent:
    def __init__(self):
        self.mav: Optional[mavutil.mavfile] = None
        self.sysid: Optional[int] = None

        self.connected_source_type: Optional[str] = None   # "lte"
        self.connected_endpoint: Optional[str] = None      # tcp:...
        self.running = True

        self._cache: Dict[str, Any] = {
            "sysid": None,
            "position": None,
            "velocity": None,
            "attitude": None,
            "battery": None,
            "gps": None,
        }

        self._last_update: Dict[str, float] = {
            "position": 0.0,
            "velocity": 0.0,
            "attitude": 0.0,
            "battery": 0.0,
            "gps": 0.0,
        }

        self._lock = threading.Lock()
        self._last_push_at = 0.0
        self._session = requests.Session()

    # -------------------------------------------------
    # LTE Connect
    # -------------------------------------------------
    def connect_lte(self) -> bool:
        if not LTE_CONNECTION:
            print("[Agent] LTE_CONNECTION is empty")
            print("[Agent] Example: tcp:3.36.81.238:51067")
            return False

        try:
            print(f"[Agent] Trying LTE: {LTE_CONNECTION}")

            mav = mavutil.mavlink_connection(LTE_CONNECTION)
            mav.wait_heartbeat(timeout=LTE_HEARTBEAT_TIMEOUT_SEC)

            hb = mav.recv_match(type="HEARTBEAT", blocking=True, timeout=2)
            sysid = None

            if hb is not None:
                try:
                    sysid = hb.get_srcSystem()
                except Exception:
                    sysid = None

            if sysid is None:
                sysid = getattr(mav, "target_system", None)

            self.mav = mav
            self.sysid = sysid
            self.connected_source_type = "lte"
            self.connected_endpoint = LTE_CONNECTION

            with self._lock:
                self._cache["sysid"] = self.sysid

            print("[Agent] Connected via LTE!")
            print(f"[Agent]  Endpoint    : {LTE_CONNECTION}")
            print(f"[Agent]  SYSID       : {self.sysid}")
            print(f"[Agent]  DRONE_ID    : {DRONE_ID}")
            print(f"[Agent]  VEHICLE_NAME: {VEHICLE_NAME}")
            print(f"[Agent]  LTE_IP      : {LTE_IP or '(empty)'}")
            return True

        except Exception as e:
            print(f"[Agent] LTE connect failed: {e}")
            self.mav = None
            self.sysid = None
            self.connected_source_type = None
            self.connected_endpoint = None
            return False

    def connect_any(self) -> bool:
        return self.connect_lte()

    # -------------------------------------------------
    # MAVLink Listen Loop
    # -------------------------------------------------
    def listen_loop(self):
        assert self.mav is not None

        while self.running:
            try:
                msg = self.mav.recv_match(blocking=True, timeout=2)
                if not msg:
                    continue
                self.ingest_message(msg)
            except Exception as e:
                print(f"[Agent] listen_loop error: {e}")
                break

        print("[Agent] listen_loop stopped")
        self.running = False

    # -------------------------------------------------
    # MAVLink message → cache
    # -------------------------------------------------
    def ingest_message(self, msg) -> None:
        t = msg.get_type()
        ts = now_ts()

        with self._lock:
            try:
                self._cache["sysid"] = msg.get_srcSystem()
            except Exception:
                pass

            if t == "ATTITUDE":
                self._cache["attitude"] = {
                    "roll": float(msg.roll) if msg.roll is not None else None,
                    "pitch": float(msg.pitch) if msg.pitch is not None else None,
                    "yaw": float(msg.yaw) if msg.yaw is not None else None,
                }
                self._last_update["attitude"] = ts
                return

            if t == "SYS_STATUS":
                self._cache["battery"] = {
                    "voltage": (float(msg.voltage_battery) / 1000.0) if msg.voltage_battery is not None else None,
                    "current": (float(msg.current_battery) / 100.0) if msg.current_battery is not None else None,
                    "remaining": int(msg.battery_remaining) if msg.battery_remaining is not None else None,
                }
                self._last_update["battery"] = ts
                return

            if t == "GPS_RAW_INT":
                self._cache["gps"] = {
                    "fix_type": int(msg.fix_type) if msg.fix_type is not None else None,
                    "satellites": int(msg.satellites_visible) if msg.satellites_visible is not None else None,
                }
                self._last_update["gps"] = ts
                return

            if t == "GLOBAL_POSITION_INT":
                relative_alt_m = (float(msg.relative_alt) / 1000.0) if msg.relative_alt is not None else None
                amsl_alt_m = (float(msg.alt) / 1000.0) if msg.alt is not None else None

                self._cache["position"] = {
                    "lat": (float(msg.lat) / 1e7) if msg.lat is not None else None,
                    "lon": (float(msg.lon) / 1e7) if msg.lon is not None else None,
                    "alt": relative_alt_m,
                    "relative_alt": relative_alt_m,
                    "amsl_alt": amsl_alt_m,
                }
                self._last_update["position"] = ts
                return

            if t == "LOCAL_POSITION_NED":
                self._cache["velocity"] = {
                    "vx": float(msg.vx) if msg.vx is not None else None,
                    "vy": float(msg.vy) if msg.vy is not None else None,
                    "vz": float(msg.vz) if msg.vz is not None else None,
                }
                self._last_update["velocity"] = ts
                return

            if t == "VFR_HUD":
                if self._cache.get("position") is None:
                    self._cache["position"] = {
                        "lat": None,
                        "lon": None,
                        "alt": None,
                        "relative_alt": None,
                        "amsl_alt": None,
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
                        vel = self._cache.get("velocity")

                        if vel is None or vel_age > VFR_VEL_FALLBACK_AFTER_SEC:
                            self._cache["velocity"] = {
                                "vx": gs,
                                "vy": 0.0,
                                "vz": None,
                            }
                            self._last_update["velocity"] = ts
                except Exception:
                    pass

                return

    # -------------------------------------------------
    # Build snapshot
    # -------------------------------------------------
    def build_snapshot(self) -> dict:
        with self._lock:
            vel = self._cache.get("velocity")
            pos = self._cache.get("position")

            speed_m_s = None
            if isinstance(vel, dict):
                vx = vel.get("vx")
                vy = vel.get("vy")
                if is_num(vx) and is_num(vy):
                    speed_m_s = math.sqrt(vx * vx + vy * vy)
                elif is_num(vx) and (vy is None):
                    speed_m_s = abs(vx)

            snap = {
                "drone_id": DRONE_ID,
                "vehicle_name": VEHICLE_NAME,
                # [변경] 포트 포함된 LTE_IP 전송 (예: "3.36.81.238:51067")
                "lte_ip": LTE_IP or None,
                "sysid": self._cache.get("sysid"),
                "source": {
                    "type": self.connected_source_type,
                    "endpoint": self.connected_endpoint,
                },
                "attitude": self._cache.get("attitude"),
                "position": pos,
                "velocity": vel,
                "speed_m_s": speed_m_s,
                "battery": self._cache.get("battery"),
                "gps": self._cache.get("gps"),
            }

            age = {}
            for k, last in self._last_update.items():
                age[k] = (now_ts() - last) if last else None
            snap["_age_sec"] = age

            return snap

    # -------------------------------------------------
    # Push Loop
    # -------------------------------------------------
    def push_loop(self):
        while self.running:
            snap = self.build_snapshot()

            if snap.get("sysid") is None:
                time.sleep(PUSH_INTERVAL_SEC)
                continue

            try:
                res = self._session.post(
                    TELEMETRY_PUSH_URL,
                    json=snap,
                    timeout=HTTP_TIMEOUT_SEC,
                )

                now = now_ts()
                if now - self._last_push_at >= 1.0:
                    self._last_push_at = now
                    age = snap.get("_age_sec", {}) or {}
                    spd = snap.get("speed_m_s")
                    spd_str = (f"{spd:.2f}m/s" if is_num(spd) else "None")

                    pos = snap.get("position") or {}
                    alt_str = fmt_num(pos.get("alt"), "m")
                    rel_alt_str = fmt_num(pos.get("relative_alt"), "m")
                    amsl_alt_str = fmt_num(pos.get("amsl_alt"), "m")
                    vfr_alt_str = fmt_num(pos.get("vfr_alt"), "m")

                    print(
                        f"[Agent] PUSH drone_id={snap.get('drone_id')} "
                        f"lte_ip={snap.get('lte_ip')} "
                        f"source_type={snap.get('source', {}).get('type')} "
                        f"endpoint={snap.get('source', {}).get('endpoint')} "
                        f"sysid={snap.get('sysid')} status={res.status_code} "
                        f"(age attitude={fmt_age(age.get('attitude'))} "
                        f"pos={fmt_age(age.get('position'))} "
                        f"vel={fmt_age(age.get('velocity'))} "
                        f"speed={spd_str} "
                        f"alt={alt_str} rel={rel_alt_str} "
                        f"amsl={amsl_alt_str} vfr={vfr_alt_str})"
                    )

            except Exception as e:
                print(f"[Agent] Push failed: {e}")

            time.sleep(PUSH_INTERVAL_SEC)

    # -------------------------------------------------
    # Run
    # -------------------------------------------------
    def run(self):
        while self.running:
            if self.connect_any():
                listen_thread = threading.Thread(target=self.listen_loop, daemon=True)
                push_thread = threading.Thread(target=self.push_loop, daemon=True)

                listen_thread.start()
                push_thread.start()
                return

            print(f"[Agent] Retry in {LTE_RETRY_SEC:.0f} seconds...")
            time.sleep(LTE_RETRY_SEC)


if __name__ == "__main__":
    print("===================================")
    print(" Local Telemetry Agent (LTE ONLY)")
    print("===================================")
    print(f"[Agent] SERVER_BASE_URL = {SERVER_BASE_URL}")
    print(f"[Agent] DRONE_ID        = {DRONE_ID}")
    print(f"[Agent] VEHICLE_NAME    = {VEHICLE_NAME}")
    print(f"[Agent] LTE_IP          = {LTE_IP or '(empty)'}")
    print(f"[Agent] LTE_CONNECTION  = {LTE_CONNECTION or '(empty)'}")

    agent = TelemetryAgent()
    agent.run()

    try:
        while True:
            if not agent.running:
                break
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n[Agent] Shutting down...")
        agent.running = False