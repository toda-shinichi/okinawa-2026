# 沖繩 2026 隨身助理 v3 改版規劃書與執行指引

- 版本：v3（取代 `GAS_INTEGRATION_PLAN.md`，舊檔保留作參考，不再執行）
- 撰寫日期：2026-10-19（出發日 2026-10-22）
- 執行者：Antigravity
- 決策者：子桓（文中標示「需子桓」的步驟，Antigravity 不可自行決定）
- 配套檔案：專案根目錄 `upgrade_kit/` 資料夾（所有程式碼都已寫好並測試過，Antigravity 只需要依步驟複製與執行）

---

## 第零章：給 Antigravity 的工作守則（開始前請完整讀過）

1. **嚴格依照步驟順序執行**，一次只做一個步驟。每個步驟最後都有「驗證」，驗證通過才能進入下一步。
2. **驗證失敗就停下來**，把畫面上的錯誤訊息原文回報給子桓，不要自己猜測修改方式，也不要跳過。
3. **不要自行改寫 `upgrade_kit/` 裡的程式碼**。這些程式碼已經通過自動測試；如果覺得有問題，先回報。
4. **不要執行 `build_app.py`**。它是舊的產生器，內容比現在的 `index.html` 舊，執行後會把所有新功能和修正覆蓋掉。
5. **沒有子桓明確同意，不可以 `git push`**。commit 可以做，push 必須先問。
6. **不要把以下檔案加入 git**：`*.pdf`（保單）、`.DS_Store`、`okinawa_*.csv`、`places_data.json`、`ANTIGRAVITY_CULTURE_SUPPLEMENT.md`。步驟 1-3 會用 `.gitignore` 處理。
7. 專案規範照舊：介面不可出現 emoji、用語中性、台灣繁體中文、句末不加驚嘆號。
8. 所有指令都在專案根目錄 `wise-mendel/` 執行。

---

## 第一章：改版範圍總覽

這次改版處理檢視時發現的所有問題與建議，共 30 項。右欄是處理這項的步驟。

### A. Bug 修正

| 編號 | 問題 | 處理方式 | 步驟 |
|---|---|---|---|
| A0 | **公開網頁和 git 紀錄外洩身分證字號、護照號碼、出生日期** | 網頁改成遮蔽顯示；`MEMORY.md` 刪除；git 歷史紀錄的清除方式交給子桓決定 | 1-2、4-1、第六章 |
| A1 | 沒有離線能力，斷網重開會沒有樣式甚至打不開 | Service Worker 快取所有檔案與 Tailwind | 5 |
| A2 | 行程沒有 ID 和完成狀態，無法同步 | 新資料模型：每個行程都有固定 ID 和完成標記 | 3、4 |
| A3 | 使用者輸入的內容直接塞進 HTML（XSS、跑版） | 全部改用 `escapeHtml`，並加強 `escStr` | 4 |
| A4 | 刪除成員後舊帳仍算給他；名稱含引號會出錯 | 有相關帳目時不能刪除；名稱全部跳脫 | 4 |
| A5 | 切換週六路線會默默刪掉自訂行程 | 每條路線各自保存，切換不刪資料 | 4 |
| A6 | 時間用字串排序，`9:00` 排在 `10:00` 後面 | 統一整理成 HH:MM 再排序；輸入改用時間選擇器 | 4 |
| A7 | 改匯率會回頭改掉所有舊帳 | 每筆帳記下當時的匯率 | 4 |
| A8 | 重開 App 後週六路線按鈕沒有高亮 | 每次畫面重繪時同步高亮 | 4 |
| A9 | 範例資料會被當成真資料同步 | 遷移時排除範例資料；預設成員不上傳 | 4 |
| A10 | 「199 點」寫死，新增地點後不會更新 | 改成自動計算 | 4、6 |

### B. 最佳化

| 編號 | 項目 | 步驟 |
|---|---|---|
| B1 | PWA：可加到主畫面、可離線使用 | 5 |
| B2 | 資料模型改版：每筆資料都有 `id`、`updatedAt`、`deleted`、`by`，舊資料自動搬移 | 3、4 |
| B3 | 開銷記錄當下匯率 | 4 |
| B4 | 以提示訊息和對話框取代 `alert`、`prompt`、`confirm` | 4 |
| B5 | 大型資料（地點、讀本、字卡）拆成獨立檔案 | 2 |

### C. 新功能

