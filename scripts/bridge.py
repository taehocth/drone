from pymavlink import mavutil
import socket

# 드론 직렬 포트 (윈도우 COM10)
master = mavutil.mavlink_connection("COM10", baud=57600)

# UDP 소켓 (Backend 컨테이너와 연결할 주소/포트)
sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

# ✅ 여기서 주소/포트를 조정해보세요    # 로컬호스트
target = ("192.168.50.80", 14445)  # 도커 전용 호스트 DNS

print("✅ COM10 → UDP 14445 브릿지 시작")

while True:
    msg = master.recv_msg()
    if msg:
        print("📡 보낸 메시지:", msg.get_type())  # 확인용 로그
        sock.sendto(msg.get_msgbuf(), target)
