from app.cbm.thresholds import BATTERY_LIMITS, ESC_LIMITS, FCC_LIMITS, GNSS_LIMITS

def evaluate_cbm_state(data):
    """
    data: 수신된 MAVLink 기반 실시간 Telemetry 데이터 객체
          (dict or namedtuple)
    """
    alerts = []

    # 🔋 Battery
    if data.voltage <= BATTERY_LIMITS["voltage_danger"]:
        alerts.append({"system": "Battery", "level": "danger", "msg": f"전압 낮음 ({data.voltage:.1f}V)"})
    elif data.voltage <= BATTERY_LIMITS["voltage_warning"]:
        alerts.append({"system": "Battery", "level": "warning", "msg": f"전압 낮음 ({data.voltage:.1f}V)"})

    if data.temp >= BATTERY_LIMITS["temp_danger"]:
        alerts.append({"system": "Battery", "level": "danger", "msg": f"온도 과열 ({data.temp:.1f}℃)"})
    elif data.temp >= BATTERY_LIMITS["temp_warning"]:
        alerts.append({"system": "Battery", "level": "warning", "msg": f"온도 상승 ({data.temp:.1f}℃)"})

    # ⚙️ Propulsion (ESC + Motor)
    if data.esc_temp >= ESC_LIMITS["temp_danger"]:
        alerts.append({"system": "ESC", "level": "danger", "msg": f"ESC 온도 과다 ({data.esc_temp:.1f}℃)"})
    elif data.esc_temp >= ESC_LIMITS["temp_warning"]:
        alerts.append({"system": "ESC", "level": "warning", "msg": f"ESC 온도 상승 ({data.esc_temp:.1f}℃)"})

    if abs(data.rpm_variation) >= ESC_LIMITS["rpm_diff_warning"]:
        alerts.append({"system": "Motor", "level": "warning", "msg": f"모터 RPM 불균형 ({data.rpm_variation*100:.0f}%)"})

    # 🧠 FCC
    if data.cpu_load >= FCC_LIMITS["cpu_danger"]:
        alerts.append({"system": "FCC", "level": "danger", "msg": f"CPU 부하 심각 ({data.cpu_load*100:.0f}%)"})
    elif data.cpu_load >= FCC_LIMITS["cpu_warning"]:
        alerts.append({"system": "FCC", "level": "warning", "msg": f"CPU 부하 높음 ({data.cpu_load*100:.0f}%)"})

    if data.imu_temp >= FCC_LIMITS["imu_temp_danger"]:
        alerts.append({"system": "FCC", "level": "danger", "msg": f"IMU 과열 ({data.imu_temp:.1f}℃)"})
    elif data.imu_temp >= FCC_LIMITS["imu_temp_warning"]:
        alerts.append({"system": "FCC", "level": "warning", "msg": f"IMU 온도 상승 ({data.imu_temp:.1f}℃)"})

    # 🛰️ GNSS
    if data.satellites <= GNSS_LIMITS["sat_danger"]:
        alerts.append({"system": "GNSS", "level": "danger", "msg": f"위성 신호 부족 ({data.satellites}개)"})
    elif data.satellites <= GNSS_LIMITS["sat_warning"]:
        alerts.append({"system": "GNSS", "level": "warning", "msg": f"위성 신호 약함 ({data.satellites}개)"})

    if data.hdop >= GNSS_LIMITS["hdop_danger"]:
        alerts.append({"system": "GNSS", "level": "danger", "msg": f"HDOP 높음 ({data.hdop:.2f})"})
    elif data.hdop >= GNSS_LIMITS["hdop_warning"]:
        alerts.append({"system": "GNSS", "level": "warning", "msg": f"HDOP 상승 ({data.hdop:.2f})"})

    return alerts
