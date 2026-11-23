# 📦 智慧型器材借閱管理系統 (Smart Equipment Loan System)

一套**免安裝 App、免專用掃碼槍、零主機維護費**的校園／實驗室器材借閱管理系統。  
老師用手機掃描器材 QR Code 即可於 **3 秒內完成批次借用**；歸還作業則由**管理人員登入歸還專用頁面（含 PIN 碼驗證）**點收確認，並支援**預建使用者名單與每日逾期自動寄信提醒**、**依設備數量批量產生 QR Code 貼紙列印**。

---

## ✨ 系統架構與雙網頁設計

| 角色 / 頁面 | 檔案 | 功能說明 |
| :--- | :--- | :--- |
| **老師／借閱人（手機端）** | `index.html` | 僅提供「📤 我要借閱」與「📋 器材現況一覽」，支援預建名單快速帶入與 `localStorage` 常用資料記憶（無法自行操作歸還）。 |
| **管理人員（電腦／平板端）** | `return.html` | 需輸入管理員 **PIN 碼**進入。提供「📥 辦理歸還（掃碼／借出中快速點選）」、「📋 現況一覽」與「🏷️ 條碼印製（批量產生 QR Code）」。 |
| **後端 API 與排程** | `Code.gs` | 部署於 Google Apps Script，含 `LockService` 併發寫入保護、PIN 碼驗證、以及每日自動寄送逾期提醒信給借閱人與管理員。 |
| **雲端資料庫** | Google Sheets | 單一試算表包含 `Equipment`、`Logs`、`Settings`、`Users` 四個工作表。 |

---

## 🤖 交給 AI 輔助快速部署（推薦）

如果您希望直接由 **Antigravity、Cursor、Claude、ChatGPT** 等 AI 工具協助您完成設定、建表與部署，專案內已附上完整的 **[`AI_DEPLOYMENT_SPEC.md`](./AI_DEPLOYMENT_SPEC.md)**（包含資料庫 Schema、API 契約、權限規範與 AI 部署執行清單）。

1. 先 Fork 或下載本專案資料夾。
2. 用 AI 工具開啟專案資料夾，直接貼上這段提示詞即可：
   > **「請閱讀 `AI_DEPLOYMENT_SPEC.md` 與現有程式碼，協助我將這套器材借閱系統設定並部署成我的學校版本。」**

---

## 🚀 老師快速部署教學（5 步驟手動上線）

### 步驟一：建立 Google 試算表資料庫副本