| 編號 | 功能 | 步驟 |
|---|---|---|
| C1 | 行程「完成」標記，以及「目前」「下一站」提示（依沖繩當地時間） | 4 |
| C2 | 「我是誰」身分選擇：記帳自動帶入墊付人，資料記錄修改者 | 4 |
| C3 | 開銷可編輯、可分類，有每日小計和分類占比 | 4 |
| C4 | 結算結果直接分享到 LINE | 4 |
| C5 | 週六自駕工具：還車倒數、加油與停車用語卡、注意事項 | 4 |
| C6 | 每日天氣預報（Open-Meteo，免金鑰），風速過強時提醒 | 4 |
| C7 | 匯率自動抓取（open.er-api.com，免金鑰），可手動覆寫 | 4 |
| C8 | 資料備份下載與匯入 | 4 |
| — | Google 試算表雙向同步（修正版，取代舊規劃書第三節） | 7、8 |
| — | 新增 3 個地圖地點（199 點變 202 點） | 6 |

### D. UI／UX

| 編號 | 項目 | 步驟 |
|---|---|---|
| D1 | 頂部同步狀態燈號（僅存本機／同步中／已同步／離線暫存 N 筆／同步失敗／密碼錯誤） | 4 |
| D2 | 刪除後 5 秒內可以「復原」 | 4 |
| D3 | 底部導覽列由 6 個改成 5 個（保單急救保留在頂部紅色按鈕） | 4 |
| D4 | 記住上次的頁籤和捲動位置 | 4 |
| D5 | 深色模式（跟隨系統／淺色／深色） | 4 |
| D6 | 所有刪除與勾選按鈕的點擊範圍至少 44px | 4 |

---

## 第二章：新架構說明（讀懂即可，不需要動手）

### 2.1 檔案結構（改版後）

```
wise-mendel/
├── index.html              主頁面（HTML、樣式、靜態資料、地點／字卡／讀本／保單的畫面邏輯）
├── manifest.webmanifest    PWA 設定
├── sw.js                   離線快取
├── icons/                  App 圖示（3 個 PNG）
├── js/
│   ├── sync.js             資料層 Store 與雲端同步 SyncManager
│   ├── model.js            行程、成員、開銷、結算、偏好設定、v2 舊資料遷移
│   └── app.js              行程、分帳、品飲、設定、天氣、匯率、主題等畫面邏輯，以及啟動流程
├── data/
│   ├── places.js           RAW_PLACES（地點資料庫）
│   ├── culture.js          CULTURE_CHAPTERS（風土讀本）
│   └── flashcards.js       DEFAULT_FLASHCARDS（手指字卡）
└── upgrade_kit/            改版工具（改版完成後保留，不會被網站使用）
```

載入順序（`upgrade_v3.py` 會自動排好）：`js/sync.js` → `js/model.js` → `data/*.js` → `index.html` 主程式 → `js/app.js`。

### 2.2 資料分兩種

| 種類 | 存放位置 | 內容 | 會不會同步 |
|---|---|---|---|
| 共用資料 | `localStorage` 的 `okinawa_2026_v3_records` | 開銷、行程修改、品飲筆記、成員、週六路線 | 會，透過 Google 試算表 |
| 個人偏好 | `localStorage` 的 `okinawa_2026_v3_prefs` | 目前頁籤、收藏、篩選、匯率、免稅籃、保單勾選、自訂字卡、主題、還車時間 | 不會，只存在自己的手機 |

每筆共用資料的格式：

```json
{ "collection": "expenses", "id": "exp-lx3k2-ab12c", "updatedAt": 1792370000000,
  "deleted": false, "by": "子桓", "data": { "title": "燕食堂午餐", "amount": 3000, "...": "..." } }
```

- 刪除不會真的移除，而是標記 `deleted: true`，這樣才能把「刪除」同步給旅伴，也才能「復原」。
- 同一筆資料兩邊都改時，以 `updatedAt` 較新的為準。

### 2.3 同步流程

1. 每次修改都先寫進手機，畫面立刻更新，並放進「待送清單」。同一筆資料連續修改只會保留最後一次。
2. 1.5 秒後在背景送出待送清單（`push`），接著拉回旅伴的更新（`pull`）。
3. 斷線時待送清單留在手機；恢復網路、App 回到前景、每 60 秒，以及按「設定與同步 → 儲存」時都會再試一次。
4. 前端一律用 `POST` 搭配 `Content-Type: text/plain`，避開 Google Apps Script 不支援的 CORS 預檢。
5. 伺服器用遞增的 `rev` 編號記錄每次寫入，前端只拉 `rev` 比上次大的資料。
6. 送出的資料如果比雲端舊，伺服器會把雲端版本放在 `conflicts` 傳回，前端直接採用。

### 2.4 Google 試算表結構

| 工作表 | 用途 | 誰會讀 |
|---|---|---|
| `Records` | 唯一的資料來源，一列一筆紀錄 | App |
| `Expenses_View` | 開銷報表（中文欄位，金額是數字，可直接加總或下載 Excel） | 人 |
| `Itinerary_View` | 行程報表 | 人 |
| `Tasting_View` | 品飲筆記報表 | 人 |

