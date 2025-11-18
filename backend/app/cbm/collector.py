from datetime import datetime
from types import SimpleNamespace

# ✅ 전역 저장소
latest_telemetry = None

def update_latest_telemetry(data: dict):
    """QGC WebSocket에서 수신된 최신 Telemetry 데이터를 CBM용으로 업데이트"""
    global latest_telemetry
    latest_telemetry = SimpleNamespace(
        timestamp=datetime.now().isoformat(),
        voltage=data.get("battery_voltage", 10.2),
        temp=data.get("battery_temp", 43.5),
        esc_temp=data.get("esc_temp", 78.3),
        rpm_variation=data.get("rpm_variation", 0.05),
        cpu_load=data.get("cpu_load", 0.65),
        imu_temp=data.get("imu_temp", 61.2),
        satellites=data.get("satellites", 6),
        hdop=data.get("hdop", 1.9),
    )

def get_latest_telemetry():
    """CBM 평가 시 최신 Telemetry 데이터 가져오기"""
    global latest_telemetry
    if latest_telemetry is None:
        # 기본값 반환 (아직 연결 안 됨)
        return SimpleNamespace(
            timestamp=datetime.now().isoformat(),
            voltage=0.0,
            temp=0.0,
            esc_temp=0.0,
            rpm_variation=0.0,
            cpu_load=0.0,
            imu_temp=0.0,
            satellites=0,
            hdop=99.9,
        )
    return latest_telemetry
