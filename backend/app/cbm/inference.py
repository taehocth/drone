"""
app/cbm/inference.py  (8-feature 버전)

역할:
  1. 서버 시작 시 drone_id별 CNN-LSTM 모델 + 정규화 통계 로드
  2. collector.py 의 슬라이딩 윈도우(20, 8)를 받아 추론
  3. 드론별 상태 유지형 CUSUM + fail count 로 이상 탐지
  4. 탐지 결과를 evaluator.py 가 사용할 수 있는 형태로 반환

[이번 수정의 핵심]
  - 입력 차원 27 → 8 (collector / cnnlstm_retrain 와 동일한 AI_FEATURE_COLS 순서)
  - yaw unwrap 대상 인덱스: (원본 5,8) → (새 2,5)
  - FAIL_THRESHOLDS_OVERRIDE 정리(volt 만 고정, current 는 자동값)
  - FEATURE_NAMES / FEATURE_MESSAGES 를 새 8개 기준으로 정리
  - CUSUM 단위 통일: 정규화 오차(err_norm) 기준이므로 mu0 도 '정규화 스케일'로 사용

기체별 모델:
  drone-001~004 → models/UNIFIED/UNIFIED_best_model.pth  (통합 모델)
"""

from __future__ import annotations

import pickle
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np
import torch
import torch.nn as nn

from app.cbm.collector import get_window, reset_window, AI_FEATURE_COLS

# ── 모델 기본 경로 ──────────────────────────────────────
_BASE = Path(__file__).parent / "models"

# ── 기체별 모델 경로 매핑 ───────────────────────────────
DRONE_MODEL_MAP = {
    "drone-001": (_BASE / "UNIFIED" / "UNIFIED_best_model.pth", _BASE / "UNIFIED" / "UNIFIED_stats.pkl"),
    "drone-002": (_BASE / "UNIFIED" / "UNIFIED_best_model.pth", _BASE / "UNIFIED" / "UNIFIED_stats.pkl"),
    "drone-003": (_BASE / "UNIFIED" / "UNIFIED_best_model.pth", _BASE / "UNIFIED" / "UNIFIED_stats.pkl"),
    "drone-004": (_BASE / "UNIFIED" / "UNIFIED_best_model.pth", _BASE / "UNIFIED" / "UNIFIED_stats.pkl"),
}

# ── 이상 탐지 파라미터 ──────────────────────────────────
DETECT_FAIL_CNT = 10
CUSUM_THRESHOLD = 15.0   # 누적 한계선 (10 → 15: 더 오래 지속돼야 경고)
CUSUM_DRIFT     = 0.10   # 허용 여유분 (0.03 → 0.10: 기준선 위 이만큼은 정상으로 간주)
CUSUM_MU0_MARGIN = 1.5   # 정상 기준선 여유 계수 (학습 평균 오차 × 1.5 까지 정상)

# ── AI 새 인덱스(0~10) 기준 yaw unwrap 대상 ─────────────
#   원본 5(att_cmd_yaw) → 새 2,  원본 8(att_state_yaw) → 새 5
YAW_COLS_NEW = [AI_FEATURE_COLS.index(5), AI_FEATURE_COLS.index(8)]  # = [2, 5]

# ── 피처 이름 (새 8개, AI_FEATURE_COLS 순서) ───────────
FEATURE_NAMES = [
    "volt",            # new0  (orig 0)
    "current",         # new1  (orig 1)
    "att_cmd_yaw",     # new2  (orig 5)
    "att_cmd_pitch",   # new3  (orig 6)
    "att_cmd_roll",    # new4  (orig 7)
    "att_state_yaw",   # new5  (orig 8)
    "att_state_pitch", # new6  (orig 9)
    "att_state_roll",  # new7  (orig 10)
]

# ── 피처별 fail count 임계값 (새 인덱스 기준) ────────────
#   volt 만 고정 override 유지 (전압은 변동이 있어 자동값보다 넉넉한 0.4 가 적절).
#   current 는 override 를 제거해 자동 계산값(rmse_train + sig)을 사용한다.
#     - 이번 재학습 current RMSE=0.019 로 매우 작아, 고정 0.05 는 오히려 과민/부적절.
#     - 자동값은 학습된 정상 변동(sig)을 반영하므로 정상 비행에서 덜 울린다.
#   gyro·EKF·accel override 는 해당 피처들이 AI 에서 빠졌으므로 없음.
FAIL_THRESHOLDS_OVERRIDE = {
    0: 0.4,    # volt
}

