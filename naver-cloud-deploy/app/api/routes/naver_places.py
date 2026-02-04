from fastapi import APIRouter, Query
import httpx, os

router = APIRouter()

CLIENT_ID = os.getenv("NAVER_SEARCH_CLIENT_ID")
CLIENT_SECRET = os.getenv("NAVER_SEARCH_CLIENT_SECRET")

@router.get("/search-place")
async def search_place(query: str = Query(...)):
    url = f"https://openapi.naver.com/v1/search/local.json?query={query}&display=5"
    headers = {
        "X-Naver-Client-Id": CLIENT_ID,
        "X-Naver-Client-Secret": CLIENT_SECRET,
    }
    async with httpx.AsyncClient() as client:
        r = await client.get(url, headers=headers)
        return r.json()
