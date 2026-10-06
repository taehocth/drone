"""
app/api/routes/fire.py — 화점탐지 기체 실시간 데이터 (fire_agent.py → 백엔드 → 웹)

엔드포인트 (main.py 에서 prefix="/api/v1/fire" 로 등록):
  POST /push      지상 PC 의 fire_agent 가 최신 JSON 을 올림 (X-Agent-Token 인증)
  GET  /status    현재 상태 + 탐지 이벤트 목록 + 영상 주소
  WS   /ws        위 내용을 0.5 s 마다 송출

환경변수 (Render):
  FIRE_AGENT_TOKEN  fire_agent 와 같은 값 (비우면 인증 없이 받음 — 시험용)
  FIRE_STREAM_URL   영상 HLS 주소 (예: https://<pc>.<tailnet>.ts.net/fire/index.m3u8)

탐지 필드 해석:
  detect.fire {on, conf, lat?, lon?} 가 있으면 그것을, 없으면 detect.yolo {on, conf} 를 쓴다.
  → 지금 Jetson 은 착륙 스테이션 YOLO 를 보내므로 그 값이 표시되고,
    화점 모델이 detect.fire 를 보내기 시작하면 코드 수정 없이 화점으로 바뀐다.
"""

from __future__ import annotations

import asyncio
import os
import time
from collections import deque
from typing import Any, Dict, Optional

from fastapi import APIRouter, Header, HTTPException, WebSocket, WebSocketDisconnect

router = APIRouter()

AGENT_TOKEN = os.getenv("FIRE_AGENT_TOKEN", "").strip()
STREAM_URL = os.getenv("FIRE_STREAM_URL", "").strip()

AGENT_STALE_S = 3.0      # 이 시간 넘게 push 가 없으면 "지상 중계 끊김"
EVENT_MIN_CONF = 0.0     # 이벤트로 기록할 최소 신뢰도 (필요 시 0.5 등으로)

_state: Dict[str, Any] = {"vehicle_id": None, "msg": None, "agent": None, "server_rx": 0.0}
_events: deque = deque(maxlen=200)
_episode: Optional[Dict[str, Any]] = None   # 진행 중인 탐지 구간
_next_event_id = 1


def _detection(msg: Optional[dict]) -> Dict[str, Any]:
    d = (msg or {}).get("detect") or {}
    src = "fire" if isinstance(d.get("fire"), dict) else "yolo"
    f = d.get(src) or {}
    try:
        conf = float(f.get("conf") or 0.0)
    except (TypeError, ValueError):
        conf = 0.0
    return {"source": src, "on": bool(f.get("on")), "conf": conf,
            "lat": f.get("lat"), "lon": f.get("lon")}


def _update_events(msg: dict, now: float) -> None:
    """탐지 on 이 시작되면 이벤트를 열고, 꺼지면 닫는다 (구간 단위 기록)."""
    global _episode, _next_event_id
    det = _detection(msg)
    veh = msg.get("vehicle") or {}
    t_ms = msg.get("t_ms") if isinstance(msg.get("t_ms"), (int, float)) else int(now * 1000)

    if det["on"] and det["conf"] >= EVENT_MIN_CONF:
        if _episode is None:
            _episode = {
                "id": _next_event_id, "source": det["source"],
                "start_ms": t_ms, "end_ms": None, "duration_s": 0.0,
                "conf_max": det["conf"], "conf_last": det["conf"],
                "lat": det["lat"] if det["lat"] is not None else veh.get("lat"),
                "lon": det["lon"] if det["lon"] is not None else veh.get("lon"),
                "pos_kind": "detect" if det["lat"] is not None else "vehicle",
                "alt_rel": veh.get("alt_rel"), "active": True,
            }
            _next_event_id += 1
            _events.append(_episode)
        else:
            _episode["conf_max"] = max(_episode["conf_max"], det["conf"])
            _episode["conf_last"] = det["conf"]
            _episode["duration_s"] = round((t_ms - _episode["start_ms"]) / 1000.0, 1)
            if det["lat"] is not None:
                _episode["lat"], _episode["lon"], _episode["pos_kind"] = det["lat"], det["lon"], "detect"
    elif _episode is not None:
        _episode["end_ms"] = t_ms
        _episode["duration_s"] = round((t_ms - _episode["start_ms"]) / 1000.0, 1)
        _episode["active"] = False
        _episode = None


def _snapshot() -> Dict[str, Any]:
    now = time.time()
    rx = _state["server_rx"]
    agent_age = (now - rx) if rx else None
    msg = _state["msg"]
    return {
        "vehicle_id": _state["vehicle_id"],
        "stream_url": STREAM_URL,
        "agent_online": agent_age is not None and agent_age < AGENT_STALE_S,
        "agent_age_s": round(agent_age, 1) if agent_age is not None else None,
        "agent": _state["agent"],
        "data_online": msg is not None,
        "msg": msg,
        "detection": _detection(msg) if msg else None,
        "events": list(reversed(_events))[:30],
        "server_unix_ms": int(now * 1000),
    }


@router.post("/push")
async def push(body: Dict[str, Any], x_agent_token: Optional[str] = Header(default=None)):
    if AGENT_TOKEN and x_agent_token != AGENT_TOKEN:
        raise HTTPException(status_code=401, detail="invalid agent token")
    now = time.time()
    msg = body.get("msg")
    _state["vehicle_id"] = body.get("vehicle_id")
    _state["agent"] = body.get("agent")
    _state["msg"] = msg if isinstance(msg, dict) else None
    _state["server_rx"] = now
    if isinstance(msg, dict):
        _update_events(msg, now)
    return {"ok": True}


@router.get("/status")
async def status():
    return _snapshot()


@router.websocket("/ws")
async def fire_ws(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            await websocket.send_json(_snapshot())
            await asyncio.sleep(0.5)
    except (WebSocketDisconnect, RuntimeError, ConnectionError):
        pass
    finally:
        try:
            await websocket.close()
        except Exception:
            pass