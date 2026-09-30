"""
app/api/routes/weather.py  (Open-Meteo 프록시 — 호출 최소화 버전)

역할:
  프론트가 Open-Meteo 를 직접 호출하지 않고 이 서버를 통해 받는다.
    - 관제 PC 가 외부 API 를 차단하는 망에 있어도 동작
    - 소스 교체·유료 전환 시 여기 한 곳만 수정

[호출 최소화 설계]
  1. 좌표 스냅: 위경도를 SNAP_DEG(기본 0.05° ≈ 5km) 격자로 묶는다.
     → 드론이 조금 움직이거나, 격자(nx,ny)/위경도 두 경로로 불러도 같은 캐시를 쓴다.
  2. 원본 통째 캐시: 3일치 시간별 예보를 한 번 받아두고,
     "지금부터 N시간" 슬라이싱은 캐시에서 매 요청마다 새로 한다.
     → 캐시가 1시간 묵어도 '현재 시각' 행은 항상 정확. hours 값이 달라도 같은 캐시.
  3. TTL: 예보 60분 / 파고 3시간 / 내륙(파고 없음) 24시간 / Kp(NOAA) 15분.
  4. 단일 비행(single-flight): 같은 격자에 동시 요청이 와도 외부 호출은 1번.
  5. 429 쿨다운: 한도 초과를 받으면 COOLDOWN_429 동안 Open-Meteo 를 아예 안 부르고
     마지막 성공 데이터(stale)를 돌려준다 → 한도에 걸린 상태에서 재시도 폭주 방지.
  6. 사용량 확인: GET /weather/stats 로 오늘 외부 호출 수·캐시 적중 수 확인.

  예상 호출 수 (격자 1곳, 기본 TTL): 예보 24 + 파고 8(해상) 또는 1(내륙) ≈ 하루 25~32회.
  탭·사용자 수와 무관하다. 더 줄이려면 WEATHER_FORECAST_TTL=10800 (3시간 → 약 16회).

  ⚠️ 캐시는 프로세스 메모리에 있다. 서버 재시작(Render 슬립 복귀 포함) 시 비워지고,
     uvicorn/gunicorn 워커를 여러 개 띄우면 워커마다 따로 캐시한다.

엔드포인트:
  GET /weather/forecast?lat=36.37&lon=126.42&hours=6
  GET /weather/?nx=..&ny=..&hours=..   (레거시 기상청 격자 호환)
  GET /weather/stats                     (호출 통계)

단위: 풍속·돌풍 m/s, 강수 mm, 기온 °C, 시정 km, 파고 m. timezone Asia/Seoul.
※ 무료 플랜(비상업). OPEN_METEO_API_KEY 환경변수 설정 시 customer-api 로 자동 전환.
"""

from __future__ import annotations

import math
import os
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Dict, List, Optional, Tuple, Union

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

# ── 호출 최소화 설정 (환경변수로 조정 가능) ──────────────────
SNAP_DEG        = float(os.getenv("WEATHER_SNAP_DEG", "0.05"))       # 격자 크기(°)
FORECAST_TTL    = int(os.getenv("WEATHER_FORECAST_TTL", "3600"))     # 예보 60분
MARINE_TTL      = int(os.getenv("WEATHER_MARINE_TTL", "10800"))      # 파고 3시간
MARINE_NONE_TTL = 24 * 3600                                          # 내륙(파고 없음) 24시간
KP_TTL          = 15 * 60                                            # Kp 15분
COOLDOWN_429    = int(os.getenv("WEATHER_COOLDOWN_429", "900"))      # 429 후 15분 휴식
FORECAST_DAYS   = 3                                                  # TTL 동안 24시간 앞까지 확보
MAX_CACHE_ITEMS = 300


# ════════════════════════════════════════════════════════
# 캐시 · 단일 비행 · 쿨다운 · 통계
# ════════════════════════════════════════════════════════
_cache: Dict[str, Tuple[float, Any]] = {}
_key_locks: Dict[str, threading.Lock] = {}
_guard = threading.Lock()
_cooldown_until: Dict[str, float] = {}          # upstream 이름 → 재개 시각(epoch)
_stats = {"day": "", "upstream_calls": {}, "cache_hits": 0, "stale_served": 0, "http_429": 0}


def _today() -> str:
    return datetime.now(KST).strftime("%Y-%m-%d")


def _bump(field: str, sub: Optional[str] = None) -> None:
    with _guard:
        if _stats["day"] != _today():               # 날짜 바뀌면 통계 초기화
            _stats.update(day=_today(), upstream_calls={}, cache_hits=0, stale_served=0, http_429=0)
        if sub is None:
            _stats[field] += 1
        else:
            _stats[field][sub] = _stats[field].get(sub, 0) + 1