# ── 피처별 이상 메시지 (새 8개) ─────────────────────────
FEATURE_MESSAGES = {
    "volt":            ("Power",  "전압 이상 감지"),
    "current":         ("Power",  "전류 이상 감지"),
    "att_cmd_yaw":     ("Flight", "Yaw 명령 이상"),
    "att_cmd_pitch":   ("Flight", "Pitch 명령 이상"),
    "att_cmd_roll":    ("Flight", "Roll 명령 이상"),
    "att_state_yaw":   ("Flight", "Yaw 상태 이상"),
    "att_state_pitch": ("Flight", "Pitch 상태 이상"),
    "att_state_roll":  ("Flight", "Roll 상태 이상"),
}


# ════════════════════════════════════════════════════════
# CNN-LSTM 모델
# ════════════════════════════════════════════════════════
class CNNLSTM(nn.Module):
    def __init__(self, win_s, num_features, output_dim,
                 filter_size=(3, 1), num_filters=32, lstm_hidden=128):
        super().__init__()
        self.conv = nn.Sequential(
            nn.Conv2d(1, num_filters, kernel_size=filter_size, padding="same"),
            nn.ReLU(),
            nn.Conv2d(num_filters, num_filters * 2, kernel_size=filter_size, padding="same"),
            nn.ReLU(),
        )
        self.lstm_input_size = num_filters * 2 * num_features
        self.lstm = nn.LSTM(input_size=self.lstm_input_size, hidden_size=lstm_hidden, batch_first=True)
        self.fc = nn.Linear(lstm_hidden, output_dim)

    def forward(self, x):
        x = x.unsqueeze(1)
        x = self.conv(x)
        b, C, T, F = x.shape
        x = x.permute(0, 2, 1, 3).contiguous().view(b, T, C * F)
        _, (hn, _) = self.lstm(x)
        return self.fc(hn[-1])


# ════════════════════════════════════════════════════════
# 드론별 상태
# ════════════════════════════════════════════════════════
class _DroneState:
    def __init__(self, num_features, cusum_mu0):
        self.n = num_features
        # CUSUM 기준치: 정규화 스케일이어야 err_norm 과 단위가 맞음
        self.err_mu0 = np.array(cusum_mu0, dtype=np.float32)
        self.fail_cnt     = np.zeros(num_features, dtype=np.int32)
        self.pre_fail_cnt = np.zeros(num_features, dtype=np.int32)
        self.S = np.zeros((1, num_features), dtype=np.float32)

    def reset(self):
        self.fail_cnt[:]     = 0
        self.pre_fail_cnt[:] = 0
        self.S[:]            = 0.0


# ════════════════════════════════════════════════════════
# 단일 모델 컨테이너
# ════════════════════════════════════════════════════════
class _ModelBundle:
    def __init__(self, model, device, mu, sig, win_s, n_feat, n_out,
                 rmse_train, thresholds, cusum_mu0):
        self.model      = model
        self.device     = device
        self.mu         = mu
        self.sig        = sig
        self.win_s      = win_s
        self.n_feat     = n_feat
        self.n_out      = n_out
        self.rmse_train = rmse_train     # 원본 스케일 (fail_count threshold 계산용)
        self.thresholds = thresholds     # 원본 스케일 (err 와 비교)
        self.cusum_mu0  = cusum_mu0      # 정규화 스케일 (err_norm 과 비교)


