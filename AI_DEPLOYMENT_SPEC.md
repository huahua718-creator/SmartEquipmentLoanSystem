# 🤖 AI 快速部署與開發規格書 (AI Deployment & System Specification)

> **本文件用途**：專為 **Antigravity、Cursor、Claude、ChatGPT** 等 AI 程式助手設計。  
> 其他老師或學校管理員只需將本專案資料夾（或本規格書）交給 AI，AI 即可依循本規格書的**資料庫結構、API 介面、權限安全規範與部署 Runbook**，協助使用者在數分鐘內完成個人化設定、Google Sheets 建表、GAS 部署與前端靜態上線。

---

## 0. 給 AI 的直接執行指令 (Copy-Paste Prompt)

如果你是拿到本專案（已 Fork 或下載資料夾）的老師，請直接複製以下指令貼給 AI：

> **「請閱讀專案內的 `AI_DEPLOYMENT_SPEC.md` 與現有程式碼（`Code.gs`、`index.html`、`return.html`）。請先向我確認：1) 我的系統標題與管理員 Email／PIN 碼；2) 我是否已複製範本試算表或要由你協助建表；3) 我要部署的 GAS Web App URL（或是否使用 `clasp` 部署）與前端託管平台（GitHub Pages / Vercel / Netlify）。接著請依規格書幫我完成設定修改、驗證與推送部署。」**

如果你想讓 AI **從零重建或客製化延伸功能**，請加上：

> **「請嚴格遵守 `AI_DEPLOYMENT_SPEC.md` 的四張工作表 Schema、CORS `text/plain;charset=utf-8` 規範、`LockService` 併發控制與借還雙頁分離權限設計，確保輸出完整無省略之程式碼。」**

---

## 1. 系統架構總覽 (Architecture Overview)

本系統採用 **雙靜態網頁 + Google Apps Script (GAS) + Google Sheets** 零維護無伺服器架構：

| 元件 | 檔案 | 角色與權限 | 關鍵技術 |
| :--- | :--- | :--- | :--- |
| **老師借閱端** | `index.html` | 公開給師生使用。**僅允許借閱 (`BORROW`) 與查詢現況**，不得出現歸還功能或管理頁連結。 | Tailwind CSS CDN、`html5-qrcode`、Web Audio API、`localStorage` |
| **管理員作業端** | `return.html` | 限管理人員使用。需經 **PIN 碼驗證**才可進入與送出歸還 (`RETURN`)，並內建 **QR Code 批量產生與列印**。 | Tailwind CSS CDN、`html5-qrcode`、`qrcodejs`、`sessionStorage`、`@media print` |
| **後端 API** | `Code.gs` | 部署為 GAS Web App（執行身分：我；存取權限：所有人）。含併發鎖定、PIN 驗證與每日逾期寄信排程。 | `LockService`、`SpreadsheetApp`、`MailApp`、`ScriptApp` |
| **資料庫** | Google Sheets | 單一試算表包含 4 個工作表：`Equipment`、`Logs`、`Settings`、`Users`。 | 範本副本：<https://docs.google.com/spreadsheets/d/1dE3wHYYRjY-x6szGyZKHdkMfl-fw50KVxIoQ5xVMh-E/copy> |

---

## 2. Google Sheets 資料庫結構 (Database Schema)

試算表必須包含以下 **4 個工作表**，第 1 列為欄位名稱（Header）：

### Sheet 1：`Equipment`（器材主檔）
| 欄位 | 型別 | 說明 |
| :--- | :--- | :--- |
| `item_id` | String (PK) | 器材唯一編號（即 QR Code 內容，比對時採大寫 trim），例：`EQ-001` |
| `item_name` | String | 器材名稱，例：`數位三用電表` |
| `category` | String | 分類，例：`電學器材` |
| `location` | String | 存放櫃位，例：`理化實驗室 A 櫃-1層` |
| `status` | Enum | `AVAILABLE`（在館）、`BORROWED`（借出中）、`MAINTENANCE`（維修中） |
| `current_borrower` | String | 目前借閱人姓名（在館時為空字串） |
| `current_unit` | String | 目前借閱人班級／處室（在館時為空字串） |
| `last_updated` | String/DateTime | 最後異動時間，固定格式化為 `YYYY-MM-DD HH:mm:ss` |

### Sheet 2：`Logs`（借還歷史流水帳）
| 欄位 | 型別 | 說明 |
| :--- | :--- | :--- |
| `log_id` | String (PK) | 流水號，格式 `LOG-YYYYMMDD-001`（當日遞增） |
| `timestamp` | String | 操作時間 `YYYY-MM-DD HH:mm:ss` |
| `action` | Enum | `BORROW`（借出）或 `RETURN`（歸還） |
| `item_id` | String | 器材編號 |
| `item_name` | String | 器材名稱（冗餘備份） |
| `borrower_unit` | String | 班級／處室 |
| `borrower_name` | String | 借閱／歸還人姓名 |
| `borrower_contact` | String | 分機或聯絡方式 |
| `note` | String | 備註（課程用途或歸還點收異常說明） |

