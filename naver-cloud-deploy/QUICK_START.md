# ⚡ 빠른 시작 가이드

## 1️⃣ SSH 접속 (Windows PowerShell)

```powershell
ssh -i "C:\Users\cth99\Downloads\hanuldrone.pem" ubuntu@49.50.138.219
```

권한 오류 시 **Git Bash** 사용:
```bash
ssh -i "C:\Users\cth99\Downloads\hanuldrone.pem" ubuntu@49.50.138.219
```

---

## 2️⃣ 서버에서 Docker 설치

```bash
# Docker 한번에 설치
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu

# Docker Compose 설치
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# 재접속 필요
exit
```

다시 접속:
```bash
ssh -i "C:\Users\cth99\Downloads\hanuldrone.pem" ubuntu@49.50.138.219
```

---

## 3️⃣ 로컬에서 코드 업로드 (Windows PowerShell)

```powershell
# 현재 위치에서 압축
cd C:\Dev\drone
Compress-Archive -Path naver-cloud-deploy\* -DestinationPath naver-deploy.zip -Force

# 서버로 전송 (Git Bash 사용)
scp -i "C:\Users\cth99\Downloads\hanuldrone.pem" C:/Dev/drone/naver-deploy.zip ubuntu@49.50.138.219:~/
```

---

## 4️⃣ 서버에서 압축 해제 및 실행

```bash
# unzip 설치
sudo apt-get update
sudo apt-get install -y unzip

# 압축 해제
unzip naver-deploy.zip -d ~/drone-backend
cd ~/drone-backend

# SECRET_KEY 생성
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
# 👆 출력된 값 복사

# .env 수정
nano .env
```

**.env 파일에서 수정할 부분:**
```env
SECRET_KEY=여기에-위에서-복사한-키-붙여넣기
FIRST_SUPERUSER_PASSWORD=안전한-비밀번호
```

저장: `Ctrl+O` → Enter → `Ctrl+X`

---

## 5️⃣ Docker Compose 실행

```bash
docker-compose up -d

# 로그 확인
docker-compose logs -f
```

실행 확인:
```bash
curl http://localhost:8000/api/v1/health
```

---

## 6️⃣ 네이버 클라우드 방화벽 설정

1. **네이버 클라우드 콘솔** 접속
2. **Server > ACG** 메뉴
3. 다음 포트 열기:
   - **80 (TCP)** - HTTP
   - **443 (TCP)** - HTTPS
   - **8000 (TCP)** - Backend API

---

## 7️⃣ 프론트엔드 환경변수 수정

### 옵션 A: Render 환경변수 추가

Render 대시보드 → 프론트엔드 서비스 → Environment:
```env
VITE_DRONE_API_URL=http://49.50.138.219
```

### 옵션 B: DroneSimulation.tsx 직접 수정

```typescript
// frontend/src/components/Dashboard/DroneSimulation.tsx
const wsUrl = "wss://49.50.138.219/api/v1/qgc/ws/qgc"
```

---

## ✅ 테스트

브라우저에서:
```
http://49.50.138.219/docs
```

---

## 🛠️ 유용한 명령어

```bash
# 로그 실시간 확인
docker-compose logs -f backend

# 재시작
docker-compose restart

# 중지
docker-compose down

# 완전 재빌드
docker-compose down -v
docker-compose up -d --build
```

---

더 자세한 내용은 **DEPLOY_GUIDE.md** 참조!
