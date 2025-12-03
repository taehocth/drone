import secrets
import warnings
from typing import Literal
from pydantic import PostgresDsn, computed_field, model_validator
from pydantic_core import MultiHostUrl
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing_extensions import Self


class Settings(BaseSettings):
    # ✅ .env 자동 로드
    model_config = SettingsConfigDict(
        env_file=".env",
        env_ignore_empty=True,
        extra="ignore",
    )

    # ----------------------
    # 기본 서비스 설정
    # ----------------------
    API_V1_STR: str = "/api/v1"
    SECRET_KEY: str = secrets.token_urlsafe(32)
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 8
    FRONTEND_HOST: str = "http://localhost:5173"
    ENVIRONMENT: Literal["local", "staging", "production"] = "local"

    # ----------------------
    # CORS 설정
    # ----------------------
    BACKEND_CORS_ORIGINS: str = (
        "http://localhost:5173,http://127.0.0.1:5173,http://api.localhost"
    )

    @computed_field
    @property
    def all_cors_origins(self) -> list[str]:
        """
        ✅ 최종적으로 허용할 CORS Origins (.env 문자열 기반)
        """
        origins = []
        if self.BACKEND_CORS_ORIGINS:
            raw = self.BACKEND_CORS_ORIGINS.replace(" ", "").split(",")
            origins = [o for o in raw if o]
        if self.FRONTEND_HOST not in origins:
            origins.append(self.FRONTEND_HOST)
        return origins

    # ----------------------
    # 프로젝트 / 모니터링
    # ----------------------
    PROJECT_NAME: str = "Drone Management System"
    SENTRY_DSN: str | None = None

    # ----------------------
    # 🔥 Gemini API (추가)
    # ----------------------
    GEMINI_API_KEY: str | None = None  # <-- 추가됨

    # ----------------------
    # DB 설정
    # ----------------------
    POSTGRES_SERVER: str = "db"
    POSTGRES_PORT: int = 5432
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "changethis"
    POSTGRES_DB: str = "drone_db"

    @computed_field
    @property
    def SQLALCHEMY_DATABASE_URI(self) -> PostgresDsn:
        return MultiHostUrl.build(
            scheme="postgresql+psycopg2",
            username=self.POSTGRES_USER,
            password=self.POSTGRES_PASSWORD,
            host=self.POSTGRES_SERVER,
            port=self.POSTGRES_PORT,
            path=self.POSTGRES_DB,
        )

    # ----------------------
    # MAVLink 설정
    # ----------------------
    MAVLINK_CONNECTION: str = "/dev/ttyUSB0"
    MAVLINK_BAUD: int = 57600
    MAVLINK_SIMULATION: bool = False

    # ----------------------
    # Naver API
    # ----------------------
    NAVER_CLIENT_ID: str | None = None
    NAVER_CLIENT_SECRET: str | None = None

    # ----------------------
    # 초기 슈퍼유저
    # ----------------------
    FIRST_SUPERUSER: str = "admin@example.com"
    FIRST_SUPERUSER_PASSWORD: str = "changethis"

    # ----------------------
    # 보안 경고
    # ----------------------
    def _check_default_secret(self, var_name: str, value: str | None) -> None:
        if value == "changethis":
            message = (
                f'The value of {var_name} is "changethis", '
                "for security, please change it, at least for deployments."
            )
            if self.ENVIRONMENT == "local":
                warnings.warn(message, stacklevel=1)
            else:
                raise ValueError(message)

    @model_validator(mode="after")
    def _enforce_non_default_secrets(self) -> Self:
        self._check_default_secret("POSTGRES_PASSWORD", self.POSTGRES_PASSWORD)
        self._check_default_secret(
            "FIRST_SUPERUSER_PASSWORD", self.FIRST_SUPERUSER_PASSWORD
        )
        return self


settings = Settings()
