/**
 * 智慧型器材借閱管理系統 (Smart Equipment Loan System) - Google Apps Script 後端
 *
 * 部署方式：
 * 1. 於 Google Sheets 中點擊「擴充功能」>「Apps Script」
 * 2. 將本檔案內容貼上並儲存
 * 3. 初次使用請於編輯器上方選擇並執行 `setupSheets` 函式（會自動建立工作表與範例資料）
 * 4. 點擊「部署」>「新增部署」> 類型選擇「網頁應用程式」
 *    - 執行身分：我 (Me)
 *    - 誰可以存取：所有人 (Anyone)
 * 5. 複製產生的網頁應用程式 URL，貼入前端 index.html 的 `GAS_API_URL` 常數中
 */

const SHEET_NAMES = {
  EQUIPMENT: 'Equipment',
  LOGS: 'Logs',
  SETTINGS: 'Settings'
};

const STATUS_ENUM = {
  AVAILABLE: 'AVAILABLE',
  BORROWED: 'BORROWED',
  MAINTENANCE: 'MAINTENANCE'
};

const ACTION_ENUM = {
  BORROW: 'BORROW',
  RETURN: 'RETURN'
};

const TIMEZONE = 'Asia/Taipei';

/**
 * 取得目前綁定的試算表物件
 */
function getSpreadsheet_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

/**
 * 格式化日期時間為 YYYY-MM-DD HH:mm:ss
 */
function formatDateTime_(value) {
  if (!value) return '';
  if (value instanceof Date) {
    return Utilities.formatDate(value, TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
  }
  const str = String(value).trim();
  if (!str) return '';
  const parsed = new Date(str.replace(/-/g, '/'));
  if (!isNaN(parsed.getTime()) && /^\d{4}[-/]/.test(str)) {
    return Utilities.formatDate(parsed, TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
  }
  return str;
}

/**
 * 建立標準 JSON 回應
 */
function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * 讀取 Settings 工作表為鍵值物件
 */
function getSettingsMap_(ss) {
  const sheet = ss.getSheetByName(SHEET_NAMES.SETTINGS);
  const map = {};
  if (!sheet || sheet.getLastRow() < 2) return map;

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const key = String(data[i][0] || '').trim();
    if (key) {
      map[key] = String(data[i][1] === undefined || data[i][1] === null ? '' : data[i][1]).trim();
    }
  }
  return map;
}

/**
 * 讀取所有器材清單
 */
function getAllEquipment_(ss) {
  const sheet = ss.getSheetByName(SHEET_NAMES.EQUIPMENT);
  if (!sheet) {
    throw new Error('找不到 Equipment 工作表，請先執行 setupSheets() 初始化試算表。');
  }
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const values = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
  const list = [];

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const itemId = String(row[0] || '').trim();
    if (!itemId) continue;

    list.push({
      item_id: itemId,
      item_name: String(row[1] || '').trim(),
      category: String(row[2] || '').trim(),
      location: String(row[3] || '').trim(),
      status: String(row[4] || STATUS_ENUM.AVAILABLE).trim().toUpperCase(),
      current_borrower: String(row[5] || '').trim(),
      current_unit: String(row[6] || '').trim(),
      last_updated: formatDateTime_(row[7])
    });
  }
  return list;
}

/**
 * 一鍵初始化三個工作表與範例測試資料（可重複執行，不會覆蓋既有資料）
 */
