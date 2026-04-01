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

SERVER_BASE_URL = os.getenv("SERVER_BASE_URL", "https://drone-5-2qlc.onrender.com")
TELEMETRY_PUSH_URL = f"{SERVER_BASE_URL}/api/v1/qgc/telemetry/push"
MISSION_PUSH_URL   = f"{SERVER_BASE_URL}/api/v1/qgc/mission/push"   # ★ 추가

PUSH_INTERVAL_SEC          = 0.1
HTTP_TIMEOUT_SEC           = 5.0
VFR_VEL_FALLBACK_AFTER_SEC = 0.5
LTE_HEARTBEAT_TIMEOUT_SEC  = 8.0
LTE_RETRY_SEC              = 5.0

MISSION_DOWNLOAD_TIMEOUT_SEC = 3.0   # 웨이포인트 1개당 응답 대기
MISSION_RETRY_INTERVAL_SEC   = 30.0  # 미션 다운로드 재시도 주기

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
        "lte_connection": "tcp:3.36.81.238:52066",
        "lte_ip":         "3.36.81.238:52066",
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


# MAVLink command → 라벨 (디버그 출력용)
def cmd_label(cmd: int) -> str:
    return {22: "TAKEOFF", 21: "LAND", 20: "RTL", 16: "WAYPOINT"}.get(cmd, f"CMD{cmd}")


# =====================================================
# Single Drone Agent
# =====================================================

