BATTERY_LIMITS = {
    "voltage_warning": 10.5,
    "voltage_danger": 9.8,
    "temp_warning": 50,
    "temp_danger": 60,
}

ESC_LIMITS = {
    "temp_warning": 70,
    "temp_danger": 85,
    "rpm_diff_warning": 0.1,  # ±10% 편차
}

FCC_LIMITS = {
    "cpu_warning": 0.8,
    "cpu_danger": 0.9,
    "imu_temp_warning": 60,
    "imu_temp_danger": 70,
}

GNSS_LIMITS = {
    "sat_warning": 7,
    "sat_danger": 5,
    "hdop_warning": 2.0,
    "hdop_danger": 2.5,
}