function setupSheets() {
  const ss = getSpreadsheet_();
  const nowStr = formatDateTime_(new Date());

  // 1. Equipment（器材主檔）
  let eqSheet = ss.getSheetByName(SHEET_NAMES.EQUIPMENT);
  if (!eqSheet) {
    eqSheet = ss.insertSheet(SHEET_NAMES.EQUIPMENT);
  }
  const eqHeaders = [
    'item_id',
    'item_name',
    'category',
    'location',
    'status',
    'current_borrower',
    'current_unit',
    'last_updated'
  ];
  if (eqSheet.getLastRow() === 0) {
    eqSheet.getRange(1, 1, 1, eqHeaders.length).setValues([eqHeaders]);
  }
  styleHeaderRow_(eqSheet, eqHeaders.length, '#D97706');

  // 加入狀態下拉驗證
  const statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList([STATUS_ENUM.AVAILABLE, STATUS_ENUM.BORROWED, STATUS_ENUM.MAINTENANCE], true)
    .setAllowInvalid(false)
    .build();
  eqSheet.getRange('E2:E500').setDataValidation(statusRule);
  eqSheet.getRange('H2:H500').setNumberFormat('@');

  if (eqSheet.getLastRow() < 2) {
    const sampleEquipment = [
      ['EQ-001', '數位三用電表', '電學器材', '理化實驗室 A 櫃-1層', 'AVAILABLE', '', '', nowStr],
      ['EQ-002', 'Vernier 能量感測器', '感測器', '理化實驗室 A 櫃-2層', 'AVAILABLE', '', '', nowStr],
      ['EQ-003', 'Arduino Uno 開發板套件', '微控制器', '資訊室 B 櫃-1層', 'AVAILABLE', '', '', nowStr],
      ['EQ-004', '數位示波器 (攜帶型)', '電學器材', '理化實驗室 A 櫃-3層', 'BORROWED', '王小明', '801班', nowStr],
      ['EQ-005', 'Chromebook 教學平板 #01', '資訊設備', '充電車 C 櫃-01', 'AVAILABLE', '', '', nowStr],
      ['EQ-006', 'Chromebook 教學平板 #02', '資訊設備', '充電車 C 櫃-02', 'AVAILABLE', '', '', nowStr],
      ['EQ-007', '無線光電閘計時器', '力學器材', '理化實驗室 B 櫃-2層', 'AVAILABLE', '', '', nowStr],
      ['EQ-008', '紅外線測溫槍', '量測儀器', '器材室 D 櫃-1層', 'MAINTENANCE', '', '', nowStr]
    ];
    eqSheet.getRange(2, 1, sampleEquipment.length, eqHeaders.length).setValues(sampleEquipment);
  }
  eqSheet.autoResizeColumns(1, eqHeaders.length);

  // 2. Logs（借還歷史流水帳）
  let logsSheet = ss.getSheetByName(SHEET_NAMES.LOGS);
  if (!logsSheet) {
    logsSheet = ss.insertSheet(SHEET_NAMES.LOGS);
  }
  const logHeaders = [
    'log_id',
    'timestamp',
    'action',
    'item_id',
    'item_name',
    'borrower_unit',
    'borrower_name',
    'borrower_contact',
    'note'
  ];
  if (logsSheet.getLastRow() === 0) {
    logsSheet.getRange(1, 1, 1, logHeaders.length).setValues([logHeaders]);
  }
  styleHeaderRow_(logsSheet, logHeaders.length, '#059669');
  logsSheet.getRange('B2:B1000').setNumberFormat('@');

  if (logsSheet.getLastRow() < 2) {
    const todayCompact = Utilities.formatDate(new Date(), TIMEZONE, 'yyyyMMdd');
    logsSheet.appendRow([
      'LOG-' + todayCompact + '-001',
      nowStr,
      'BORROW',
      'EQ-004',
      '數位示波器 (攜帶型)',
      '801班',
      '王小明',
      '分機 123',
      '系統初始化範例紀錄'
    ]);
  }
  logsSheet.autoResizeColumns(1, logHeaders.length);

  // 3. Settings（系統參數設定）
  let settingsSheet = ss.getSheetByName(SHEET_NAMES.SETTINGS);
  if (!settingsSheet) {
    settingsSheet = ss.insertSheet(SHEET_NAMES.SETTINGS);
  }
  const settingsHeaders = ['key', 'value'];
  if (settingsSheet.getLastRow() === 0) {
    settingsSheet.getRange(1, 1, 1, settingsHeaders.length).setValues([settingsHeaders]);
  }
  styleHeaderRow_(settingsSheet, settingsHeaders.length, '#475569');

  if (settingsSheet.getLastRow() < 2) {
    const defaultSettings = [
      ['system_title', '智慧型器材借閱管理系統'],
      ['admin_pin', '1234'],
      ['admin_email', 'ada@clsh.ntpc.edu.tw'],
      ['overdue_hours', '24']
    ];
    settingsSheet.getRange(2, 1, defaultSettings.length, 2).setValues(defaultSettings);
  }
  settingsSheet.autoResizeColumns(1, settingsHeaders.length);

  SpreadsheetApp.flush();
  Logger.log('工作表初始化完成：Equipment, Logs, Settings');
}

/**
 * 美化表頭列
 */
