# telemetry_agent/agent.py

import time
import threading
from typing import Optional, Dict, Any

import requests
from pymavlink import mavutil
from serial.tools import list_ports


# =====================================================
# CONFIG
# =====================================================

SERVER_BASE_URL = "https://drone-5-2qlc.onrender.com"
TELEMETRY_PUSH_URL = f"{SERVER_BASE_URL}/api/v1/qgc/telemetry/push"

BAUD_RATES = [57600, 115200, 921600]

# 전송 주기(초): 0.05 = 20Hz (빠름), 0.1 = 10Hz (권장)
PUSH_INTERVAL_SEC = 0.1

# 특정 데이터가 너무 오래 갱신되지 않으면 stale로 판단(초)
STALE_WARN_SEC = 2.0

# requests timeout
HTTP_TIMEOUT_SEC = 2.0


# =====================================================
# UTIL
# =====================================================

def scan_serial_ports():
    return [p.device for p in list_ports.comports()]


def now_ts() -> float:
    return time.time()


# =====================================================
# Telemetry Agent
# =====================================================

class TelemetryAgent:
    def __init__(self):
        self.mav: Optional[mavutil.mavfile] = None
        self.sysid: Optional[int] = None
        self.running = True

        # 🔴 누적 캐시 (서버로 보낼 "완성 스냅샷")
        self._cache: Dict[str, Any] = {
            "sysid": None,
            "position": None,   # {lat, lon, alt}
            "velocity": None,   # {vx, vy, vz} or derived
            "attitude": None,   # {roll, pitch, yaw}
            "battery": None,    # {voltage, current, remaining}
            "gps": None,        # {fix_type, satellites}
        }

        # 마지막으로 각 항목이 갱신된 시각 (stale 진단용)
        self._last_update: Dict[str, float] = {
            "position": 0.0,
            "velocity": 0.0,
            "attitude": 0.0,
            "battery": 0.0,
            "gps": 0.0,
        }

        self._lock = threading.Lock()

        # push rate control
        self._last_push_at = 0.0

    # -------------------------------------------------
    # Connect to ANY available telemetry
    # -------------------------------------------------
    def connect_any(self) -> bool:
        print("[Agent] Scanning serial ports...")

        ports = scan_serial_ports()
        if not ports:
            print("[Agent] No serial ports found")
            return False

        for port in ports:
            for baud in BAUD_RATES:
                try:
                    print(f"[Agent] Trying {port} @ {baud}")
                    mav = mavutil.mavlink_connection(port, baud=baud, timeout=3)
                    mav.wait_heartbeat(timeout=5)

                    self.mav = mav
                    self.sysid = mav.target_system

                    with self._lock:
                        self._cache["sysid"] = self.sysid

                    print("[Agent] Connected!")
                    print(f"[Agent]  Port : {port}")
                    print(f"[Agent]  Baud : {baud}")
                    print(f"[Agent]  SYSID: {self.sysid}")
                    return True
                except Exception:
                    continue

        print("[Agent] Failed to connect to any telemetry")
        return False

    # -------------------------------------------------
    # MAVLink Listen Loop (캐시 누적)
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
            # sysid는 항상 유지
            self._cache["sysid"] = msg.get_srcSystem()

            # 1) 자세 (ATTITUDE)
            if t == "ATTITUDE":
                self._cache["attitude"] = {
                    "roll": float(msg.roll),
                    "pitch": float(msg.pitch),
                    "yaw": float(msg.yaw),
                }
                self._last_update["attitude"] = ts
                return

            # 2) 배터리 (SYS_STATUS)
            if t == "SYS_STATUS":
                self._cache["battery"] = {
                    "voltage": float(msg.voltage_battery) / 1000.0 if msg.voltage_battery is not None else None,
                    "current": float(msg.current_battery) / 100.0 if msg.current_battery is not None else None,
                    "remaining": int(msg.battery_remaining) if msg.battery_remaining is not None else None,
                }
                self._last_update["battery"] = ts
                return

            # 3) GPS 상태 (GPS_RAW_INT)
            if t == "GPS_RAW_INT":
                self._cache["gps"] = {
                    "fix_type": int(msg.fix_type) if msg.fix_type is not None else None,
                    "satellites": int(msg.satellites_visible) if msg.satellites_visible is not None else None,
                }
                self._last_update["gps"] = ts
                return

            # 4) 위치 (GLOBAL_POSITION_INT)
            if t == "GLOBAL_POSITION_INT":
                self._cache["position"] = {
                    "lat": float(msg.lat) / 1e7 if msg.lat is not None else None,
                    "lon": float(msg.lon) / 1e7 if msg.lon is not None else None,
                    # relative_alt: mm → m
                    "alt": float(msg.relative_alt) / 1000.0 if msg.relative_alt is not None else None,
                }
                self._last_update["position"] = ts
                return

            # 5) 속도 (LOCAL_POSITION_NED)
            # vx, vy, vz: m/s (NED)
            if t == "LOCAL_POSITION_NED":
                self._cache["velocity"] = {
                    "vx": float(msg.vx) if msg.vx is not None else None,
                    "vy": float(msg.vy) if msg.vy is not None else None,
                    "vz": float(msg.vz) if msg.vz is not None else None,
                }
                self._last_update["velocity"] = ts
                return

            # 6) 고도/속도 근삿값 (VFR_HUD) - 매우 유용
            # airspeed/groundspeed(m/s), alt(m), climb(m/s)
            if t == "VFR_HUD":
                # position이 없을 때라도 alt는 확보 가능
                if self._cache.get("position") is None:
                    self._cache["position"] = {"lat": None, "lon": None, "alt": None}

                # alt 업데이트
                try:
                    self._cache["position"]["alt"] = float(msg.alt) if msg.alt is not None else self._cache["position"]["alt"]
                    self._last_update["position"] = ts
                except Exception:
                    pass

                # velocity가 없을 때라도 groundspeed 기반으로 근삿값 확보
                # VFR_HUD groundspeed는 m/s
                try:
                    gs = float(msg.groundspeed) if msg.groundspeed is not None else None
                    if gs is not None:
                        # 방향 성분(vx/vy)은 모르므로 magnitude 기반 근삿값
                        self._cache["velocity"] = {
                            "vx": gs,   # 근삿값: vx에 넣고, 프론트에서 speed 계산에 쓰게 됨
                            "vy": 0.0,
                            "vz": None,
                        }
                        self._last_update["velocity"] = ts
                except Exception:
                    pass

                return

    # -------------------------------------------------
    # Build snapshot for server
    # -------------------------------------------------
    def build_snapshot(self) -> dict:
        with self._lock:
            snap = {
                "sysid": self._cache.get("sysid"),
                "ts": now_ts(),
                "position": self._cache.get("position"),
                "velocity": self._cache.get("velocity"),
                "attitude": self._cache.get("attitude"),
                "battery": self._cache.get("battery"),
                "gps": self._cache.get("gps"),
            }

            # stale 진단용 필드(서버/프론트에서 무시해도 됨)
            age = {}
            for k, last in self._last_update.items():
                age[k] = (now_ts() - last) if last else None
            snap["_age_sec"] = age

            return snap

    # -------------------------------------------------
    # Push Loop → Server (고주기 스냅샷 전송)
    # -------------------------------------------------
    def push_loop(self):
        while self.running:
            snap = self.build_snapshot()

            # sysid 없으면 전송 의미 없음
            if not snap.get("sysid"):
                time.sleep(PUSH_INTERVAL_SEC)
                continue

            try:
                res = requests.post(
                    TELEMETRY_PUSH_URL,
                    json=snap,
                    timeout=HTTP_TIMEOUT_SEC,
                )

                # 너무 많은 로그는 부담이므로 1초에 1번 정도만 찍음
                now = now_ts()
                if now - self._last_push_at >= 1.0:
                    self._last_push_at = now
                    att_age = snap["_age_sec"].get("attitude")
                    pos_age = snap["_age_sec"].get("position")
                    vel_age = snap["_age_sec"].get("velocity")
                    print(
                        f"[Agent] PUSH sysid={snap.get('sysid')} status={res.status_code} "
                        f"(age attitude={att_age:.2f}s pos={pos_age if pos_age is None else f'{pos_age:.2f}s'} "
                        f"vel={vel_age if vel_age is None else f'{vel_age:.2f}s'})"
                    )

            except Exception as e:
                print(f"[Agent] Push failed: {e}")

            time.sleep(PUSH_INTERVAL_SEC)

    # -------------------------------------------------
    # Run Agent
    # -------------------------------------------------
    def run(self):
        while self.running:
            if self.connect_any():
                threading.Thread(target=self.listen_loop, daemon=True).start()
                threading.Thread(target=self.push_loop, daemon=True).start()
                break

            print("[Agent] Retry in 3 seconds...")
            time.sleep(3)


# =====================================================
# Entry Point
# =====================================================

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
