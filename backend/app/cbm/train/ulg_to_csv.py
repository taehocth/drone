"""
ulg_to_csv.py

ulog 파일을 CNN-LSTM 학습용 27컬럼 CSV로 변환합니다.
기체별 폴더에서 ulog 파일을 읽어 CSV로 저장합니다.

사용법:
    python ulg_to_csv.py

폴더 구조 예시:
    ulog_files/
    ├── DM4_1/
    │   ├── log_001.ulg
    │   ├── log_002.ulg
    │   └── ...
    ├── DM4_2/
    ├── DM3/
    └── DM4_6/

결과물:
    csv_output/
    ├── DM4_1/
    │   ├── log_001.csv
    │   ├── log_002.csv
    │   └── ...
    ├── DM4_2/
    ├── DM3/
    └── DM4_6/
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


def convert_ulg_to_df(ulg_path: str):
    """
    ulog 파일 1개를 27컬럼 DataFrame으로 변환.
    실패 시 (None, 사유) 반환.
    """
    try:
        ulog = ULog(ulg_path)

        bat   = get_topic(ulog, 'battery_status')
        gps   = get_topic(ulog, 'vehicle_global_position')
        attsp = get_topic(ulog, 'vehicle_attitude_setpoint')
        att   = get_topic(ulog, 'vehicle_attitude')
        ekf   = get_topic(ulog, 'estimator_sensor_bias')
        gyro  = get_topic(ulog, 'sensor_gyro')
        accel = get_topic(ulog, 'sensor_accel')
        act   = get_topic(ulog, 'actuator_outputs')

        # 필수 토픽 없으면 스킵
        required = [bat, gps, attsp, att, ekf, gyro, accel, act]
        if any(t is None for t in required):
            missing = [n for t, n in zip(required, [
                'battery_status', 'vehicle_global_position',
                'vehicle_attitude_setpoint', 'vehicle_attitude',
                'estimator_sensor_bias', 'sensor_gyro',
                'sensor_accel', 'actuator_outputs'
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
            'sensor_accel_x':     accel.data['x'],
            'sensor_accel_y':     accel.data['y'],
            'sensor_accel_z':     accel.data['z'],
            'pwm1':               resample(ref_ts, act.data['timestamp'],   act.data['output[0]']),
            'pwm2':               resample(ref_ts, act.data['timestamp'],   act.data['output[1]']),
            'pwm3':               resample(ref_ts, act.data['timestamp'],   act.data['output[2]']),
            'pwm4':               resample(ref_ts, act.data['timestamp'],   act.data['output[3]']),
        })

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
    print(" ulog → 27컬럼 CSV 변환 스크립트")
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
                print(f" ✅ ({len(df)}행)")
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