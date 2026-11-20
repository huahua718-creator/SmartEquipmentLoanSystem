# 智慧型器材借閱管理系統 (Smart Equipment Loan System)

免安裝 App、免專用掃碼槍的輕量級器材借閱系統，由原有的 NFC (PN532) 器材借還系統升級為手機相機連續掃碼架構。

## 系統特色

- **手機鏡頭連續掃碼**：整合 `html5-qrcode`，支援前後鏡頭切換、2.5 秒防重複掃描（Debounce）、Web Audio API 提示音與手機震動回饋。
- **LINE 內建瀏覽器防呆**：自動偵測 `Line/` 環境並引導使用者以 Safari / Chrome 開啟，附一鍵複製網址。
- **借閱人記憶預填**：使用 `localStorage`（`eq_loan_user_profile`）自動預填班級/處室、姓名與聯絡方式，並提供「切換借閱人（清除記憶）」按鈕供公用平板輪流使用。
- **併發寫入保護**：GAS 後端使用 `LockService.getScriptLock()` 避免多人同時借還造成資料覆蓋衝突。
- **器材現況一覽**：免掃碼即可即時搜尋在館可借、借出中（含借閱人）與維修中器材。
- **逾期未歸還通知**：保留並升級原系統的 `sendOverdueEmailNotification()` 每日排程寄信功能。

## 檔案說明

- `Code.gs`：Google Apps Script 後端 API（含 `setupSheets()` 一鍵建表與範例資料、`doGet()`、`doPost()`、`sendOverdueEmailNotification()`）。
- `index.html`：單一靜態前端頁面（HTML5 + Tailwind CSS CDN + Vanilla JS + html5-qrcode）。

## 快速啟用步驟

### 1. 設定 Google Sheets 與 Apps Script 後端
1. 開啟已建立於 Google Drive 的試算表（包含 `Equipment`、`Logs`、`Settings` 三個工作表）。
2. 點擊試算表上方選單 **「擴充功能」>「Apps Script」**。
3. 將 `Code.gs` 完整貼入編輯器並儲存（`Ctrl + S`）。
4. （若使用全新空白試算表）在函式下拉選單選擇 `setupSheets` 並點擊「執行」，即可自動建立表頭與範例資料。
5. 點擊右上角 **「部署」>「新增部署」**，類型選擇 **「網頁應用程式」**：
   - 執行身分：**我**
   - 誰可以存取：**所有人**
6. 複製產生的 **網頁應用程式 URL**。
7. （選用）於 Apps Script 左側「觸發條件」新增時間驅動觸發條件，每日早上 8:00 執行 `sendOverdueEmailNotification` 以寄送逾期提醒信。

### 2. 設定並部署前端 (`index.html`)
1. 開啟 `index.html`，將頂部常數 `GAS_API_URL` 的 `"YOUR_GAS_WEB_APP_URL"` 替換為步驟 1 取得的 Web App URL。
2. 將專案部署至支援 HTTPS 的靜態託管平台（如 Vercel、Netlify 或 GitHub Pages）即可使用手機相機掃碼。