報表由程式自動重建，**請不要手動修改任何工作表**，手動改的內容會被覆蓋或造成同步錯亂。

### 2.5 和舊規劃書相比修正了什麼

| 舊規劃書的問題 | v3 做法 |
|---|---|
| `updateOrAppendRow` 沒有定義 | 改用單一 `push`，依 ID 更新或新增 |
| `application/json` 會被 CORS 擋 | 改用 `text/plain` |
| 日期、時間、TRUE 被試算表自動轉型 | 資料以 JSON 文字存放，欄位格式設為純文字 |
| 中文欄名對不上前端英文欄位 | 資料欄位全部在 JSON 裡；中文只出現在報表 |
| `syncAll` 整張表覆寫會吃掉別人的資料 | 移除，只做逐筆合併 |
| 重送會產生重複資料 | 依 ID 寫入，重送不會重複 |
| 刪除無法同步 | 刪除標記 |
| 任何人拿到網址都能讀寫 | 需要同步密碼；密碼不寫在程式碼裡 |
| `Custom_Places` 只讀不寫 | 移除這張表（新地點直接寫進 `data/places.js`） |

---

## 第三章：逐步執行指引

### 步驟 1：準備工作

**1-1. 確認工作目錄乾淨**

```bash
git status
git log --oneline -1
```

預期：目前在 `main` 分支，最後一筆 commit 是 `2fca5b9 feat(culture): expand Okinawa cultural & historical reader to 15 interactive chapters`。`MEMORY.md` 顯示為已修改是正常的。

**1-2. 建立改版分支和備份**

```bash
git checkout -b v3-upgrade
```

```bash
cp index.html index.v2.backup.html
```

**1-3. 建立 `.gitignore`**

在專案根目錄建立 `.gitignore`，內容如下（完整複製）：

```
.DS_Store
*.pdf
*.backup.html
okinawa_2026.csv
okinawa_all_places.csv
okinawa_selected.csv
places_data.json
ANTIGRAVITY_CULTURE_SUPPLEMENT.md
GAS_INTEGRATION_PLAN.md
node_modules/
```

**1-4. 確認自動測試可以跑**

```bash
node upgrade_kit/test_sync.js
```

**驗證**：最後一行印出 `ALL TESTS PASSED`。如果沒有出現，停下來回報。

---

### 步驟 2：把大型資料拆成獨立檔案（B5）

```bash
python3 upgrade_kit/split_data.py
```

**驗證**：

1. 畫面印出三行「已寫出 data/places.js」「已寫出 data/culture.js」「已寫出 data/flashcards.js」，最後一行是「index.html 已更新」。
2. 執行以下指令，三個檔案都要印出 `ok`：

```bash
for f in data/*.js; do node --check "$f" && echo "ok $f"; done
```

3. **不要再執行第二次**。萬一誤執行，腳本會印出「找不到單行常數……（可能已經拆過了）」並停止，檔案不會被改動，這是正常的。

---

### 步驟 3：放入新的程式檔

```bash
mkdir -p js
```

```bash
cp upgrade_kit/sync.js upgrade_kit/model.js upgrade_kit/app.js js/
```

```bash
cp upgrade_kit/sw.js upgrade_kit/manifest.webmanifest ./
```

**驗證**：

```bash
for f in js/*.js sw.js; do node --check "$f" && echo "ok $f"; done
```

四個檔案都印出 `ok`。

---

### 步驟 4：執行自動改版腳本

這支腳本會一次完成 `index.html` 的 48 項修改：遮蔽個資、固定 Tailwind 版本、加入 PWA 設定與 v3 樣式、頂部同步燈號、天氣列與自駕卡、導覽列改 5 欄、分帳頁新欄位、對話框容器、刪除被取代的舊程式、`state` 改為 `prefs`、`alert` 改為 `toast`、加強跳脫，以及載入新的 js 檔。

```bash
python3 upgrade_kit/upgrade_v3.py
```

**驗證**：

1. 畫面逐行列出完成項目，最後一行是「全部完成，共 48 項。」。
2. 如果出現 `[停止] ...`，代表 `index.html` 和預期不同，**檔案沒有被修改**。把整段訊息回報給子桓，不要手動改。
3. 確認個資已經從網頁移除，以下指令要印出 `0`：

```bash
grep -c "A128378959\|361537836\|1993/06/15" index.html
```

4. 確認主程式語法正確：

```bash
python3 -c "import re;s=open('index.html',encoding='utf-8').read();open('/tmp/okinawa_main.js','w').write(re.findall(r'<script>(.*?)</script>',s,re.S)[1])" && node --check /tmp/okinawa_main.js && echo "main ok"
```

印出 `main ok`。

**4-1. 清除 `MEMORY.md` 裡的個資（手動）**

打開 `MEMORY.md`，找到這一行：

