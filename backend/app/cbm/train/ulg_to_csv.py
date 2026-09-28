"""
ulg_to_csv.py

ulog 파일을 CNN-LSTM 학습용 42컬럼 CSV로 변환합니다.
기체별 폴더에서 ulog 파일을 읽어 CSV로 저장합니다.

[컬럼 구성]
  0~26   원본 27컬럼 (순서·내용 유지 — 기존 학습·배포 호환)
  27~30  pwm_dev1~4      : 각 모터 출력 − 4모터 평균 (추력 비대칭)
  31~33  gyro_vib_x/y/z  : 자이로 1초 창 표준편차 (진동) — sensor_combined(고주파) 기반
  34~36  accel_vib_x/y/z : 가속도 1초 창 표준편차 (진동) — 사고 보고서상 가장 선명한 조기 신호
  37     accel_vib_metric: PX4 vehicle_imu_status.accel_vibration_metric
  38     gyro_vib_metric : PX4 vehicle_imu_status.gyro_vibration_metric
  39~41  rate_integ_roll/pitch/yaw : 각속도 제어기 적분항 (rate_ctrl_status)
                          — 제어기가 지속 외란을 얼마나 흡수하고 있는지. 한계 ±0.30.

[v3 변경 — 배터리 인스턴스 자동 선택]
  battery_status 가 여러 인스턴스일 때 가장 높은 평균 전압을 가진 인스턴스를 사용.
  (DM4_1 사고 로그: 인스턴스0 = 0.19V(미연결), 인스턴스1 = 46.5V(실제 12S 배터리)
   → 기존 스크립트는 인스턴스0 만 읽어 volt 가 0.2V 로 학습되던 결함 수정)

⚠️ 학습에 쓰려면 csv_output 의 "모든" CSV가 42컬럼이어야 합니다 → 전체 재변환 필요.
   신규 토픽(rate_ctrl_status, vehicle_imu_status)이 없는 로그는 제외되며 사유가 출력됩니다.

사용법:
    python ulg_to_csv.py

폴더 구조 예시:
    ulog_files/
    ├── DM4_1/
    │   ├── log_001.ulg
    │   └── ...
    ├── DM4_2/
    ├── DM3/
    └── DM4_6/

결과물:
    csv_output/
    ├── DM4_1/
    │   ├── log_001.csv   (34컬럼, 헤더 없음)
    │   └── ...
    └── ...
"""

import os
import glob
import numpy as np
import pandas as pd
from pyulog import ULog

# ── 설정 ──────────────────────────────────────────────
ULOG_DIR   = "ulog_files"   # ulog 파일이 있는 폴더
OUTPUT_DIR = "csv_output"   # 변환된 CSV 저장 폴더
DRONE_IDS = ["DM4_1", "DM4_2", "DM3", "DM4_6"] # 기체 ID

# ── 파생 피처 설정 ─────────────────────────────────────
VIB_WINDOW_SEC = 1.0   # 자이로 진동 지표의 이동 표준편차 윈도우 (초)

# ── 품질 필터 설정 ─────────────────────────────────────
MIN_ROWS           = 500     # 최소 행 수 (너무 짧은 로그 제외)
MIN_GPS_STD        = 0.0001  # GPS 변화량 최소값 (이동거리 너무 짧은 로그 제외)
MAX_NULL_RATIO     = 0.05    # 결측치 허용 비율 (5% 초과 시 제외)
MAX_GAP_SEC        = 5.0     # 타임스탬프 최대 허용 gap (초) - LTE 끊김 감지


# ── 헬퍼 함수 ─────────────────────────────────────────
def get_topic(ulog, name, multi_id=0):
    count = 0
    for d in ulog.data_list:
        if d.name == name:
            if count == multi_id:
                return d
            count += 1
    return None


