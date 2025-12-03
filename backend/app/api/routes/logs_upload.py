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
        battery = next((d for d in ulog.data_list if d.name == "battery_status"), None)
        gps = next((d for d in ulog.data_list if d.name == "vehicle_gps_position"), None)
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
        esc_t, esc_d = extract(esc)
        att_t, att_d = extract(attitude)
        est_t, est_d = extract(estimator_att)
        pos_t, pos_d = extract(local_pos)

        # ========== 배터리 디버깅 로그 추가 ==========
        if battery:
            print("\n========== BATTERY RAW DEBUG ==========")
            if "voltage_v" in battery.data and len(battery.data["voltage_v"]) > 0:
                sample_volt = battery.data["voltage_v"][:10]
                print(f"[voltage_v] 첫 10개 값: {sample_volt}")
                print(f"[voltage_v] 평균: {np.mean(sample_volt):.3f}, 최소: {min(sample_volt):.3f}, 최대: {max(sample_volt):.3f}")
            
            if "voltage_filtered_v" in battery.data and len(battery.data["voltage_filtered_v"]) > 0:
                sample_filtered = battery.data["voltage_filtered_v"][:10]
                print(f"[voltage_filtered_v] 첫 10개 값: {sample_filtered}")
                print(f"[voltage_filtered_v] 평균: {np.mean(sample_filtered):.3f}, 최소: {min(sample_filtered):.3f}, 최대: {max(sample_filtered):.3f}")
            
            if "current_a" in battery.data and len(battery.data["current_a"]) > 0:
                sample_current = battery.data["current_a"][:10]
                all_currents = battery.data["current_a"]
                print(f"[current_a] 첫 10개 원시 값: {sample_current}")
                print(f"[current_a] 원시 평균: {np.mean(sample_current):.3f}, 최소: {min(sample_current):.3f}, 최대: {max(sample_current):.3f}")
                # 전체 데이터의 최대값 확인
                if len(all_currents) > 0:
                    max_raw = max([float(x) for x in all_currents])
                    min_raw = min([float(x) for x in all_currents])
                    print(f"[current_a] 전체 원시 데이터 - 최소: {min_raw:.3f}, 최대: {max_raw:.3f}")
                    # 단위 추정 및 변환 예시 출력
                    if max_raw > 1000:
                        print(f"[current_a] 단위 추정: mA - 변환 시 최대: {max_raw/1000.0:.2f}A")
                    elif max_raw > 100:
                        print(f"[current_a] 단위 추정: cA (centiAmpere) - 변환 시 최대: {max_raw/100.0:.2f}A")
                    elif max_raw > 10:
                        print(f"[current_a] 단위 추정: A (Ampere) - 그대로 사용, 최대: {max_raw:.2f}A")
                    else:
                        print(f"[current_a] 단위 추정: A (Ampere) 또는 정규화된 값 - 그대로 사용, 최대: {max_raw:.2f}A")
            
            # current_filtered_a와 current_average_a 확인
            if "current_filtered_a" in battery.data and len(battery.data["current_filtered_a"]) > 0:
                sample_filtered = battery.data["current_filtered_a"][:10]
                print(f"[current_filtered_a] 첫 10개 값: {sample_filtered}")
                print(f"[current_filtered_a] 평균: {np.mean(sample_filtered):.3f}, 최소: {min(sample_filtered):.3f}, 최대: {max(sample_filtered):.3f}")
            
            if "current_average_a" in battery.data and len(battery.data["current_average_a"]) > 0:
                sample_avg = battery.data["current_average_a"][:10]
                print(f"[current_average_a] 첫 10개 값: {sample_avg}")
                print(f"[current_average_a] 평균: {np.mean(sample_avg):.3f}, 최소: {min(sample_avg):.3f}, 최대: {max(sample_avg):.3f}")
            
            # 셀 전압 확인
            if "voltage_cell_v[0]" in battery.data:
                cell0_sample = battery.data['voltage_cell_v[0]'][:10]
                print(f"[voltage_cell_v[0]] 첫 10개: {cell0_sample}")
                # 사용 가능한 셀 수 확인
                cell_count_found = 0
                for i in range(14):
                    if f"voltage_cell_v[{i}]" in battery.data:
                        cell_count_found += 1
                print(f"[셀 개수] 발견된 셀: {cell_count_found}개")
                if "cell_count" in battery.data:
                    print(f"[cell_count] 첫 10개: {battery.data['cell_count'][:10]}")
            
            # scale 필드 확인 (스케일링 팩터)
            if "scale" in battery.data and len(battery.data["scale"]) > 0:
                scale_sample = battery.data["scale"][:10]
                print(f"[scale] 첫 10개: {scale_sample}")
                print(f"[scale] 평균: {np.mean(scale_sample):.3f}")
            
            # nominal_voltage 확인
            if "nominal_voltage" in battery.data and len(battery.data["nominal_voltage"]) > 0:
                nom_volt_sample = battery.data["nominal_voltage"][:10]
                print(f"[nominal_voltage] 첫 10개: {nom_volt_sample}")
            
            print("========================================\n")
        else:
            print("⚠️ [BATTERY] battery_status 토픽을 찾지 못함")
        # ============================================

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
                    
                    # 방법 2: voltage_filtered_v 우선 사용, 없으면 voltage_v 사용
                    voltage_key = None
                    if "voltage_filtered_v" in bat_d and len(bat_d["voltage_filtered_v"]) > bat_idx:
                        voltage_key = "voltage_filtered_v"
                    elif "voltage_v" in bat_d and len(bat_d["voltage_v"]) > bat_idx:
                        voltage_key = "voltage_v"
                    
                    if not voltage_added and voltage_key:
                        raw_volt = float(bat_d[voltage_key][bat_idx])
                        
                        # scale 필드를 우선적으로 사용
                        if "scale" in bat_d and len(bat_d["scale"]) > bat_idx:
                            scale_val = float(bat_d["scale"][bat_idx])
                            if scale_val > 0 and raw_volt > 0:
                                # scale을 사용하여 전압 변환
                                corrected_volt = raw_volt * scale_val
                                if corrected_volt > 5:  # 5V 이상이면 유효한 전압으로 간주
                                    voltages.append(corrected_volt)
                                    voltage_added = True
                        
                        # scale이 없거나 실패한 경우, cell_count 기반 계산
                        if not voltage_added and "cell_count" in bat_d and len(bat_d["cell_count"]) > bat_idx:
                            cell_cnt = int(bat_d["cell_count"][bat_idx])
                            if cell_cnt > 0 and raw_volt > 0:
                                # voltage_v가 이미 V 단위인지 확인
                                if raw_volt > 10:
                                    # 이미 V 단위
                                    voltages.append(raw_volt)
                                    voltage_added = True
                                elif raw_volt > 0.1:
                                    # voltage_v가 정규화된 값(0~1)으로 보임
                                    # cell_count를 사용하여 실제 전압 계산
                                    # cell_count가 12인 경우: 12셀 또는 6셀 배터리 2개 직렬
                                    # 6셀 배터리 4개 병렬 = 전압은 6셀과 동일
                                    # 실제 셀 수를 6으로 가정 (병렬 구성)
                                    actual_cells = 6  # 병렬 구성이므로 전압은 6셀과 동일
                                    avg_cell_volt = 3.7  # 평균 셀 전압
                                    battery_voltage = actual_cells * avg_cell_volt  # 22.2V
                                    
                                    # 스케일 팩터 계산
                                    # voltage_v 평균이 0.141일 때 22.2V가 나와야 함
                                    scale_factor = battery_voltage / 0.14  # ≈ 158.6
                                    
                                    corrected_volt = raw_volt * scale_factor
                                    
                                    if corrected_volt > 10:
                                        voltages.append(corrected_volt)
                                        voltage_added = True
                        
                        # cell_count가 없거나 실패한 경우, 값 범위로 추정
                        if not voltage_added:
                            if raw_volt > 1000:
                                # mV 단위로 추정
                                corrected_volt = raw_volt / 1000.0
                                voltages.append(corrected_volt)
                            elif raw_volt > 100:
                                # 10mV 단위로 추정
                                corrected_volt = raw_volt / 100.0
                                voltages.append(corrected_volt)
                            elif raw_volt > 10:
                                # V 단위로 가정
                                voltages.append(raw_volt)
                    
                    # 전류 처리
                    # 터미널 로그 확인 결과:
                    # - current_average_a: 평균 14.709A, 최소 14.454A, 최대 14.923A (이미 A 단위)
                    # - current_filtered_a: 평균 0.056 (정규화된 값)
                    # - current_a: 평균 0.056 (정규화된 값)
                    # 
                    # 6셀 리포 배터리 4개 병렬 쿼드콥터:
                    # - 전압: 병렬이므로 6셀 1개와 동일 (약 22-25V) → 단일 배터리 기준
                    # - 전류: 병렬이므로 4개 합산 → 합 기준 (current_average_a가 이미 합산된 값으로 보임)
                    current_added = False
                    
                    # 방법 1: current_average_a 우선 사용 (이미 A 단위로 보임)
                    if "current_average_a" in bat_d and len(bat_d["current_average_a"]) > bat_idx:
                        avg_current = float(bat_d["current_average_a"][bat_idx])
                        if avg_current > 0:
                            # current_average_a는 이미 A 단위로 보임 (터미널 로그: 14.709A)
                            # 10 이상이면 이미 A 단위로 간주
                            if avg_current >= 10:
                                currents.append(avg_current)
                                current_added = True
                            elif avg_current > 1:
                                # 1-10 사이도 A 단위일 수 있음
                                currents.append(avg_current)
                                current_added = True
                            elif avg_current > 0.1:
                                # 0.1-1 사이는 cA 단위일 수 있음
                                corrected_current = avg_current / 100.0
                                if corrected_current > 0.01:
                                    currents.append(corrected_current)
                                    current_added = True
                    
                    # 방법 2: current_filtered_a 사용 (fallback)
                    if not current_added and "current_filtered_a" in bat_d and len(bat_d["current_filtered_a"]) > bat_idx:
                        filtered_current = float(bat_d["current_filtered_a"][bat_idx])
                        if filtered_current > 0:
                            if filtered_current > 1000:
                                corrected_current = filtered_current / 1000.0
                                currents.append(corrected_current)
                                current_added = True
                            elif filtered_current > 100:
                                corrected_current = filtered_current / 100.0
                                currents.append(corrected_current)
                                current_added = True
                            elif filtered_current >= 10:
                                currents.append(filtered_current)
                                current_added = True
                            elif filtered_current > 0.01:
                                # 0.01-10 사이는 정규화된 값(0~1)으로 가정
                                # current_average_a가 14.7A 정도이므로, 이를 참고하여 스케일링
                                # 하지만 current_average_a를 우선 사용하므로 여기는 fallback
                                corrected_current = filtered_current * 250.0
                                if corrected_current > 0.1:
                                    currents.append(corrected_current)
                                    current_added = True
                    
                    # 방법 3: current_a 사용 (fallback, PX4 기본)
                    if not current_added and "current_a" in bat_d and len(bat_d["current_a"]) > bat_idx:
                        raw_current = float(bat_d["current_a"][bat_idx])
                        
                        if raw_current > 0:
                            if raw_current > 1000:
                                corrected_current = raw_current / 1000.0
                                currents.append(corrected_current)
                                current_added = True
                            elif raw_current > 100:
                                corrected_current = raw_current / 100.0
                                currents.append(corrected_current)
                                current_added = True
                            elif raw_current >= 10:
                                currents.append(raw_current)
                                current_added = True
                            elif raw_current > 0.01:
                                # 정규화된 값으로 가정
                                corrected_current = raw_current * 280.0
                                if corrected_current > 0.1:
                                    currents.append(corrected_current)
                                    current_added = True

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

        # 배터리 데이터 디버깅
        print(f"\n========== BATTERY EXTRACTION RESULT ==========")
        print(f"[voltages] 추출된 개수: {len(voltages)}")
        if voltages:
            print(f"[voltages] 평균: {statistics.mean(voltages):.2f}V, 최소: {min(voltages):.2f}V, 최대: {max(voltages):.2f}V")
        print(f"[currents] 추출된 개수: {len(currents)}")
        if currents:
            print(f"[currents] 평균: {statistics.mean(currents):.2f}A, 최소: {min(currents):.2f}A, 최대: {max(currents):.2f}A")
        print("===============================================\n")

        if voltages:
            summary["battery_avg_voltage"] = float(statistics.mean(voltages))
            summary["battery_min_voltage"] = float(min(voltages))
            summary["battery_voltage_ripple"] = float(max(voltages) - min(voltages))

        if currents:
            summary["battery_peak_current"] = float(max(currents))
            summary["battery_avg_current"] = float(statistics.mean(currents))

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

        if "z" in pos_d:
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