function styleHeaderRow_(sheet, colCount, bgColor) {
  const headerRange = sheet.getRange(1, 1, 1, colCount);
  headerRange
    .setBackground(bgColor)
    .setFontColor('#FFFFFF')
    .setFontWeight('bold')
    .setHorizontalAlignment('left');
  sheet.setFrozenRows(1);
}

/**
 * GET API 進入點
 * 支援：?action=getEquipment
 */
function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) ? String(e.parameter.action).trim() : 'getEquipment';
    const ss = getSpreadsheet_();

    if (action === 'getEquipment') {
      const data = getAllEquipment_(ss);
      const settingsMap = getSettingsMap_(ss);
      return jsonResponse_({
        success: true,
        data: data,
        settings: {
          system_title: settingsMap.system_title || '智慧型器材借閱管理系統'
        }
      });
    }

    return jsonResponse_({
      success: false,
      message: '不支援的 GET action：' + action
    });
  } catch (err) {
    return jsonResponse_({
      success: false,
      message: '伺服器發生錯誤：' + err.message
    });
  }
}

/**
 * POST API 進入點
 * 前端需以 Content-Type: text/plain;charset=utf-8 傳送 JSON 字串
 */
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    // 最多等待 10 秒取得鎖定，防止多人同時借還寫入衝突
    lock.waitLock(10000);

    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse_({
        success: false,
        processed: [],
        failed: [],
        message: '請求內容為空'
      });
    }

    let payload;
    try {
      payload = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return jsonResponse_({
        success: false,
        processed: [],
        failed: [],
        message: 'JSON 格式解析失敗：' + parseErr.message
      });
    }

    if (payload.action !== 'submitTransaction') {
      return jsonResponse_({
        success: false,
        processed: [],
        failed: [],
        message: '不支援的 POST action：' + String(payload.action || '')
      });
    }

    return handleSubmitTransaction_(payload);
  } catch (err) {
    return jsonResponse_({
      success: false,
      processed: [],
      failed: [],
      message: '系統忙碌或發生錯誤：' + err.message
    });
  } finally {
    try {
      lock.releaseLock();
    } catch (releaseErr) {
      // 若尚未取得鎖定則忽略釋放錯誤
    }
  }
}

/**
 * 處理批次借閱與歸還交易
 */