def get_best_battery(ulog):
    """battery_status 인스턴스 중 평균 전압이 가장 높은(=실제 연결된) 것을 선택."""
    best, best_v = None, -1.0
    for d in ulog.data_list:
        if d.name == 'battery_status':
            try:
                v = float(np.nanmean(d.data['voltage_v']))
            except Exception:
                v = -1.0
            if v > best_v:
                best, best_v = d, v
    return best


def windowed_std(ts_ref, ts_hr, values_hr, win_us=1_000_000):
    """
    고주파(ts_hr, values_hr) 신호에 대해, 기준 시점 ts_ref 각각의
    [t - win, t] 구간 표준편차를 계산 (진동 세기). 누적합으로 벡터화.
    → 사고 보고서의 '1초 창 고주파 진동 RMS' 와 같은 정의.
    """
    v = np.asarray(values_hr, dtype=np.float64)
    ts_hr = np.asarray(ts_hr)
    csum  = np.concatenate([[0.0], np.cumsum(v)])
    csum2 = np.concatenate([[0.0], np.cumsum(v * v)])
    hi = np.searchsorted(ts_hr, ts_ref, side='right')
    lo = np.searchsorted(ts_hr, ts_ref - win_us, side='left')
    n  = np.maximum(hi - lo, 1)
    mean = (csum[hi] - csum[lo]) / n
    var  = (csum2[hi] - csum2[lo]) / n - mean * mean
    out  = np.sqrt(np.maximum(var, 0.0))
    out[(hi - lo) < 2] = 0.0   # 샘플 부족 구간은 0
    return out


def resample(ts_ref, ts_src, values):
    """ts_src 기준 values를 ts_ref에 nearest 보간"""
    indices = np.searchsorted(ts_src, ts_ref, side='left')
    indices = np.clip(indices, 0, len(ts_src) - 1)
    return values[indices]


def check_quality(df, gyro_ts) -> tuple[bool, str]:
    """
    DataFrame 품질 검사.
    반환: (통과 여부, 사유)
    """
    # 1. 최소 행 수 검사
    if len(df) < MIN_ROWS:
        return False, f"행 수 부족 ({len(df)}행 < {MIN_ROWS}행)"

    # 2. 결측치 비율 검사
    null_ratio = df.isnull().sum().sum() / (len(df) * len(df.columns))
    if null_ratio > MAX_NULL_RATIO:
        return False, f"결측치 과다 ({null_ratio*100:.1f}% > {MAX_NULL_RATIO*100:.0f}%)"

    # 3. GPS 이동거리 검사 (DM3 짧은 로그 제외)
    gps_std = df['esti_gps_pos_north'].std() + df['esti_gps_pos_east'].std()
    if gps_std < MIN_GPS_STD:
        return False, f"이동거리 너무 짧음 (GPS std={gps_std:.6f} < {MIN_GPS_STD})"

    # 4. 타임스탬프 gap 검사 (DM4_1 LTE 끊김 감지)
    ts_diff = np.diff(gyro_ts) / 1e6  # microseconds → seconds
    max_gap = ts_diff.max()
    if max_gap > MAX_GAP_SEC:
        return False, f"LTE 끊김 감지 (최대 gap={max_gap:.1f}초 > {MAX_GAP_SEC}초)"

    return True, "OK"