### Sheet 3：`Settings`（系統參數設定）
| `key` | 預設值範例 | 說明 |
| :--- | :--- | :--- |
| `system_title` | `智慧型器材借閱管理系統` | 顯示於前端標題與通知信主旨 |
| `admin_pin` | `1234` | 管理員進入 `return.html` 與執行 `RETURN` API 必驗之 PIN 碼（部署時應引導使用者修改） |
| `admin_email` | `admin@school.edu.tw` | 接收每日逾期彙整報告的管理員信箱 |
| `overdue_hours` | `24` | 借出超過幾小時視為逾期 |
| `notify_borrower_on_overdue` | `TRUE` | `TRUE` 時於逾期排程直接寄提醒信給借閱人 |

### Sheet 4：`Users`（預建借閱人名單與通知信箱）
| 欄位 | 型別 | 說明 |
| :--- | :--- | :--- |
| `user_id` | String (PK) | 使用者編號，例：`U-001` |
| `unit` | String | 班級／處室，例：`自然科` |
| `name` | String | 姓名，例：`陳大華` |
| `email` | String | 通知 Email（用於每日逾期提醒） |
| `contact` | String | 分機或電話 |
| `role` | String | 身分，例：`教師`、`職員`、`學生` |
| `active` | Boolean/String | `TRUE` 或 `FALSE`（僅 `TRUE` 會出現在前端下拉選單與參與通知查詢） |

---

## 3. 前後端 API 介面規範 (GAS Web App Contract)

> **關鍵 CORS 規範**：所有前端 `POST` 請求**必須**使用 `Content-Type: text/plain;charset=utf-8` 傳送 `JSON.stringify(payload)`，以避免 Google Apps Script 遭遇 `OPTIONS` Preflight 失敗。

### 3.1 `GET {GAS_API_URL}?action=getEquipment`
回傳所有器材、啟用中的使用者（**不回傳原始 Email，僅回傳 `has_email` 布林旗標**以保護隱私）與公開設定：
```json
{
  "success": true,
  "data": [
    {
      "item_id": "EQ-001",
      "item_name": "數位三用電表",
      "category": "電學器材",
      "location": "理化實驗室 A 櫃-1層",
      "status": "AVAILABLE",
      "current_borrower": "",
      "current_unit": "",
      "last_updated": "2026-11-20 12:30:00"
    }
  ],
  "users": [
    {
      "user_id": "U-001",
      "unit": "自然科",
      "name": "陳大華",
      "contact": "分機 201",
      "role": "教師",
      "has_email": true
    }
  ],
  "settings": {
    "system_title": "智慧型器材借閱管理系統",
    "pin_required": true
  }
}
```

### 3.2 `POST {GAS_API_URL}` — 管理員 PIN 碼驗證 (`verifyAdminPin`)
- **Payload**：`{ "action": "verifyAdminPin", "pin": "1234" }`
- **Response**：`{ "success": true, "message": "管理員身分驗證成功" }`（錯誤則 `success: false`）。

### 3.3 `POST {GAS_API_URL}` — 批次借閱／歸還 (`submitTransaction`)
- **BORROW Payload**（由 `index.html` 發送）：
  ```json
  {
    "action": "submitTransaction",
    "type": "BORROW",
    "borrower": { "unit": "自然科", "name": "陳大華", "contact": "分機 201" },
    "items": ["EQ-001", "EQ-002"],
    "note": "第三節理化實驗課使用"
  }
  ```
- **RETURN Payload**（僅由 `return.html` 發送，**必須附帶 `admin_pin`**）：
  ```json
  {
    "action": "submitTransaction",
    "type": "RETURN",
    "admin_pin": "1234",
    "borrower": { "unit": "", "name": "管理員陳老師", "contact": "" },
    "items": ["EQ-001"],
    "note": "清點正常"
  }
  ```
- **後端強制邏輯**：
  1. 若 `type === "RETURN"`，先核對 `payload.admin_pin` 是否相符 `Settings!admin_pin`，不符直接拒絕。
  2. 取得 `LockService.getScriptLock().waitLock(10000)`，並於 `finally` 釋放鎖定。
  3. 逐筆檢查 `Equipment` 狀態並寫入更新與 `Logs` 流水帳，呼叫 `SpreadsheetApp.flush()`。
  4. 回傳 `{ "success": true, "processed": ["EQ-001"], "failed": [], "message": "..." }`。

---

## 4. 核心業務規則與 UX 規範

