"""
cnnlstm_retrain.py  (11-feature 재학습 버전)

csv_output/ 하위 모든 기체 폴더의 CSV를 합쳐서
CNN-LSTM 모델을 Early Stopping으로 재학습합니다.

[이번 수정의 핵심]
  - AI 학습 대상을 27개 -> 11개로 축소
      원본 인덱스 [0,1,5,6,7,8,9,10]
      = volt, current, 자세 6개(5~10)
      (sensor_gyro 17~19 는 노이즈성이라 AI 제외 → 물리 임계값으로 감시)
  - 제외: GPS 절대좌표(2,3,4) / EKF bias·variance(11~16) / accel(20~22) / PWM(23~26)
    (accel·PWM은 규칙/물리 임계값으로 별도 감시, GPS·EKF는 AI에서 완전 제거)
  - 데이터 누수 제거: 파일 '내부' 9:1 -> 파일 '단위' 9:1 분할
  - yaw unwrap을 원본 좌표계(col 5,8)에서 '먼저' 수행한 뒤 11개 컬럼 추출
    (피처를 먼저 자르면 인덱스가 어긋나 unwrap이 깨지므로 순서가 중요)

실행 방법:
    cd backend/app/cbm/train
    python cnnlstm_retrain.py

결과물:
    trainResult/UNIFIED_best_model.pth   (11피처 모델 + rmse_train_list)
    pkl_files/UNIFIED_stats.pkl          (mu/sig 등, 11차원)
"""

import os
import glob
import random
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import torch.optim as optim
import pickle
import matplotlib.pyplot as plt

from torch.utils.data import Dataset, DataLoader


# ══════════════════════════════════════════════
# 파라미터 설정
# ══════════════════════════════════════════════
DATA_DIR  = "csv_output"                        # ← 전체 폴더 (하위 기체 폴더 자동 탐색)
PKL_PATH  = "pkl_files/UNIFIED_stats.pkl"
SAVE_PATH = "trainResult/UNIFIED_best_model.pth"
TEMP_PATH = "trainResult/UNIFIED_best_model_temp.pth"

WIN_S               = 20
NUM_EPOCHS          = 100
BATCH_SIZE          = 256
LR                  = 0.0001
EARLY_STOP_PATIENCE = 15

# ── AI 학습에 사용할 '원본 CSV 컬럼' 인덱스 ──────────────────
#   0: volt           1: current
#   5,6,7,8,9,10: 자세 6개 (5,8 = yaw 계열 / 나머지는 roll·pitch 계열)
#   17,18,19: sensor_gyro x/y/z
# (이 순서가 그대로 새 인덱스 0~10 이 됩니다. collector/inference도 동일 순서로 맞출 것)
FEATURE_COLS = [0, 1, 5, 6, 7, 8, 9, 10]

# yaw unwrap 대상 (원본 좌표계 기준 컬럼)
YAW_COLS_ORIG = [5, 8]

SEED = 42


# ══════════════════════════════════════════════
# 유틸 함수
# ══════════════════════════════════════════════
def load_csv(path):
    return pd.read_csv(path, header=None).values

def convert_yawSign(X, yaw_cols):
    """원본 좌표계에서 yaw 컬럼을 unwrap. (피처 축소 '전'에 호출해야 함)"""
    X = X.copy()
    for col in yaw_cols:
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

def normalize(X, Y, mu, sig):
    X_norm = [(x - mu) / sig for x in X]
    Y_norm = [(y - mu.squeeze()) / sig.squeeze() for y in Y]
    return X_norm, Y_norm

def inverse_normalize(Y_norm, mu, sig):
    return Y_norm * sig.squeeze() + mu.squeeze()

def compute_rmse(preds, targets):
    return [float(np.sqrt(np.mean((preds[:, i] - targets[:, i]) ** 2)))
            for i in range(preds.shape[1])]


