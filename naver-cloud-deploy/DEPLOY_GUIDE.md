# 🚀 네이버 클라우드 백엔드 배포 가이드

## 서버 정보
- **공인 IP**: 211.188.48.144
- **사용자명**: ubuntu
- **SSH 키**: C:\Users\cth99\Downloads\drone-ssh.pem

---

## 1단계: 서버 접속 및 초기 설정

### 1.1 SSH 접속

PowerShell 또는 Git Bash를 열고 다음 명령어로 접속하세요:

```bash
ssh -i "C:\Users\cth99\Downloads\drone-ssh.pem" ubuntu@211.188.48.144
```

접속이 안되면 키 권한 문제일 수 있습니다. WSL에서 시도:

```bash
# WSL에서 실행
cp /mnt/c/Users/cth99/Downloads/drone-ssh.pem ~/.ssh/
chmod 600 ~/.ssh/drone-ssh.pem
ssh -i ~/.ssh/drone-ssh.pem ubuntu@211.188.48.144
```

### 1.2 서버 환경 설정

서버 접속 후 다음 명령어를 순서대로 실행:

```bash
# 시스템 업데이트
sudo apt-get update
sudo apt-get upgrade -y

# Docker 설치
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker ubuntu
rm get-docker.sh

# Docker Compose 설치
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# 재접속 (Docker 그룹 권한 적용)
exit
```

다시 SSH로 접속:
```bash
ssh -i "C:\Users\cth99\Downloads\drone-ssh.pem" ubuntu@211.188.48.144
```

---

## 2단계: 백엔드 코드 업로드

### 2.1 로컬에서 코드 압축

**Windows PowerShell**에서 실행:

```powershell
cd C:\Dev\drone
Compress-Archive -Path naver-cloud-deploy\* -DestinationPath naver-cloud-deploy.zip -Force
```

### 2.2 서버로 업로드

**Git Bash** 또는 **WSL**에서 실행:

```bash
scp -i "C:\Users\cth99\Downloads\drone-ssh.pem" C:/Dev/drone/naver-cloud-deploy.zip ubuntu@211.188.48.144:~/
```

### 2.3 서버에서 압축 해제

서버에 SSH 접속 후:

```bash
# unzip 설치 (없는 경우)
sudo apt-get install -y unzip

# 압축 해제
unzip naver-cloud-deploy.zip -d ~/drone-backend
cd ~/drone-backend

# 권한 설정
chmod +x naver_cloud_deploy.sh
```

---

## 3단계: 환경변수 설정

### 3.1 .env 파일 수정

서버에서 .env 파일을 편집:

```bash
nano .env
```

다음 값들을 **반드시** 수정하세요:

```env
# 🔴 SECRET_KEY를 랜덤 값으로 변경
SECRET_KEY=여기에-랜덤-시크릿-키-입력

# 🔴 Render 프론트엔드 URL로 변경
FRONTEND_HOST=https://drone-6-fabz.onrender.com
BACKEND_CORS_ORIGINS=https://drone-6-fabz.onrender.com,http://localhost:5173

# 🔴 관리자 비밀번호 변경
FIRST_SUPERUSER_PASSWORD=안전한-비밀번호-입력

# 데이터베이스 비밀번호 (원하면 변경)
POSTGRES_PASSWORD=drone_prod_db_9f2a31
```

저장: `Ctrl + O`, Enter, 종료: `Ctrl + X`

### 3.2 SECRET_KEY 생성

안전한 SECRET_KEY 생성:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

출력된 값을 복사해서 .env 파일의 SECRET_KEY에 붙여넣기

---

## 4단계: Docker Compose로 실행

### 4.1 백엔드 실행

```bash
cd ~/drone-backend

# Docker Compose로 실행
docker-compose up -d

# 로그 확인
docker-compose logs -f
```

### 4.2 실행 확인

```bash
# 컨테이너 상태 확인
docker ps

# API 테스트
curl http://localhost:8000/api/v1/health

# WebSocket 테스트 (외부에서)
# ws://211.188.48.144/api/v1/qgc/ws/qgc
```

---

## 5단계: 방화벽 설정 (네이버 클라우드)