def _load_bundle(model_path: Path, pkl_path: Path, label: str) -> Optional[_ModelBundle]:
    if not model_path.exists():
        print(f"[inference] ❌ 모델 파일 없음: {model_path}")
        return None
    if not pkl_path.exists():
        print(f"[inference] ❌ pkl 파일 없음: {pkl_path}")
        return None

    try:
        with open(pkl_path, "rb") as f:
            stats = pickle.load(f)

        mu  = np.array(stats["mu"]).squeeze()    # (8,)
        sig = np.array(stats["sig"]).squeeze()   # (8,)
        sig[sig == 0] = 1e-7
        win_s  = int(stats["win_s"])
        n_feat = mu.shape[0]

        # 학습 측 feature_cols 와 collector 측 AI_FEATURE_COLS 일치 검증
        train_cols = stats.get("feature_cols")
        if train_cols is not None and list(train_cols) != list(AI_FEATURE_COLS):
            print(f"[inference] ⚠️ feature_cols 불일치! 학습={train_cols} vs collector={AI_FEATURE_COLS}")
        if n_feat != len(AI_FEATURE_COLS):
            print(f"[inference] ⚠️ 피처 수 불일치! stats={n_feat} vs collector={len(AI_FEATURE_COLS)}")

        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        ckpt   = torch.load(model_path, map_location=device, weights_only=False)

        n_out = ckpt["model_state_dict"]["fc.weight"].shape[0]
        model = CNNLSTM(win_s=win_s, num_features=n_feat, output_dim=n_out).to(device)
        model.load_state_dict(ckpt["model_state_dict"])
        model.eval()

        rmse_train = np.array(ckpt["rmse_train_list"], dtype=np.float32)   # 원본 스케일
        min_len    = min(len(rmse_train), len(sig))

        # fail_count 임계값: 원본 스케일 (rmse_train + sig), 일부 override
        thresholds = rmse_train[:min_len] + sig[:min_len]
        for feat_idx, override_val in FAIL_THRESHOLDS_OVERRIDE.items():
            if feat_idx < min_len:
                thresholds[feat_idx] = override_val

        # CUSUM 기준치: 정규화 스케일. rmse_train(원본)을 sig 로 나눠 정규화 단위로 변환
        # MU0_MARGIN 을 곱해 '정상으로 간주하는 폭'을 학습 평균 오차보다 넓게 잡는다
        # (운용 환경이 학습 데이터와 조금 달라도 누적되지 않도록 — 오탐 완화)
        cusum_mu0 = (rmse_train[:min_len] / sig[:min_len] * CUSUM_MU0_MARGIN).astype(np.float32)

        print(f"[inference] ✅ [{label}] 모델 로드 완료 win_s={win_s} n_feat={n_feat} n_out={n_out}")
        return _ModelBundle(model, device, mu, sig, win_s, n_feat, n_out,
                            rmse_train, thresholds, cusum_mu0)

    except Exception as e:
        print(f"[inference] ❌ [{label}] 로드 실패: {e}")
        return None


