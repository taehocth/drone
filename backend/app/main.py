from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import api_router
from app.core.config import settings
from app.api.routes import cbm

app = FastAPI(title=settings.PROJECT_NAME)

# ✅ CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ✅ 모든 v1 API 등록
app.include_router(api_router, prefix=settings.API_V1_STR)

# ✅ CBM 개별 라우터 (WebSocket 전용)
app.include_router(cbm.router, prefix="/api/v1", tags=["cbm"])

# ✅ 헬스체크
@app.get("/health")
async def health():
    return {"status": "ok"}


# ✅ 디버깅: 라우트 목록 출력
@app.on_event("startup")
async def show_routes():
    for route in app.routes:
        print("등록된 엔드포인트:", route.path, getattr(route, "methods", "WS"))
