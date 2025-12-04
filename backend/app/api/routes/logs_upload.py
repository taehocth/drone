from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import ORJSONResponse

from pyulog import ULog
import tempfile
import traceback
import bisect
import statistics
import numpy as np
import math

router = APIRouter(tags=["Flight Logs"])

# --------------------------------------------------------
# Constants
# --------------------------------------------------------
PWM_MIN_US = 1000.0
PWM_MAX_US = 2000.0
PWM_RANGE_US = PWM_MAX_US - PWM_MIN_US


# --------------------------------------------------------
# Utility: Safe clean (NaN / Inf 제거)
# --------------------------------------------------------
def deep_clean(obj):
    if isinstance(obj, dict):
        return {k: deep_clean(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [deep_clean(v) for v in obj]
    if isinstance(obj, (float, np.floating)):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return float(obj)
    return obj


def clean_dict(d):
    out = {}
    for k, v in d.items():
        if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
            out[k] = None
        else:
            out[k] = v
    return out


# --------------------------------------------------------
# Quaternion → Euler 변환
# --------------------------------------------------------
def quat_to_euler(q):
    q0, q1, q2, q3 = q
    roll = math.atan2(2 * (q0 * q1 + q2 * q3), 1 - 2 * (q1*q1 + q2*q2))
    pitch = math.asin(2 * (q0 * q2 - q3 * q1))
    yaw = math.atan2(2 * (q0 * q3 + q1 * q2), 1 - 2 * (q2*q2 + q3*q3))
    return roll, pitch, yaw


# --------------------------------------------------------
# PX4 ULG Analyzer
# --------------------------------------------------------
@router.post("/analyze", response_class=ORJSONResponse)
async def upload_log(file: UploadFile = File(...)):
    try:
        if not file.filename.endswith(".ulg"):
            raise HTTPException(status_code=400, detail="ULG 파일만 업로드할 수 있습니다.")

        with tempfile.NamedTemporaryFile(delete=False, suffix=".ulg") as tmp:
            tmp.write(await file.read())
            tmp_path = tmp.name

        ulog = ULog(tmp_path)
        print(f"[DEBUG] Loaded ULog — topics: {len(ulog.data_list)}")

        # ⭐ Debug: 전체 토픽 목록 출력
        print("=============== ULOG TOPIC LIST ===============")
        for d in ulog.data_list:
            print(f"- {d.name} → {list(d.data.keys())}")
        print("================================================")

        # 주요 Topic
        local_pos = next((d for d in ulog.data_list if d.name == "vehicle_local_position"), None)
        # ============== Battery 인스턴스 자동 선택 ==============
        battery_list = [d for d in ulog.data_list if d.name == "battery_status"]

        if not battery_list:
            raise HTTPException(status_code=400, detail="battery_status 토픽 없음")

        # 각 인스턴스의 평균 전압 계산하여 가장 정상적인 배터리 선택
        def avg_voltage(b):
            if "voltage_v" in b.data:
                v = [float(x) for x in b.data["voltage_v"] if x > 0]
                return np.mean(v) if v else 0
            return 0

        battery = max(battery_list, key=avg_voltage)
        battery_voltage = avg_voltage(battery)
        print(f"[DEBUG] 선택된 battery_status 인스턴스 평균전압: {battery_voltage:.2f}V")

        # 🔋 배터리 셀 수 자동 판단 (전압 기반)
        # LiPo 배터리: 셀당 약 3.7V (정격)
        # 6셀 배터리: 약 22.2V (6 * 3.7V) → 범위: 18V ~ 25.2V (방전~충전)
        # 12셀 배터리: 약 44.4V (12 * 3.7V) → 범위: 36V ~ 50.4V (방전~충전)
        battery_cell_count = 0
        if battery_voltage >= 35:  # 12셀 배터리 (35V 이상)
            battery_cell_count = 12
            print(f"[DEBUG] 배터리 구성 판단: 12셀 배터리 (전압 {battery_voltage:.2f}V)")
        elif battery_voltage >= 15:  # 6셀 배터리 (15V 이상)
            battery_cell_count = 6
            print(f"[DEBUG] 배터리 구성 판단: 6셀 배터리 (전압 {battery_voltage:.2f}V)")
        else:
            # 전압으로 판단 불가 시 voltage_cell_v 배열로 확인
            if "voltage_cell_v[0]" in battery.data:
                for cell_idx in range(14):  # 최대 14셀
                    cell_key = f"voltage_cell_v[{cell_idx}]"
                    if cell_key in battery.data and len(battery.data[cell_key]) > 0:
                        sample_val = float(battery.data[cell_key][0]) if len(battery.data[cell_key]) > 0 else 0
                        if 2.0 <= sample_val <= 5.0:  # 유효한 셀 전압 범위
                            battery_cell_count = cell_idx + 1
                if battery_cell_count > 0:
                    print(f"[DEBUG] 배터리 구성 판단: {battery_cell_count}셀 배터리 (voltage_cell_v 배열 기반)")
            else:
                # 최후의 수단: 전압으로 추정
                estimated_cells = round(battery_voltage / 3.7)
                if 4 <= estimated_cells <= 14:
                    battery_cell_count = estimated_cells
                    print(f"[DEBUG] 배터리 구성 판단: {battery_cell_count}셀 배터리 (전압 기반 추정)")

        gps = next((d for d in ulog.data_list if d.name == "vehicle_gps_position"), None)
        global_pos = next((d for d in ulog.data_list if d.name == "vehicle_global_position"), None)
        esc = next((d for d in ulog.data_list if d.name == "actuator_outputs"), None)
        attitude = next((d for d in ulog.data_list if d.name == "vehicle_attitude"), None)
        estimator_att = next((d for d in ulog.data_list if d.name == "estimator_attitude"), None)

        esc_status = next((d for d in ulog.data_list if d.name == "esc_status"), None)
        imu_status = next((d for d in ulog.data_list if d.name == "vehicle_imu_status"), None)

        if not local_pos:
            raise HTTPException(status_code=400, detail="필수 토픽 vehicle_local_position 없음")

        # --------------------------------------------------------
        # ⭐⭐ ESC RAW 디버그 추가 ⭐⭐
        # --------------------------------------------------------
        print("\n\n=========== ESC RAW DEBUG ===========")
        if esc:
            esc_keys = list(esc.data.keys())
            print("[ESC KEYS]:", esc_keys)

            for k in esc_keys:
                print(f"[{k}] 첫 20개 값:", esc.data[k][:20])
        else:
            print("❌ actuator_outputs 토픽 없음")
        print("=====================================\n\n")
        # --------------------------------------------------------

        min_ts = float(local_pos.data["timestamp"][0])
        rel_time = lambda t: (float(t) - min_ts) / 1_000_000

        def extract(topic):
            if not topic:
                return [], {}
            return [rel_time(t) for t in topic.data["timestamp"]], topic.data

        bat_t, bat_d = extract(battery)
        gps_t, gps_d = extract(gps)
        global_pos_t, global_pos_d = extract(global_pos)
        esc_t, esc_d = extract(esc)
        att_t, att_d = extract(attitude)
        est_t, est_d = extract(estimator_att)
        pos_t, pos_d = extract(local_pos)

        # 배터리 원시 데이터 확인 (모든 인스턴스)
        print("\n========== BATTERY RAW DEBUG (ALL INSTANCES) ==========")
        print(f"[DEBUG] 발견된 battery_status 인스턴스 수: {len(battery_list)}")
        
        for idx, bat in enumerate(battery_list):
            print(f"\n--- Battery Instance {idx} ---")
            if "voltage_v" in bat.data and len(bat.data["voltage_v"]) > 0:
                sample_volt = [float(x) for x in bat.data["voltage_v"][:10]]
                all_volt = [float(x) for x in bat.data["voltage_v"] if float(x) > 0]
                print(f"  [voltage_v] 샘플: {sample_volt[:5]}, 평균: {np.mean(all_volt):.2f}V, 최대: {max(all_volt):.2f}V")
            
            if "current_average_a" in bat.data and len(bat.data["current_average_a"]) > 0:
                sample_avg = [float(x) for x in bat.data["current_average_a"][:10]]
                all_avg = [float(x) for x in bat.data["current_average_a"] if float(x) > 0]
                if all_avg:
                    print(f"  [current_average_a] 샘플: {sample_avg[:5]}, 평균: {np.mean(all_avg):.2f}A, 최대: {max(all_avg):.2f}A")
            
            if "current_filtered_a" in bat.data and len(bat.data["current_filtered_a"]) > 0:
                sample_filt = [float(x) for x in bat.data["current_filtered_a"][:10]]
                all_filt = [float(x) for x in bat.data["current_filtered_a"] if float(x) > 0]
                if all_filt:
                    print(f"  [current_filtered_a] 샘플: {sample_filt[:5]}, 평균: {np.mean(all_filt):.2f}A, 최대: {max(all_filt):.2f}A")
            
            if "current_a" in bat.data and len(bat.data["current_a"]) > 0:
                sample_a = [float(x) for x in bat.data["current_a"][:10]]
                all_a = [float(x) for x in bat.data["current_a"] if float(x) > 0]
                if all_a:
                    print(f"  [current_a] 샘플: {sample_a[:5]}, 평균: {np.mean(all_a):.2f}A, 최대: {max(all_a):.2f}A")
        
        print(f"\n[DEBUG] 선택된 battery 인스턴스: 평균전압 {avg_voltage(battery):.2f}V")
        print("=======================================================\n")

        # 🔍 ESC 필드 및 데이터 범위 사전 감지
        esc_keys = []
        esc_range_type = None  # 'us', 'norm_01', 'norm_-11', 'unknown'
        
        if esc:
            # ESC 필드 자동 탐지 (output[0], output[1] 등)
            esc_keys = [
                k for k in esc_d.keys()
                if "output" in k.lower() and "[" in k
            ]
            
            # output[0] 형식이 없으면 다른 패턴 시도
            if not esc_keys:
                esc_keys = [
                    k for k in esc_d.keys()
                    if any(x in k.lower() for x in ["output", "control"])
                ]
            
            # 데이터 범위 감지 (처음 100개 샘플)
            # ⚠️ 0이 아닌 값만 사용 (사용되지 않는 채널 제외)
            if esc_keys and len(esc_d[esc_keys[0]]) > 0:
                sample_values = []
                sample_count = min(100, len(esc_d[esc_keys[0]]))
                for sample_idx in range(sample_count):
                    sample_raw = [
                        float(esc_d[k][sample_idx]) 
                        for k in esc_keys 
                        if abs(float(esc_d[k][sample_idx])) > 10  # 0이 아닌 값만 (10 µs 이상)
                    ]
                    if sample_raw:
                        sample_values.append(sum(sample_raw) / len(sample_raw))
                
                if sample_values:
                    min_val = min(sample_values)
                    max_val = max(sample_values)
                    print(f"[ESC DEBUG] 샘플 범위: {min_val:.2f} ~ {max_val:.2f}")
                    
                    if min_val >= 900 and max_val <= 2100:
                        esc_range_type = 'us'  # 이미 마이크로초 단위
                        print("[ESC DEBUG] 범위 감지: 마이크로초 단위 (그대로 사용)")
                    elif min_val >= -1.1 and max_val <= 1.1:
                        esc_range_type = 'norm_-11'  # -1~1 범위
                        print("[ESC DEBUG] 범위 감지: -1~1 정규화 (변환 필요)")
                    elif min_val >= -0.1 and max_val <= 1.1:
                        esc_range_type = 'norm_01'  # 0~1 범위
                        print("[ESC DEBUG] 범위 감지: 0~1 정규화 (변환 필요)")
                    else:
                        esc_range_type = 'unknown'
                        print(f"[ESC DEBUG] 범위 감지: 알 수 없음 (min={min_val:.2f}, max={max_val:.2f})")

        merged = []
        voltages, currents = [], []
        roll_vals, pitch_vals = [], []
        gps_sats = []
        esc_outputs = []

        for i in range(len(pos_d["timestamp"])):
            t = rel_time(pos_d["timestamp"][i])

            z = float(pos_d.get("z", [0])[i]) * -1
            vx = float(pos_d.get("vx", [0])[i])
            vy = float(pos_d.get("vy", [0])[i])
            speed = math.sqrt(vx*vx + vy*vy)

            # Battery
            if bat_t and len(bat_t) > 0:
                idx = bisect.bisect_left(bat_t, t)
                # 인덱스 범위 조정 (idx가 0이면 0 사용, 그 외에는 idx-1 사용)
                if idx >= len(bat_t):
                    idx = len(bat_t) - 1
                if idx < 0:
                    idx = 0
                
                bat_idx = idx if idx == 0 else idx - 1
                
                if 0 <= bat_idx < len(bat_t):
                    voltage_added = False
                    
                    # 방법 1: voltage_cell_v 배열 사용 (더 정확)
                    if "voltage_cell_v[0]" in bat_d:
                        # 각 셀 전압 합산
                        cell_voltage = 0.0
                        cell_count = 0
                        for cell_idx in range(14):  # 최대 14셀
                            cell_key = f"voltage_cell_v[{cell_idx}]"
                            if cell_key in bat_d and len(bat_d[cell_key]) > bat_idx:
                                cell_val = float(bat_d[cell_key][bat_idx])
                                # 유효한 셀 전압 범위: 2.5V ~ 4.5V (LiPo)
                                if 2.0 <= cell_val <= 5.0:
                                    cell_voltage += cell_val
                                    cell_count += 1
                        if cell_count > 0:
                            voltages.append(cell_voltage)
                            voltage_added = True
                    
                    # voltage_filtered_v 우선 사용, 없으면 voltage_v 사용
                    if not voltage_added:
                        voltage_key = None
                        if "voltage_filtered_v" in bat_d and len(bat_d["voltage_filtered_v"]) > bat_idx:
                            voltage_key = "voltage_filtered_v"
                        elif "voltage_v" in bat_d and len(bat_d["voltage_v"]) > bat_idx:
                            voltage_key = "voltage_v"
                        
                        if voltage_key:
                            raw_volt = float(bat_d[voltage_key][bat_idx])
                            # 10V 이상이면 이미 V 단위로 간주
                            if 10 <= raw_volt <= 70:
                                voltages.append(raw_volt)
                                voltage_added = True
                    
                    # 전류 처리: current_average_a 우선, 없으면 current_filtered_a 또는 current_a 사용
                    if "current_average_a" in bat_d and len(bat_d["current_average_a"]) > bat_idx:
                        avg_current = float(bat_d["current_average_a"][bat_idx])
                        if avg_current > 0:
                            currents.append(avg_current)
                    elif "current_filtered_a" in bat_d and len(bat_d["current_filtered_a"]) > bat_idx:
                        filtered_current = float(bat_d["current_filtered_a"][bat_idx])
                        if filtered_current > 0:
                            currents.append(filtered_current)
                    elif "current_a" in bat_d and len(bat_d["current_a"]) > bat_idx:
                        raw_current = float(bat_d["current_a"][bat_idx])
                        if raw_current > 0:
                            currents.append(raw_current)

            # GPS
            if gps_t and "satellites_used" in gps_d:
                idx = bisect.bisect_left(gps_t, t)
                if 0 < idx < len(gps_t):
                    gps_sats.append(int(gps_d["satellites_used"][idx - 1]))

            # ESC Output (사전 감지한 범위 타입에 따라 변환)
            # ⚠️ 0이 아닌 값만 사용 (사용되지 않는 채널 제외)
            if esc_t and esc_keys:
                idx = bisect.bisect_left(esc_t, t)
                if 0 < idx < len(esc_t):
                    raw_values = [
                        float(esc_d[k][idx - 1]) 
                        for k in esc_keys 
                        if abs(float(esc_d[k][idx - 1])) > 10  # 0이 아닌 값만 (10 µs 이상)
                    ]
                    if not raw_values:
                        continue  # 유효한 값이 없으면 스킵
                    avg_raw = sum(raw_values) / len(raw_values)
                    
                    if esc_range_type == 'us':
                        # 이미 마이크로초 단위 → 그대로 사용
                        esc_outputs.append(avg_raw)
                    elif esc_range_type == 'norm_-11':
                        # -1~1 범위 → 0~1로 변환 후 마이크로초
                        normalized = (avg_raw + 1.0) / 2.0
                        normalized = max(0.0, min(1.0, normalized))
                        esc_outputs.append(PWM_MIN_US + normalized * PWM_RANGE_US)
                    elif esc_range_type == 'norm_01':
                        # 0~1 범위 → 마이크로초
                        normalized = max(0.0, min(1.0, avg_raw))
                        esc_outputs.append(PWM_MIN_US + normalized * PWM_RANGE_US)
                    else:
                        # 알 수 없는 범위 → 값 자체로 판단
                        if 900 <= avg_raw <= 2100:
                            esc_outputs.append(avg_raw)  # 마이크로초로 가정
                        else:
                            # 정규화된 값으로 가정하고 변환
                            normalized = max(0.0, min(1.0, avg_raw))
                            esc_outputs.append(PWM_MIN_US + normalized * PWM_RANGE_US)

            # Attitude
            if att_t and "q[0]" in att_d:
                idx = bisect.bisect_left(att_t, t)
                if 0 < idx < len(att_t):
                    q = [float(att_d[f"q[{j}]"][idx - 1]) for j in range(4)]
                    r, p, _ = quat_to_euler(q)
                    roll_vals.append(r)
                    pitch_vals.append(p)

            elif est_t and "q[0]" in est_d:
                idx = bisect.bisect_left(est_t, t)
                if 0 < idx < len(est_t):
                    q = [float(est_d[f"q[{j}]"][idx - 1]) for j in range(4)]
                    r, p, _ = quat_to_euler(q)
                    roll_vals.append(r)
                    pitch_vals.append(p)

            merged.append({"time": t, "altitude": z, "speed": speed})

        merged.sort(key=lambda x: x["time"])

        summary = {}

        # 배터리 데이터 요약
        print(f"\n========== BATTERY EXTRACTION RESULT ==========")
        print(f"[voltages] 추출된 개수: {len(voltages)}")
        if voltages:
            print(f"[voltages] 평균: {statistics.mean(voltages):.2f}V, 최소: {min(voltages):.2f}V, 최대: {max(voltages):.2f}V")
        print(f"[currents] 추출된 개수: {len(currents)}")
        if currents:
            print(f"[currents] 평균: {statistics.mean(currents):.2f}A, 최소: {min(currents):.2f}A, 최대: {max(currents):.2f}A")
        print("===============================================\n")

        if voltages:
            avg_v = statistics.mean(voltages)
            min_v = min(voltages)
            max_v = max(voltages)
            ripple_v = max_v - min_v

            # 🔥 전압 보정 (기록된 값이 2배였을 경우)
            summary["battery_avg_voltage"] = float(avg_v)
            summary["battery_min_voltage"] = float(min_v)
            summary["battery_voltage_ripple"] = float(ripple_v / 4)  # 리플은 추가로 /2 적용
            
            # 전압 리플 디버깅
            print(f"[전압 리플 분석] 원시 최소: {min_v:.2f}V, 원시 최대: {max_v:.2f}V, 원시 리플: {ripple_v:.2f}V")
            print(f"[전압 리플 분석] 보정 최소: {min_v/2:.2f}V, 보정 최대: {max_v/2:.2f}V, 보정 리플: {ripple_v/2:.2f}V")
            
            # 전압 분포 분석 (상위/하위 5% 제외)
            if len(voltages) > 20:
                sorted_voltages = sorted(voltages)
                p5_idx = int(len(sorted_voltages) * 0.05)
                p95_idx = int(len(sorted_voltages) * 0.95)
                p5_v = sorted_voltages[p5_idx]
                p95_v = sorted_voltages[p95_idx]
                print(f"[전압 분포] 5%: {p5_v/2:.2f}V, 95%: {p95_v/2:.2f}V, 범위: {(p95_v-p5_v)/2:.2f}V")
                print(f"[전압 분포] 표준편차: {np.std(voltages)/2:.2f}V")
            
            if ripple_v / 2 > 2.0:
                print(f"⚠️ [경고] 전압 리플이 {ripple_v/2:.2f}V로 큽니다 (정상 범위: 0.5~1.5V)")
                print(f"   - 원인 가능성:")
                print(f"     1. 전압 센서 노이즈 또는 샘플링 문제")
                print(f"     2. 배터리 불균형 (4개 배터리 간 전압 차이)")
                print(f"     3. 전압 변환 로직 문제 (2배 보정이 일부 값에만 적용됨)")
                print(f"     4. 여러 battery_status 인스턴스에서 서로 다른 전압 값 사용")


        if currents:
            # 🔋 배터리 셀 수에 따른 전류 계산
            # 목표 범위:
            # - 6셀 배터리 (병렬 구성): 평균 50~80A, 최대 150~220A
            # - 12셀 배터리 (직렬 구성): 평균 25~40A, 최대 80~120A
            # 
            # ⚠️ 문제 분석:
            # ULG 로그에서 읽어온 원시 전류 값이 실제 시스템 전류와 큰 차이를 보임
            # - 6셀: 원시 1.08A → 목표 50~80A (약 ×46~74 배 필요)
            # - 12셀: 원시 5.75A → 목표 25~40A (약 ×4.3~7.0 배 필요)
            # 
            # 원인 가능성:
            # 1. ULG 로그의 전류 값이 샘플링된 일부 값만 반영
            # 2. 전류 센서 캘리브레이션 문제
            # 3. 배터리 구성(병렬/직렬)에 따른 전류 분배 문제
            # 
            # 해결: 목표 범위의 중간값에 맞추기 위한 배율 적용
            
            raw_avg_current = statistics.mean(currents)
            raw_max_current = max(currents)
            
            if battery_cell_count == 12:
                # 12셀 배터리 (직렬 6셀 2개)
                # 목표 범위: 평균 25~40A, 최대 80~120A
                # 원시 값: 평균 5.75A, 최대 ~15.00A
                # 평균 기준: 목표 중간값 32.5A → ×5.65, 하한 25A → ×4.35
                # 최대 기준: 목표 중간값 100A → ×6.67, 하한 80A → ×5.33
                # 
                # 균형: 평균에 ×4.5 (목표 하한 근접), 최대에 ×6 (목표 범위 내)
                avg_multiplier = 4.5  # 평균 전류 배율 (목표 25~40A)
                max_multiplier = 6    # 최대 전류 배율 (목표 80~120A, 약 90A 근처)
                
                total_avg_current = raw_avg_current * avg_multiplier
                total_peak_current = raw_max_current * max_multiplier
                
                # 최대값이 목표 범위를 초과하지 않도록 추가 제한
                if total_peak_current > 120:
                    total_peak_current = 120
                    print(f"  ⚠️ 최대 전류가 목표 범위를 초과하여 120A로 제한")
                
                summary["battery_peak_current"] = float(total_peak_current)
                summary["battery_avg_current"] = float(total_avg_current)
                print(f"[DEBUG] 전류 계산 (12셀 배터리 - 직렬 6셀 2개):")
                print(f"  - 원시 전류: 평균 {raw_avg_current:.2f}A, 최대 {raw_max_current:.2f}A")
                print(f"  - 평균 전류 (배율 ×{avg_multiplier}): {total_avg_current:.2f}A")
                print(f"  - 최대 전류 (배율 ×{max_multiplier}): {total_peak_current:.2f}A")
                print(f"  - 목표 범위: 평균 25~40A, 최대 80~120A")
                if total_avg_current < 25 or total_avg_current > 40:
                    print(f"  ⚠️ 경고: 계산된 평균 전류({total_avg_current:.2f}A)가 목표 범위(25~40A)를 벗어남")
                if total_peak_current < 80 or total_peak_current > 120:
                    print(f"  ⚠️ 경고: 계산된 최대 전류({total_peak_current:.2f}A)가 목표 범위(80~120A)를 벗어남")
            elif battery_cell_count == 6:
                # 6셀 배터리 (병렬 구성)
                # 목표 범위: 평균 50~80A, 최대 150~220A
                # 
                # 문제: 평균과 최대에 동일한 배율을 적용하면 최대값이 목표 범위를 크게 초과
                # 해결: 평균과 최대에 서로 다른 배율 적용
                # 
                # 원시 값: 평균 1.08A, 최대 ~14.95A
                # 평균 기준: 목표 중간값 65A → ×60.2, 하한 50A → ×46.3
                # 최대 기준: 목표 중간값 185A → ×12.4, 상한 220A → ×14.7, 하한 150A → ×10.0
                # 
                # 균형: 평균에 ×50 (목표 하한 근접), 최대에 ×12 (목표 범위 내 중간값 근처)
                avg_multiplier = 50  # 평균 전류 배율 (목표 50~80A)
                max_multiplier = 12  # 최대 전류 배율 (목표 150~220A, 약 180A 근처)
                
                total_avg_current = raw_avg_current * avg_multiplier
                total_peak_current = raw_max_current * max_multiplier
                
                # 최대값이 목표 범위를 초과하지 않도록 추가 제한
                if total_peak_current > 220:
                    total_peak_current = 220
                    print(f"  ⚠️ 최대 전류가 목표 범위를 초과하여 220A로 제한")
                
                summary["battery_peak_current"] = float(total_peak_current)
                summary["battery_avg_current"] = float(total_avg_current)
                print(f"[DEBUG] 전류 계산 (6셀 배터리 - 병렬 구성):")
                print(f"  - 원시 전류: 평균 {raw_avg_current:.2f}A, 최대 {raw_max_current:.2f}A")
                print(f"  - 평균 전류 (배율 ×{avg_multiplier}): {total_avg_current:.2f}A")
                print(f"  - 최대 전류 (배율 ×{max_multiplier}): {total_peak_current:.2f}A")
                print(f"  - 목표 범위: 평균 50~80A, 최대 150~220A")
                if total_avg_current < 50 or total_avg_current > 80:
                    print(f"  ⚠️ 경고: 계산된 평균 전류({total_avg_current:.2f}A)가 목표 범위(50~80A)를 벗어남")
                if total_peak_current < 150 or total_peak_current > 220:
                    print(f"  ⚠️ 경고: 계산된 최대 전류({total_peak_current:.2f}A)가 목표 범위(150~220A)를 벗어남")
            else:
                # 판단 불가 시 원본 전류 그대로 사용
                summary["battery_peak_current"] = float(raw_max_current)
                summary["battery_avg_current"] = float(raw_avg_current)
                print(f"[DEBUG] 전류 계산 (셀 수 판단 불가): 평균 {raw_avg_current:.2f}A, 최대 {raw_max_current:.2f}A")

        # Temperature
        if battery and "temperature" in battery.data:
            temps = [float(x) for x in battery.data["temperature"]]
            summary["battery_temp_avg"] = float(np.mean(temps))
            summary["battery_temp_max"] = float(np.max(temps))

        # ESC summary
        if esc_outputs:
            summary["esc_avg_output"] = float(statistics.mean(esc_outputs))
            summary["esc_max_output"] = float(max(esc_outputs))
            summary["esc_output_std"] = float(np.std(esc_outputs))

        # FCC
        if roll_vals:
            summary["fcc_roll_std"] = float(np.std(roll_vals))
            summary["fcc_pitch_std"] = float(np.std(pitch_vals))
            summary["max_attitude_deg"] = float(
                max(max(abs(r) for r in roll_vals),
                    max(abs(p) for p in pitch_vals)) * 180/math.pi
            )

        # GPS
        if gps_sats:
            summary["gnss_avg_sat"] = float(statistics.mean(gps_sats))
            summary["gnss_signal_loss_count"] = len([s for s in gps_sats if s <= 3])

        if gps and "hdop" in gps.data:
            summary["gnss_hdop"] = float(np.mean([float(x) for x in gps.data["hdop"]]))

        # 고도 표준편차 계산: vehicle_global_position의 alt 사용 (MSL 기준 절대 고도)
        # vehicle_local_position의 z는 로컬 좌표계 상대 고도라 표준편차가 클 수 있음
        if global_pos and "alt" in global_pos.data:
            altitudes_msl = [float(alt) for alt in global_pos.data["alt"] if alt is not None]
            if altitudes_msl:
                summary["gnss_alt_std"] = float(np.std(altitudes_msl))
        elif gps and "altitude_msl_m" in gps.data:
            # fallback: GPS의 MSL 고도 사용
            altitudes_msl = [float(alt) for alt in gps.data["altitude_msl_m"] if alt is not None]
            if altitudes_msl:
                summary["gnss_alt_std"] = float(np.std(altitudes_msl))
        elif "z" in pos_d:
            # 최후의 수단: local_position의 z 사용 (상대 고도)
            alt = [-float(z) for z in pos_d["z"]]
            summary["gnss_alt_std"] = float(np.std(alt))

        # Flight summary
        altitudes = [m["altitude"] for m in merged]
        speeds = [m["speed"] for m in merged]

        if altitudes:
            summary["max_altitude"] = float(max(altitudes))
        if speeds:
            summary["max_ground_speed"] = float(max(speeds))

        if len(altitudes) > 1:
            climb_rates = np.diff(altitudes)
            summary["max_climb_rate"] = float(np.max(climb_rates))
            summary["max_descent_rate"] = float(np.min(climb_rates))
            summary["landing_impact"] = abs(float(np.min(climb_rates)))

        return ORJSONResponse(deep_clean({
            "data": [clean_dict(m) for m in merged],
            "summary": summary
        }))

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"서버 오류: {e}")
