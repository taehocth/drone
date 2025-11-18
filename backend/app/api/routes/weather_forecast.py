from fastapi import APIRouter, Query
import requests
from datetime import datetime, timedelta
import xmltodict
import os

router = APIRouter()

KMA_API_URL = "http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst"
SERVICE_KEY = os.getenv("KMA_SERVICE_KEY")  # ⚠️ .env에 저장된 인증키 사용

@router.get("")
def get_wind_forecast(
    nx: int = Query(..., description="격자 X"),
    ny: int = Query(..., description="격자 Y"),
    base_date: str = Query(..., description="기준 날짜 (YYYYMMDD)"),
    base_time: str = Query(..., description="기준 시각 (HHMM)"),
):
    """
    기상청 초단기예보(3시간 단위) API에서
    향후 6시간의 예측 풍속(WSD)을 반환합니다.
    """
    try:
        params = {
            "serviceKey": SERVICE_KEY,
            "numOfRows": 1000,
            "pageNo": 1,
            "dataType": "XML",
            "base_date": base_date,
            "base_time": base_time,
            "nx": nx,
            "ny": ny,
        }

        res = requests.get(KMA_API_URL, params=params, timeout=10)
        data = xmltodict.parse(res.text)

        items = data["response"]["body"]["items"]["item"]
        if not isinstance(items, list):
            items = [items]

        # ✅ 풍속(WSD) 데이터만 추출
        forecast = []
        for item in items:
            if item["category"] == "WSD":  # 풍속 데이터
                forecast.append(float(item["fcstValue"]))

        # ✅ 최근 6시간(6개 데이터)만 반환
        return {"forecast": forecast[:6]}

    except Exception as e:
        return {"error": str(e), "forecast": []}