1. **LINE 內建瀏覽器防呆**：偵測 `navigator.userAgent` 含 `Line/` 時，於 `index.html` 與 `return.html` 立即顯示全螢幕遮罩引導改用 Safari / Chrome 開啟，並附一鍵複製網址按鈕。
2. **借閱人記憶 (`localStorage`)**：`index.html` 使用鍵名 `eq_loan_user_profile` 儲存 `{ unit, name, contact }`，初始化自動預填並顯示提示；提供「切換借閱人（清除記憶）」按鈕；支援從 `Users` 下拉選單快速帶入並顯示 `has_email` 提醒狀態。
3. **相機掃碼與防抖**：使用 `html5-qrcode`，點擊按鈕才啟動鏡頭（預設後置鏡頭 `facingMode: "environment"`），支援前後鏡頭切換、**2.5 秒同編號防重複觸發**、Web Audio API 合成提示音、手機震動 (`navigator.vibrate`)，並保留手動輸入框。
4. **管理員鎖定 (`sessionStorage`)**：`return.html` 驗證通過後暫存 PIN 於 `sessionStorage`（`eq_admin_verified_pin`），關閉分頁自動失效，頂部提供「🔒 鎖定」按鈕。
5. **QR Code 批量產生選單**：`return.html` 使用 `qrcodejs` 純前端生成 QR Code，支援：
   - 依 `Equipment` 清單勾選／分類篩選／設定每台印製張數。
   - 依設備數量批量產生連續序號貼紙（前綴、起始號、數量、補零位數）。
   - 可選附加一張指向 `index.html` 的借閱入口海報 QR Code。
   - 提供 1/2/3 欄排版切換與 `@media print` 專用列印樣式。
6. **逾期雙重通知 (`sendOverdueEmailNotification`)**：每日掃描 `BORROWED` 且超過 `overdue_hours` 之器材，依 `unit + name`（或 `name`）查詢 `Users` 信箱直接寄信提醒借閱人，並彙整個人通知狀態總表寄給 `admin_email`。

---

## 5. 給 AI 的自動化部署 Runbook（協助其他老師上線步驟）

當老師請你（AI）協助部署本系統時，請依下列順序執行並向使用者確認必要資訊：

### Step 1：蒐集設定資訊（向使用者詢問）
- 系統名稱（`system_title`，預設：`智慧型器材借閱管理系統`）
- 管理員通知信箱（`admin_email`）
- 管理員 PIN 碼（`admin_pin`，提醒勿使用預設 `1234`）
- 逾期判定時數（`overdue_hours`，預設 `24` 小時）
- 預計部署的前端平台（`GitHub Pages` / `Vercel` / `Netlify`）

### Step 2：準備 Google Sheets 與 Apps Script 後端
- **情境 A（使用者點擊範本 `/copy` 連結建立試算表）**：
  1. 請使用者開啟範本連結建立副本：<https://docs.google.com/spreadsheets/d/1dE3wHYYRjY-x6szGyZKHdkMfl-fw50KVxIoQ5xVMh-E/copy>
  2. 若環境有連接 Google Sheets MCP/CLI，協助更新 `Settings` 參數與匯入使用者提供的器材/教師名單至 `Equipment` / `Users`；否則請使用者直接在試算表修改。
  3. 引導使用者開啟試算表 **「擴充功能 → Apps Script」**（或若已登入 `clasp`，協助更新 `.clasp.json` 的 `scriptId` 並執行 `clasp push -f`）。
  4. 請使用者執行一次 **`setupOverdueTrigger()`**（開啟每日早上 8 點逾期檢查寄信）。
  5. 請使用者將 Apps Script 部署為 **「網頁應用程式」**（執行身分：**我**；誰可以存取：**所有人**），並取得 Web App URL。
- **情境 B（從空白試算表開始）**：
  - 請使用者貼入 `Code.gs`，執行一次 **`setupSheets()`** 自動建立 4 張工作表與範例資料，再執行 `setupOverdueTrigger()` 並部署 Web App。

### Step 3：綁定前端 `GAS_API_URL` 並驗證
1. 修改 `index.html` 與 `return.html` 中的 `const GAS_API_URL = "<使用者的 Web App URL>";`。
2. （重要）檢查檔案中不含任何私密憑證或他人個資，並確認 `index.html` 沒有任何連往 `return.html` 或 `RETURN` 交易的程式邏輯。
3. 使用 Node.js 或瀏覽器驗證前端 `<script>` 語法無誤，並對 `{GAS_API_URL}?action=getEquipment` 發送 `GET` 測試確認回傳 `success: true`。
4. 對 `{GAS_API_URL}` 發送 `POST` `{"action":"verifyAdminPin","pin":"<設定的PIN>"}` 確認驗證通過。

### Step 4：部署靜態前端（HTTPS）
- **GitHub Pages**：協助使用者 `git commit` + `git push` 至其 GitHub Repo，引導於 `Settings → Pages` 啟用 `main` 分支根目錄部署。
- **Vercel / Netlify**：引導匯入 GitHub Repo 或使用 CLI 部署（無需 build command，輸出目錄為專案根目錄 `.`）。

### Step 5：交付與驗收指引
完成後提供使用者：
1. **老師手機借用網址**：`https://<domain>/index.html`
2. **管理員歸還與條碼印製網址**：`https://<domain>/return.html`
3. 提醒使用 `return.html` 內的「🏷️ 條碼印製」印出器材貼紙與門口借閱入口海報 QR Code，並實際以手機測試掃描一筆借閱、再由管理端測試歸還。
