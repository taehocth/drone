import os
import time
import threading
import math
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List

import requests
from pymavlink import mavutil


# =====================================================
# CONFIG
# =====================================================

SERVER_BASE_URL    = os.getenv("SERVER_BASE_URL", "https://drone-5-2qlc.onrender.com")
TELEMETRY_PUSH_URL = f"{SERVER_BASE_URL}/api/v1/qgc/telemetry/push"
MISSION_PUSH_URL   = f"{SERVER_BASE_URL}/api/v1/qgc/mission/push"

PUSH_INTERVAL_SEC          = 0.1
HTTP_TIMEOUT_SEC           = 5.0
VFR_VEL_FALLBACK_AFTER_SEC = 0.5
LTE_HEARTBEAT_TIMEOUT_SEC  = 8.0
LTE_RETRY_SEC              = 5.0

HEARTBEAT_WATCHDOG_SEC = 10.0

# =====================================================
# 기체 목록
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
        "lte_connection": "tcp:121.153.47.136:51068",
        "lte_ip":         "121.153.47.136:51068",
    },
    {
        "drone_id":       "drone-003",
        "vehicle_name":   "drone-003",
        "lte_connection": "tcp:121.153.47.136:52066",
        "lte_ip":         "121.153.47.136:52066",
    },
    {
        "drone_id":       "drone-004",
        "vehicle_name":   "drone-004",
        "lte_connection": "tcp:220.89.185.198:52565",
        "lte_ip":         "220.89.185.198:52565",
    },
]

IMPORTANT_PARAMS = {
    "ARMING_CHECK", "FS_BATT_ENABLE", "FS_GCS_ENABLE",
    "RTL_ALT", "WPNAV_SPEED", "FENCE_ENABLE",
    "FS_THR_ENABLE", "BATT_LOW_VOLT", "BATT_CRT_VOLT",
}

