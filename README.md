# 智慧型器材借閱管理系統 (Smart Equipment Loan System)

免安裝 App、免專用掃碼槍的輕量級器材借閱系統，由原有的 NFC (PN532) 器材借還系統升級為「老師手機借用端」與「管理員歸還及條碼印製端」雙網頁分離架構。

## 系統特色

- **借還雙網頁權限分離**：
  - `index.html`（**老師手機借用端**）：僅提供「我要借閱」與「器材現況一覽」，老師無法自行操作歸還，確保器材必須經管理人員點收歸還。
  - `return.html`（**管理員歸還與條碼作業端**）：提供管理員掃碼／一鍵點選辦理歸還，並內建 **QR Code 批量產生與列印選單**。
- **QR Code 批量產生與印製**：
  - 支援「依試算表設備清單產生」（可篩選分類、勾選項目、設定每台列印張數）與「依設備數量批量序號產生」（輸入前綴與數量一鍵產生連續貼紙）。
  - 支援額外產生「老師借閱入口海報 QR Code」，並提供 `@media print` 專用排版一鍵列印。
- **手機鏡頭連續掃碼**：整合 `html5-qrcode`，支援前後鏡頭切換、2.5 秒防重複掃描（Debounce）、Web Audio API 提示音與手機震動回饋。
- **LINE 內建瀏覽器防呆**：自動偵測 `Line/` 環境並引導使用者以 Safari / Chrome 開啟，附一鍵複製網址。
- **借閱人記憶預填**：使用 `localStorage`（`eq_loan_user_profile`）自動預填班級/處室、姓名與聯絡方式，並提供「切換借閱人（清除記憶）」按鈕。
- **併發寫入保護**：GAS 後端使用 `LockService.getScriptLock()` 避免多人同時借還造成資料覆蓋衝突。

## 檔案與部署資訊

- `Code.gs`：Google Apps Script 後端 API（含 `setupSheets()`、`doGet()`、`doPost()`、`sendOverdueEmailNotification()`）。
- `index.html`：老師手機借用端網頁（已設定連線至 GAS Web App URL）。
- `return.html`：管理員歸還確認與 QR Code 批量印製網頁（已設定連線至 GAS Web App URL）。
- `.clasp.json`：Apps Script 專案設定（Script ID：`1ah9qpaK5vUdajKTthKTFFXAHQZmUQDIg-d4kuq0mhl4De7tAF9pOpVSu`）。

### 已綁定之 GAS Web App
- **Script ID**：`1ah9qpaK5vUdajKTthKTFFXAHQZmUQDIg-d4kuq0mhl4De7tAF9pOpVSu`
- **Web App URL**：`https://script.google.com/macros/s/AKfycbzNSPUOhz_Aq771uuXHncjfMISLxBy4JMMMmpW5YEfl2gQhGv4DJQii8eVRrWiLXKJx/exec`

### 前端靜態部署
將 `index.html` 與 `return.html` 一併部署至 Vercel / Netlify / GitHub Pages：
- 公開分享給老師掃碼借用：`https://<你的網域>/index.html`
- 管理人員專用歸還與條碼印製：`https://<你的網域>/return.html`