네이버 클라우드 콘솔에서 ACG(Access Control Group) 설정:

1. **네이버 클라우드 콘솔** 접속
2. **Server > ACG** 메뉴
3. 다음 포트 허용:
   - **HTTP**: 80 (TCP)
   - **HTTPS**: 443 (TCP)
   - **Custom**: 8000 (TCP) - 백엔드 직접 접근

---

## 6단계: 프론트엔드 환경변수 수정

### 6.1 Render 프론트엔드 환경변수

Render 대시보드에서 프론트엔드 서비스 선택 후:

```env
VITE_API_URL=http://211.188.48.144
```

또는 드론 데이터만 네이버 클라우드로:

```env
VITE_DRONE_API_URL=http://211.188.48.144
```

### 6.2 DroneSimulation.tsx 수정 (선택사항)

특정 API만 네이버 클라우드로 연결하려면:

```typescript
// frontend/src/components/Dashboard/DroneSimulation.tsx
const connect = () => {
  if (wsRef.current) return

  // 🔴 네이버 클라우드 서버로 직접 연결
  const wsUrl = "wss://211.188.48.144/api/v1/qgc/ws/qgc"

  const ws = new WebSocket(wsUrl)
  // ... 나머지 코드
}
```

---

## 7단계: 테스트

### 7.1 API 문서 접속

브라우저에서:
```
http://211.188.48.144/docs
```

### 7.2 WebSocket 연결 테스트

프론트엔드에서 "Connect" 버튼 클릭 후 드론 데이터 수신 확인

---

## 유용한 명령어

### Docker 관리

```bash
# 로그 확인
docker-compose logs -f backend

# 재시작
docker-compose restart backend

# 중지
docker-compose down

# 완전 재빌드
docker-compose down -v
docker-compose up -d --build
```

### 데이터베이스 접속

```bash
docker exec -it drone_db psql -U postgres -d drone_db
```

### 서버 상태 모니터링

```bash
# CPU, 메모리 사용량
htop

# Docker 리소스
docker stats
```

---

## 문제 해결

### 1. 포트가 이미 사용 중

```bash
# 포트 확인
sudo netstat -tulpn | grep :8000

# 프로세스 종료
sudo kill -9 <PID>
```

### 2. Docker 권한 오류

```bash
sudo usermod -aG docker ubuntu
exit  # 재접속
```

### 3. WebSocket 연결 안됨

- 네이버 클라우드 ACG에서 포트 80, 8000 허용 확인
- nginx가 정상 실행 중인지 확인: `docker ps`
- CORS 설정 확인: `.env` 파일의 `BACKEND_CORS_ORIGINS`

### 4. 데이터베이스 연결 오류

```bash
# 데이터베이스 컨테이너 재시작
docker-compose restart db

# 로그 확인
docker-compose logs db
```

---

## 자동 시작 설정

서버 재부팅 시 자동으로 Docker 컨테이너 시작:

```bash
# Docker 서비스 자동 시작
sudo systemctl enable docker

# Docker Compose 자동 시작 (systemd 서비스)
sudo nano /etc/systemd/system/drone-backend.service
```

내용:
```ini
[Unit]
Description=Drone Backend
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/home/ubuntu/drone-backend
ExecStart=/usr/local/bin/docker-compose up -d
ExecStop=/usr/local/bin/docker-compose down
User=ubuntu

[Install]
WantedBy=multi-user.target
```

서비스 활성화:
```bash
sudo systemctl daemon-reload
sudo systemctl enable drone-backend.service
sudo systemctl start drone-backend.service
```

---

## 다음 단계 (선택사항)

1. **HTTPS 설정**: Let's Encrypt로 SSL 인증서 발급
2. **도메인 연결**: DNS 설정으로 IP 대신 도메인 사용
3. **모니터링**: Prometheus + Grafana 설치
4. **백업**: 데이터베이스 자동 백업 스크립트

---

## 완료!

백엔드가 네이버 클라우드에서 실행되고 있습니다.

**접속 URL**:
- API 문서: http://211.188.48.144/docs
- WebSocket: wss://211.188.48.144/api/v1/qgc/ws/qgc