def build_windows(file_paths, feature_cols, yaw_cols, win_s):
    """주어진 파일들에서 (윈도우 입력, 정답) 리스트 생성.
       yaw unwrap은 원본 좌표계에서 수행한 뒤 feature_cols 만 추출한다."""
    X_list, Y_list = [], []
    for path in file_paths:
        data = load_csv(path)                      # (N, 27)  원본 전체 컬럼
        if len(data) < win_s + 1:
            continue
        for k in range(len(data) - win_s):
            seg_full = convert_yawSign(data[k:k+win_s+1], yaw_cols)  # 원본 좌표계에서 unwrap
            seg = seg_full[:, feature_cols]         # ← 여기서 11개만 추출 (N, 11)
            X_list.append(seg[:win_s][..., np.newaxis])   # (win_s, 11, 1)
            Y_list.append(seg[win_s])                     # (11,)
    return X_list, Y_list


# ══════════════════════════════════════════════
# Dataset
# ══════════════════════════════════════════════
class SequenceDataset(Dataset):
    def __init__(self, X_list, Y_list):
        self.X = [torch.tensor(x, dtype=torch.float32).permute(2, 0, 1).squeeze(0) for x in X_list]
        self.Y = [torch.tensor(y, dtype=torch.float32) for y in Y_list]

    def __len__(self):
        return len(self.X)

    def __getitem__(self, idx):
        return self.X[idx], self.Y[idx]


# ══════════════════════════════════════════════
# CNN-LSTM 모델  (구조 변경 없음 / num_features 만 11로 들어감)
# ══════════════════════════════════════════════
class CNNLSTM(nn.Module):
    def __init__(self, win_s, num_features, output_dim,
                 filter_size=(3, 1), num_filters=32, lstm_hidden=128):
        super().__init__()
        self.conv = nn.Sequential(
            nn.Conv2d(1, num_filters, kernel_size=filter_size, padding='same'),
            nn.ReLU(),
            nn.Conv2d(num_filters, num_filters*2, kernel_size=filter_size, padding='same'),
            nn.ReLU(),
        )
        self.lstm_input_size = num_filters * 2 * num_features
        self.lstm = nn.LSTM(self.lstm_input_size, lstm_hidden, batch_first=True)
        self.fc   = nn.Linear(lstm_hidden, output_dim)

    def forward(self, x):
        x = x.unsqueeze(1)
        x = self.conv(x)
        b, C, T, F = x.shape
        x = x.permute(0, 2, 1, 3).contiguous().view(b, T, C * F)
        _, (hn, _) = self.lstm(x)
        return self.fc(hn[-1])