def add_derived_features(df: pd.DataFrame, ref_ts: np.ndarray, scomb=None) -> pd.DataFrame:
    """
    파생 피처 7개를 컬럼 27~33 위치에 추가.

    - pwm_dev1~4 : 각 모터 출력 − 4모터 평균.
        호버/순항에서는 0 근처의 느린 신호. 암대 풀림·모터 열화 등으로
        추력 비대칭이 생기면 특정 모터의 편차가 지속적으로 벌어짐.
        (원시 pwm 의 고주파 성분은 평균을 빼면서 상쇄됨)
    - gyro_vib_x/y/z : 자이로 각속도의 이동 표준편차(윈도우 VIB_WINDOW_SEC).
        순시 각속도는 예측 불가한 고주파지만 "진동의 세기"는 천천히 변함.
        결합부 헐거움 → 진동 레벨 상승을 저주파 신호로 요약.
    """
    # 샘플링 주파수 추정 → 초 단위 윈도우를 샘플 수로 환산
    dt = np.median(np.diff(ref_ts)) / 1e6  # seconds
    fs = (1.0 / dt) if dt > 0 else 10.0
    win = max(5, int(round(fs * VIB_WINDOW_SEC)))

    # 27~30: 모터 출력 편차
    pwm_mean = (df['pwm1'] + df['pwm2'] + df['pwm3'] + df['pwm4']) / 4.0
    for i in range(1, 5):
        df[f'pwm_dev{i}'] = df[f'pwm{i}'] - pwm_mean

    # 31~36: 진동 지표 — 1초 창 표준편차
    #   sensor_gyro/sensor_accel 은 로깅 프로파일에 따라 1Hz 로 다운샘플되어 있어
    #   그 위에서 계산한 std 는 고주파 진동을 담지 못함. sensor_combined(~167Hz)가
    #   있으면 그 고주파 원본으로 계산 (사고 보고서의 진동 RMS 정의와 동일).
    if scomb is not None:
        ts_hr = scomb.data['timestamp']
        for i, ax in enumerate(('x', 'y', 'z')):
            df[f'gyro_vib_{ax}'] = windowed_std(ref_ts, ts_hr, scomb.data[f'gyro_rad[{i}]'],
                                                win_us=int(VIB_WINDOW_SEC * 1e6))
        for i, ax in enumerate(('x', 'y', 'z')):
            df[f'accel_vib_{ax}'] = windowed_std(ref_ts, ts_hr, scomb.data[f'accelerometer_m_s2[{i}]'],
                                                 win_us=int(VIB_WINDOW_SEC * 1e6))
    else:
        # 대체: 1Hz 리샘플 신호의 이동 표준편차 (감도 낮음)
        for ax in ('x', 'y', 'z'):
            df[f'gyro_vib_{ax}'] = df[f'sensor_gyro_{ax}'].rolling(win, min_periods=1).std().fillna(0.0)
        for ax in ('x', 'y', 'z'):
            df[f'accel_vib_{ax}'] = df[f'sensor_accel_{ax}'].rolling(win, min_periods=1).std().fillna(0.0)

    return df