```
  - 護照號碼：361537836 / 身分證字號：A128378959
```

整行刪掉，改成：

```
  - 護照、身分證等證件號碼：不記錄在專案內（專案是公開的 GitHub 倉庫）
```

**驗證**：`grep -c "A128378959\|361537836" MEMORY.md` 印出 `0`。

---

### 步驟 5：產生圖示，完成 PWA 離線設定（A1、B1）

```bash
python3 upgrade_kit/make_icons.py
```

**驗證**：畫面印出三行「已產生 icons/...png」。

```bash
ls icons
```

應該有 `apple-touch-icon.png`、`icon-192.png`、`icon-512.png`。

> 重要規則（請記住，之後每次改版都適用）：只要修改了 `index.html`、`js/`、`data/` 底下任何檔案，就要把 `sw.js` 第 3 行 `CACHE_VERSION` 的最後三位數字加 1（例如 `v3-001` 改成 `v3-002`），手機才會拿到新版。

---

### 步驟 6：新增 3 個地圖地點（199 點變 202 點）

打開 `data/places.js`。檔案第 2 行開頭是 `const RAW_PLACES = [[1, "ORBIT RENT A CAR", ...`，這一行最後是 `]];`。

把最後的 `]];` 改成下面這段（注意：開頭的 `], ` 是用來接上前一筆資料，結尾仍是 `]];`）：

```js
], [2, "7-Eleven 那霸新天地浮島通店", "〒900-0014 沖縄県那覇市松尾２丁目１１−1", "住處周邊最近的 7-Eleven，可用 Seven Bank ATM 跨國提款。", "便利商店 / ATM", "", "", 26.21355, 127.68862, 0.15, "那霸（市區）", "選物採買,交通與應變"], [2, "Conte", "〒903-0813 沖縄県那覇市首里赤田町１丁目17", "首里赤田町的咖啡食堂，以沖繩在地蔬菜與肉品製作定食，店內也展示陶器與畫作。", "咖啡店 / 餐廳", "", "", 26.21715, 127.72298, 3.58, "那霸（首里）", "咖啡甜點,正餐美食"], [2, "LUCKY MAXIMUM", "〒900-0013 沖縄県那覇市牧志２丁目１６−12 宮里アパート 102.103", "牧志老公寓裡的選品店，有古著、獨立品牌服飾與生活物件。", "選物店", "", "", 26.21794, 127.68732, 0.59, "那霸（市區）", "選物採買"]];
```

**驗證**：

```bash
node --check data/places.js && node -e "eval(require('fs').readFileSync('data/places.js','utf8').replace('const RAW_PLACES','global.RAW_PLACES'));console.log(RAW_PLACES.length)"
```

印出 `202`。

> 需子桓確認：這三個地點的座標和地址來自舊規劃書，距離已用住處座標重新計算過。請子桓在 Google Maps 點開這三個地點，確認位置正確。

---

### 步驟 7：本機測試（不需要雲端）

**7-1. 啟動本機伺服器**

```bash
python3 -m http.server 8765
```

用 Chrome 開 `http://localhost:8765/`，按 F12 開開發者工具，切到手機模擬（iPhone 尺寸）。

**7-2. 逐項檢查**（每一項都要確認，有任何一項不符就停下來回報）

