from fastapi import APIRouter

from app.api.routes import items, login, private, users, utils
from app.core.config import settings
from fastapi import FastAPI
from app.api.routes import checklist
from app.api.routes import qgc_ws  # ★ 추가

app = FastAPI()

# 체크리스트 라우트 등록
app.include_router(checklist.router, prefix="/api/v1/checklists", tags=["checklists"])

api_router = APIRouter()
api_router.include_router(login.router)
api_router.include_router(users.router)
api_router.include_router(utils.router)
api_router.include_router(items.router)
api_router.include_router(          # ★ 추가 — /api/v1/qgc/* 엔드포인트 등록
    qgc_ws.router,
    prefix="/qgc",
    tags=["qgc"],
)

if settings.ENVIRONMENT == "local":
    api_router.include_router(private.router)