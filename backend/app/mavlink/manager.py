from __future__ import annotations

from datetime import datetime, timezone
from threading import Lock
from typing import Dict, Any, Optional, List


# agent.py push 간격이 0.1초이므로 8초면 충분히 여유있음
OFFLINE_THRESHOLD_SEC = 8.0


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _now_iso() -> str:
    return _now_utc().isoformat()


def _parse_iso(ts: Optional[str]) -> Optional[datetime]:
    if not ts:
        return None
    try:
        dt = datetime.fromisoformat(ts)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


class VehicleRegistry:
    def __init__(self):
        self._lock = Lock()

        # drone_id 기준 텔레메트리 저장
        self._vehicles_by_drone_id: Dict[str, Dict[str, Any]] = {}

        # lte_ip -> drone_id 역인덱스
        self._drone_id_by_lte_ip: Dict[str, str] = {}

        # 미션 웨이포인트 (drone_id 기준)
        self._mission_by_drone_id: Dict[str, List[Dict[str, Any]]] = {}

        # 비행 이벤트 (drone_id 기준, 최대 500개)
        self._events_by_drone_id: Dict[str, List[Dict[str, Any]]] = {}
        self._events_lock = Lock()

        # 명시적 offline 플래그
        self._forced_offline: Dict[str, bool] = {}

    # -------------------------------------------------
    # 내부 유틸
    # -------------------------------------------------
    def _age_sec(self, item: Optional[Dict[str, Any]]) -> Optional[float]:
        if not item:
            return None
        last_seen = _parse_iso(item.get("last_seen"))
        if not last_seen:
            return None
        return (_now_utc() - last_seen).total_seconds()

    def _is_online(self, item: Optional[Dict[str, Any]]) -> bool:
        age = self._age_sec(item)
        if age is None:
            return False
        return age <= OFFLINE_THRESHOLD_SEC

    def _is_forced_offline(self, drone_id: Optional[str], lte_ip: Optional[str] = None) -> bool:
        if drone_id and self._forced_offline.get(drone_id):
            return True
        if lte_ip and self._forced_offline.get(f"lte:{lte_ip}"):
            return True
        return False

    def _build_offline_payload(
        self,
        *,
        drone_id: Optional[str] = None,
        lte_ip: Optional[str] = None,
        error: str = "no_data",
        age_sec: Optional[float] = None,
    ) -> Dict[str, Any]:
        return {
            "ok": False,
            "online": False,
            "error": error,
            "drone_id": drone_id,
            "lte_ip": lte_ip,
            "last_seen_age_sec": age_sec,
        }

    def _build_online_payload(
        self,
        item: Dict[str, Any],
        drone_id: str,
    ) -> Dict[str, Any]:
        out = dict(item)
        out["online"] = True
        out["ok"] = True
        out["last_seen_age_sec"] = self._age_sec(item)
        out["mission_waypoints"] = list(self._mission_by_drone_id.get(drone_id, []))
        return out

    # -------------------------------------------------
    # 명시적 offline 처리 (agent.py offline 신호)
    # -------------------------------------------------
    def mark_offline(
        self,
        lte_ip: Optional[str] = None,
        drone_id: Optional[str] = None,
    ) -> None:
        """
        agent.py가 기체 연결 끊김을 감지하면 호출.
        해당 기체를 즉시 offline 상태로 강제 전환하고,
        마지막 정상 telemetry 캐시도 제거한다.
        """
        with self._lock:
            target_id: Optional[str] = None

            if drone_id:
                target_id = drone_id
            elif lte_ip:
                target_id = self._drone_id_by_lte_ip.get(lte_ip)

            if target_id:
                self._forced_offline[target_id] = True

                cached = self._vehicles_by_drone_id.pop(target_id, None)
                cached_lte_ip = None
                if cached:
                    cached_lte_ip = cached.get("lte_ip")

                final_lte_ip = lte_ip or cached_lte_ip
                if final_lte_ip:
                    self._forced_offline[f"lte:{final_lte_ip}"] = True
                    self._drone_id_by_lte_ip.pop(final_lte_ip, None)

                print(f"[Registry] mark_offline: drone_id={target_id}, lte_ip={final_lte_ip}")
                return

            if lte_ip:
                self._forced_offline[f"lte:{lte_ip}"] = True
                self._drone_id_by_lte_ip.pop(lte_ip, None)
                print(f"[Registry] mark_offline: unresolved lte_ip={lte_ip}")

    # -------------------------------------------------
    # 텔레메트리 수신 (agent -> push)
    # -------------------------------------------------
    def ingest_from_agent(self, data: Dict[str, Any]) -> None:
        now_iso = _now_iso()
        sysid = data.get("sysid")
        drone_id = data.get("drone_id")
        lte_ip = data.get("lte_ip")

        if not drone_id:
            if sysid is not None:
                drone_id = f"sysid-{sysid}"
            else:
                drone_id = "unknown-drone"

        item = dict(data)
        item["drone_id"] = drone_id
        item["lte_ip"] = lte_ip
        item["last_seen"] = now_iso
        item["online"] = True
        item["ok"] = True

        with self._lock:
            self._vehicles_by_drone_id[drone_id] = item

            if lte_ip:
                self._drone_id_by_lte_ip[lte_ip] = drone_id

            # 새 데이터 수신 -> forced_offline 해제
            self._forced_offline[drone_id] = False
            if lte_ip:
                self._forced_offline[f"lte:{lte_ip}"] = False

            # 텔레메트리 payload 안의 미션도 같이 저장
            wps = data.get("mission_waypoints")
            if isinstance(wps, list):
                self._mission_by_drone_id[drone_id] = wps

        # 비행 이벤트 수집
        events = data.get("flight_events")
        if isinstance(events, list) and events:
            with self._events_lock:
                bucket = self._events_by_drone_id.setdefault(drone_id, [])
                bucket.extend(events)
                if len(bucket) > 500:
                    self._events_by_drone_id[drone_id] = bucket[-500:]

    # -------------------------------------------------
    # 미션 저장 / 조회
    # -------------------------------------------------
    def ingest_mission(self, drone_id: str, lte_ip: str, waypoints: List[Dict[str, Any]]) -> None:
        with self._lock:
            self._mission_by_drone_id[drone_id] = waypoints
            if lte_ip and drone_id:
                self._drone_id_by_lte_ip[lte_ip] = drone_id

    def get_mission_by_drone_id(self, drone_id: str) -> List[Dict[str, Any]]:
        with self._lock:
            return list(self._mission_by_drone_id.get(drone_id, []))

    def get_mission_by_lte_ip(self, lte_ip: str) -> List[Dict[str, Any]]:
        with self._lock:
            drone_id = self._drone_id_by_lte_ip.get(lte_ip)
            if not drone_id:
                return []
            return list(self._mission_by_drone_id.get(drone_id, []))

    # -------------------------------------------------
    # 비행 이벤트 조회
    # -------------------------------------------------
    def pop_events(self, drone_id: str) -> List[Dict[str, Any]]:
        with self._events_lock:
            events = list(self._events_by_drone_id.get(drone_id, []))
            self._events_by_drone_id[drone_id] = []
        return events

    def get_all_events(self, drone_id: str) -> List[Dict[str, Any]]:
        with self._events_lock:
            return list(self._events_by_drone_id.get(drone_id, []))

    # -------------------------------------------------
    # 조회
    # -------------------------------------------------
    def latest_flattened_by_drone_id(self, drone_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            item = self._vehicles_by_drone_id.get(drone_id)

            if not item:
                return self._build_offline_payload(
                    drone_id=drone_id,
                    error="no_data",
                )

            lte_ip = item.get("lte_ip")

            if self._is_forced_offline(drone_id, lte_ip):
                return self._build_offline_payload(
                    drone_id=drone_id,
                    lte_ip=lte_ip,
                    error="forced_offline",
                )

            age_sec = self._age_sec(item)
            if not self._is_online(item):
                self._vehicles_by_drone_id.pop(drone_id, None)
                if lte_ip:
                    self._drone_id_by_lte_ip.pop(lte_ip, None)
                return self._build_offline_payload(
                    drone_id=drone_id,
                    lte_ip=lte_ip,
                    error="stale",
                    age_sec=age_sec,
                )

            return self._build_online_payload(item, drone_id)

    def latest_flattened_by_lte_ip(self, lte_ip: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            if self._forced_offline.get(f"lte:{lte_ip}"):
                drone_id = self._drone_id_by_lte_ip.get(lte_ip)
                return self._build_offline_payload(
                    drone_id=drone_id,
                    lte_ip=lte_ip,
                    error="forced_offline",
                )

            drone_id = self._drone_id_by_lte_ip.get(lte_ip)
            if not drone_id:
                return self._build_offline_payload(
                    lte_ip=lte_ip,
                    error="no_data",
                )

            item = self._vehicles_by_drone_id.get(drone_id)
            if not item:
                return self._build_offline_payload(
                    drone_id=drone_id,
                    lte_ip=lte_ip,
                    error="no_data",
                )

            if self._is_forced_offline(drone_id, lte_ip):
                return self._build_offline_payload(
                    drone_id=drone_id,
                    lte_ip=lte_ip,
                    error="forced_offline",
                )

            age_sec = self._age_sec(item)
            if not self._is_online(item):
                self._vehicles_by_drone_id.pop(drone_id, None)
                self._drone_id_by_lte_ip.pop(lte_ip, None)
                return self._build_offline_payload(
                    drone_id=drone_id,
                    lte_ip=lte_ip,
                    error="stale",
                    age_sec=age_sec,
                )

            return self._build_online_payload(item, drone_id)

    def latest_flattened(self) -> Optional[Dict[str, Any]]:
        with self._lock:
            if not self._vehicles_by_drone_id:
                return self._build_offline_payload(error="no_data")

            latest_item = None
            latest_dt = None

            for item in self._vehicles_by_drone_id.values():
                dt = _parse_iso(item.get("last_seen"))
                if dt is None:
                    continue
                if latest_dt is None or dt > latest_dt:
                    latest_dt = dt
                    latest_item = item

            if not latest_item:
                return self._build_offline_payload(error="no_data")

            drone_id = latest_item.get("drone_id")
            lte_ip = latest_item.get("lte_ip")

            if self._is_forced_offline(drone_id, lte_ip):
                return self._build_offline_payload(
                    drone_id=drone_id,
                    lte_ip=lte_ip,
                    error="forced_offline",
                )

            age_sec = self._age_sec(latest_item)
            if not self._is_online(latest_item):
                if drone_id:
                    self._vehicles_by_drone_id.pop(drone_id, None)
                if lte_ip:
                    self._drone_id_by_lte_ip.pop(lte_ip, None)
                return self._build_offline_payload(
                    drone_id=drone_id,
                    lte_ip=lte_ip,
                    error="stale",
                    age_sec=age_sec,
                )

            if not drone_id:
                return self._build_offline_payload(
                    lte_ip=lte_ip,
                    error="missing_drone_id",
                )

            return self._build_online_payload(latest_item, drone_id)

    def list_vehicles(self) -> List[Dict[str, Any]]:
        with self._lock:
            rows: List[Dict[str, Any]] = []

            for drone_id, item in self._vehicles_by_drone_id.items():
                pos = item.get("position") or {}
                battery = item.get("battery") or {}
                gps = item.get("gps") or {}
                lte_ip = item.get("lte_ip")

                online = (
                    self._is_online(item)
                    and not self._is_forced_offline(drone_id, lte_ip)
                )

                rows.append({
                    "drone_id": drone_id,
                    "vehicle_name": item.get("vehicle_name"),
                    "lte_ip": lte_ip,
                    "sysid": item.get("sysid"),
                    "last_seen": item.get("last_seen"),
                    "last_seen_age_sec": self._age_sec(item),
                    "online": online,
                    "battery": battery.get("remaining"),
                    "gps_fix_type": gps.get("fix_type"),
                    "gps_satellites": gps.get("satellites"),
                    "lat": pos.get("lat"),
                    "lon": pos.get("lon"),
                    "alt": pos.get("alt"),
                    "mission_wp_count": len(self._mission_by_drone_id.get(drone_id, [])),
                    "event_count": len(self._events_by_drone_id.get(drone_id, [])),
                })

            rows.sort(key=lambda x: x.get("last_seen") or "", reverse=True)
            return rows


_registry: Optional[VehicleRegistry] = None


def get_vehicle_registry() -> VehicleRegistry:
    global _registry
    if _registry is None:
        _registry = VehicleRegistry()
    return _registry


def start_mavlink_background() -> None:
    """
    app.main 호환용 no-op 함수.
    외부 telemetry_agent 가 /api/v1/qgc/telemetry/push 로 데이터를 밀어주므로
    서버 내부에서 별도 MAVLink 수집 스레드를 시작하지 않아도 됨.
    """
    return None