| # | 操作 | 預期結果 |
|---|---|---|
| 1 | 第一次開啟 | 跳出「先告訴我你是誰」對話框。選「子桓」，按儲存 |
| 2 | 看頂部 | 左邊顯示「僅存本機」，右邊有「設定與同步」按鈕 |
| 3 | 看行程頁 Day 1 | 有天氣列（溫度、降雨機率、風速、日落）；每張行程卡右上角有「完成」和「✕」 |
| 4 | 按任一行程的「完成」 | 按鈕變綠色「已完成」，卡片變淡，標題加刪除線 |
| 5 | 按「✕」 | 行程消失，底部出現「已刪除……」提示和「復原」按鈕；按復原後行程回來 |
| 6 | 用下方表單加入 `09:05 測試早餐` | 出現在 10:05 那一筆的上面（不是最下面） |
| 7 | 按「還原預設行程」 | 跳出確認對話框（不是瀏覽器原生的確認視窗）；確認後自訂項目消失、完成標記清除 |
| 8 | 切到 Day 3 | 出現「自駕日工具」卡片和路線切換按鈕 |
| 9 | Day 3 切到 B 路線，加一筆自訂行程，切回 A 再切回 B | B 路線的自訂行程還在 |
| 10 | 地點頁按任一地點的「+ 排入行程表」 | 跳出對話框可選日期和時間（不是瀏覽器原生的輸入視窗）；加入後跳到行程頁 |
| 11 | 地點頁數量文字 | 顯示「符合條件共 202 個地點（總庫 202 點）」 |
| 12 | 分帳頁看匯率旁邊 | 顯示「自動匯率，更新於 ……」 |
| 13 | 記一筆帳：`燕食堂 午餐`、3000、JPY、分類「餐飲」 | 墊付人預設是「子桓」；明細出現這筆，下方有「每日小計」和「分類占比」 |
| 14 | 按這筆帳的「改」，金額改 3500，按「更新這筆帳目」 | 金額變成 ¥3,500，沒有多出第二筆 |
| 15 | 新增旅伴 `阿哲`，記一筆阿哲墊付的帳，再試著移除阿哲 | 出現「還有 1 筆相關帳目」提示，阿哲沒有被刪掉 |
| 16 | 手動把匯率改成 0.3 | 提示「舊帳不變」；舊帳的台幣金額沒有變；匯率旁顯示「手動匯率 改回自動」 |
| 17 | 按「把結算結果傳到 LINE」 | 手機上會跳出分享選單；電腦上會開 LINE 分享頁 |
| 18 | 風土品飲頁新增一筆品飲筆記，名稱輸入 `<b>測試</b>` | 畫面上顯示的是 `<b>測試</b>` 文字本身，不會變粗體 |
| 19 | 底部導覽列 | 只有 5 個按鈕；頂部紅色「保單急救」仍可進入保單頁 |
| 20 | 保單頁 | 護照只顯示末四碼，身分證字號顯示「不公開顯示」 |
| 21 | 切到分帳頁，往下捲一點，重新整理 | 仍停在分帳頁的同一個位置 |
| 22 | 設定與同步 → 外觀選「深色」→ 儲存 | 整個畫面變深色，文字看得清楚 |
| 23 | 設定與同步 → 下載備份檔 | 下載一個 `okinawa-2026-backup-日期.json` |
| 24 | 開發者工具 Console | 沒有紅色錯誤（`favicon` 之外） |

**7-3. 離線測試**

1. 重新整理一次頁面，讓離線快取裝好。
2. 開發者工具 → Application → Service Workers，確認狀態是 `activated and is running`。
3. 開發者工具 → Network，把 `No throttling` 改成 `Offline`。
4. 重新整理頁面。

**驗證**：頁面正常顯示，樣式完整（頂部是深藍色），行程與地點都在。記一筆帳後，頂部仍顯示「僅存本機」（還沒設定雲端，所以正常）。

測完把 Network 改回 `No throttling`，並在終端機按 `Ctrl + C` 停止伺服器。

**7-4. 舊資料遷移測試**（確認子桓手機上的 v2 舊資料會被正確搬過來）

1. 開 `http://localhost:8765/`，在 Console 輸入以下指令（模擬一支有舊資料的手機）：

```js
localStorage.clear();
localStorage.setItem('okinawa_2026_tzh_v2', JSON.stringify({ currentDay: 3, satRoute: 'north', fxRate: 0.21, members: ['子桓', '旅伴 A', '小美'], expenses: [{ id: 1, title: '範例', amount: 8500, currency: 'JPY', payer: '子桓', splitters: ['子桓'] }, { id: 1729500000000, title: '泡盛', amount: 2000, currency: 'JPY', payer: '小美', method: '現金', splitters: ['子桓', '小美'], time: '10/22 21:00' }], customItinerary: { 1: [{ time: '9:00', title: '自訂早餐' }] } }));
location.reload();
```

2. **驗證**：重新載入後停在 Day 3、北部路線；分帳只有「泡盛」一筆（範例那筆不會出現）；成員有小美；Day 1 只剩「09:00 自訂早餐」。
3. 測完在 Console 執行 `localStorage.clear(); location.reload();` 清掉測試資料。

**7-5. 提交到本機分支**

```bash
git add .gitignore index.html MEMORY.md manifest.webmanifest sw.js icons js data upgrade_kit UPGRADE_PLAN_v3.md
```

```bash
git status
```

確認清單中**沒有** `.pdf`、`.csv`、`places_data.json`、`.DS_Store`、`index.v2.backup.html`，然後：

```bash
git commit -m "feat(v3): 離線 PWA、資料模型改版、雲端同步準備、修正 XSS 與個資外洩"
```

**到這裡先停下來，回報子桓「步驟 1 到 7 完成」，等子桓完成步驟 8。**

---

### 步驟 8：建立 Google 試算表並部署同步 API（需子桓操作，約 10 分鐘）

> 這一步必須由子桓本人用自己的 Google 帳號操作。Antigravity 只負責在旁邊說明，不可以代為登入或輸入密碼。

**8-1. 建立試算表**

1. 開啟指定資料夾：`https://drive.google.com/drive/folders/1wxOvZsAAwsbob3yr-u4HezyBlydvqYI2`
2. 點「新增」→「Google 試算表」→「空白試算表」。
3. 左上角檔名改成 `Okinawa_2026_Database`。
4. **不需要**自己建立工作表或標題列，下一步的程式會自動建立。

