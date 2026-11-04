# 營養師健康計算室 — GitHub Pages + YOLOv8 / MiDaS Python API

本專案整合原先的繁體中文 BMI／理想體重／蛋白質與腎臟病模式，另外提供**可部署的 Python API 介接** [AbdelrahmanElshatlawy/food-recognition-and-nutrition-analyzer](https://github.com/AbdelrahmanElshatlawy/food-recognition-and-nutrition-analyzer) 的 `nutrition_pipeline.py`。

**完成與尚未完成的範圍：** 前端輸入欄位及計算可直接用；API 的上傳、檢查、介接、錯誤處理均已實作。**原作者的 `best.pt` 模型權重未附上，也未在此環境完成真正 AI 推論**。需另外取得模型檔、安裝大量 Python/深度學習依賴並部署能運行模型的主機。原程式會透過 `torch.hub` 取得 MiDaS，首次執行需可存取外部網路及足夠 RAM/CPU/GPU。原作者的完整程式與數據集不包含在本壓縮檔內；部署時以 `git clone` 引用。

## 1. 檔案結構

- `frontend/` — GitHub Pages 靜態網站。`app.js` 即時連動 BMI、BMI 22 體重、蛋白質及腎臟病模式，並可人工編輯食物份量。
- `frontend/config.js` — API 網址設定，不含任何金鑰。
- `backend/main.py` — FastAPI，`GET /health`, `POST /analyze` (JSON data URL)，限制單張 5 MB/1200 萬像素，去 EXIF、限制同時推論。
- `backend/upstream_adapter.py` — 讀取並使用上游**真正**的 `run_one_image` (YOLO → GrabCut/mask → MiDaS → CSV)。替換上游寫死的 Windows 路徑，移除結尾測試用執行區段；並清除本次結果輸出。
- `Dockerfile`, `docker-compose.yml` — Python API 容器。
- `tests/` — API 基本測試 (使用模擬模型，不是辨識準確率測試)。
- `.github/workflows/pages.yml` — GitHub Pages 前端部署。

## 2. GitHub Pages（先使網頁上線）

1. 在 GitHub 建立新的 repository，例如 `nutrition-health-site`，將 ZIP **解壓縮後的內容**上傳到 repository 根目錄，預設分支 `main`。
2. 到 `Settings > Pages > Build and deployment > Source` 選 `GitHub Actions`。
3. GitHub Actions 執行 `Deploy static frontend`，獲得 `https://你的帳號.github.io/nutrition-health-site/`。
4. 不需後端就能即時看 BMI、理想體重、蛋白質及手動食物清單；沒有 API 時不會假裝 AI 已辨識。

## 3. 取得模型權重與 nutrition CSV

原作者 README 提供 Kaggle 模型權重連結：
https://kaggle.com/datasets/b70f785b5f4e21301154def41a4a5205681567d9d502eedf5320049f5f16ad8e

1. 下載 `best.pt` 放入本專案的 `models/best.pt`（Git 忽略，不應提交大型模型）。
2. Docker build 時會 clone 原始 repository，它應提供 `datasets/nutrition_256.csv`。若原作者改動檔案或 model 不可取得，請以適當來源自行準備，並設定 `NUTRITION_CSV` 等路徑。
3. MiDaS 權重會由上游 `torch.hub.load` 在首次運行下載，容器需可存取外網且有足夠記憶體；建議預熱快取後正式部署。
4. **授權提醒：** 上游 README 標示 MIT；部署前請自行確認其完整 LICENSE 與模型、UECFOOD256 資料、Ultralytics 的授權條件。不能只根據 README 假定所有第三方模型可商用。

## 4. 本機啟動（Docker）

需要 Docker / Docker Compose；先放好 `models/best.pt`：

```bash
CORS_ORIGINS=http://localhost:5500 docker compose up --build
```

另開終端機，在 `frontend/` 目錄執行：

```bash
python -m http.server 5500
```

瀏覽 `http://localhost:5500`，在「食物份量辨識 > 網站管理者：AI 服務設定」填入 `http://localhost:8000`。`http://localhost:8000/health` 的 `ai_configured` 必須是 `true`，但這僅代表檔案就緒，不代表已成功載入 AI 或完成推論。

無 Docker 時：

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
# 另行 git clone 上游到 ./upstream，設定 UPSTREAM_DIR 與 YOLO_WEIGHTS
export UPSTREAM_DIR="$PWD/upstream"
export YOLO_WEIGHTS="$PWD/models/best.pt"
export CORS_ORIGINS='http://localhost:5500'
uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

## 5. 正式線上部署

- GitHub Pages **只能部署 `frontend/`，不能運行 YOLO/Python 模型**。
- 將 Docker API 部署到支援自訂容器、持久快取/模型檔案的主機（雲端 VM、容器平台等），並提供 HTTPS。需把模型權重以私有磁碟或映像建置步驟供給容器（`docker-compose.yml` 是本機路徑範例）。
- 設定伺服器 `CORS_ORIGINS=https://你的帳號.github.io`（不包含子路徑），以及適當反向代理 request body 限制、HTTPS、rate limit、監控。**公開服務必須加上限流、防濫用與資料處理告知**；此範例不含使用者登入、配額、審計或臨床資料保存。
- 修改 `frontend/config.js`：`window.NUTRITION_API_URL = 'https://你的-api-網址';`，推送至 GitHub；或在管理者欄位於當前裝置輸入 API URL。
- 請勿公開 API 金鑰，避免在網址/照片中傳送姓名、檢驗單等健康個資；照片會傳送至你部署的 API。原始上游會建立輸出檔案，本 adapter 在單次處理後清除，但正式部署仍應設置存放目錄權限、日誌管理及資料清除政策。

## 6. API 介接格式

```http
POST /analyze
Content-Type: application/json

{"image":"data:image/jpeg;base64,..."}
```

成功範例（**僅格式展示，不是模型推論成果**）：

```json
{"items":[{"name":"rice","grams":80,"proteinPer100g":2.7,"caloriesPer100g":130,"matched":true}],"source":"YOLOv8 + MiDaS upstream pipeline","warning":"照片份量屬估算值；須人工核對。"}
```

`matched=false` / `proteinPer100g=null` 表示原始營養資料找不到對應食物，不應將 0 解讀為實際 0 克；網站會提醒人工修正。原始模型主要估算熱量與三大營養素，**沒有驗證的磷、鉀、鈉資料**，因此網站不聲稱腎臟病食物分析可用來判斷這些營養素。

## 7. 腎臟病安全範圍

- CKD G3–G5 未透析：KDIGO 2024 參考 0.8 g/kg/day，體重基準與個別需求仍需由營養師確認。
- 血液透析、腹膜透析：網站提供**可編輯係數**，預設只作操作起點，不視為醫囑；營養不良、肌少症、特殊病程、孕哺、兒童等不應直接套算。
- BMI 22 是計算參考，與臨床乾體重、理想體重、調整體重並不等同。
- 食物重量與營養素依照片推定有高度不確定性，尤其混合料理與遮蔽食材，需人工核對。

依據：
- KDIGO 2024: https://kdigo.org/wp-content/uploads/2024/03/KDIGO-2024-CKD-Guideline.pdf
- ADA 2026: https://diabetesjournals.org/care/article/49/Supplement_1/S246/163914/11-Chronic-Kidney-Disease-and-Risk-Management%20/

## 8. 測試

```bash
pip install pytest httpx fastapi uvicorn pydantic pillow
pytest -q
node --check frontend/app.js
```

API 測試使用 mock model 驗證上傳格式及錯誤處理，不表示原作者權重可載入或辨識準確率已驗證。上線前必須做真實食物照片、份量誤差、不同光照、腎臟病營養資料審查與資安測試。
