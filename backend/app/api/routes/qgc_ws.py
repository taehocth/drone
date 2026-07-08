from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Body
from datetime import datetime, timezone, timedelta
import asyncio

from app.mavlink.manager import get_vehicle_registry

router = APIRouter()


# ─────────────────────────────────────────────────────────────
# 텔레메트리 push (agent.py → 서버)
# ─────────────────────────────────────────────────────────────
@router.post("/telemetry/push")
async def push_telemetry(data: dict = Body(...)):
    registry = get_vehicle_registry()

    # offline 신호 처리
    if data.get("ok") is False:
        lte_ip   = data.get("lte_ip")
        drone_id = data.get("drone_id")
        if lte_ip or drone_id:
            registry.mark_offline(lte_ip=lte_ip, drone_id=drone_id)
        return {"ok": True, "note": "marked offline"}

    lte_ip   = data.get("lte_ip")
    drone_id = data.get("drone_id")
    sysid    = data.get("sysid")

    if sysid is None and not (lte_ip and drone_id):
        return {"ok": False, "error": "missing sysid and identifiers"}

    # 정상 데이터 수신 → forced_offline 즉시 해제
    if lte_ip or drone_id:
        registry.clear_forced_offline(lte_ip=lte_ip, drone_id=drone_id)

    registry.ingest_from_agent(data)
    return {"ok": True}


# ─────────────────────────────────────────────────────────────
# ★ 미션 push (agent.py → 서버)
# POST /api/v1/qgc/mission/push
# ─────────────────────────────────────────────────────────────
@router.post("/mission/push")
async def push_mission(data: dict = Body(...)):
    registry  = get_vehicle_registry()
    drone_id  = data.get("drone_id")
    lte_ip    = data.get("lte_ip", "")
    waypoints = data.get("waypoints", [])

    if not drone_id:
        return {"ok": False, "error": "drone_id missing"}
    if not isinstance(waypoints, list) or len(waypoints) == 0:
        return {"ok": False, "error": "waypoints empty"}

    registry.ingest_mission(
        drone_id=drone_id,
        lte_ip=lte_ip,
        waypoints=waypoints,
    )

    print(f"[mission/push] drone_id={drone_id} wp_count={len(waypoints)}")
    return {"ok": True, "wp_count": len(waypoints)}


# ─────────────────────────────────────────────────────────────
# ★ 미션 조회 (NaverMap.tsx → 서버)
# GET /api/v1/qgc/mission/{drone_id}
# ─────────────────────────────────────────────────────────────
@router.get("/mission/{drone_id}")
async def get_mission(drone_id: str):
    registry  = get_vehicle_registry()
    waypoints = registry.get_mission_by_drone_id(drone_id)

    if not waypoints:
        return {"ok": False, "drone_id": drone_id, "waypoints": []}

    return {
        "ok":        True,
        "drone_id":  drone_id,
        "waypoints": waypoints,
        "wp_count":  len(waypoints),
    }


# ─────────────────────────────────────────────────────────────
# WebSocket (서버 → NaverMap 실시간 스트림)
# WS /api/v1/qgc/ws/qgc
# ─────────────────────────────────────────────────────────────
@router.websocket("/ws/qgc")
async def qgc_ws(websocket: WebSocket):
    lte_ip = websocket.query_params.get("lte_ip")
    await websocket.accept()

    registry = get_vehicle_registry()

    try:
        while True:
            # ── 연결이 살아있는지 먼저 확인 (닫혔으면 조용히 종료) ──
            # application_state.value == 1 이 CONNECTED 상태.
            if websocket.application_state.value != 1:
                break

            if lte_ip:
                payload = registry.latest_flattened_by_lte_ip(lte_ip)
            else:
                payload = registry.latest_flattened()

            if payload:
                out = dict(payload)
                out["server_ts"] = datetime.now(
                    timezone(timedelta(hours=9))
                ).isoformat()
                await websocket.send_json(out)
            else:
                await websocket.send_json({
                    "ok":        False,
                    "error":     "no_data",
                    "lte_ip":    lte_ip,
                    "server_ts": datetime.now(
                        timezone(timedelta(hours=9))
                    ).isoformat(),
                })

            await asyncio.sleep(0.1)

    except WebSocketDisconnect:
        # 클라이언트가 정상적으로 연결을 종료한 경우 — 조용히 무시
        pass
    except (RuntimeError, ConnectionError) as e:
        # 이미 닫힌 소켓에 쓰기 시도 등 — 로그만 남기고 종료
        # ("unable to perform operation on ... the handler is closed" 방지)
        print(f"ℹ️  QGC WS 연결 종료됨 (lte_ip={lte_ip}): {e}")
    except Exception as e:
        print(f"⚠️ QGC WS 예기치 못한 오류 (lte_ip={lte_ip}): {e}")
    finally:
        # 아직 열려 있으면 정리
        try:
            if websocket.application_state.value == 1:
                await websocket.close()
        except Exception:
            pass