**8-2. 貼上程式碼**

1. 在試算表選單點「擴充功能」→「Apps Script」。
2. 編輯器裡預設有一個 `程式碼.gs`（或 `Code.gs`），裡面有 `function myFunction() {}`。把裡面的內容**全部刪掉**。
3. 打開專案裡的 `upgrade_kit/Code.gs`，全選複製，貼到編輯器。
4. 按上方的磁碟圖示（儲存）。

**8-3. 執行一次 `setup`（建立工作表並產生同步密碼）**

1. 編輯器上方有一個函式下拉選單，選 `setup`。
2. 按「執行」。
3. 第一次會跳出「需要授權」：按「審查權限」→ 選自己的 Google 帳號 → 出現「Google 尚未驗證這個應用程式」時，按左下角「進階」→「前往『未命名的專案』（不安全）」→「允許」。這是因為這支程式是自己寫的，沒有送 Google 審查，屬於正常現象。
4. 下方「執行記錄」會出現一行：`同步密碼（請抄到 App 的雲端設定）：xxxxxxxxxxxxxxxx`
5. **把這 16 碼密碼抄下來**，之後要傳給旅伴。
6. 回到試算表分頁，應該多出 `Records`、`Expenses_View`、`Itinerary_View`、`Tasting_View` 四張工作表。原本的「工作表1」可以刪掉。

> 忘記密碼時：在 Apps Script 編輯器左側點齒輪「專案設定」，拉到最下面「指令碼屬性」，`TOKEN` 的值就是密碼。

**8-4. 部署成網頁應用程式**

1. 編輯器右上角按「部署」→「新增部署作業」。
2. 左邊「選取類型」旁的齒輪 → 選「網頁應用程式」。
3. 說明：填 `v3`。
4. 執行身分：選「我（自己的 Gmail）」。
5. 誰可以存取：選「所有人」。（安全性由同步密碼把關，網址公開也沒關係。）
6. 按「部署」，再授權一次（同 8-3 第 3 點）。
7. 複製「網頁應用程式」網址，結尾是 `/exec`。把這個網址交給 Antigravity。

**8-5. 驗證**

用瀏覽器直接開那個 `/exec` 網址，畫面應顯示：

```
{"status":"ok","message":"OKINAWA 2026 sync API. Use POST."}
```

> 之後如果修改了 `Code.gs`：要按「部署」→「管理部署作業」→ 鉛筆圖示 →「版本」選「新版本」→「部署」。這樣網址不會變。**不要**按「新增部署作業」，那會產生新網址，App 要跟著改。

---

### 步驟 9：接上雲端並測試同步（Antigravity 執行）

**9-1. 填入網址**

打開 `js/sync.js`，找到這一行：

```js
  API_URL: '',
```

把子桓給的網址填進引號裡，例如：

```js
  API_URL: 'https://script.google.com/macros/s/AKfycb.../exec',
```

**同步密碼不可以寫進任何程式檔**，它只能由使用者在 App 的「設定與同步」裡輸入。

**9-2. 更新快取版本**

`sw.js` 第 3 行改成：

```js
const CACHE_VERSION = 'okinawa-2026-v3-002';
```

**9-3. 雙視窗同步測試**

1. 啟動本機伺服器：`python3 -m http.server 8765`
2. 視窗 A：一般的 Chrome 視窗開 `http://localhost:8765/`。設定與同步 → 我是「子桓」→ 同步密碼貼上 → 儲存。
3. 視窗 B：Chrome 無痕視窗開同一個網址。設定與同步 → 我是「旅伴 A」→ 同一組密碼 → 儲存。

| # | 操作 | 預期結果 |
|---|---|---|
| 1 | 兩個視窗儲存設定後 | 頂部變成「已與雲端同步」（綠色） |
| 2 | A 記一筆帳 `測試同步` 1000 JPY | 約 2 秒後 A 顯示「已與雲端同步」；試算表 `Expenses_View` 出現這筆，「折合台幣」是數字 |
| 3 | B 按「設定與同步」→「儲存」（或等 60 秒） | B 的分帳頁出現 `測試同步`，墊付人是子桓 |
| 4 | B 把 Day 1 第一個行程按「完成」 | A 在 60 秒內（或切換分頁再回來後）也顯示已完成 |
| 5 | A 刪除 `測試同步` | B 同步後這筆也消失；試算表 `Expenses_View` 也沒有這筆 |
| 6 | A 在 Network 設 Offline，記兩筆帳 | 頂部顯示「離線暫存 2 筆」 |
| 7 | A 改回 No throttling | 幾秒內變回「已與雲端同步」；B 同步後看得到這兩筆 |
| 8 | 在 B 的設定把密碼改成 `wrong` | 頂部顯示「同步密碼錯誤」；改回正確密碼後恢復 |
| 9 | 打開試算表 `Records` | 每一筆資料一列，`data` 欄是 JSON 文字 |

