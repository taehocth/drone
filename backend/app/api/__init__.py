from fastapi import APIRouter
from app.api.routes import (
    items,
    login,
    private,
    users,
    utils,
    checklist,
    weather,
    qgc_ws,
    telemetry_ws,
    naver_directions,
    naver_places,
    news,
    logs,
    logs_upload,
    cbm_ws,
    logs_convert,   # 👈 변환기 추가
)
from app.core.config import settings

api_router = APIRouter()

# 로그인
api_router.include_router(login.router, prefix="/login", tags=["login"])

# 사용자
api_router.include_router(users.router, prefix="/users", tags=["users"])

# 유틸
api_router.include_router(utils.router, prefix="/utils", tags=["utils"])

# 체크리스트
api_router.include_router(checklist.router, prefix="/checklists", tags=["checklists"])

# 날씨
api_router.include_router(weather.router, prefix="/weather", tags=["weather"])

# QGC
api_router.include_router(qgc_ws.router, prefix="/qgc", tags=["qgc"])

# 텔레메트리
api_router.include_router(telemetry_ws.router, prefix="/qgc", tags=["telemetry"])

# Naver API
api_router.include_router(naver_directions.router, prefix="/naver", tags=["naver"])
api_router.include_router(naver_places.router, prefix="/naver", tags=["naver"])

# 뉴스
api_router.include_router(news.router, prefix="/news", tags=["news"])

# 일반 로그
api_router.include_router(logs.router, prefix="/logs", tags=["logs"])

# PX4 ULG 로그 분석
api_router.include_router(logs_upload.router, prefix="/logs", tags=["logs-upload"])

# PX4 ULG → CSV 변환
api_router.include_router(logs_convert.router, prefix="/logs", tags=["convert"])  # 👈 추가!

# CBM WebSocket
api_router.include_router(cbm_ws.router, prefix="/cbm", tags=["cbm"])

# 개발 전용
if settings.ENVIRONMENT == "local":
    api_router.include_router(private.router, prefix="/private", tags=["private"])