function handleSubmitTransaction_(payload) {
  const type = String(payload.type || '').trim().toUpperCase();
  if (type !== ACTION_ENUM.BORROW && type !== ACTION_ENUM.RETURN) {
    return jsonResponse_({
      success: false,
      processed: [],
      failed: [],
      message: '無效的交易類型，僅支援 BORROW 或 RETURN'
    });
  }

  const rawItems = Array.isArray(payload.items) ? payload.items : [];
  const items = [];
  const seen = {};
  for (let i = 0; i < rawItems.length; i++) {
    const id = String(rawItems[i] || '').trim().toUpperCase();
    if (id && !seen[id]) {
      seen[id] = true;
      items.push(id);
    }
  }

  if (items.length === 0) {
    return jsonResponse_({
      success: false,
      processed: [],
      failed: [],
      message: '請至少選擇一項器材'
    });
  }

  const borrower = payload.borrower || {};
  const borrowerUnit = String(borrower.unit || '').trim();
  const borrowerName = String(borrower.name || '').trim();
  const borrowerContact = String(borrower.contact || '').trim();
  const note = String(payload.note || '').trim();

  if (type === ACTION_ENUM.BORROW && (!borrowerName || !borrowerUnit)) {
    return jsonResponse_({
      success: false,
      processed: [],
      failed: [],
      message: '借閱模式必須填寫「借閱人姓名」與「班級 / 處室」'
    });
  }

  const ss = getSpreadsheet_();
  const eqSheet = ss.getSheetByName(SHEET_NAMES.EQUIPMENT);
  const logsSheet = ss.getSheetByName(SHEET_NAMES.LOGS);

  if (!eqSheet || !logsSheet) {
    throw new Error('找不到 Equipment 或 Logs 工作表，請先執行 setupSheets()。');
  }

  const eqLastRow = eqSheet.getLastRow();
  const eqValues = eqLastRow >= 2 ? eqSheet.getRange(2, 1, eqLastRow - 1, 8).getValues() : [];

  // 建立 item_id -> 資料列索引（從 2 開始）對照表
  const eqIndexMap = {};
  for (let i = 0; i < eqValues.length; i++) {
    const id = String(eqValues[i][0] || '').trim().toUpperCase();
    if (id) {
      eqIndexMap[id] = {
        rowNumber: i + 2,
        itemId: String(eqValues[i][0]).trim(),
        itemName: String(eqValues[i][1] || '').trim(),
        status: String(eqValues[i][4] || STATUS_ENUM.AVAILABLE).trim().toUpperCase(),
        currentBorrower: String(eqValues[i][5] || '').trim(),
        currentUnit: String(eqValues[i][6] || '').trim()
      };
    }
  }

  const now = new Date();
  const nowStr = formatDateTime_(now);
  let nextLogSeq = getNextLogSeqForDate_(logsSheet, now);
  const datePrefix = 'LOG-' + Utilities.formatDate(now, TIMEZONE, 'yyyyMMdd') + '-';

  const processed = [];
  const failed = [];
  const logRowsToAppend = [];

  for (let i = 0; i < items.length; i++) {
    const targetId = items[i];
    const eq = eqIndexMap[targetId];

    if (!eq) {
      failed.push({ item_id: targetId, reason: '器材主檔查無此編號' });
      continue;
    }

    if (type === ACTION_ENUM.BORROW) {
      if (eq.status === STATUS_ENUM.AVAILABLE) {
        // 更新 Equipment 為借出中
        eqSheet.getRange(eq.rowNumber, 5, 1, 4).setValues([[
          STATUS_ENUM.BORROWED,
          borrowerName,
          borrowerUnit,
          nowStr
        ]]);
        eq.status = STATUS_ENUM.BORROWED;

        const logId = datePrefix + String(nextLogSeq++).padStart(3, '0');
        logRowsToAppend.push([
          logId,
          nowStr,
          ACTION_ENUM.BORROW,
          eq.itemId,
          eq.itemName,
          borrowerUnit,
          borrowerName,
          borrowerContact,
          note
        ]);
        processed.push(eq.itemId);
      } else if (eq.status === STATUS_ENUM.BORROWED) {
        const who = (eq.currentUnit ? eq.currentUnit + ' ' : '') + (eq.currentBorrower || '他人');
        failed.push({ item_id: eq.itemId, reason: '目前由 ' + who + ' 借出中' });
      } else {
        failed.push({ item_id: eq.itemId, reason: '器材目前為維修中或不可借閱狀態' });
      }
    } else {
      // RETURN 歸還邏輯
      if (eq.status === STATUS_ENUM.MAINTENANCE) {
        failed.push({ item_id: eq.itemId, reason: '器材標記為維修中，請由管理員於試算表調整狀態' });
        continue;
      }

      const prevUnit = eq.currentUnit;
      const prevBorrower = eq.currentBorrower;

      // 重設 Equipment 為在館 AVAILABLE，清空借閱人與單位
      eqSheet.getRange(eq.rowNumber, 5, 1, 4).setValues([[
        STATUS_ENUM.AVAILABLE,
        '',
        '',
        nowStr
      ]]);
      eq.status = STATUS_ENUM.AVAILABLE;

      const logId = datePrefix + String(nextLogSeq++).padStart(3, '0');
      const logUnit = borrowerUnit || prevUnit;
      const logName = borrowerName || prevBorrower || '現場歸還';
      logRowsToAppend.push([
        logId,
        nowStr,
        ACTION_ENUM.RETURN,
        eq.itemId,
        eq.itemName,
        logUnit,
        logName,
        borrowerContact,
        note
      ]);
      processed.push(eq.itemId);
    }
  }

  if (logRowsToAppend.length > 0) {
    const startRow = logsSheet.getLastRow() + 1;
    logsSheet.getRange(startRow, 1, logRowsToAppend.length, 9).setValues(logRowsToAppend);
    logsSheet.getRange(startRow, 2, logRowsToAppend.length, 1).setNumberFormat('@');
  }

  SpreadsheetApp.flush();

  const actionLabel = type === ACTION_ENUM.BORROW ? '借閱' : '歸還';
  let message = '';
  if (processed.length > 0 && failed.length === 0) {
    message = '成功完成 ' + processed.length + ' 項器材' + actionLabel;
  } else if (processed.length > 0 && failed.length > 0) {
    message = '已完成 ' + processed.length + ' 項器材' + actionLabel + '，另有 ' + failed.length + ' 項失敗';
  } else {
    message = actionLabel + '失敗：' + failed.map(function (f) { return f.item_id + '（' + f.reason + '）'; }).join('；');
  }

  return jsonResponse_({
    success: processed.length > 0,
    processed: processed,
    failed: failed,
    message: message
  });
}

