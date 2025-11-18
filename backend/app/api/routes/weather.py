from fastapi import APIRouter, HTTPException, Query
import httpx
import xmltodict

router = APIRouter()

@router.get("/")
async def get_weather(
    nx: int = Query(..., description="격자 X 좌표"),
    ny: int = Query(..., description="격자 Y 좌표"),
    base_date: str = Query(..., description="발표 일자 (YYYYMMDD)"),
    base_time: str = Query(..., description="발표 시각 (HHMM)"),
):
    """
    ✅ 기상청 초단기실황 (UltraSrtNcst) API 라우트
    - XML 응답을 JSON으로 변환
    - API 오류 / 데이터 없음 gracefully 처리
    """
    API_KEY = "bwKriB11TImCq4gddSyJ8g"  # TODO: .env에 옮겨서 os.getenv("KMA_API_KEY")로 불러도 됨

    url = (
        "https://apihub.kma.go.kr/api/typ02/openApi/"
        "VilageFcstInfoService_2.0/getUltraSrtNcst"
        f"?pageNo=1&numOfRows=1000&dataType=XML"
        f"&base_date={base_date}&base_time={base_time}"
        f"&nx={nx}&ny={ny}"
        f"&authKey={API_KEY}"
    )

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.get(url)

        if res.status_code != 200:
            raise HTTPException(
                status_code=500,
                detail=f"❌ 기상청 API 요청 실패 (HTTP {res.status_code}): {res.text[:200]}"
            )

        # ✅ XML → JSON 변환
        parsed_data = xmltodict.parse(res.text)

        # ✅ 응답 구조 검사
        response = parsed_data.get("response", {})
        header = response.get("header", {})
        result_code = header.get("resultCode")
        result_msg = header.get("resultMsg", "")

        # ✅ 기상청이 오류 코드 반환 시
        if result_code != "00":
            print(f"⚠️ 기상청 응답 오류: {result_msg}")
            return {
                "response": {
                    "header": {"resultCode": result_code, "resultMsg": result_msg},
                    "body": None,
                }
            }

        # ✅ body 존재 여부 확인
        body = response.get("body", {})
        items = body.get("items")

        if not body or not items:
            print("⚠️ 기상청 데이터 없음: body나 items가 비어 있음")
            return {
                "response": {
                    "header": {"resultCode": "99", "resultMsg": "데이터 없음"},
                    "body": None,
                }
            }

        # ✅ 정상 응답 반환
        return parsed_data

    except httpx.RequestError as e:
        print(f"❌ 네트워크 오류: {e}")
        raise HTTPException(status_code=500, detail=f"네트워크 오류: {str(e)}")

    except Exception as e:
        print(f"❌ 날씨 API 내부 오류: {e}")
        raise HTTPException(status_code=500, detail=f"서버 내부 오류: {str(e)}")