class DroneAgent:
    def __init__(self, drone_id: str, vehicle_name: str, lte_connection: str, lte_ip: str):
        self.drone_id       = drone_id
        self.vehicle_name   = vehicle_name
        self.lte_connection = lte_connection
        self.lte_ip         = lte_ip

        self.mav:   Optional[mavutil.mavfile] = None
        self.sysid: Optional[int]             = None
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

        # ★ 미션 캐시
        self._mission_waypoints: List[Dict[str, Any]] = []
        self._mission_lock      = threading.Lock()
        self._last_mission_try  = 0.0   # 마지막 다운로드 시도 시각

        self._lock        = threading.Lock()
        self._last_push_at = 0.0
        self._session     = requests.Session()

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

            self.mav   = mav
            self.sysid = sysid

            with self._lock:
                self._cache["sysid"] = self.sysid

            print(f"[{self.drone_id}] Connected! sysid={self.sysid} lte_ip={self.lte_ip}")

            # ★ 연결 직후 미션 다운로드 시도
            self._try_download_mission()

            return True

        except Exception as e:
            print(f"[{self.drone_id}] Connect failed: {e}")
            self.mav   = None
            self.sysid = None
            return False

    # -------------------------------------------------
    # ★ 미션 다운로드 (MISSION_REQUEST_LIST → MISSION_ITEM_INT)
    # -------------------------------------------------
    def _try_download_mission(self) -> None:
        """
        기체에서 미션 웨이포인트 전체를 MAVLink로 내려받아
        self._mission_waypoints 에 저장하고 서버로 push한다.
        실패해도 예외를 전파하지 않는다 (텔레메트리 루프와 독립).
        """
        if self.mav is None:
            return

        now = now_ts()
        self._last_mission_try = now

        try:
            mav = self.mav

            # 1) 미션 개수 요청
            mav.mav.mission_request_list_send(
                mav.target_system,
                mav.target_component,
            )

            count_msg = mav.recv_match(
                type="MISSION_COUNT",
                blocking=True,
                timeout=MISSION_DOWNLOAD_TIMEOUT_SEC,
            )
            if count_msg is None:
                print(f"[{self.drone_id}] Mission: no MISSION_COUNT response")
                return

            count = int(count_msg.count)
            if count == 0:
                print(f"[{self.drone_id}] Mission: empty (count=0)")
                with self._mission_lock:
                    self._mission_waypoints = []
                self._push_mission()
                return

            print(f"[{self.drone_id}] Mission: downloading {count} items...")
            waypoints: List[Dict[str, Any]] = []

            # 2) 개별 웨이포인트 요청
            for i in range(count):
                mav.mav.mission_request_int_send(
                    mav.target_system,
                    mav.target_component,
                    i,
                )
                item = mav.recv_match(
                    type="MISSION_ITEM_INT",
                    blocking=True,
                    timeout=MISSION_DOWNLOAD_TIMEOUT_SEC,
                )
                if item is None:
                    print(f"[{self.drone_id}] Mission: timeout at item {i}")
                    return   # 중간 실패 시 불완전 저장 방지

                # MISSION_ITEM_INT: x=lat*1e7, y=lon*1e7, z=alt(m)
                lat = float(item.x) / 1e7
                lng = float(item.y) / 1e7
                alt = float(item.z)
                cmd = int(item.command)

                # 유효 좌표만 포함 (home 등 lat=0,lng=0 제외)
                if abs(lat) < 0.0001 and abs(lng) < 0.0001:
                    continue

                waypoints.append({
                    "index":   int(item.seq),
                    "command": cmd,
                    "lat":     lat,
                    "lng":     lng,
                    "alt":     alt,
                })

            # 3) 완료 ACK
            mav.mav.mission_ack_send(
                mav.target_system,
                mav.target_component,
                0,   # MAV_MISSION_ACCEPTED
            )

            with self._mission_lock:
                self._mission_waypoints = waypoints

            print(
                f"[{self.drone_id}] Mission downloaded: "
                f"{len(waypoints)} valid waypoints"
            )
            for wp in waypoints:
                print(
                    f"  [{wp['index']}] {cmd_label(wp['command'])} "
                    f"lat={wp['lat']:.6f} lng={wp['lng']:.6f} alt={wp['alt']:.1f}m"
                )

            # 4) 서버로 push
            self._push_mission()

        except Exception as e:
            print(f"[{self.drone_id}] Mission download error: {e}")

    def _push_mission(self) -> None:
        """다운로드된 미션 웨이포인트를 서버 REST API로 push"""
        with self._mission_lock:
            waypoints = list(self._mission_waypoints)

        payload = {
            "drone_id":   self.drone_id,
            "lte_ip":     self.lte_ip,
            "waypoints":  waypoints,
        }
        try:
            res = self._session.post(
                MISSION_PUSH_URL, json=payload, timeout=HTTP_TIMEOUT_SEC
            )
            print(
                f"[{self.drone_id}] Mission push → "
                f"status={res.status_code} wp_count={len(waypoints)}"
            )
        except Exception as e:
            print(f"[{self.drone_id}] Mission push failed: {e}")

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

                # ★ MISSION_ITEM_INT / MISSION_CURRENT 처리
                t = msg.get_type()
                if t == "MISSION_CURRENT":
                    # QGC가 미션을 업로드하면 자동 재다운로드
                    # (일정 간격 이상 지났을 때만)
                    elapsed = now_ts() - self._last_mission_try
                    if elapsed > MISSION_RETRY_INTERVAL_SEC:
                        print(
                            f"[{self.drone_id}] MISSION_CURRENT received → re-download"
                        )
                        threading.Thread(
                            target=self._try_download_mission,
                            daemon=True,
                        ).start()

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
        t  = msg.get_type()
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
                rel  = (float(msg.relative_alt) / 1000.0) if msg.relative_alt is not None else None
                amsl = (float(msg.alt)           / 1000.0) if msg.alt          is not None else None
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
                        vel_age  = (now_ts() - last_vel) if last_vel else 999.0
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

        # ★ 미션 웨이포인트 포함 (별도 lock)
        with self._mission_lock:
            snap["mission_waypoints"] = list(self._mission_waypoints)

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
                            f"speed={fmt_num(snap.get('speed_m_s'), 'm/s')} "
                            f"wp={len(snap.get('mission_waypoints', []))}"
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

                while self.running:
                    time.sleep(1)

                print(f"[{self.drone_id}] Disconnected. Retry in {LTE_RETRY_SEC:.0f}s...")
            else:
                print(f"[{self.drone_id}] Retry in {LTE_RETRY_SEC:.0f}s...")

            # 재연결 시 미션 캐시 초기화
            with self._mission_lock:
                self._mission_waypoints = []

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