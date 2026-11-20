# 智慧型器材借閱管理系統 (Smart Equipment Loan System)

免安裝 App、免專用掃碼槍的輕量級器材借閱系統，由原有的 NFC (PN532) 器材借還系統升級為「老師手機借用端」與「管理員歸還及條碼印製端」雙網頁分離架構。

## 系統特色

- **借還雙網頁權限分離＋後端 PIN 碼驗證**：
  - `index.html`（**老師手機借用端**）：僅提供「我要借閱」與「器材現況一覽」，支援從預建 `Users` 名單快速選填，也可自由填寫並記憶於 `localStorage`。
  - `return.html`（**管理員歸還與條碼作業端**）：進入前須驗證 `Settings` 中的 `admin_pin`（預設 `1234`），後端執行歸還時也會強制核對 PIN 碼，確保器材確實經管理員點收歸還。
- **預建使用者名單與雙重逾期 Email 通知**：
  - 試算表新增 `Users` 工作表，可預先建置教師／借閱人姓名、單位與 Email。
  - `sendOverdueEmailNotification()` 每日排程檢查逾期項目時，會**自動寄信給該位借閱人**，並將完整彙整報告（含個人通知結果）寄給管理員。
- **QR Code 批量產生與印製**：
  - 支援「依試算表設備清單產生」（可篩選分類、勾選項目、設定每台列印張數）與「依設備數量批量序號產生」（輸入前綴與數量一鍵產生連續貼紙）。
  - 支援額外產生「老師借閱入口海報 QR Code」，並提供 `@media print` 專用排版一鍵列印。
- **手機鏡頭連續掃碼**：整合 `html5-qrcode`，支援前後鏡頭切換、2.5 秒防重複掃描（Debounce）、Web Audio API 提示音與手機震動回饋。
- **LINE 內建瀏覽器防呆**：自動偵測 `Line/` 環境並引導使用者以 Safari / Chrome 開啟，附一鍵複製網址。
- **併發寫入保護**：GAS 後端使用 `LockService.getScriptLock()` 避免多人同時借還造成資料覆蓋衝突。

## Google Sheets 工作表結構

1. `Equipment`：`item_id`、`item_name`、`category`、`location`、`status`、`current_borrower`、`current_unit`、`last_updated`
2. `Logs`：`log_id`、`timestamp`、`action`、`item_id`、`item_name`、`borrower_unit`、`borrower_name`、`borrower_contact`、`note`
3. `Settings`：`system_title`、`admin_pin`（預設 `1234`）、`admin_email`、`overdue_hours`（預設 `24`）、`notify_borrower_on_overdue`（`TRUE`）
4. `Users`：`user_id`、`unit`、`name`、`email`、`contact`、`role`、`active`

## 已綁定之 GAS Web App
- **Script ID**：`1ah9qpaK5vUdajKTthKTFFXAHQZmUQDIg-d4kuq0mhl4De7tAF9pOpVSu`
- **Web App URL**：`https://script.google.com/macros/s/AKfycbzNSPUOhz_Aq771uuXHncjfMISLxBy4JMMMmpW5YEfl2gQhGv4DJQii8eVRrWiLXKJx/exec`

## 啟用每日自動逾期通知排程
於 Google Apps Script 編輯器上方選擇 `setupOverdueTrigger` 並點擊「執行」一次，即可自動建立每天早上 8:00～9:00 執行 `sendOverdueEmailNotification` 的排程（或手動至「觸發條件」頁面設定）。
