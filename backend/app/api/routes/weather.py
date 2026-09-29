"""
app/api/routes/weather.py  (Open-Meteo 프록시 버전 — 기상청 API 대체)

역할:
  프론트가 Open-Meteo 를 직접 호출하지 않고 이 서버를 통해 받는다.
    - 관제 PC 가 외부 API 를 차단하는 망(회사 방화벽 등)에 있어도 동작
    - 소스 교체·유료 전환 시 여기 한 곳만 수정
    - 응답을 화면·복합 위험 점수에 바로 쓸 수 있는 형태로 정리

엔드포인트:
  GET /weather/forecast?lat=36.37&lon=126.42&hours=6
    → {
        "source": "open-meteo",
        "location": {"lat":..., "lon":...},
        "hours": [ {time, hour, temp, wind, gust, precip, precip_prob, code, condition, visibility_km, wave}, ... ],
        "current": {...첫 항목...},
        "kp_index": 2.33 | null,
        "fetched_at": "..."
      }
  GET /weather/  (레거시 nx,ny 격자 호출 호환 → 격자 중심 위경도로 변환해 같은 응답)

단위: 풍속·돌풍 m/s, 강수 mm, 기온 °C, 시정 km, 파고 m. timezone Asia/Seoul.
※ 무료 플랜(비상업). 상업 전환 시 OPEN_METEO_API_KEY 환경변수를 설정하면 customer-api 로 자동 전환.
"""

from __future__ import annotations

import math
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import requests
from fastapi import APIRouter, HTTPException, Query
from fastapi.concurrency import run_in_threadpool

router = APIRouter()

OPEN_METEO_API_KEY = os.getenv("OPEN_METEO_API_KEY", "").strip()
_BASE_FORECAST = ("https://customer-api.open-meteo.com/v1/forecast" if OPEN_METEO_API_KEY
                  else "https://api.open-meteo.com/v1/forecast")
_BASE_MARINE = ("https://customer-marine-api.open-meteo.com/v1/marine" if OPEN_METEO_API_KEY
                else "https://marine-api.open-meteo.com/v1/marine")
_KP_URL = "https://services.swpc.noaa.gov/json/planetary_k_index_1m.json"
_TIMEOUT = 8.0
KST = timezone(timedelta(hours=9))


# ── WMO weather code → 한글 상태 ───────────────────────────
def _condition(code: int) -> str:
    if code == 0: return "맑음"
    if code <= 2: return "구름 조금"
    if code == 3: return "흐림"
    if code in (45, 48): return "안개"
    if 51 <= code <= 57: return "이슬비"
    if 61 <= code <= 67: return "비"
    if 71 <= code <= 77: return "눈"
    if 80 <= code <= 82: return "소나기"
    if code in (85, 86): return "눈보라"
    if 95 <= code <= 99: return "뇌우"
    return "알 수 없음"


# ── 기상청 격자 → 위경도 (레거시 호환용) ────────────────────
def _grid_to_latlon(nx: int, ny: int) -> tuple[float, float]:
    RE, GRID = 6371.00877, 5.0
    SLAT1, SLAT2, OLON, OLAT, XO, YO = 30.0, 60.0, 126.0, 38.0, 43, 136
    DEGRAD = math.pi / 180.0
    re = RE / GRID
    slat1, slat2, olon, olat = SLAT1 * DEGRAD, SLAT2 * DEGRAD, OLON * DEGRAD, OLAT * DEGRAD
    sn = math.tan(math.pi * 0.25 + slat2 * 0.5) / math.tan(math.pi * 0.25 + slat1 * 0.5)
    sn = math.log(math.cos(slat1) / math.cos(slat2)) / math.log(sn)
    sf = math.tan(math.pi * 0.25 + slat1 * 0.5)
    sf = (sf ** sn) * math.cos(slat1) / sn
    ro = math.tan(math.pi * 0.25 + olat * 0.5)
    ro = re * sf / (ro ** sn)
    xn, yn = nx - XO, ro - ny + YO
    ra = math.sqrt(xn * xn + yn * yn)
    if sn < 0: ra = -ra
    alat = (re * sf / ra) ** (1.0 / sn)
    alat = 2.0 * math.atan(alat) - math.pi * 0.5
    if abs(xn) <= 0.0: theta = 0.0
    elif abs(yn) <= 0.0: theta = math.pi * 0.5 if xn > 0 else -math.pi * 0.5
    else: theta = math.atan2(xn, yn)
    alon = theta / sn + olon
    return alat / DEGRAD, alon / DEGRAD


