#!/bin/bash
# 네이버 클라우드 백엔드 배포 스크립트

set -e

echo "=================================================="
echo "🚀 Drone 백엔드 네이버 클라우드 배포 스크립트"
echo "=================================================="
echo ""

# 1. 시스템 업데이트
echo "📦 시스템 패키지 업데이트 중..."
sudo apt-get update
sudo apt-get upgrade -y

# 2. 필수 패키지 설치
echo "📦 필수 패키지 설치 중..."
sudo apt-get install -y \
    curl \
    git \
    build-essential \
    python3.12 \
    python3.12-venv \
    python3-pip \
    postgresql \
    postgresql-contrib \
    nginx \
    libxml2-dev \
    libxslt1-dev \
    python3-dev

# 3. Docker 설치 (선택사항)
echo "🐳 Docker 설치 확인..."
if ! command -v docker &> /dev/null; then
    echo "Docker 설치 중..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    rm get-docker.sh
else
    echo "✅ Docker가 이미 설치되어 있습니다"
fi

# 4. Docker Compose 설치
echo "🐳 Docker Compose 설치 확인..."
if ! command -v docker-compose &> /dev/null; then
    echo "Docker Compose 설치 중..."
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
else
    echo "✅ Docker Compose가 이미 설치되어 있습니다"
fi

# 5. 프로젝트 디렉토리 생성
echo "📁 프로젝트 디렉토리 생성..."
mkdir -p /home/$USER/drone-backend
cd /home/$USER/drone-backend

echo ""
echo "=================================================="
echo "✅ 서버 환경 설정 완료!"
echo "=================================================="
echo ""
echo "다음 단계:"
echo "1. 백엔드 코드를 업로드하세요"
echo "2. .env 파일을 설정하세요"
echo "3. Docker Compose로 실행하세요"
echo ""
