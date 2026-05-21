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
    ├── DM4_3/
    └── DM4_6/

결과물:
    csv_output/
    ├── DM4_1/
    │   ├── log_001.csv
    │   ├── log_002.csv
    │   └── ...
    ├── DM4_2/
    ├── DM4_3/
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
DRONE_IDS  = ["DM4_1", "DM4_2", "DM4_3", "DM4_6"]  # 기체 ID


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


def convert_ulg_to_df(ulg_path: str) -> pd.DataFrame:
    """
    ulog 파일 1개를 27컬럼 DataFrame으로 변환.
    실패 시 None 반환.
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
            print(f"  ⚠️ 필수 토픽 없음: {missing}")
            return None

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

        return df

    except Exception as e:
        print(f"  ❌ 변환 오류: {e}")
        return None


# ── 메인 ──────────────────────────────────────────────
if __name__ == "__main__":
    print("=" * 55)
    print(" ulog → 27컬럼 CSV 변환 스크립트")
    print("=" * 55)
    print(f" 입력 폴더: {ULOG_DIR}")
    print(f" 출력 폴더: {OUTPUT_DIR}")
    print(f" 기체 IDs: {DRONE_IDS}")
    print()

    total_success = 0
    total_fail    = 0

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

            df = convert_ulg_to_df(ulg_path)
            if df is not None and len(df) > 100:
                # 헤더 없이 저장 (학습 코드가 header=None으로 읽음)
                df.to_csv(csv_path, index=False, header=False)
                print(f" ✅ ({len(df)}행)")
                success += 1
            else:
                if df is not None:
                    print(f" ⚠️ 데이터 너무 적음 ({len(df)}행) → 스킵")
                fail += 1

        print(f"\n  [{drone_id}] 완료: 성공 {success}개 / 실패 {fail}개")
        total_success += success
        total_fail    += fail

    print(f"\n{'=' * 55}")
    print(f" 전체 완료: 성공 {total_success}개 / 실패 {total_fail}개")
    print(f" 결과물 위치: {OUTPUT_DIR}/")
    print("=" * 55)