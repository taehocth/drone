from __future__ import annotations

from datetime import datetime, timezone, timedelta
from threading import Lock
from typing import Dict, Any, Optional, List


KST = timezone(timedelta(hours=9))
OFFLINE_THRESHOLD_SEC = 5.0


def _now_iso() -> str:
    return datetime.now(KST).isoformat()


def _parse_iso(ts: Optional[str]) -> Optional[datetime]:
    if not ts:
        return None
    try:
        return datetime.fromisoformat(ts)
    except Exception:
        return None


class VehicleRegistry:
    def __init__(self):
        self._lock = Lock()

        # drone_id 기준 저장
        self._vehicles_by_drone_id: Dict[str, Dict[str, Any]] = {}

        # lte_ip -> drone_id 역인덱스
        self._drone_id_by_lte_ip: Dict[str, str] = {}

    def ingest_from_agent(self, data: Dict[str, Any]) -> None:
        now_iso = _now_iso()

        sysid = data.get("sysid")
        drone_id = data.get("drone_id")
        lte_ip = data.get("lte_ip")

        # drone_id 없으면 fallback 생성
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

        with self._lock:
            self._vehicles_by_drone_id[drone_id] = item
            if lte_ip:
                self._drone_id_by_lte_ip[lte_ip] = drone_id

    def _is_online(self, item: Optional[Dict[str, Any]]) -> bool:
        if not item:
            return False

        last_seen = _parse_iso(item.get("last_seen"))
        if not last_seen:
            return False

        now = datetime.now(KST)
        age = (now - last_seen).total_seconds()
        return age <= OFFLINE_THRESHOLD_SEC

    def latest_flattened_by_drone_id(
        self, drone_id: str
    ) -> Optional[Dict[str, Any]]:
        with self._lock:
            item = self._vehicles_by_drone_id.get(drone_id)
            if not item:
                return None

            # 오프라인 기체는 None 반환 → 서버가 ok=False 전송
            if not self._is_online(item):
                return None

            out = dict(item)
            out["online"] = True
            return out

    def latest_flattened_by_lte_ip(self, lte_ip: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            drone_id = self._drone_id_by_lte_ip.get(lte_ip)
            if not drone_id:
                return None

            item = self._vehicles_by_drone_id.get(drone_id)
            if not item:
                return None

            # ★ 핵심 수정: 오프라인 기체는 None 반환 → 서버가 ok=False 전송
            # 기존: 오프라인이어도 마지막 데이터를 그대로 반환
            # → 기체 1만 연결돼도 기체 2, 3 카드에 기체 1 데이터가 표시되는 원인
            # 수정: 5초 이상 데이터가 없으면 없는 기체로 처리
            if not self._is_online(item):
                return None

            out = dict(item)
            out["online"] = True
            return out

    def latest_flattened(self) -> Optional[Dict[str, Any]]:
        """
        하위 호환용.
        가장 최근 last_seen 기체 1개 반환
        """
        with self._lock:
            if not self._vehicles_by_drone_id:
                return None

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
                return None

            out = dict(latest_item)
            out["online"] = self._is_online(latest_item)
            return out

    def list_vehicles(self) -> List[Dict[str, Any]]:
        with self._lock:
            rows: List[Dict[str, Any]] = []

            for drone_id, item in self._vehicles_by_drone_id.items():
                pos = item.get("position") or {}
                battery = item.get("battery") or {}
                gps = item.get("gps") or {}

                rows.append(
                    {
                        "drone_id": drone_id,
                        "vehicle_name": item.get("vehicle_name"),
                        "lte_ip": item.get("lte_ip"),
                        "sysid": item.get("sysid"),
                        "last_seen": item.get("last_seen"),
                        "online": self._is_online(item),
                        "battery": battery.get("remaining"),
                        "gps_fix_type": gps.get("fix_type"),
                        "gps_satellites": gps.get("satellites"),
                        "lat": pos.get("lat"),
                        "lon": pos.get("lon"),
                        "alt": pos.get("alt"),
                    }
                )

            rows.sort(
                key=lambda x: x.get("last_seen") or "",
                reverse=True,
            )
            return rows


_registry: Optional[VehicleRegistry] = None


def get_vehicle_registry() -> VehicleRegistry:
    global _registry
    if _registry is None:
        _registry = VehicleRegistry()
    return _registry


def start_mavlink_background() -> None:
    """
    app.main 호환용 함수.

    기존 프로젝트에서는 app.main 에서
    start_mavlink_background 를 import 하고 있을 수 있음.
    현재 구조에서는 외부 telemetry_agent 가
    /api/v1/qgc/telemetry/push 로 데이터를 밀어주므로,
    서버 내부에서 별도 MAVLink 수집 스레드를 시작하지 않아도 됨.

    따라서 여기서는 import 에러 방지용 no-op 으로 둔다.
    """
    return None