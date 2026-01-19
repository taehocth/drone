import secrets
import warnings
from typing import Literal, Optional

from pydantic import PostgresDsn, computed_field, model_validator
from pydantic_core import MultiHostUrl
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing_extensions import Self


class Settings(BaseSettings):
    # ==================================================
    # .env 자동 로드
    # ==================================================
    model_config = SettingsConfigDict(
        env_file=".env",
        env_ignore_empty=True,
        extra="ignore",
    )

    # ==================================================
    # 기본 서비스 설정
    # ==================================================
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "Drone Management System"
    SECRET_KEY: str = secrets.token_urlsafe(32)
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 8
    ENVIRONMENT: Literal["local", "staging", "production"] = "local"

    FRONTEND_HOST: str = "http://localhost:5173"

    # ==================================================
    # CORS 설정
    # ==================================================
    BACKEND_CORS_ORIGINS: str = (
        "http://localhost:5173,http://127.0.0.1:5173"
    )

    @computed_field
    @property
    def all_cors_origins(self) -> list[str]:
        origins: list[str] = []
        if self.BACKEND_CORS_ORIGINS:
            raw = self.BACKEND_CORS_ORIGINS.replace(" ", "").split(",")
            origins = [o for o in raw if o]
        if self.FRONTEND_HOST not in origins:
            origins.append(self.FRONTEND_HOST)
        return origins

    # ==================================================
    # DB 설정
    # ==================================================
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

    # ==================================================
    # 🚁 MAVLink 설정 (가장 중요)
    # ==================================================

    # 🔴 MAVLink 백그라운드 스레드 활성화 여부
    # - Render: false
    # - Local Telemetry Agent: true
    MAVLINK_ENABLED: bool = False

    # 연결 방식
    # serial | udp
    MAVLINK_MODE: Literal["serial", "udp"] = "udp"

    # 명시적 연결 문자열 (있으면 최우선)
    # 예:
    #   udp:127.0.0.1:14550
    #   COM5
    MAVLINK_CONNECTION: Optional[str] = None

    # UDP 기본 엔드포인트 (QGC / SITL / Telemetry Radio)
    MAVLINK_UDP_ENDPOINT: str = "udp:0.0.0.0:14550"

    # Serial Baudrate
    MAVLINK_BAUD: int = 57600

    # ==================================================
    # 📡 Telemetry PUSH (Local Agent → Render Backend)
    # ==================================================
    # 🔴 이 필드가 없어서 Render가 크래시 났었음
    RENDER_TELEMETRY_PUSH_URL: str = (
        "https://drone-5-2qlc.onrender.com/api/v1/qgc/telemetry/push"
    )

    # ==================================================
    # 기타 외부 API
    # ==================================================
    GEMINI_API_KEY: str | None = None
    NAVER_CLIENT_ID: str | None = None
    NAVER_CLIENT_SECRET: str | None = None

    # ==================================================
    # 초기 슈퍼유저
    # ==================================================
    FIRST_SUPERUSER: str = "admin@example.com"
    FIRST_SUPERUSER_PASSWORD: str = "changethis"

    # ==================================================
    # 보안 경고
    # ==================================================
    def _check_default_secret(self, var_name: str, value: str | None) -> None:
        if value == "changethis":
            message = (
                f'The value of {var_name} is "changethis", '
                "for security, please change it."
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