/**
 * 計算當日下一個流水號序號 (LOG-YYYYMMDD-001)
 */
function getNextLogSeqForDate_(logsSheet, dateObj) {
  const prefix = 'LOG-' + Utilities.formatDate(dateObj, TIMEZONE, 'yyyyMMdd') + '-';
  const lastRow = logsSheet.getLastRow();
  if (lastRow < 2) return 1;

  const ids = logsSheet.getRange(2, 1, lastRow - 1, 1).getValues();
  let maxSeq = 0;
  for (let i = 0; i < ids.length; i++) {
    const id = String(ids[i][0] || '').trim();
    if (id.indexOf(prefix) === 0) {
      const seq = parseInt(id.substring(prefix.length), 10);
      if (!isNaN(seq) && seq > maxSeq) {
        maxSeq = seq;
      }
    }
  }
  return maxSeq + 1;
}

/**
 * 每日排程：檢查逾期未歸還器材並寄送通知信給管理員
 * （延續自原 NFC 系統功能，可在 Apps Script 觸發條件設定每天早上 8:00 執行）
 */
function sendOverdueEmailNotification() {
  const ss = getSpreadsheet_();
  const settings = getSettingsMap_(ss);
  const adminEmail = settings.admin_email || 'ada@clsh.ntpc.edu.tw';
  const overdueHours = parseFloat(settings.overdue_hours || '24') || 24;
  const systemTitle = settings.system_title || '智慧型器材借閱管理系統';

  const eqList = getAllEquipment_(ss);
  const now = new Date();
  const thresholdMs = overdueHours * 60 * 60 * 1000;
  const overdueItems = [];

  for (let i = 0; i < eqList.length; i++) {
    const eq = eqList[i];
    if (eq.status === STATUS_ENUM.BORROWED && eq.last_updated) {
      const updatedDate = new Date(eq.last_updated.replace(/-/g, '/'));
      if (!isNaN(updatedDate.getTime()) && (now.getTime() - updatedDate.getTime()) > thresholdMs) {
        const hoursElapsed = Math.floor((now.getTime() - updatedDate.getTime()) / (60 * 60 * 1000));
        overdueItems.push({
          item_id: eq.item_id,
          item_name: eq.item_name,
          location: eq.location,
          borrower: eq.current_borrower,
          unit: eq.current_unit,
          last_updated: eq.last_updated,
          hoursElapsed: hoursElapsed
        });
      }
    }
  }

  if (overdueItems.length === 0) {
    Logger.log('今日檢查無逾期未歸還器材（門檻：' + overdueHours + ' 小時）。');
    return;
  }

  const todayStr = Utilities.formatDate(now, TIMEZONE, 'yyyy/MM/dd');
  const subject = '🚨 【' + systemTitle + '】每日逾期未歸還提醒 (' + todayStr + ')';

  let htmlBody = '<h3>您好，以下器材借出已超過 ' + overdueHours + ' 小時尚未歸還：</h3>';
  htmlBody += '<table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%; text-align: left;">';
  htmlBody += '<tr style="background-color: #FEF3C7;"><th>器材編號</th><th>器材名稱</th><th>借閱單位</th><th>借閱人</th><th>借出時間</th><th>已借出時數</th></tr>';

  for (let j = 0; j < overdueItems.length; j++) {
    const item = overdueItems[j];
    htmlBody += '<tr>';
    htmlBody += '<td><b>' + item.item_id + '</b></td>';
    htmlBody += '<td>' + item.item_name + '</td>';
    htmlBody += '<td>' + item.unit + '</td>';
    htmlBody += '<td><b>' + item.borrower + '</b></td>';
    htmlBody += '<td>' + item.last_updated + '</td>';
    htmlBody += '<td style="color: #DC2626; font-weight: bold;">' + item.hoursElapsed + ' 小時</td>';
    htmlBody += '</tr>';
  }

  htmlBody += '</table>';
  htmlBody += '<p style="color:#6B7280;font-size:12px;">此信件由 ' + systemTitle + ' 自動發送，請勿直接回覆。</p>';

  MailApp.sendEmail({
    to: adminEmail,
    subject: subject,
    htmlBody: htmlBody
  });

  Logger.log('已成功發送逾期提醒信件給 ' + adminEmail + '，共 ' + overdueItems.length + ' 筆。');
}