def convert_ulg_to_df(ulg_path: str):
    """
    ulog 파일 1개를 42컬럼 DataFrame으로 변환.
    실패 시 (None, 사유) 반환.
    """
    try:
        ulog = ULog(ulg_path)

        bat   = get_best_battery(ulog)          # v3: 실제 연결된 배터리 인스턴스
        gps   = get_topic(ulog, 'vehicle_global_position')
        attsp = get_topic(ulog, 'vehicle_attitude_setpoint')
        att   = get_topic(ulog, 'vehicle_attitude')
        ekf   = get_topic(ulog, 'estimator_sensor_bias')
        gyro  = get_topic(ulog, 'sensor_gyro')
        accel = get_topic(ulog, 'sensor_accel')
        act   = get_topic(ulog, 'actuator_outputs')
        rcs   = get_topic(ulog, 'rate_ctrl_status')       # v3: 제어기 적분항
        imus  = get_topic(ulog, 'vehicle_imu_status')     # v3: PX4 진동 메트릭
        scomb = get_topic(ulog, 'sensor_combined')        # v3: 고주파 IMU (진동 계산용, 없으면 1Hz 대체)

        # 필수 토픽 없으면 스킵
        required = [bat, gps, attsp, att, ekf, gyro, accel, act, rcs, imus]
        if any(t is None for t in required):
            missing = [n for t, n in zip(required, [
                'battery_status', 'vehicle_global_position',
                'vehicle_attitude_setpoint', 'vehicle_attitude',
                'estimator_sensor_bias', 'sensor_gyro',
                'sensor_accel', 'actuator_outputs',
                'rate_ctrl_status', 'vehicle_imu_status'
            ]) if t is None]
            return None, f"필수 토픽 없음: {missing}"

        # 기준 타임스탬프: sensor_gyro
        ref_ts = gyro.data['timestamp']

        # 쿼터니언 → 오일러
        q0 = resample(ref_ts, att.data['timestamp'], att.data['q[0]'])
        q1 = resample(ref_ts, att.data['timestamp'], att.data['q[1]'])
        q2 = resample(ref_ts, att.data['timestamp'], att.data['q[2]'])
        q3 = resample(ref_ts, att.data['timestamp'], att.data['q[3]'])
        yaw   = np.arctan2(2*(q0*q3+q1*q2), 1-2*(q2**2+q3**2))
        pitch = np.arcsin(np.clip(2*(q0*q2-q3*q1), -1, 1))
        roll  = np.arctan2(2*(q0*q1+q2*q3), 1-2*(q1**2+q2**2))

        df = pd.DataFrame({
            'volt':               resample(ref_ts, bat.data['timestamp'],   bat.data['voltage_filtered_v']),
            'current':            resample(ref_ts, bat.data['timestamp'],   bat.data['current_filtered_a']),
            'esti_gps_pos_north': resample(ref_ts, gps.data['timestamp'],   gps.data['lat']),
            'esti_gps_pos_east':  resample(ref_ts, gps.data['timestamp'],   gps.data['lon']),
            'esti_gps_pos_down':  resample(ref_ts, gps.data['timestamp'],   gps.data['alt']),
            'att_cmd_yaw':        resample(ref_ts, attsp.data['timestamp'], attsp.data['yaw_body']),
            'att_cmd_pitch':      resample(ref_ts, attsp.data['timestamp'], attsp.data['pitch_body']),
            'att_cmd_roll':       resample(ref_ts, attsp.data['timestamp'], attsp.data['roll_body']),
            'att_state_yaw':      yaw,
            'att_state_pitch':    pitch,
            'att_state_roll':     roll,
            'esti_gyro_bias_x':   resample(ref_ts, ekf.data['timestamp'],   ekf.data['gyro_bias[0]']),
            'esti_gyro_bias_y':   resample(ref_ts, ekf.data['timestamp'],   ekf.data['gyro_bias[1]']),
            'esti_gyro_bias_z':   resample(ref_ts, ekf.data['timestamp'],   ekf.data['gyro_bias[2]']),
            'esti_accel_bias_x':  resample(ref_ts, ekf.data['timestamp'],   ekf.data['accel_bias[0]']),
            'esti_accel_bias_y':  resample(ref_ts, ekf.data['timestamp'],   ekf.data['accel_bias[1]']),
            'esti_accel_bias_z':  resample(ref_ts, ekf.data['timestamp'],   ekf.data['accel_bias[2]']),
            'sensor_gyro_x':      gyro.data['x'],
            'sensor_gyro_y':      gyro.data['y'],
            'sensor_gyro_z':      gyro.data['z'],
            # v3: 가속도는 자이로와 샘플 수가 다를 수 있어 기준 타임스탬프로 리샘플
            'sensor_accel_x':     resample(ref_ts, accel.data['timestamp'], accel.data['x']),
            'sensor_accel_y':     resample(ref_ts, accel.data['timestamp'], accel.data['y']),
            'sensor_accel_z':     resample(ref_ts, accel.data['timestamp'], accel.data['z']),
            'pwm1':               resample(ref_ts, act.data['timestamp'],   act.data['output[0]']),
            'pwm2':               resample(ref_ts, act.data['timestamp'],   act.data['output[1]']),
            'pwm3':               resample(ref_ts, act.data['timestamp'],   act.data['output[2]']),
            'pwm4':               resample(ref_ts, act.data['timestamp'],   act.data['output[3]']),
        })

        # ── 파생 피처 추가 (컬럼 27~36) ──────────────────
        df = add_derived_features(df, ref_ts, scomb)

        # ── v3 신규 원천 피처 (컬럼 37~41) ────────────────
        df['accel_vib_metric'] = resample(ref_ts, imus.data['timestamp'], imus.data['accel_vibration_metric'])
        df['gyro_vib_metric']  = resample(ref_ts, imus.data['timestamp'], imus.data['gyro_vibration_metric'])
        df['rate_integ_roll']  = resample(ref_ts, rcs.data['timestamp'],  rcs.data['rollspeed_integ'])
        df['rate_integ_pitch'] = resample(ref_ts, rcs.data['timestamp'],  rcs.data['pitchspeed_integ'])
        df['rate_integ_yaw']   = resample(ref_ts, rcs.data['timestamp'],  rcs.data['yawspeed_integ'])

        # 품질 검사
        passed, reason = check_quality(df, ref_ts)
        if not passed:
            return None, reason

        return df, "OK"

    except Exception as e:
        return None, f"변환 오류: {e}"


