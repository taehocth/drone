from __future__ import annotations

from datetime import datetime, timezone, timedelta
from threading import Lock
from typing import Dict, Any, Optional, List


OFFLINE_THRESHOLD_SEC = 30.0


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


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

        # ★ 미션 웨이포인트 저장 (drone_id 기준)
        self._mission_by_drone_id: Dict[str, List[Dict[str, Any]]] = {}

    # -------------------------------------------------
    # 텔레메트리 수신 (agent → push)
    # -------------------------------------------------
    def ingest_from_agent(self, data: Dict[str, Any]) -> None:
        now_iso  = _now_iso()
        sysid    = data.get("sysid")
        drone_id = data.get("drone_id")
        lte_ip   = data.get("lte_ip")

        if not drone_id:
            if sysid is not None:
                drone_id = f"sysid-{sysid}"
            else:
                drone_id = "unknown-drone"

        item = dict(data)
        item["drone_id"]  = drone_id
        item["lte_ip"]    = lte_ip
        item["last_seen"] = now_iso
        item["online"]    = True

        with self._lock:
            self._vehicles_by_drone_id[drone_id] = item
            if lte_ip:
                self._drone_id_by_lte_ip[lte_ip] = drone_id

            # ★ 텔레메트리 payload 안에 미션 웨이포인트가 포함된 경우 함께 저장
            wps = data.get("mission_waypoints")
            if isinstance(wps, list) and len(wps) > 0:
                self._mission_by_drone_id[drone_id] = wps

    # -------------------------------------------------
    # ★ 미션 웨이포인트 직접 저장 (REST push 엔드포인트용)
    # -------------------------------------------------
    def ingest_mission(self, drone_id: str, lte_ip: str, waypoints: List[Dict[str, Any]]) -> None:
        """
        agent 가 /mission/push 로 별도 전송할 때 사용.
        텔레메트리 push 에 포함된 경우에도 ingest_from_agent 에서 처리되므로
        이 메서드는 별도 엔드포인트가 있을 때만 호출된다.
        """
        with self._lock:
            self._mission_by_drone_id[drone_id] = waypoints
            # lte_ip → drone_id 역인덱스도 갱신
            if lte_ip and drone_id:
                self._drone_id_by_lte_ip[lte_ip] = drone_id

    # -------------------------------------------------
    # 미션 조회
    # -------------------------------------------------
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
    # 온라인 판정
    # -------------------------------------------------
    def _is_online(self, item: Optional[Dict[str, Any]]) -> bool:
        if not item:
            return False
        last_seen = _parse_iso(item.get("last_seen"))
        if not last_seen:
            return False
        now = datetime.now(timezone.utc)
        age = (now - last_seen).total_seconds()
        return age <= OFFLINE_THRESHOLD_SEC

    # -------------------------------------------------
    # 조회 메서드
    # -------------------------------------------------
    def latest_flattened_by_drone_id(
        self, drone_id: str
    ) -> Optional[Dict[str, Any]]:
        with self._lock:
            item = self._vehicles_by_drone_id.get(drone_id)
            if not item:
                return None
            if not self._is_online(item):
                return None
            out = dict(item)
            out["online"] = True
            # ★ 미션 웨이포인트 포함
            out["mission_waypoints"] = list(
                self._mission_by_drone_id.get(drone_id, [])
            )
            return out

    def latest_flattened_by_lte_ip(self, lte_ip: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            drone_id = self._drone_id_by_lte_ip.get(lte_ip)
            if not drone_id:
                return None
            item = self._vehicles_by_drone_id.get(drone_id)
            if not item:
                return None
            if not self._is_online(item):
                return None
            out = dict(item)
            out["online"] = True
            # ★ 미션 웨이포인트 포함
            out["mission_waypoints"] = list(
                self._mission_by_drone_id.get(drone_id, [])
            )
            return out

    def latest_flattened(self) -> Optional[Dict[str, Any]]:
        """하위 호환용. 가장 최근 last_seen 기체 1개 반환."""
        with self._lock:
            if not self._vehicles_by_drone_id:
                return None

            latest_item  = None
            latest_dt    = None

            for item in self._vehicles_by_drone_id.values():
                dt = _parse_iso(item.get("last_seen"))
                if dt is None:
                    continue
                if latest_dt is None or dt > latest_dt:
                    latest_dt   = dt
                    latest_item = item

            if not latest_item:
                return None

            out          = dict(latest_item)
            out["online"] = self._is_online(latest_item)
            drone_id     = latest_item.get("drone_id")
            # ★ 미션 웨이포인트 포함
            out["mission_waypoints"] = list(
                self._mission_by_drone_id.get(drone_id, [])
            ) if drone_id else []
            return out

    def list_vehicles(self) -> List[Dict[str, Any]]:
        with self._lock:
            rows: List[Dict[str, Any]] = []
            for drone_id, item in self._vehicles_by_drone_id.items():
                pos     = item.get("position") or {}
                battery = item.get("battery")  or {}
                gps     = item.get("gps")      or {}
                rows.append({
                    "drone_id":      drone_id,
                    "vehicle_name":  item.get("vehicle_name"),
                    "lte_ip":        item.get("lte_ip"),
                    "sysid":         item.get("sysid"),
                    "last_seen":     item.get("last_seen"),
                    "online":        self._is_online(item),
                    "battery":       battery.get("remaining"),
                    "gps_fix_type":  gps.get("fix_type"),
                    "gps_satellites":gps.get("satellites"),
                    "lat":           pos.get("lat"),
                    "lon":           pos.get("lon"),
                    "alt":           pos.get("alt"),
                    # ★ 미션 웨이포인트 수
                    "mission_wp_count": len(
                        self._mission_by_drone_id.get(drone_id, [])
                    ),
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