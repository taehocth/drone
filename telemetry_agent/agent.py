import time
import threading
import math
from typing import Optional, Dict, Any, List, Tuple

import requests
from pymavlink import mavutil
from serial.tools import list_ports


# =====================================================
# CONFIG
# =====================================================

SERVER_BASE_URL = "https://hanuldrone.duckdns.org"
TELEMETRY_PUSH_URL = f"{SERVER_BASE_URL}/api/v1/qgc/telemetry/push"

BAUD_RATES = [57600, 115200, 921600]
PUSH_INTERVAL_SEC = 0.1
STALE_WARN_SEC = 3.0
HTTP_TIMEOUT_SEC = 5.0
VFR_VEL_FALLBACK_AFTER_SEC = 0.5

# ✅ 포트 우선순위/필터
PREFERRED_PORTS = ["COM6"]  # 필요하면 ["COM6","COM7"] 처럼 추가 가능
EXCLUDE_IF_DESC_CONTAINS = ["bluetooth"]  # description에 포함되면 제외 (case-insensitive)
USB_HINTS = ["usb", "serial", "stm", "px4", "cube", "fmu"]  # description에 있으면 우선


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


def scan_serial_ports_detailed() -> List[Tuple[str, str]]:
    """
    Returns list of (device, description)
    """
    out: List[Tuple[str, str]] = []
    for p in list_ports.comports():
        dev = getattr(p, "device", None) or ""
        desc = getattr(p, "description", None) or ""
        if dev:
            out.append((dev, desc))
    return out


def should_exclude_port(device: str, desc: str) -> bool:
    d = (device or "").lower()
    s = (desc or "").lower()
    for key in EXCLUDE_IF_DESC_CONTAINS:
        key = (key or "").lower()
        if key and (key in d or key in s):
            return True
    return False


def port_score(device: str, desc: str) -> int:
    """
    Higher score = tried earlier (after preferred ports)
    """
    s = (desc or "").lower()
    d = (device or "").lower()

    score = 0
    # USB/Serial 힌트
    for h in USB_HINTS:
        if h and (h in s or h in d):
            score += 10

    # COM 숫자가 클수록 가끔 USB 쪽인 경우가 있어 약간 가산(취향)
    # (원치 않으면 삭제해도 됨)
    if d.startswith("com"):
        try:
            n = int(d.replace("com", "").strip())
            score += min(n, 20) // 5  # 최대 +4 정도
        except Exception:
            pass

    return score


def build_try_port_list() -> List[str]:
    """
    1) Preferred ports (exists) first
    2) Non-excluded ports sorted by score desc
    """
    detailed = scan_serial_ports_detailed()
    if not detailed:
        return []

    # exclude bluetooth etc.
    filtered = [(dev, desc) for (dev, desc) in detailed if not should_exclude_port(dev, desc)]

    # preferred first (only if present)
    present = {dev for (dev, _) in filtered}
    preferred = [p for p in PREFERRED_PORTS if p in present]

    # remaining ports sorted by heuristic score
    remaining = [(dev, desc) for (dev, desc) in filtered if dev not in preferred]
    remaining_sorted = sorted(remaining, key=lambda x: port_score(x[0], x[1]), reverse=True)

    ordered = preferred + [dev for (dev, _) in remaining_sorted]
    return ordered


# =====================================================
# Telemetry Agent
# =====================================================

class TelemetryAgent:
    def __init__(self):
        self.mav: Optional[mavutil.mavfile] = None
        self.sysid: Optional[int] = None
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
    # Connect to telemetry (COM6 우선 + Bluetooth 제외)
    # -------------------------------------------------
    def connect_any(self) -> bool:
        print("[Agent] Scanning serial ports...")

        ports = build_try_port_list()
        if not ports:
            print("[Agent] No serial ports found (after filtering)")
            return False

        print("[Agent] Candidate ports (ordered):", ", ".join(ports))

        for port in ports:
            for baud in BAUD_RATES:
                try:
                    print(f"[Agent] Trying {port} @ {baud}")

                    mav = mavutil.mavlink_connection("COM5", baud=57600)

                    # ✅ heartbeat 확인 (여기서 걸리면 '진짜 MAVLink'임)
                    mav.wait_heartbeat(timeout=5)

                    # ✅ sysid 확정
                    hb = mav.recv_match(type="HEARTBEAT", blocking=True, timeout=2)
                    sysid = None
                    if hb is not None:
                        try:
                            sysid = hb.get_srcSystem()
                        except Exception:
                            sysid = None

                    # fallback
                    if sysid is None:
                        sysid = getattr(mav, "target_system", None)

                    self.mav = mav
                    self.sysid = sysid

                    with self._lock:
                        self._cache["sysid"] = self.sysid

                    print("[Agent] Connected!")
                    print(f"[Agent]  Port : {port}")
                    print(f"[Agent]  Baud : {baud}")
                    print(f"[Agent]  SYSID: {self.sysid}")
                    return True

                except Exception as e:
                    # 실패하면 다음 baud/포트 시도
                    continue

        print("[Agent] Failed to connect to any telemetry")
        return False

    # -------------------------------------------------
    # MAVLink Listen Loop
    # -------------------------------------------------
    def listen_loop(self):
        assert self.mav is not None

        while self.running:
            msg = self.mav.recv_match(blocking=True, timeout=2)
            if not msg:
                continue
            self.ingest_message(msg)

    # -------------------------------------------------
    # MAVLink message → cache
    # -------------------------------------------------
    def ingest_message(self, msg) -> None:
        t = msg.get_type()
        ts = now_ts()

        with self._lock:
            # sysid 유지/갱신
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
                self._cache["position"] = {
                    "lat": (float(msg.lat) / 1e7) if msg.lat is not None else None,
                    "lon": (float(msg.lon) / 1e7) if msg.lon is not None else None,
                    "alt": (float(msg.relative_alt) / 1000.0) if msg.relative_alt is not None else None,
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
                    self._cache["position"] = {"lat": None, "lon": None, "alt": None}

                if getattr(msg, "alt", None) is not None:
                    try:
                        self._cache["position"]["alt"] = float(msg.alt)
                        self._last_update["position"] = ts
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

            speed_m_s = None
            if isinstance(vel, dict):
                vx = vel.get("vx")
                vy = vel.get("vy")
                if is_num(vx) and is_num(vy):
                    speed_m_s = math.sqrt(vx * vx + vy * vy)
                elif is_num(vx) and (vy is None):
                    speed_m_s = abs(vx)

            snap = {
                "sysid": self._cache.get("sysid"),
                "attitude": self._cache.get("attitude"),
                "position": self._cache.get("position"),
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

                    print(
                        f"[Agent] PUSH sysid={snap.get('sysid')} status={res.status_code} "
                        f"(age attitude={fmt_age(age.get('attitude'))} "
                        f"pos={fmt_age(age.get('position'))} "
                        f"vel={fmt_age(age.get('velocity'))} "
                        f"speed={spd_str})"
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
                threading.Thread(target=self.listen_loop, daemon=True).start()
                threading.Thread(target=self.push_loop, daemon=True).start()
                break

            print("[Agent] Retry in 3 seconds...")
            time.sleep(3)


if __name__ == "__main__":
    print("===================================")
    print(" Local Telemetry Agent (QGC 역할)")
    print("===================================")

    agent = TelemetryAgent()
    agent.run()

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n[Agent] Shutting down...")
        agent.running = False