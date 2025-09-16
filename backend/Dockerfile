FROM python:3.10

# 로그가 바로바로 나오도록
ENV PYTHONUNBUFFERED=1

# 작업 디렉토리
WORKDIR /app

# 🔧 pymavlink 설치를 위한 시스템 패키지 설치
RUN apt-get update && apt-get install -y \
    build-essential \
    libxml2-dev \
    libxslt1-dev \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

# requirements.txt 복사 및 설치
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Alembic, 스크립트 등 프로젝트 관련 파일 복사
COPY ./scripts /app/scripts
COPY ./alembic.ini /app/
COPY ./app /app/app

# uvicorn으로 FastAPI 실행
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]