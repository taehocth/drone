# telemetry_agent/agent.py

import time
import json
import threading
import platform
from typing import Optional

import requests
from pymavlink import mavutil
from serial.tools import list_ports


# =====================================================
# CONFIG
# =====================================================

# 🔴 배포된 서버 주소
SERVER_BASE_URL = "https://drone-5-2qlc.onrender.com"
TELEMETRY_PUSH_URL = f"{SERVER_BASE_URL}/api/v1/qgc/telemetry/push"

BAUD_RATES = [57600, 115200, 921600]
PUSH_INTERVAL_SEC = 0.2


# =====================================================
# UTIL: Serial Port Scan
# =====================================================

def scan_serial_ports():
    ports = list_ports.comports()
    return [p.device for p in ports]


# =====================================================
# MAVLink Agent
# =====================================================

class TelemetryAgent:
    def __init__(self):
        self.mav: Optional[mavutil.mavfile] = None
        self.sysid: Optional[int] = None
        self.last_payload: Optional[dict] = None
        self.running = True

    # -------------------------------------------------
    # Connect to ANY available telemetry
    # -------------------------------------------------
    def connect_any(self):
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

                    print(f"[Agent] Connected!")
                    print(f"[Agent]  Port : {port}")
                    print(f"[Agent]  Baud : {baud}")
                    print(f"[Agent]  SYSID: {self.sysid}")
                    return True

                except Exception:
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

            self.last_payload = self.parse_message(msg)

    # -------------------------------------------------
    # Parse MAVLink → JSON
    # -------------------------------------------------
    def parse_message(self, msg) -> Optional[dict]:
        payload = {
            "sysid": msg.get_srcSystem(),
        }

        t = msg.get_type()

        if t == "GLOBAL_POSITION_INT":
            payload["position"] = {
                "lat": msg.lat / 1e7,
                "lon": msg.lon / 1e7,
                "alt": msg.relative_alt / 1000,
            }

        elif t == "ATTITUDE":
            payload["attitude"] = {
                "roll": msg.roll,
                "pitch": msg.pitch,
                "yaw": msg.yaw,
            }

        elif t == "SYS_STATUS":
            payload["battery"] = {
                "voltage": msg.voltage_battery / 1000,
                "current": msg.current_battery / 100,
                "remaining": msg.battery_remaining,
            }

        elif t == "GPS_RAW_INT":
            payload["gps"] = {
                "fix_type": msg.fix_type,
                "satellites": msg.satellites_visible,
            }

        else:
            return None

        return payload

    # -------------------------------------------------
    # Push Loop → Server
    # -------------------------------------------------
    def push_loop(self):
        while self.running:
            if self.last_payload:
                try:
                    requests.post(
                        TELEMETRY_PUSH_URL,
                        json=self.last_payload,
                        timeout=1,
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