全部符合後，把測試資料（`測試同步` 等）在 App 裡刪掉。

**9-4. 提交**

```bash
git add js/sync.js sw.js
```

```bash
git commit -m "feat(sync): 接上 Google Apps Script 同步 API"
```

**停下來，回報子桓「步驟 9 完成，等待同意推送」。**

---

### 步驟 10：推送上線（需子桓同意後才執行）

收到子桓明確說「可以推送」之後：

```bash
git checkout main
```

```bash
git merge v3-upgrade
```

```bash
git push origin main
```

**驗證**：

1. 等 1 到 2 分鐘，開 `https://toda-shinichi.github.io/okinawa-2026/`，確認看到新版（頂部有「設定與同步」按鈕）。
2. 用以下指令確認線上版已經沒有個資，要印出 `0`：

```bash
curl -s https://toda-shinichi.github.io/okinawa-2026/ | grep -c "A128378959\|361537836"
```

---

### 步驟 11：旅伴手機安裝說明（給子桓轉傳）

可以直接複製以下文字傳到 LINE 群組（密碼請私訊，不要貼在群組）：

```
沖繩旅行助理網址：https://toda-shinichi.github.io/okinawa-2026/

iPhone：用 Safari 開啟 → 下方分享按鈕 → 加入主畫面
Android：用 Chrome 開啟 → 右上角選單 → 加到主畫面

第一次打開會問你是誰，選自己的名字。
接著按上方「設定與同步」，輸入我私訊給你的同步密碼，按儲存。
頂部顯示「已與雲端同步」就完成了。

出發前請連著網路打開一次，之後在沖繩沒網路也能用，連上網路後會自動補傳。
```

---

## 第四章：常見問題排除

| 狀況 | 原因 | 處理 |
|---|---|---|
| `upgrade_v3.py` 印出 `[停止] ...預期找到 1 處，實際找到 0 處` | `index.html` 不是預期的版本（可能被 `build_app.py` 覆蓋，或已經手動改過） | 執行 `git checkout index.html` 回到最後一次 commit，從步驟 2 重來；仍失敗就回報 |
| 改了程式但手機上沒變 | 離線快取還是舊版 | 確認 `sw.js` 的 `CACHE_VERSION` 有加 1；手機把 App 完全關掉再開兩次 |
| 頂部一直是「同步失敗」 | GAS 網址錯誤，或部署時「誰可以存取」不是「所有人」 | 用瀏覽器開 `/exec` 網址，看是否出現步驟 8-5 的文字 |
| 頂部是「同步密碼錯誤」 | 密碼打錯，或子桓重新執行過 `setup` | 到 Apps Script「專案設定 → 指令碼屬性」查 `TOKEN` |
| 試算表出現「找不到 Records 工作表」錯誤 | 沒執行 `setup` 或把 `Records` 刪掉了 | 重新執行 `setup`（密碼不會改變） |
| 「離線暫存 N 筆」一直不歸零 | 網路不穩或 GAS 忙碌 | 等網路穩定後按「設定與同步 → 儲存」；資料不會遺失 |
| 天氣列顯示「連上網路後自動更新」 | 離線，或日期還不在 16 天預報範圍內 | 連網後自動更新，不需處理 |
| 想在電腦上看帳 | — | 直接開 Google 試算表的 `Expenses_View`，可用「檔案 → 下載 → Excel」 |

---

## 第五章：之後的維護規則

1. 改了 `index.html`、`js/`、`data/` 任何檔案，就要把 `sw.js` 的 `CACHE_VERSION` 加 1。
2. `index.html` 裡的 `DEFAULT_ITINERARY` 和 `SAT_ROUTES`：**只能在陣列尾端新增行程，不可以插入中間、刪除或調換順序**。預設行程的 ID 是依位置編號的（例如 `def-d1-03` 是 Day 1 第 3 筆），順序一變，已同步的完成標記就會對到錯的行程。要修改某一筆預設行程的文字可以，位置不要動。
3. 新增地點：直接編輯 `data/places.js`，在最後的 `]];` 前面接上新資料（格式見步驟 6），數量會自動更新。
4. 改了 `upgrade_kit/sync.js` 或 `upgrade_kit/model.js` 後，先跑 `node upgrade_kit/test_sync.js` 確認通過，再複製到 `js/`。
5. `build_app.py` 已經不能用，請不要執行。之後如果要清理，由子桓決定是否刪除。

---

## 第六章：需要子桓決定的事項

