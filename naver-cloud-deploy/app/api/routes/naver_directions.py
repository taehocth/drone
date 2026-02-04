from fastapi import APIRouter
import httpx
import os

router = APIRouter()

CLIENT_ID = os.getenv("NAVER_CLIENT_ID")
CLIENT_SECRET = os.getenv("NAVER_CLIENT_SECRET")

@router.get("/directions")
async def get_directions(start: str, goal: str):
    url = (
        f"https://naveropenapi.apigw.ntruss.com/map-direction/v1/driving"
        f"?start={start}&goal={goal}&option=trafast"
    )
    headers = {
        "X-NCP-APIGW-API-KEY-ID": CLIENT_ID,
        "X-NCP-APIGW-API-KEY": CLIENT_SECRET,
    }
    async with httpx.AsyncClient() as client:
        r = await client.get(url, headers=headers)
        return r.json()