# ── 외부 호출 (동기 → threadpool) ────────────────────────────
def _get_json(url: str, params: Dict[str, Any]) -> Any:
    if OPEN_METEO_API_KEY and "open-meteo" in url:
        params = {**params, "apikey": OPEN_METEO_API_KEY}
    r = requests.get(url, params=params, timeout=_TIMEOUT)
    r.raise_for_status()
    return r.json()


def _fetch_all(lat: float, lon: float, hours: int) -> Dict[str, Any]:
    fc = _get_json(_BASE_FORECAST, {
        "latitude": f"{lat:.4f}", "longitude": f"{lon:.4f}",
        "hourly": "temperature_2m,precipitation,precipitation_probability,wind_speed_10m,"
                  "wind_gusts_10m,wind_direction_10m,weather_code,visibility",
        "wind_speed_unit": "ms", "timezone": "Asia/Seoul", "forecast_days": 2,
    })
    h = fc.get("hourly") or {}
    times: List[str] = h.get("time") or []
    if not times:
        raise HTTPException(status_code=502, detail="Open-Meteo 응답에 hourly 데이터가 없습니다")

    # 파고 (해상 좌표에서만 값; 내륙은 오류 → None)
    waves: List[Optional[float]] = []
    try:
        mr = _get_json(_BASE_MARINE, {
            "latitude": f"{lat:.4f}", "longitude": f"{lon:.4f}",
            "hourly": "wave_height", "timezone": "Asia/Seoul", "forecast_days": 2,
        })
        waves = (mr.get("hourly") or {}).get("wave_height") or []
    except Exception:
        waves = []

    # Kp 지수
    kp: Optional[float] = None
    try:
        kpd = requests.get(_KP_URL, timeout=_TIMEOUT).json()
        kp = float(kpd[-1].get("kp_index")) if kpd else None
    except Exception:
        kp = None

    # 현재 시각(KST)이 속한 슬롯부터 hours 개
    now = datetime.now(KST)
    idx = 0
    for i, t in enumerate(times):
        try:
            ts = datetime.fromisoformat(t).replace(tzinfo=KST)
        except ValueError:
            continue
        if ts > now - timedelta(hours=1):
            idx = i
            break

    def _g(key: str, i: int, default=None):
        arr = h.get(key) or []
        return arr[i] if i < len(arr) and arr[i] is not None else default

    rows = []
    for i in range(idx, min(idx + max(1, hours), len(times))):
        t = times[i]
        try:
            hour_label = f"{datetime.fromisoformat(t).hour}시"
        except ValueError:
            hour_label = t
        code = int(_g("weather_code", i, 0) or 0)
        wv = waves[i] if i < len(waves) else None
        rows.append({
            "time": t, "hour": hour_label,
            "temp": _g("temperature_2m", i, 0.0),
            "wind": _g("wind_speed_10m", i, 0.0),
            "gust": _g("wind_gusts_10m", i, 0.0),
            "wind_dir": _g("wind_direction_10m", i, 0.0),
            "precip": _g("precipitation", i, 0.0),
            "precip_prob": _g("precipitation_probability", i, 0),
            "code": code, "condition": _condition(code),
            "visibility_km": (_g("visibility", i, 10000) or 10000) / 1000.0,
            "wave": float(wv) if isinstance(wv, (int, float)) else None,
        })

    return {
        "source": "open-meteo",
        "location": {"lat": lat, "lon": lon},
        "hours": rows,
        "current": rows[0] if rows else None,
        "kp_index": kp,
        "fetched_at": now.isoformat(),
    }


# ── 엔드포인트 ─────────────────────────────────────────────
@router.get("/forecast")
async def get_forecast(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    hours: int = Query(6, ge=1, le=24),
):
    """위경도 기준 시간별 예보 (Open-Meteo 프록시)."""
    try:
        return await run_in_threadpool(_fetch_all, lat, lon, hours)
    except HTTPException:
        raise
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"Open-Meteo 호출 실패: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"기상 처리 오류: {e}")


@router.get("/")
async def get_weather_legacy(
    nx: int = Query(...),
    ny: int = Query(...),
    hours: int = Query(6, ge=1, le=24),
    base_date: Optional[str] = None,   # 레거시 파라미터 — 무시
    base_time: Optional[str] = None,
):
    """레거시 호환: 기상청 격자(nx,ny) 호출을 격자 중심 위경도로 변환해 같은 응답을 준다."""
    lat, lon = _grid_to_latlon(nx, ny)
    return await get_forecast(lat=lat, lon=lon, hours=hours)