def _lock_for(key: str) -> threading.Lock:
    with _guard:
        lk = _key_locks.get(key)
        if lk is None:
            lk = _key_locks[key] = threading.Lock()
        return lk


def _evict_if_needed() -> None:
    if len(_cache) <= MAX_CACHE_ITEMS:
        return
    for k, _ in sorted(_cache.items(), key=lambda kv: kv[1][0])[: len(_cache) - MAX_CACHE_ITEMS]:
        _cache.pop(k, None)


TTL = Union[int, Callable[[Any], int]]


def _cached(key: str, ttl: TTL, upstream: str, loader: Callable[[], Any]) -> Tuple[Any, float, bool]:
    """
    캐시 조회 → 없거나 만료면 loader() 로 외부 호출 (같은 key 동시 요청은 1번만 호출).
    반환: (data, age_sec, stale)
      stale=True : 외부 호출 실패/쿨다운 중이라 만료된 캐시를 대신 돌려준 경우
    """
    def _ttl_of(data):
        return ttl(data) if callable(ttl) else ttl

    hit = _cache.get(key)
    now = time.time()
    if hit and now - hit[0] < _ttl_of(hit[1]):
        _bump("cache_hits")
        return hit[1], now - hit[0], False

    with _lock_for(key):
        # 락을 기다리는 동안 다른 스레드가 채웠을 수 있음 → 재확인
        hit = _cache.get(key)
        now = time.time()
        if hit and now - hit[0] < _ttl_of(hit[1]):
            _bump("cache_hits")
            return hit[1], now - hit[0], False

        # 429 쿨다운 중이면 외부 호출 자체를 하지 않음
        until = _cooldown_until.get(upstream, 0.0)
        if now < until:
            if hit:
                _bump("stale_served")
                return hit[1], now - hit[0], True
            raise HTTPException(status_code=503,
                                detail=f"{upstream} 호출 한도 초과로 대기 중 ({int(until - now)}초 후 재시도)")

        try:
            _bump("upstream_calls", upstream)
            data = loader()
        except requests.HTTPError as e:
            if e.response is not None and e.response.status_code == 429:
                _cooldown_until[upstream] = time.time() + COOLDOWN_429
                _bump("http_429")
                print(f"[weather] ⚠️ {upstream} 429 — {COOLDOWN_429}초 동안 호출 중단")
            if hit:
                _bump("stale_served")
                return hit[1], now - hit[0], True
            raise
        except requests.RequestException:
            if hit:
                _bump("stale_served")
                return hit[1], now - hit[0], True
            raise

        _cache[key] = (time.time(), data)
        _evict_if_needed()
        return data, 0.0, False


# ════════════════════════════════════════════════════════
# 보조 함수
# ════════════════════════════════════════════════════════
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


def _grid_to_latlon(nx: int, ny: int) -> tuple[float, float]:
    """기상청 격자 → 위경도 (레거시 호환용)."""
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


def _snap(v: float) -> float:
    """SNAP_DEG 격자 중심으로 스냅 (같은 격자 = 같은 캐시 키)."""
    return round(round(v / SNAP_DEG) * SNAP_DEG, 4)


def _get_json(url: str, params: Dict[str, Any]) -> Any:
    if OPEN_METEO_API_KEY and "open-meteo" in url:
        params = {**params, "apikey": OPEN_METEO_API_KEY}
    r = requests.get(url, params=params, timeout=_TIMEOUT)
    r.raise_for_status()
    return r.json()


# ════════════════════════════════════════════════════════
# 원본 데이터 로더 (캐시 단위)
# ════════════════════════════════════════════════════════
def _forecast_raw(slat: float, slon: float) -> Tuple[dict, float, bool]:
    def load():
        fc = _get_json(_BASE_FORECAST, {
            "latitude": f"{slat:.4f}", "longitude": f"{slon:.4f}",
            "hourly": "temperature_2m,precipitation,precipitation_probability,wind_speed_10m,"
                      "wind_gusts_10m,wind_direction_10m,weather_code,visibility",
            "wind_speed_unit": "ms", "timezone": "Asia/Seoul", "forecast_days": FORECAST_DAYS,
        })
        if not (fc.get("hourly") or {}).get("time"):
            raise HTTPException(status_code=502, detail="Open-Meteo 응답에 hourly 데이터가 없습니다")
        return fc
    return _cached(f"fc:{slat}:{slon}", FORECAST_TTL, "open-meteo", load)