# ── 메인 ──────────────────────────────────────────────
if __name__ == "__main__":
    print("=" * 55)
    print(" ulog → 42컬럼 CSV 변환 스크립트 (v3)")
    print(" 27 원본 + pwm_dev4 + gyro_vib3 + accel_vib3 + PX4 진동메트릭2 + 제어기 적분항3")
    print(" 배터리: 다중 인스턴스 중 실제 연결(최고 전압) 채널 자동 선택")
    print("=" * 55)
    print(f" 입력 폴더: {ULOG_DIR}")
    print(f" 출력 폴더: {OUTPUT_DIR}")
    print(f" 기체 IDs: {DRONE_IDS}")
    print()
    print("── 품질 필터 설정 ──")
    print(f" 최소 행 수:        {MIN_ROWS}행")
    print(f" GPS 최소 이동:     {MIN_GPS_STD}")
    print(f" 결측치 허용:       {MAX_NULL_RATIO*100:.0f}%")
    print(f" LTE 끊김 감지 gap: {MAX_GAP_SEC}초")
    print(f" 진동 지표 윈도우:  {VIB_WINDOW_SEC}초")
    print()

    total_success = 0
    total_fail    = 0
    skip_reasons  = {}  # 제외 사유 집계

    for drone_id in DRONE_IDS:
        input_dir  = os.path.join(ULOG_DIR, drone_id)
        output_dir = os.path.join(OUTPUT_DIR, drone_id)

        if not os.path.exists(input_dir):
            print(f"[{drone_id}] 폴더 없음 → 스킵: {input_dir}")
            continue

        os.makedirs(output_dir, exist_ok=True)
        ulg_files = sorted(glob.glob(os.path.join(input_dir, "*.ulg")))

        print(f"\n[{drone_id}] ulog 파일 수: {len(ulg_files)}개")
        print("-" * 40)

        success = 0
        fail    = 0

        for ulg_path in ulg_files:
            fname     = os.path.basename(ulg_path)
            csv_fname = fname.replace(".ulg", ".csv")
            csv_path  = os.path.join(output_dir, csv_fname)

            print(f"  변환 중: {fname} ...", end="")

            df, reason = convert_ulg_to_df(ulg_path)
            if df is not None:
                df.to_csv(csv_path, index=False, header=False)
                print(f" ✅ ({len(df)}행, {len(df.columns)}컬럼)")
                success += 1
            else:
                print(f" ⚠️ 제외 → {reason}")
                skip_reasons[reason] = skip_reasons.get(reason, 0) + 1
                fail += 1

        print(f"\n  [{drone_id}] 완료: 성공 {success}개 / 제외 {fail}개")
        total_success += success
        total_fail    += fail

    print(f"\n{'=' * 55}")
    print(f" 전체 완료: 성공 {total_success}개 / 제외 {total_fail}개")
    print(f" 결과물 위치: {OUTPUT_DIR}/")
    if skip_reasons:
        print()
        print(" ── 제외 사유 요약 ──")
        for reason, count in sorted(skip_reasons.items(), key=lambda x: -x[1]):
            print(f"  {count}개 → {reason}")
    print("=" * 55)