1. 點擊下方連結，直接將範本試算表複製到您自己的 Google 雲端硬碟：  
   👉 **[點此建立「智慧型器材借閱管理系統_資料庫」副本](https://docs.google.com/spreadsheets/d/1dE3wHYYRjY-x6szGyZKHdkMfl-fw50KVxIoQ5xVMh-E/copy)**
2. 點擊頁面上的 **「建立副本」**。
3. 依照學校／實驗室需求修改各工作表內容：
   - **`Equipment`（器材主檔）**：填入您要管理的器材編號（`item_id`，即 QR Code 內容）、名稱、分類、存放位置，新器材狀態請填 `AVAILABLE`。
   - **`Users`（借閱人名單與通知信箱）**：預先填入教師／使用者名單與 `email`，借用時可從下拉選單一鍵帶入，**逾期時系統會直接寄信提醒該位借閱人**。
   - **`Settings`（系統設定）**：
     - `system_title`：系統標題（顯示於網頁頂部與信件主旨）
     - `admin_pin`：管理員進入歸還頁面的 PIN 碼（**預設為 `1234`，強烈建議修改**）
     - `admin_email`：管理員接收逾期彙整報告的信箱
     - `overdue_hours`：超過幾小時未歸還視為逾期（預設 `24`）
     - `notify_borrower_on_overdue`：`TRUE` 表示逾期時同時寄信給借閱人
   - **`Logs`（借還流水帳）**：系統自動寫入，請勿手動刪除欄位標題。

---

### 步驟二：設定並部署 Google Apps Script (GAS) 後端

1. 在剛剛建立好的 Google 試算表副本上方選單，點擊 **「擴充功能」→「Apps Script」**。
2. 確認編輯器內的程式碼與本專案的 [`Code.gs`](./Code.gs) 一致（若沒有程式碼或想更新為最新版，請將 [`Code.gs`](./Code.gs) 全文複製貼上取代，並按 `Ctrl + S` 儲存）。
   > 💡 **提示**：若您是從全新空白試算表自行貼上 `Code.gs`，可先在上方函式選單選擇 `setupSheets` 並執行一次，系統會自動建立 4 個工作表與範例資料。
3. **（建議）開啟每日自動逾期通知**：
   - 在 Apps Script 編輯器上方函式選單選擇 **`setupOverdueTrigger`**，點擊 **「執行」**。
   - 依畫面提示完成 Google 帳號授權後，系統就會自動設定**每天早上 8:00～9:00** 檢查逾期器材並寄發通知信。
4. **部署為網頁應用程式 (Web App)**：
   - 點擊右上角 **「部署」→「新增部署」**。
   - 左側齒輪選擇類型：**「網頁應用程式」**。
   - **執行身分**：選擇 **「我」**。
   - **誰可以存取**：選擇 **「所有人」**（重要！否則老師手機無法連線）。
   - 點擊「部署」，複製畫面產生的 **網頁應用程式 URL**（格式為 `https://script.google.com/macros/s/.../exec`）。

---

### 步驟三：設定前端連線網址

1. Fork 本 GitHub 儲存庫至您自己的 GitHub 帳號（或直接下載 `index.html` 與 `return.html`）。
2. 分別開啟 **`index.html`** 與 **`return.html`**，搜尋 `GAS_API_URL`：
   ```javascript
   const GAS_API_URL = "請替換為步驟二複製的網頁應用程式 URL";
   ```
3. 將引號內的網址改為**您自己的 GAS Web App URL** 後儲存並 Push 回您的 GitHub。

---

### 步驟四：免費部署前端網頁（必須使用 HTTPS 才能開啟手機相機）

以下靜態託管平台皆提供免費 HTTPS，任選一種即可（無需任何編譯設定）：

- **方法 A：GitHub Pages（最簡單，免註冊其他平台）**
  1. 進入您 Fork 後的 GitHub 專案，點選上方 **Settings → Pages**。
  2. **Source** 選擇 `Deploy from a branch`，Branch 選擇 `main` / `/ (root)`，點擊 **Save**。
  3. 約 1～2 分鐘後即可取得網址：
     - 老師借閱頁：`https://<您的帳號>.github.io/<專案名稱>/index.html`
     - 管理員歸還頁：`https://<您的帳號>.github.io/<專案名稱>/return.html`
- **方法 B：Vercel / Netlify**
  - 登入 Vercel 或 Netlify，點擊 **Add New Project / Import from Git** 匯入您的 GitHub 專案，直接點擊 Deploy 即可上線。

---

### 步驟五：印製器材 QR Code 與開始使用

1. 使用電腦瀏覽器開啟您的 **管理員頁面 (`return.html`)**，輸入 `admin_pin`（預設 `1234`）進入系統。
2. 切換至 **「🏷️ 條碼印製」** 分頁：
   - **依試算表設備清單產生**：可依分類篩選、設定每台印製張數，一鍵產生所有設備的 QR Code 貼紙。
   - **依設備數量批量序號產生**：新購設備時可直接輸入前綴（如 `EQ-`）與數量，批量產生連續編號貼紙。
   - 勾選 **「額外產生『老師借閱入口』QR Code」**，可一併印出入口海報張貼於器材室門口！
3. 點擊右上角 **「🖨️ 列印 QR Code」** 即可印出裁切貼於器材上。

---

## ❓ 常見問題 (FAQ)

- **Q1：老師用 LINE 掃描門口 QR Code 後不能開相機怎麼辦？**  
  LINE 內建瀏覽器會阻擋相機權限。網頁已內建偵測機制，偵測到 `Line/` 環境時會顯示全螢幕引導畫面與「一鍵複製網址」按鈕，引導老師切換至 Safari 或 Chrome 開啟即可正常連續掃碼。
- **Q2：器材室放一台公用平板，不同老師怎麼輪流借用？**  
  借用頁右上角有 **「🔄 切換借閱人（清除記憶）」** 按鈕，點擊即可清除上一位老師的 `localStorage` 記憶；管理端頂部亦有 **「🔒 鎖定」** 按鈕，離開座位時可隨時鎖定。
- **Q3：之後如果修改了 `Code.gs`，為什麼網頁呼叫還是舊行為？**  
  Google Apps Script 修改程式碼後，必須點擊右上角 **「部署」→「管理部署」→ 鉛筆編輯 → 版本選擇「建立新版本」→ 部署**，變更才會套用到線上的 Web App URL。
- **Q4：如何快速測試逾期通知信？**  
  可先在試算表 `Equipment` 將某項測試器材改為 `BORROWED`、填入 `Users` 中有設定您自己信箱的姓名、將 `last_updated` 改為昨天以前的日期，再到 Apps Script 編輯器執行 `sendOverdueEmailNotification` 即可立即測試收信效果。