# ══════════════════════════════════════════════
# 메인
# ══════════════════════════════════════════════
if __name__ == "__main__":

    random.seed(SEED)
    np.random.seed(SEED)
    torch.manual_seed(SEED)

    # ── 1. 하위 폴더 전체 CSV 탐색 ──────────────
    file_list = sorted(glob.glob(os.path.join(DATA_DIR, "**", "*.csv"), recursive=True))
    print(f"[데이터] 전체 CSV 파일 수: {len(file_list)}")
    print(f"[피처] AI 학습 대상 원본 컬럼: {FEATURE_COLS}  (총 {len(FEATURE_COLS)}개)")

    from collections import Counter
    drone_counts = Counter(os.path.basename(os.path.dirname(f)) for f in file_list)
    for drone, cnt in sorted(drone_counts.items()):
        print(f"  {drone}: {cnt}개")

    # ── 1-b. 파일 '단위' 9:1 분할 (데이터 누수 제거) ──────────
    #   기체별 비율을 유지하면서 나눈다(소수 기체가 통째로 빠지지 않도록).
    train_files, test_files = [], []
    by_drone = {}
    for f in file_list:
        by_drone.setdefault(os.path.basename(os.path.dirname(f)), []).append(f)

    for drone, files in by_drone.items():
        files = files[:]                       # 복사
        random.shuffle(files)
        n_test = max(1, int(round(0.1 * len(files)))) if len(files) >= 2 else 0
        test_files  += files[:n_test]
        train_files += files[n_test:]

    print(f"\n[분할] 파일 단위 9:1  ->  Train 파일 {len(train_files)}개 / Test 파일 {len(test_files)}개")
    # 기체별 test 배분 확인 (DM3 같은 소수 기체가 검증에 들어갔는지)
    test_by_drone = Counter(os.path.basename(os.path.dirname(f)) for f in test_files)
    print(f"[분할] Test 파일 기체별: {dict(test_by_drone)}")

    # ── 1-c. 윈도우 생성 ────────────────────────
    XTrain, YTrain = build_windows(train_files, FEATURE_COLS, YAW_COLS_ORIG, WIN_S)
    XTest,  YTest  = build_windows(test_files,  FEATURE_COLS, YAW_COLS_ORIG, WIN_S)
    print(f"[데이터] Train 윈도우: {len(XTrain)}개, Test 윈도우: {len(XTest)}개")

    if len(XTrain) == 0 or len(XTest) == 0:
        raise RuntimeError("윈도우가 비었습니다. 파일 수/길이를 확인하세요.")

    # ── 2. 정규화 (11차원으로 자동 계산됨) ───────
    XTrain_concat = np.concatenate(XTrain, axis=0)   # (N*win_s, 11, 1)
    mu  = np.mean(XTrain_concat, axis=0)             # (11, 1)
    sig = np.std(XTrain_concat,  axis=0)             # (11, 1)
    sig[sig == 0] = 1e-7
    print(f"[정규화] mu shape={mu.shape}, sig shape={sig.shape}  (11차원 확인)")

    XTrain, YTrain = normalize(XTrain, YTrain, mu, sig)
    XTest,  YTest  = normalize(XTest,  YTest,  mu, sig)

    # ── 3. DataLoader ───────────────────────────
    train_loader = DataLoader(SequenceDataset(XTrain, YTrain), batch_size=BATCH_SIZE, shuffle=True)
    test_loader  = DataLoader(SequenceDataset(XTest,  YTest),  batch_size=32, shuffle=False)

    # ── 4. 모델 초기화 ──────────────────────────
    num_features  = XTrain[0].shape[1]          # = 11
    num_responses = YTrain[0].shape[0]          # = 11
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"[모델] features={num_features}, responses={num_responses}, device={device}")
    assert num_features == len(FEATURE_COLS), "피처 수 불일치!"

    model     = CNNLSTM(WIN_S, num_features, num_responses).to(device)
    optimizer = optim.Adam(model.parameters(), lr=LR)
    criterion = nn.MSELoss()

    # ── 5. 학습 (Early Stopping) ─────────────────
    print(f"\n[학습] max_epoch={NUM_EPOCHS}, patience={EARLY_STOP_PATIENCE}, batch={BATCH_SIZE}")
    print("Test Loss가 개선되지 않으면 자동 중단됩니다.\n")

    train_losses, test_losses = [], []
    best_test_loss   = float('inf')
    best_epoch       = 0
    patience_counter = 0

    os.makedirs(os.path.dirname(SAVE_PATH), exist_ok=True)

    for epoch in range(NUM_EPOCHS):
        model.train()
        train_loss = 0
        for Xb, Yb in train_loader:
            Xb, Yb = Xb.to(device), Yb.to(device)
            optimizer.zero_grad()
            loss = criterion(model(Xb), Yb)
            loss.backward()
            optimizer.step()
            train_loss += loss.item() * Xb.size(0)
        train_loss /= len(train_loader.dataset)

        model.eval()
        test_loss = 0
        with torch.no_grad():
            for Xb, Yb in test_loader:
                Xb, Yb = Xb.to(device), Yb.to(device)
                loss = criterion(model(Xb), Yb)
                test_loss += loss.item() * Xb.size(0)
        test_loss /= len(test_loader.dataset)

        train_losses.append(train_loss)
        test_losses.append(test_loss)

        print(f"  Epoch {epoch+1:3d}/{NUM_EPOCHS} "
              f"| Train: {train_loss:.6f} | Test: {test_loss:.6f}", end="")

        if test_loss < best_test_loss:
            best_test_loss   = test_loss
            best_epoch       = epoch + 1
            patience_counter = 0
            torch.save(model.state_dict(), TEMP_PATH)
            print(f"  ✅ Best! (epoch={best_epoch})")
        else:
            patience_counter += 1
            print(f"  patience={patience_counter}/{EARLY_STOP_PATIENCE}")
            if patience_counter >= EARLY_STOP_PATIENCE:
                print(f"\n🛑 Early Stopping! Best epoch={best_epoch}, Test Loss={best_test_loss:.6f}")
                break

    # ── 6. 최적 모델 복원 ────────────────────────
    print(f"\n[모델] Best epoch={best_epoch} 모델 복원 중...")
    model.load_state_dict(torch.load(TEMP_PATH, map_location=device))
    model.eval()

    # ── 7. RMSE 계산 (원본 스케일, 11개) ─────────
    print("[RMSE] 계산 중...")
    preds_norm, targets_norm = [], []
    with torch.no_grad():
        for Xb, Yb in train_loader:
            preds_norm.append(model(Xb.to(device)).cpu().numpy())
            targets_norm.append(Yb.numpy())

    preds_norm   = np.concatenate(preds_norm)
    targets_norm = np.concatenate(targets_norm)
    preds   = inverse_normalize(preds_norm,   mu.squeeze(), sig.squeeze())
    targets = inverse_normalize(targets_norm, mu.squeeze(), sig.squeeze())

    rmse_list = compute_rmse(preds, targets)
    feat_names = ["volt", "current",
                  "att_5", "att_6", "att_7", "att_8", "att_9", "att_10"]
    print("[RMSE] 피처별 결과 (새 인덱스 : 원본컬럼 : 이름):")
    for i, r in enumerate(rmse_list):
        print(f"  new{i:2d} (orig {FEATURE_COLS[i]:2d}, {feat_names[i]:8s}): {r:.6f}")

    # ── 8. 저장 ──────────────────────────────────
    os.makedirs(os.path.dirname(PKL_PATH), exist_ok=True)

    torch.save({
        'model_state_dict': model.state_dict(),
        'rmse_train_list':  rmse_list,
        'feature_cols':     FEATURE_COLS,     # ← 추론 측 동기화 검증용으로 함께 저장
    }, SAVE_PATH)

    with open(PKL_PATH, 'wb') as f:
        pickle.dump({
            'win_s':        WIN_S,
            'mu':           mu,
            'sig':          sig,
            'feature_cols': FEATURE_COLS,
            'XTrain': XTrain[:10],
            'YTrain': YTrain[:10],
            'XTest':  XTest[:10],
            'YTest':  YTest[:10],
        }, f)

    print(f"\n✅ 저장 완료!")
    print(f"  모델 : {SAVE_PATH}  (Best epoch={best_epoch}, features={num_features})")
    print(f"  통계 : {PKL_PATH}")
    print(f"  학습 데이터: {dict(drone_counts)}")

    # ── 9. Loss 그래프 ───────────────────────────
    plt.figure(figsize=(10, 4))
    plt.plot(train_losses, label='Train Loss')
    plt.plot(test_losses,  label='Test Loss')
    if best_epoch > 0:
        plt.axvline(x=best_epoch-1, color='r', linestyle='--', label=f'Best epoch={best_epoch}')
    plt.xlabel('Epoch')
    plt.ylabel('Loss')
    plt.title(f'CNN-LSTM 11-feature (Best epoch={best_epoch})')
    plt.legend()
    plt.grid(True)
    plt.tight_layout()
    plt.savefig('trainResult/loss_curve_UNIFIED.png')
    plt.show()
    print("  그래프: trainResult/loss_curve_UNIFIED.png")