from fastapi import APIRouter

from app.api.routes import items, login, private, users, utils
from app.core.config import settings
from fastapi import FastAPI
from app.api.routes import checklist  # ✅ 방금 만든 라우트 불러오기

app = FastAPI()

# 기존 user, item 라우트 등록 코드 있을거임
# ...

# 체크리스트 라우트 등록
app.include_router(checklist.router, prefix="/api/v1/checklists", tags=["checklists"])
api_router = APIRouter()
api_router.include_router(login.router)
api_router.include_router(users.router)
api_router.include_router(utils.router)
api_router.include_router(items.router)


if settings.ENVIRONMENT == "local":
    api_router.include_router(private.router)