# ════════════════════════════════════════════════════════
# 추론 엔진 (싱글턴)
# ════════════════════════════════════════════════════════
class InferenceEngine:
    def __init__(self):
        self._bundles: Dict[str, _ModelBundle] = {}
        self._drone_states: Dict[str, _DroneState] = {}
        self._load_all()

    def _load_all(self):
        for drone_id, (model_path, pkl_path) in DRONE_MODEL_MAP.items():
            bundle = _load_bundle(model_path, pkl_path, drone_id)
            if bundle:
                self._bundles[drone_id] = bundle

    def _get_bundle(self, drone_id: str) -> Optional[_ModelBundle]:
        return self._bundles.get(drone_id)

    @property
    def ready(self) -> bool:
        return bool(self._bundles)

    def _get_state(self, drone_id: str, bundle: _ModelBundle) -> _DroneState:
        if drone_id not in self._drone_states:
            self._drone_states[drone_id] = _DroneState(
                num_features=bundle.n_feat,
                cusum_mu0=bundle.cusum_mu0.tolist(),
            )
        return self._drone_states[drone_id]

    @staticmethod
    def _fix_yaw(X):
        """새 인덱스(YAW_COLS_NEW=[2,5]) 기준 yaw unwrap.
           학습(cnnlstm_retrain)은 원본 좌표계에서 unwrap 했고,
           추론은 이미 8개로 슬라이스된 윈도우를 받으므로 새 인덱스로 보정한다."""
        X = X.copy()
        for col in YAW_COLS_NEW:
            if col >= X.shape[1]:
                continue
            sign = X[0, col] >= 0
            for j in range(1, X.shape[0]):
                if not sign and X[j, col] > 0:
                    t = X[j, col] - 2 * np.pi
                    if abs(X[j, col] - X[j-1, col]) > abs(t - X[j-1, col]):
                        X[j, col] = t
                elif sign and X[j, col] < 0:
                    t = X[j, col] + 2 * np.pi
                    if abs(X[j, col] - X[j-1, col]) > abs(t - X[j-1, col]):
                        X[j, col] = t
        return X

    def run(self, drone_id: str) -> List[dict]:
        bundle = self._get_bundle(drone_id)
        if bundle is None:
            return []

        window = get_window(drone_id)   # (20, 8)
        if window is None:
            return []

        state = self._get_state(drone_id, bundle)

        window_fixed = self._fix_yaw(window)
        x_norm       = (window_fixed - bundle.mu) / bundle.sig  # (20, 8)

        y_true_norm = torch.tensor(x_norm[-1], dtype=torch.float32)
        x_tensor    = torch.tensor(x_norm, dtype=torch.float32).unsqueeze(0).to(bundle.device)

        with torch.no_grad():
            y_pred_norm = bundle.model(x_tensor).squeeze(0).cpu()

        y_pred   = y_pred_norm.numpy() * bundle.sig[:bundle.n_out] + bundle.mu[:bundle.n_out]
        y_true   = y_true_norm.numpy() * bundle.sig[:bundle.n_out] + bundle.mu[:bundle.n_out]
        err      = np.abs(y_pred - y_true)
        err_norm = np.abs(y_pred_norm.numpy() - y_true_norm.numpy())

        alerts = []
        n = min(bundle.n_out, bundle.n_feat)
        thresholds = bundle.thresholds[:n]

        # ── fail count (점진적 이상) — 원본 스케일 ────────
        for j in range(n):
            if err[j] >= thresholds[j]:
                state.fail_cnt[j] += 1
            else:
                state.pre_fail_cnt[j] = 0
                state.fail_cnt[j]     = 0
                continue

            if state.fail_cnt[j] >= DETECT_FAIL_CNT:
                feat_name = FEATURE_NAMES[j] if j < len(FEATURE_NAMES) else f"feature_{j}"
                system, msg = FEATURE_MESSAGES.get(feat_name, ("Unknown", f"피처 {j} 이상"))
                alerts.append({
                    "system":    system,
                    "level":     "danger",
                    "source":    "cnn_lstm",
                    "method":    "fail_count",
                    "feature":   feat_name,
                    "msg":       msg,
                    "err":       round(float(err[j]), 6),
                    "threshold": round(float(thresholds[j]), 6),
                })
                state.pre_fail_cnt[j] = 0
                state.fail_cnt[j]     = 0
            else:
                state.pre_fail_cnt[j] = state.fail_cnt[j]

        # ── CUSUM (순간적 이상) — 정규화 스케일로 통일 ────
        err_norm_arr = err_norm[:n].reshape(1, n)
        mu0          = bundle.cusum_mu0[:n]    # ← 정규화 스케일 (단위 통일)
        state.S      = np.maximum(0, state.S + (err_norm_arr - mu0 - CUSUM_DRIFT))
        cusum_flags  = (state.S > CUSUM_THRESHOLD).squeeze(0)

        for j in range(n):
            if cusum_flags[j]:
                feat_name = FEATURE_NAMES[j] if j < len(FEATURE_NAMES) else f"feature_{j}"
                system, msg = FEATURE_MESSAGES.get(feat_name, ("Unknown", f"피처 {j} 이상"))
                already = any(a["feature"] == feat_name and a["method"] == "fail_count" for a in alerts)
                if not already:
                    alerts.append({
                        "system":  system,
                        "level":   "warning",
                        "source":  "cnn_lstm",
                        "method":  "cusum",
                        "feature": feat_name,
                        "msg":     msg,
                        "cusum":   round(float(state.S[0, j]), 4),
                    })
                state.S[0, j] = 0.0

        return alerts

    def reset(self, drone_id: str) -> None:
        if drone_id in self._drone_states:
            self._drone_states[drone_id].reset()
        reset_window(drone_id)
        print(f"[inference] {drone_id} 상태 초기화 완료")

    def reset_all(self) -> None:
        for state in self._drone_states.values():
            state.reset()

    def get_cusum_values(self, drone_id: str) -> Optional[dict]:
        state  = self._drone_states.get(drone_id)
        bundle = self._get_bundle(drone_id)
        if state is None or bundle is None:
            return None
        return {FEATURE_NAMES[i]: float(state.S[0, i])
                for i in range(min(bundle.n_out, len(FEATURE_NAMES)))}

    def get_fail_counts(self, drone_id: str) -> Optional[dict]:
        state  = self._drone_states.get(drone_id)
        bundle = self._get_bundle(drone_id)
        if state is None or bundle is None:
            return None
        return {FEATURE_NAMES[i]: int(state.fail_cnt[i])
                for i in range(min(bundle.n_out, len(FEATURE_NAMES)))}


# ════════════════════════════════════════════════════════
# 싱글턴 접근자
# ════════════════════════════════════════════════════════
_engine: Optional[InferenceEngine] = None

def get_inference_engine() -> InferenceEngine:
    global _engine
    if _engine is None:
        _engine = InferenceEngine()
    return _engine