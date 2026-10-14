"""
accident_to_csv.py

사고 로그(.ulg) 1개를 42컬럼 CSV 로 변환한다.
결과는 accident_log/ 폴더에 저장 — csv_output 에 넣으면 다음 재학습 때
사고 데이터가 '정상' 으로 학습되므로 반드시 분리해 둔다.

실행:
    cd backend/app/cbm/train
    python accident_to_csv.py
"""

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)
sys.path.insert(0, HERE)

import ulg_to_csv as u   # 같은 폴더의 ulg_to_csv.py 재사용

SRC = os.path.join("accident_log", "04_00_08.ulg")
DST = os.path.join("accident_log", "04_00_08.csv")

if not os.path.exists(SRC):
    print(f"❌ 원본 없음: {os.path.abspath(SRC)}")
    sys.exit(1)

print(f"변환 중: {SRC}")
df, reason = u.convert_ulg_to_df(SRC)

if df is None and "필수 토픽" not in reason and "변환 오류" not in reason:
    # 사고 로그는 비행이 비정상 종료되어 품질 필터(행 수·gap·결측)에 걸릴 수 있음 → 필터 무시하고 재시도
    print(f"⚠️ 품질 필터 제외됨({reason}) → 필터 무시하고 다시 변환")
    u.check_quality = lambda df, ts: (True, "OK")
    df, reason = u.convert_ulg_to_df(SRC)

if df is None:
    print(f"❌ 변환 실패: {reason}")
    sys.exit(1)

df.to_csv(DST, index=False, header=False)
print(f"✅ 저장: {os.path.abspath(DST)}  ({len(df)}행 × {len(df.columns)}열)")

# 참고용: 비행 길이와 주요 컬럼 범위
print(f"   비행 길이 약 {len(df)}초 ({len(df)/60:.1f}분)")
print(f"   volt {df['volt'].min():.1f}~{df['volt'].max():.1f} V, "
      f"pwm_dev 최대 |{df[['pwm_dev1','pwm_dev2','pwm_dev3','pwm_dev4']].abs().max().max():.0f}|, "
      f"accel_vib_metric 최대 {df['accel_vib_metric'].max():.2f}")