CALIB_KEYWORDS = [
    "calibrat", "accel", "compass", "gyro", "baro",
    "PreArm", "EKF", "GPS Glitch", "Arm", "Disarm",
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


def cmd_label(cmd: int) -> str:
    return {22: "TAKEOFF", 21: "LAND", 20: "RTL", 16: "WAYPOINT"}.get(cmd, f"CMD{cmd}")


def _kst_now() -> str:
    return datetime.now(timezone(timedelta(hours=9))).strftime("%H:%M:%S")


# =====================================================
# Single Drone Agent
# =====================================================

class DroneAgent:
    def __init__(self, drone_id: str, vehicle_name: str, lte_connection: str, lte_ip: str):
        self.drone_id       = drone_id
        self.vehicle_name   = vehicle_name
        self.lte_connection = lte_connection
        self.lte_ip         = lte_ip

        self.mav:    Optional[mavutil.mavfile] = None
        self.sysid:  Optional[int]             = None
        self.running = True

        self._cache: Dict[str, Any] = {
            "sysid":        None,
            "position":     None,
            "velocity":     None,
            "attitude":     None,
            "battery":      None,
            "gps":          None,
            # ★ CNN-LSTM 추가 피처
            "att_target":   None,   # ATTITUDE_TARGET  → att_cmd (yaw/pitch/roll)
            "raw_imu":      None,   # RAW_IMU          → sensor_gyro / sensor_accel
            "ekf_bias":     None,   # EKF_STATUS_REPORT→ esti_gyro_bias / esti_accel_bias
            "servo_output": None,   # SERVO_OUTPUT_RAW → pwm_cmd 1~6
        }

        self._last_update: Dict[str, float] = {
            "position":     0.0,
            "velocity":     0.0,
            "attitude":     0.0,
            "battery":      0.0,
            "gps":          0.0,
            # ★ CNN-LSTM 추가 피처
            "att_target":   0.0,
            "raw_imu":      0.0,
            "ekf_bias":     0.0,
            "servo_output": 0.0,
        }

        self._last_heartbeat_ts: float = 0.0

        self._mission_waypoints: List[Dict[str, Any]] = []
        self._mission_lock       = threading.Lock()
        self._mission_buf: Dict[int, Dict[str, Any]] = {}
        self._mission_expected_count: int = 0

        self._was_armed:             bool = False
        self._mission_download_done: bool = False
        self._mission_downloading:   bool = False

        self._mission_queue: List[Any] = []
        self._mission_queue_lock = threading.Lock()

        self._flight_events:  List[Dict[str, Any]] = []
        self._events_lock     = threading.Lock()
        self._last_mode:      Optional[str] = None
        self._last_gps_fix:   Optional[int] = None
        self._battery_warned: set           = set()

        self._last_rssi_pct: Optional[int] = None

        self._lock         = threading.Lock()
        self._last_push_at = 0.0
        self._session      = requests.Session()

    # -------------------------------------------------
    # 이벤트 헬퍼
    # -------------------------------------------------
    def _add_event(self, event: Dict[str, Any]) -> None:
        event["time"] = _kst_now()
        with self._events_lock:
            self._flight_events.append(event)
            if len(self._flight_events) > 100:
                self._flight_events = self._flight_events[-100:]

    def pop_events(self) -> List[Dict[str, Any]]:
        with self._events_lock:
            events = list(self._flight_events)
            self._flight_events = []
        return events

    # -------------------------------------------------
    # Connect
    # -------------------------------------------------
    def connect(self) -> bool:
        try:
            print(f"[{self.drone_id}] Trying: {self.lte_connection}")
            mav = mavutil.mavlink_connection(self.lte_connection)
            mav.wait_heartbeat(timeout=LTE_HEARTBEAT_TIMEOUT_SEC)

            hb    = mav.recv_match(type="HEARTBEAT", blocking=True, timeout=2)
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
            self._last_heartbeat_ts = now_ts()

            with self._lock:
                self._cache["sysid"] = self.sysid

            print(f"[{self.drone_id}] Connected! sysid={self.sysid} lte_ip={self.lte_ip}")

            self._add_event({
                "type":    "connected",
                "level":   "success",
                "message": f"드론 연결됨 — sysid={self.sysid}",
            })

            if not self._mission_download_done:
                print(f"[{self.drone_id}] 연결 직후 미션 다운로드 시도")
                threading.Thread(
                    target=self._download_mission,
                    daemon=True,
                    name=f"{self.drone_id}-mission-init",
                ).start()

            return True

        except Exception as e:
            print(f"[{self.drone_id}] Connect failed: {e}")
            self.mav   = None
            self.sysid = None
            return False

    # -------------------------------------------------
    # Offline 신호 전송
    # -------------------------------------------------
    def _send_offline_signal(self) -> None:
        payload = {
            "drone_id":     self.drone_id,
            "vehicle_name": self.vehicle_name,
            "lte_ip":       self.lte_ip,
            "sysid":        self.sysid,
            "ok":           False,
            "error":        "no_data",
            "online":       False,
        }
        for attempt in range(3):
            try:
                res = self._session.post(
                    TELEMETRY_PUSH_URL, json=payload, timeout=HTTP_TIMEOUT_SEC
                )
                print(
                    f"[{self.drone_id}] Offline signal sent "
                    f"(attempt {attempt + 1}) → status={res.status_code}"
                )
                return
            except Exception as e:
                print(f"[{self.drone_id}] Offline signal failed (attempt {attempt + 1}): {e}")
                if attempt < 2:
                    time.sleep(1.0)

    # -------------------------------------------------
    # 미션 push
    # -------------------------------------------------
    def _push_mission(self) -> None:
        with self._mission_lock:
            waypoints = list(self._mission_waypoints)

        payload = {
            "drone_id":  self.drone_id,
            "lte_ip":    self.lte_ip,
            "waypoints": waypoints,
        }
        try:
            res = self._session.post(
                MISSION_PUSH_URL, json=payload, timeout=HTTP_TIMEOUT_SEC
            )
            print(f"[{self.drone_id}] Mission push → status={res.status_code} wp_count={len(waypoints)}")
        except Exception as e:
            print(f"[{self.drone_id}] Mission push failed: {e}")

        self._add_event({
            "type":    "mission_synced",
            "level":   "success",
            "message": f"미션 경로 동기화 완료 — {len(waypoints)}개 웨이포인트",
        })

    # -------------------------------------------------
    # 미션 다운로드
    # -------------------------------------------------
    def _download_mission(self) -> None:
        if self._mission_downloading or self.mav is None:
            return
        self._mission_downloading = True
        print(f"[{self.drone_id}] 미션 다운로드 시작")

        try:
            with self._mission_queue_lock:
                self._mission_queue.clear()

            self.mav.mav.mission_request_list_send(
                self.mav.target_system,
                self.mav.target_component,
            )

            count_msg = self._wait_mission_msg("MISSION_COUNT", timeout=5.0)
            if count_msg is None:
                print(f"[{self.drone_id}] MISSION_COUNT 수신 실패 — 다운로드 중단")
                return

            count = int(count_msg.count)
            buf: Dict[int, Dict[str, Any]] = {}

            for seq in range(count):
                self.mav.mav.mission_request_int_send(
                    self.mav.target_system,
                    self.mav.target_component,
                    seq,
                )
                item = self._wait_mission_msg("MISSION_ITEM_INT", timeout=3.0, seq=seq)
                if item is None:
                    item = self._wait_mission_msg("MISSION_ITEM", timeout=3.0, seq=seq)
                if item is None:
                    return

                lat = float(item.x) / 1e7
                lng = float(item.y) / 1e7
                alt = float(item.z)
                cmd = int(item.command)

                if abs(lat) < 0.0001 and abs(lng) < 0.0001:
                    continue

                buf[seq] = {"index": seq, "command": cmd, "lat": lat, "lng": lng, "alt": alt}

            self.mav.mav.mission_ack_send(
                self.mav.target_system,
                self.mav.target_component,
                mavutil.mavlink.MAV_MISSION_ACCEPTED,
            )

            waypoints = sorted(buf.values(), key=lambda w: w["index"])
            with self._mission_lock:
                self._mission_waypoints = waypoints
            self._mission_download_done = True

            print(f"[{self.drone_id}] 미션 다운로드 완료: {len(waypoints)}개")
            self._add_event({
                "type":    "mission_ack",
                "level":   "success",
                "message": f"미션 다운로드 완료 — {len(waypoints)}개 웨이포인트",
            })
            threading.Thread(target=self._push_mission, daemon=True).start()

        except Exception as e:
            print(f"[{self.drone_id}] 미션 다운로드 실패: {e}")
        finally:
            self._mission_downloading = False

    def _wait_mission_msg(self, msg_type: str, timeout: float, seq: int = -1) -> Optional[Any]:
        deadline = time.time() + timeout
        while time.time() < deadline:
            with self._mission_queue_lock:
                for i, m in enumerate(self._mission_queue):
                    if m.get_type() == msg_type:
                        if seq == -1 or getattr(m, "seq", -1) == seq:
                            self._mission_queue.pop(i)
                            return m
            time.sleep(0.05)
        return None

    # -------------------------------------------------
    # HEARTBEAT 감시 루프
    # -------------------------------------------------
    def _heartbeat_watchdog(self) -> None:
        print(f"[{self.drone_id}] Heartbeat watchdog started")
        while self.running:
            time.sleep(2.0)
            if not self.running:
                break
            if self._last_heartbeat_ts == 0.0:
                continue
            age = now_ts() - self._last_heartbeat_ts
            if age > HEARTBEAT_WATCHDOG_SEC:
                print(
                    f"[{self.drone_id}] ★ HEARTBEAT watchdog triggered! "
                    f"No heartbeat for {age:.1f}s → forcing disconnect"
                )
                self.running = False
                try:
                    if self.mav:
                        self.mav.close()
                except Exception:
                    pass
                break
        print(f"[{self.drone_id}] Heartbeat watchdog stopped")

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
    # Ingest
    # -------------------------------------------------
    def _ingest(self, msg) -> None:
        t  = msg.get_type()
        ts = now_ts()

        if self._mission_downloading and t in (
            "MISSION_COUNT", "MISSION_ITEM_INT", "MISSION_ITEM"
        ):
            with self._mission_queue_lock:
                self._mission_queue.append(msg)
            return

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
                remaining = int(msg.battery_remaining)   if msg.battery_remaining is not None else None
                voltage   = (float(msg.voltage_battery) / 1000.0) if msg.voltage_battery is not None else None
                self._cache["battery"] = {
                    "voltage":   voltage,
                    "current":   (float(msg.current_battery) / 100.0) if msg.current_battery is not None else None,
                    "remaining": remaining,
                }
                self._last_update["battery"] = ts

                if remaining is not None:
                    if remaining <= 20 and 20 not in self._battery_warned:
                        self._battery_warned.add(20)
                        self._add_event({
                            "type":    "battery_critical",
                            "level":   "danger",
                            "message": f"배터리 위험 — {remaining}% ({voltage:.1f}V) 즉시 귀환",
                        })
                    elif remaining <= 35 and 35 not in self._battery_warned:
                        self._battery_warned.add(35)
                        self._add_event({
                            "type":    "battery_low",
                            "level":   "caution",
                            "message": f"배터리 부족 — {remaining}% ({voltage:.1f}V) 귀환 준비",
                        })
                    elif remaining > 40:
                        self._battery_warned.clear()

            elif t == "GPS_RAW_INT":
                fix_type = int(msg.fix_type)           if msg.fix_type           is not None else None
                sats     = int(msg.satellites_visible) if msg.satellites_visible is not None else None
                self._cache["gps"] = {
                    "fix_type":   fix_type,
                    "satellites": sats,
                }
                self._last_update["gps"] = ts

                if fix_type != self._last_gps_fix:
                    self._last_gps_fix = fix_type
                    fix_map = {
                        0: "No GPS", 1: "No Fix", 2: "2D Fix",
                        3: "3D Fix", 4: "DGPS",   5: "RTK Float", 6: "RTK Fixed",
                    }
                    fix_label = fix_map.get(fix_type, str(fix_type))
                    level     = "info" if (fix_type or 0) >= 3 else "caution"
                    self._add_event({
                        "type":    "gps_status",
                        "level":   level,
                        "message": f"GPS {fix_label} — {sats}위성",
                    })

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

            # ★ ─────────────────────────────────────────────
            # CNN-LSTM 추가 메시지 파싱
            # ─────────────────────────────────────────────────

            elif t == "ATTITUDE_TARGET":
                # att_cmd (자세 명령): yaw/pitch/roll
                # q[0..3] 쿼터니언 → roll/pitch/yaw 변환
                try:
                    q = msg.q  # [w, x, y, z]
                    if q is not None and len(q) == 4:
                        w, x, y, z = float(q[0]), float(q[1]), float(q[2]), float(q[3])
                        # 쿼터니언 → 오일러각 변환
                        roll_cmd  =  math.atan2(2*(w*x + y*z), 1 - 2*(x*x + y*y))
                        pitch_cmd =  math.asin( max(-1.0, min(1.0, 2*(w*y - z*x))) )
                        yaw_cmd   =  math.atan2(2*(w*z + x*y), 1 - 2*(y*y + z*z))
                    else:
                        roll_cmd = pitch_cmd = yaw_cmd = None

                    self._cache["att_target"] = {
                        "roll":  roll_cmd,
                        "pitch": pitch_cmd,
                        "yaw":   yaw_cmd,
                        # 추가: body rate (rad/s)
                        "body_roll_rate":  float(msg.body_roll_rate)  if getattr(msg, "body_roll_rate",  None) is not None else None,
                        "body_pitch_rate": float(msg.body_pitch_rate) if getattr(msg, "body_pitch_rate", None) is not None else None,
                        "body_yaw_rate":   float(msg.body_yaw_rate)   if getattr(msg, "body_yaw_rate",   None) is not None else None,
                    }
                    self._last_update["att_target"] = ts
                except Exception as e:
                    print(f"[{self.drone_id}] ATTITUDE_TARGET parse error: {e}")

            elif t == "RAW_IMU":
                # sensor_gyro (xgyro/ygyro/zgyro) → rad/s 변환 (단위: mrad/s)
                # sensor_accel (xacc/yacc/zacc)   → m/s² 변환 (단위: mg)
                try:
                    # gyro: mrad/s → rad/s
                    xg = (float(msg.xgyro) / 1000.0) if getattr(msg, "xgyro", None) is not None else None
                    yg = (float(msg.ygyro) / 1000.0) if getattr(msg, "ygyro", None) is not None else None
                    zg = (float(msg.zgyro) / 1000.0) if getattr(msg, "zgyro", None) is not None else None
                    # accel: mg → m/s² (1g = 9.80665 m/s²)
                    xa = (float(msg.xacc) * 9.80665 / 1000.0) if getattr(msg, "xacc", None) is not None else None
                    ya = (float(msg.yacc) * 9.80665 / 1000.0) if getattr(msg, "yacc", None) is not None else None
                    za = (float(msg.zacc) * 9.80665 / 1000.0) if getattr(msg, "zacc", None) is not None else None

                    self._cache["raw_imu"] = {
                        "gyro_x": xg, "gyro_y": yg, "gyro_z": zg,
                        "accel_x": xa, "accel_y": ya, "accel_z": za,
                    }
                    self._last_update["raw_imu"] = ts
                except Exception as e:
                    print(f"[{self.drone_id}] RAW_IMU parse error: {e}")

            elif t == "EKF_STATUS_REPORT":
                # esti_gyro_bias / esti_accel_bias
                # EKF_STATUS_REPORT에는 velocity/pos variance가 있으나
                # bias 값은 직접 제공되지 않으므로 variance를 proxy로 활용
                try:
                    self._cache["ekf_bias"] = {
                        "velocity_variance":  float(msg.velocity_variance)  if getattr(msg, "velocity_variance",  None) is not None else None,
                        "pos_horiz_variance": float(msg.pos_horiz_variance) if getattr(msg, "pos_horiz_variance", None) is not None else None,
                        "pos_vert_variance":  float(msg.pos_vert_variance)  if getattr(msg, "pos_vert_variance",  None) is not None else None,
                        "compass_variance":   float(msg.compass_variance)   if getattr(msg, "compass_variance",   None) is not None else None,
                        "terrain_alt_variance": float(msg.terrain_alt_variance) if getattr(msg, "terrain_alt_variance", None) is not None else None,
                        # EKF flags
                        "flags": int(msg.flags) if getattr(msg, "flags", None) is not None else None,
                    }
                    self._last_update["ekf_bias"] = ts
                except Exception as e:
                    print(f"[{self.drone_id}] EKF_STATUS_REPORT parse error: {e}")

            elif t == "SERVO_OUTPUT_RAW":
                # pwm_cmd 1~6 (모터 PWM 출력, 단위: μs, 일반적으로 1000~2000)
                try:
                    self._cache["servo_output"] = {
                        "pwm1": int(msg.servo1_raw) if getattr(msg, "servo1_raw", None) is not None else None,
                        "pwm2": int(msg.servo2_raw) if getattr(msg, "servo2_raw", None) is not None else None,
                        "pwm3": int(msg.servo3_raw) if getattr(msg, "servo3_raw", None) is not None else None,
                        "pwm4": int(msg.servo4_raw) if getattr(msg, "servo4_raw", None) is not None else None,
                        "pwm5": int(msg.servo5_raw) if getattr(msg, "servo5_raw", None) is not None else None,
                        "pwm6": int(msg.servo6_raw) if getattr(msg, "servo6_raw", None) is not None else None,
                    }
                    self._last_update["servo_output"] = ts
                except Exception as e:
                    print(f"[{self.drone_id}] SERVO_OUTPUT_RAW parse error: {e}")

            # ★ ─────────────────────────────────────────────

        # lock 바깥 이벤트 처리

        if t == "HEARTBEAT":
            self._last_heartbeat_ts = ts

            try:
                mode = mavutil.mode_string_v10(msg)
                if mode and mode != self._last_mode:
                    self._last_mode = mode
                    self._add_event({
                        "type":    "mode_change",
                        "level":   "info",
                        "message": f"비행 모드 변경 → {mode}",
                        "detail":  mode,
                    })
            except Exception:
                pass

            armed = bool(msg.base_mode & mavutil.mavlink.MAV_MODE_FLAG_SAFETY_ARMED)

            if not armed and self._was_armed:
                self._mission_download_done = False
                print(f"[{self.drone_id}] Disarmed — 미션 캐시 유지 (wp={len(self._mission_waypoints)}개)")

            if armed and not self._was_armed and not self._mission_download_done:
                print(f"[{self.drone_id}] Armed 감지 → 미션 다운로드 스레드 시작")
                threading.Thread(target=self._download_mission, daemon=True).start()

            self._was_armed = armed

        elif t == "STATUSTEXT":
            severity_map = {
                0: "danger", 1: "danger", 2: "danger", 3: "danger",
                4: "caution", 5: "info", 6: "info", 7: "debug",
            }
            text  = (msg.text or "").rstrip('\x00')
            level = severity_map.get(int(msg.severity), "info")

            text_lower = text.lower()
            for kw in CALIB_KEYWORDS:
                if kw.lower() in text_lower:
                    if "prearm" in text_lower or "failed" in text_lower or "error" in text_lower:
                        level = "danger"
                    elif level == "info":
                        level = "caution"
                    break

            self._add_event({
                "type":     "statustext",
                "level":    level,
                "message":  text,
                "severity": int(msg.severity),
            })

        elif t == "MISSION_COUNT" and not self._mission_downloading:
            count = int(msg.count)
            self._mission_buf = {}
            self._mission_expected_count = count

        elif t == "MISSION_ITEM_INT" and not self._mission_downloading:
            lat = float(msg.x) / 1e7
            lng = float(msg.y) / 1e7
            alt = float(msg.z)
            cmd = int(msg.command)
            seq = int(msg.seq)

            if abs(lat) < 0.0001 and abs(lng) < 0.0001:
                return

            self._mission_buf[seq] = {"index": seq, "command": cmd, "lat": lat, "lng": lng, "alt": alt}

        elif t == "MISSION_ITEM" and not self._mission_downloading:
            lat = float(getattr(msg, "x", 0))
            lng = float(getattr(msg, "y", 0))
            alt = float(getattr(msg, "z", 0))
            cmd = int(msg.command)
            seq = int(msg.seq)

            if abs(lat) < 0.0001 and abs(lng) < 0.0001:
                return

            self._mission_buf[seq] = {"index": seq, "command": cmd, "lat": lat, "lng": lng, "alt": alt}

        elif t == "MISSION_ACK" and not self._mission_downloading:
            if int(msg.type) == 0:
                waypoints = sorted(self._mission_buf.values(), key=lambda w: w["index"])
                with self._mission_lock:
                    self._mission_waypoints = waypoints
                self._mission_buf = {}
                self._mission_expected_count = 0

                self._add_event({
                    "type":    "mission_ack",
                    "level":   "success",
                    "message": f"QGC 미션 업로드 완료 — {len(waypoints)}개 웨이포인트 동기화",
                })
                threading.Thread(target=self._push_mission, daemon=True).start()

        elif t == "MISSION_ITEM_REACHED":
            self._add_event({
                "type":    "waypoint_reached",
                "level":   "info",
                "message": f"웨이포인트 {int(msg.seq) + 1} 도달",
                "index":   int(msg.seq),
            })

        elif t == "MISSION_CURRENT":
            self._add_event({
                "type":    "mission_current",
                "level":   "info",
                "message": f"현재 목표 → WP {int(msg.seq) + 1}",
                "index":   int(msg.seq),
            })

        elif t == "HOME_POSITION":
            lat = float(msg.latitude)  / 1e7
            lng = float(msg.longitude) / 1e7
            self._add_event({
                "type":    "home_set",
                "level":   "info",
                "message": f"홈 위치 설정 — {lat:.6f}, {lng:.6f}",
            })

        elif t == "RC_CHANNELS":
            rssi = getattr(msg, "rssi", None)
            if rssi is not None and rssi != 255:
                rssi_pct = round((rssi / 254) * 100)
                level = (
                    "danger"  if rssi_pct < 30 else
                    "caution" if rssi_pct < 60 else
                    "info"
                )
                last = self._last_rssi_pct
                if last is None or abs(rssi_pct - last) >= 10:
                    self._last_rssi_pct = rssi_pct
                    self._add_event({
                        "type":    "rc_rssi",
                        "level":   level,
                        "message": f"RC 신호 강도 {rssi_pct}% (raw={rssi})",
                    })

        elif t == "COMMAND_ACK":
            cmd    = getattr(msg, "command", None)
            result = getattr(msg, "result", -1)
            if cmd == 206:
                self._add_event({
                    "type":    "camera_trigger",
                    "level":   "info" if result == 0 else "caution",
                    "message": f"카메라 트리거 {'성공' if result == 0 else f'실패 (result={result})'}",
                })

        elif t == "PARAM_VALUE":
            param_id = (getattr(msg, "param_id", "") or "").rstrip('\x00')
            if param_id in IMPORTANT_PARAMS:
                val     = getattr(msg, "param_value", None)
                val_str = f"{val:.4f}" if val is not None else "?"
                self._add_event({
                    "type":    "param_change",
                    "level":   "info",
                    "message": f"파라미터 — {param_id} = {val_str}",
                })

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
                "online":       True,
                "armed":        self._was_armed,
                # ★ CNN-LSTM 추가 피처
                "att_target":   self._cache.get("att_target"),    # att_cmd (yaw/pitch/roll)
                "raw_imu":      self._cache.get("raw_imu"),       # sensor_gyro / sensor_accel
                "ekf_bias":     self._cache.get("ekf_bias"),      # esti_gyro_bias / esti_accel_bias
                "servo_output": self._cache.get("servo_output"),  # pwm_cmd 1~6
            }
            snap["_age_sec"] = {
                k: (now_ts() - v) if v else None
                for k, v in self._last_update.items()
            }
            print(f"[{self.drone_id}] raw_imu={snap.get('raw_imu')} | att_target={snap.get('att_target')} | servo={snap.get('servo_output')}")

        with self._mission_lock:
            snap["mission_waypoints"] = list(self._mission_waypoints)

        snap["flight_events"] = self.pop_events()
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
                            f"armed={snap.get('armed')} "
                            f"wp={len(snap.get('mission_waypoints', []))} "
                            f"events={len(snap.get('flight_events', []))}"
                        )
                except Exception as e:
                    print(f"[{self.drone_id}] Push failed: {e}")

            time.sleep(PUSH_INTERVAL_SEC)

    # -------------------------------------------------
    # Run (자동 재연결)
    # -------------------------------------------------
    def run(self):
        while True:
            self.running = True
            self._last_heartbeat_ts = 0.0

            if self.connect():
                listen_t   = threading.Thread(target=self.listen_loop,         daemon=True)
                push_t     = threading.Thread(target=self.push_loop,           daemon=True)
                watchdog_t = threading.Thread(target=self._heartbeat_watchdog, daemon=True)

                listen_t.start()
                push_t.start()
                watchdog_t.start()

                while self.running:
                    time.sleep(1)

                print(f"[{self.drone_id}] 연결 끊김 → offline 신호 전송")
                self._send_offline_signal()
                print(f"[{self.drone_id}] Disconnected. Retry in {LTE_RETRY_SEC:.0f}s...")
            else:
                self._send_offline_signal()
                print(f"[{self.drone_id}] Retry in {LTE_RETRY_SEC:.0f}s...")

            # 재연결 시 캐시 초기화
            with self._lock:
                self._cache = {
                    "sysid":        None,
                    "position":     None,
                    "velocity":     None,
                    "attitude":     None,
                    "battery":      None,
                    "gps":          None,
                    # ★ CNN-LSTM 추가 피처
                    "att_target":   None,
                    "raw_imu":      None,
                    "ekf_bias":     None,
                    "servo_output": None,
                }
                self._last_update = {
                    "position":     0.0,
                    "velocity":     0.0,
                    "attitude":     0.0,
                    "battery":      0.0,
                    "gps":          0.0,
                    # ★ CNN-LSTM 추가 피처
                    "att_target":   0.0,
                    "raw_imu":      0.0,
                    "ekf_bias":     0.0,
                    "servo_output": 0.0,
                }

            with self._mission_lock:
                self._mission_waypoints = []
            with self._events_lock:
                self._flight_events = []

            self._mission_buf             = {}
            self._mission_expected_count  = 0
            self._was_armed               = False
            self._mission_download_done   = False
            self._mission_downloading     = False
            self._last_mode               = None
            self._last_gps_fix            = None
            self._battery_warned          = set()
            self._last_rssi_pct           = None
            self._last_heartbeat_ts       = 0.0

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
        session = requests.Session()
        for cfg in DRONE_LIST:
            try:
                session.post(
                    TELEMETRY_PUSH_URL,
                    json={
                        "drone_id": cfg["drone_id"],
                        "lte_ip":   cfg["lte_ip"],
                        "ok":       False,
                        "error":    "no_data",
                        "online":   False,
                    },
                    timeout=3.0,
                )
                print(f"[{cfg['drone_id']}] Shutdown offline signal sent")
            except Exception as e:
                print(f"[{cfg['drone_id']}] Shutdown signal failed: {e}")