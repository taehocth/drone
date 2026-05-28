# app/cbm/thresholds.py

BATTERY_LIMITS = {
    "voltage_warning": 10.5,
    "voltage_danger":  9.8,
    "temp_warning":    50,
    "temp_danger":     60,
}

ESC_LIMITS = {
    "temp_warning":      70,
    "temp_danger":       85,
    "rpm_diff_warning":  0.1,   # ±10% 편차
}

FCC_LIMITS = {
    "cpu_warning":      0.8,
    "cpu_danger":       0.9,
    "imu_temp_warning": 60,
    "imu_temp_danger":  70,
}

GNSS_LIMITS = {
    "sat_warning":  7,
    "sat_danger":   5,
    "hdop_warning": 2.0,
    "hdop_danger":  2.5,
}


# ════════════════════════════════════════════════════════
# Failsafe 임계값
# ════════════════════════════════════════════════════════

# ── 배터리 전압 (6S 기준, 정격 22.2V) ──────────────────
FAILSAFE_VOLTAGE = {
    "caution":  21.0,   # 셀당 3.50V — 방전 시작
    "warning":  19.8,   # 셀당 3.30V — 출력 저하 시작
    "danger":   18.6,   # 셀당 3.10V — 즉각 대응 필요
}

# ── 배터리 전류 (호버링 대비 상대 비율) ─────────────────
# 비행 초기 10초 평균을 기준 호버링 전류로 자동 설정
FAILSAFE_CURRENT_RATIO = {
    "caution":  1.30,   # 호버링 대비 +30%
    "warning":  1.60,   # 호버링 대비 +60%
    "danger":   2.00,   # 호버링 대비 +100%
}

# ── 자세 피치 / 롤 (절댓값 기준, 단위: degree) ──────────
# Pitch와 Roll 동일 기준 적용
# 두 축이 동시에 warning 이상이면 단계 상향 적용
FAILSAFE_ATTITUDE_DEG = {
    "caution":  15.0,   # 0.26 rad — 급기동 또는 강풍
    "warning":  30.0,   # 0.52 rad — 자세 제어 한계 접근
    "danger":   45.0,   # 0.79 rad — 추락 위험 임박
}

# ── 자이로 각속도 X/Y/Z (절댓값 기준, 단위: rad/s) ──────
# 세 축 중 하나라도 danger 진입 시 전체 danger 판정
FAILSAFE_GYRO = {
    "caution":  0.2,    # 가벼운 진동 또는 외란
    "warning":  0.5,    # 자세 제어 알고리즘 보정 한계
    "danger":   1.0,    # 자이로 고장 또는 기체 스핀
}

# ── 가속도 X/Y (절댓값 기준, 단위: m/s²) ────────────────
FAILSAFE_ACCEL_XY = {
    "caution":  2.0,    # 바람 또는 가벼운 진동
    "warning":  5.0,    # 강한 외란 또는 급기동
    "danger":   9.8,    # 충돌 또는 자유낙하 수준 (1G)
}

# ── 가속도 Z (정상 호버링 대비 편차, 단위: m/s²) ─────────
# 정상 호버링 시 약 -9.8m/s² 유지
# 절대값이 아닌 정상값 대비 편차 기준
FAILSAFE_ACCEL_Z = {
    "caution":  2.0,
    "warning":  5.0,
    "danger":   9.8,
}

# ── GPS 고도 (목표 고도 대비 이탈, 단위: m) ─────────────
# 절대 고도가 아닌 목표 고도 대비 이탈 기준
# 변화율 기준은 자유낙하 조기 감지용
FAILSAFE_ALTITUDE = {
    "caution":       3.0,   # 목표 고도 ±3m 이탈
    "warning":       7.0,   # 목표 고도 ±7m 이탈
    "danger":        15.0,  # 목표 고도 ±15m 이탈
    "rate_danger":   3.0,   # 1초당 변화율 > 3m/s
}

# ── 모터 PWM 편차 (4개 모터 max-min, 단위: μs) ───────────
# 개별 절대값이 아닌 4개 모터 간 상대 편차 기준
FAILSAFE_PWM = {
    "caution":      100,    # 미세한 모터 불균형
    "warning":      200,    # 한 모터 이상 가능성
    "danger":       350,    # 모터 고장 또는 프로펠러 이탈 수준
    "single_high":  1900,   # 단일 모터 상한
    "single_low":   1100,   # 단일 모터 하한
}

# ── Failsafe 단계별 점수 ─────────────────────────────────
FAILSAFE_SCORE = {
    "caution":  1,
    "warning":  2,
    "danger":   3,
}

# ── Failsafe 총점 임계값 ─────────────────────────────────
FAILSAFE_TOTAL = {
    "monitor":  1,   # 1~3점: 모니터링 강화 + 운용자 알람
    "rtl":      4,   # 4~6점: RTL 귀환 권고
    "land":     7,   # 7점 이상: 즉시 착륙 권고
}

# ── 히스테리시스 유예 시간 (초) ──────────────────────────
# 단계 하락 시 즉각 해제하지 않고 유예 시간 적용
# 플리커링(경계값 근처 반복 발동) 방지
FAILSAFE_HYSTERESIS_SEC = 10