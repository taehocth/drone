from fastapi import APIRouter
import httpx

router = APIRouter()

@router.get("/weather")
async def get_weather(nx: int, ny: int, base_date: str, base_time: str):
    service_key = "발급받은APIKEY(인코딩된 값)"
    url = (
        "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst"
        f"?serviceKey={service_key}&pageNo=1&numOfRows=1000&dataType=JSON"
        f"&base_date={base_date}&base_time={base_time}&nx={nx}&ny={ny}"
    )
    async with httpx.AsyncClient() as client:
        r = await client.get(url)
        return r.json()
