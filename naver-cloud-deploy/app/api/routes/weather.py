from fastapi import APIRouter, HTTPException, Query
import httpx
import xmltodict
from datetime import datetime, timedelta

router = APIRouter()

def get_latest_base_time():
    """기상청 초단기실황 발표 시각 자동 계산 (00 / 30 단위)"""
    now = datetime.now()

    # 기상청 데이터는 약 10~15분 지연됨
    now -= timedelta(minutes=15)

    minute = now.minute
    if minute < 30:
        return now.strftime("%Y%m%d"), now.strftime("%H00")
    else:
        return now.strftime("%Y%m%d"), now.strftime("%H30")


async def call_kma_api(nx, ny, base_date, base_time):
    """기상청 API 호출 함수"""
    API_KEY = "bwKriB11TImCq4gddSyJ8g"

    url = (
        "https://apihub.kma.go.kr/api/typ02/openApi/"
        "VilageFcstInfoService_2.0/getUltraSrtNcst"
        f"?pageNo=1&numOfRows=1000&dataType=XML"
        f"&base_date={base_date}&base_time={base_time}"
        f"&nx={nx}&ny={ny}"
        f"&authKey={API_KEY}"
    )

    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(url)

    return res


@router.get("/")
async def get_weather(
    nx: int = Query(...),
    ny: int = Query(...),
    base_date: str = None,
    base_time: str = None,
):
    """
    기상청 초단기실황 API (자동 base_time 보정 + NO_DATA fallback)
    """

    # 1) 서버에서 base_date/base_time 자동 계산
    if not base_date or not base_time:
        base_date, base_time = get_latest_base_time()

    # 2) API 호출 (최신 발표 시각)
    res = await call_kma_api(nx, ny, base_date, base_time)

    parsed = xmltodict.parse(res.text)
    header = parsed.get("response", {}).get("header", {})
    result_code = header.get("resultCode")

    # 3) NO_DATA 발생 시 → 30분 이전 시각으로 한번 더 요청
    if result_code != "00":
        print(f"⚠️ NO_DATA 발생 → 30분 전으로 재시도")

        # 30분 재계산
        dt = datetime.strptime(base_date + base_time, "%Y%m%d%H%M")
        dt -= timedelta(minutes=30)

        fallback_date = dt.strftime("%Y%m%d")
        fallback_time = dt.strftime("%H%M")

        res = await call_kma_api(nx, ny, fallback_date, fallback_time)
        parsed = xmltodict.parse(res.text)

    # 4) 최종 응답 반환
    return parsed