def _marine_raw(slat: float, slon: float) -> Dict[str, Optional[float]]:
    """시각 → 파고. 내륙이면 {} 를 24시간 캐시해 매번 재시도하지 않는다. 실패해도 예보는 계속."""
    def load():
        try:
            mr = _get_json(_BASE_MARINE, {
                "latitude": f"{slat:.4f}", "longitude": f"{slon:.4f}",
                "hourly": "wave_height", "timezone": "Asia/Seoul", "forecast_days": FORECAST_DAYS,
            })
        except requests.HTTPError as e:
            if e.response is not None and e.response.status_code == 400:
                return {}                       # 내륙 좌표 → 파고 없음
            raise
        h = mr.get("hourly") or {}
        waves = {t: w for t, w in zip(h.get("time") or [], h.get("wave_height") or []) if w is not None}
        return waves                            # 값이 전부 None 이면 {} (내륙)

    def ttl(data):
        return MARINE_TTL if data else MARINE_NONE_TTL

    try:
        data, _, _ = _cached(f"mr:{slat}:{slon}", ttl, "open-meteo", load)
        return data
    except Exception:
        return {}


def _kp_index() -> Optional[float]:
    def load():
        kpd = requests.get(_KP_URL, timeout=_TIMEOUT)
        kpd.raise_for_status()
        arr = kpd.json()
        return float(arr[-1].get("kp_index")) if arr else None
    try:
        data, _, _ = _cached("kp", KP_TTL, "noaa", load)
        return data
    except Exception:
        return None


# ════════════════════════════════════════════════════════
# 응답 조립 (캐시된 원본에서 매 요청 슬라이싱)
# ════════════════════════════════════════════════════════
def _fetch_all(lat: float, lon: float, hours: int) -> Dict[str, Any]:
    slat, slon = _snap(lat), _snap(lon)

    fc, age, stale = _forecast_raw(slat, slon)
    h = fc.get("hourly") or {}
    times: List[str] = h.get("time") or []

    waves = _marine_raw(slat, slon)
    kp = _kp_index()

    # 현재 시각(KST)이 속한 슬롯부터 hours 개
    now = datetime.now(KST)
    idx = None
    for i, t in enumerate(times):
        try:
            ts = datetime.fromisoformat(t).replace(tzinfo=KST)
        except ValueError:
            continue
        if ts > now - timedelta(hours=1):
            idx = i
            break
    if idx is None:
        raise HTTPException(status_code=503, detail="캐시된 예보가 모두 지난 시각입니다 (갱신 대기)")

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
        wv = waves.get(t)
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
        "location": {"lat": lat, "lon": lon, "grid_lat": slat, "grid_lon": slon},
        "hours": rows,
        "current": rows[0] if rows else None,
        "kp_index": kp,
        "fetched_at": datetime.fromtimestamp(time.time() - age, KST).isoformat(),  # 실제 수신 시각
        "cache_age_sec": int(age),
        "stale": stale,        # True 면 외부 호출 실패로 오래된 데이터를 보여주는 중
    }


# ════════════════════════════════════════════════════════
# 엔드포인트
# ════════════════════════════════════════════════════════
@router.get("/forecast")
async def get_forecast(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    hours: int = Query(6, ge=1, le=24),
):
    """위경도 기준 시간별 예보 (Open-Meteo 프록시, 캐시)."""
    try:
        return await run_in_threadpool(_fetch_all, lat, lon, hours)
    except HTTPException:
        raise
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"Open-Meteo 호출 실패: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"기상 처리 오류: {e}")


@router.get("/stats")
async def get_weather_stats():
    """오늘(KST) 외부 호출 수·캐시 적중 수 — 사용량 모니터링용."""
    now = time.time()
    with _guard:
        if _stats["day"] != _today():
            _stats.update(day=_today(), upstream_calls={}, cache_hits=0, stale_served=0, http_429=0)
        snapshot = {k: (dict(v) if isinstance(v, dict) else v) for k, v in _stats.items()}
    snapshot["cooldown_remaining_sec"] = {k: max(0, int(v - now)) for k, v in _cooldown_until.items()}
    snapshot["cache_items"] = len(_cache)
    snapshot["settings"] = {"snap_deg": SNAP_DEG, "forecast_ttl": FORECAST_TTL, "marine_ttl": MARINE_TTL}
    return snapshot


@router.get("/")
async def get_weather_legacy(
    nx: int = Query(...),
    ny: int = Query(...),
    hours: int = Query(6, ge=1, le=24),
    base_date: Optional[str] = None,   # 레거시 파라미터 — 무시
    base_time: Optional[str] = None,
):
    """레거시 호환: 기상청 격자(nx,ny) → 위경도 변환 후 같은 캐시를 사용."""
    lat, lon = _grid_to_latlon(nx, ny)
    return await get_forecast(lat=lat, lon=lon, hours=hours)