| # | 事項 | 說明 | 建議 |
|---|---|---|---|
| 1 | **git 歷史紀錄裡的身分證字號與護照號碼** | 步驟 4 只能讓「最新版本」不再出現。GitHub 上舊的 commit 仍然看得到，任何人都能翻到。要徹底移除，需要改寫 git 歷史並強制推送（`git filter-repo` 加 `git push --force`），這個動作無法復原，也會讓其他人手上的副本失效 | 建議做。也可以考慮把倉庫改成私人（但 GitHub Pages 用私人倉庫需要付費方案） |
| 2 | 證件號碼是否已被別人看到 | 網站公開期間無法確認是否被爬取 | 視情況留意可疑的身分冒用；護照可考慮出國回來後評估 |
| 3 | 新增 3 個地點的座標 | 見步驟 6 | 請在 Google Maps 確認 |
| 4 | 推送上線的時間 | 見步驟 10 | 建議 10/21 晚上前完成，讓旅伴出發前先開一次 App |

---

## 附錄 A：`upgrade_kit/` 檔案說明

| 檔案 | 用途 | 使用步驟 |
|---|---|---|
| `split_data.py` | 把三大資料常數拆到 `data/` | 2 |
| `sync.js` | 資料層與同步（複製到 `js/`） | 3 |
| `model.js` | 資料模型與遷移（複製到 `js/`） | 3 |
| `app.js` | 介面邏輯與啟動（複製到 `js/`） | 3 |
| `sw.js`、`manifest.webmanifest` | 離線快取與 PWA 設定（複製到根目錄） | 3 |
| `upgrade_v3.py` | 自動修改 `index.html` 共 48 處 | 4 |
| `v3.css` | `upgrade_v3.py` 會讀取並插入的樣式 | 4 |
| `make_icons.py` | 產生 App 圖示，不需安裝任何套件 | 5 |
| `Code.gs` | Google Apps Script 同步 API | 8 |
| `test_sync.js` | 自動測試：模擬兩支手機和 GAS 伺服器，涵蓋 15 種情境 | 1、維護時 |

## 附錄 B：同步 API 規格

所有請求都是 `POST` 到 GAS 網址，`Content-Type: text/plain;charset=utf-8`，body 為 JSON 字串。

| action | 請求 | 回應 |
|---|---|---|
| `ping` | `{ "action": "ping", "token": "..." }` | `{ "status": "ok" }` |
| `pull` | `{ "action": "pull", "token": "...", "since": 0 }` | `{ "status": "ok", "rev": 42, "records": [ ... ] }` |
| `push` | `{ "action": "push", "token": "...", "records": [ ... ] }`（單次最多 300 筆） | `{ "status": "ok", "rev": 45, "accepted": [...], "rejected": [...], "conflicts": [...] }` |

錯誤回應：`{ "status": "error", "code": "unauthorized | busy | bad_json | bad_action | bad_records | too_many | server", "message": "..." }`

允許的 `collection`：`expenses`、`itinerary`、`tastings`、`members`、`settings`、`places`。

## 附錄 C：已完成的驗證紀錄（撰寫本規劃書時）

| 項目 | 方法 | 結果 |
|---|---|---|
| GAS 與前端同步邏輯 | `test_sync.js`：模擬 GAS 試算表與兩到三支手機，涵蓋密碼錯誤、新增、完成標記、報表與公式注入、離線佇列、回應遺失後重送不重複、刪除同步、同時修改的衝突處理、週六路線切換、刪除與還原預設行程、成員保護與結算、v2 遷移、備份匯入匯出、欄位驗證 | 全部通過 |
| 拆檔與改版腳本 | 在 `index.html` 副本上執行，並重複執行確認會被擋下 | 48 項全部成功；重複執行正確停止 |
| 功能與畫面 | 375px 手機尺寸實際操作：身分選擇、行程完成／刪除／復原／排序、週六路線、排入行程對話框、記帳／編輯／分類／統計、成員保護、手動匯率、XSS、深色模式、頁籤記憶、v2 遷移 | 全部正常 |
| 離線 | Chrome headless：Service Worker 安裝後斷網重新整理 | 樣式、行程與 199 個地點正常顯示，沒有錯誤 |
| 外部服務 | Tailwind 3.4.17、Open-Meteo、open.er-api.com 實際連線 | 皆可用，天氣與匯率 API 都有開放 CORS |

未能在撰寫時驗證的部分：真實的 Google Apps Script 部署（需要子桓的帳號），由步驟 9-3 補驗。

## 附錄 D：備註

- 日本自 2026 年 11 月 1 日起改為「先付稅、出境時退稅」的新制。本次旅程在 10/22 到 10/25，仍適用現行的店內免稅，App 的 ¥5,000 免稅湊單器不需要修改。
- 天氣與匯率都使用免金鑰的公開服務，沒有網路時會沿用上一次取得的資料。
