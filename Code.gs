/**
 * 智慧型器材借閱管理系統 (Smart Equipment Loan System) - Google Apps Script 後端
 *
 * 工作表結構：
 * - Equipment：器材主檔
 * - Logs：借還歷史流水帳
 * - Settings：系統參數（system_title, admin_pin, admin_email, overdue_hours, notify_borrower_on_overdue）
 * - Users：使用者名單與逾期通知 Email
 */

const SHEET_NAMES = {
  EQUIPMENT: 'Equipment',
  LOGS: 'Logs',
  SETTINGS: 'Settings',
  USERS: 'Users'
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

function getSpreadsheet_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

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

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

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
 * 讀取 Users 工作表中已啟用的使用者名單
 */
function getAllUsers_(ss, includeEmail) {
  const sheet = ss.getSheetByName(SHEET_NAMES.USERS);
  if (!sheet || sheet.getLastRow() < 2) return [];

  const lastRow = sheet.getLastRow();
  const values = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
  const users = [];

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const name = String(row[2] || '').trim();
    const unit = String(row[1] || '').trim();
    const activeRaw = row[6];
    const isActive = activeRaw === '' || activeRaw === true || String(activeRaw).trim().toUpperCase() === 'TRUE';

    if (!name || !isActive) continue;

    const email = String(row[3] || '').trim();
    const item = {
      user_id: String(row[0] || '').trim(),
      unit: unit,
      name: name,
      contact: String(row[4] || '').trim(),
      role: String(row[5] || '').trim(),
      has_email: email.indexOf('@') !== -1
    };
    if (includeEmail) {
      item.email = email;
    }
    users.push(item);
  }
  return users;
}

/**
 * 一鍵初始化所有工作表與範例測試資料（可重複執行，不會覆蓋既有資料）
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
      ['overdue_hours', '24'],
      ['notify_borrower_on_overdue', 'TRUE']
    ];
    settingsSheet.getRange(2, 1, defaultSettings.length, 2).setValues(defaultSettings);
  }
  settingsSheet.autoResizeColumns(1, settingsHeaders.length);

  // 4. Users（借閱人名單與逾期通知 Email）
  let usersSheet = ss.getSheetByName(SHEET_NAMES.USERS);
  if (!usersSheet) {
    usersSheet = ss.insertSheet(SHEET_NAMES.USERS);
  }
  const userHeaders = [
    'user_id',
    'unit',
    'name',
    'email',
    'contact',
    'role',
    'active'
  ];
  if (usersSheet.getLastRow() === 0) {
    usersSheet.getRange(1, 1, 1, userHeaders.length).setValues([userHeaders]);
  }
  styleHeaderRow_(usersSheet, userHeaders.length, '#0F766E');

  const activeRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['TRUE', 'FALSE'], true)
    .setAllowInvalid(false)
    .build();
  usersSheet.getRange('G2:G500').setDataValidation(activeRule);

  if (usersSheet.getLastRow() < 2) {
    const sampleUsers = [
      ['U-001', '自然科', '陳大華', 'teacher1@example.edu.tw', '分機 201', '教師', 'TRUE'],
      ['U-002', '資訊組', '林小美', 'teacher2@example.edu.tw', '分機 305', '教師', 'TRUE'],
      ['U-003', '801班', '王小明', 'student801@example.edu.tw', '分機 123', '學生', 'TRUE']
    ];
    usersSheet.getRange(2, 1, sampleUsers.length, userHeaders.length).setValues(sampleUsers);
  }
  usersSheet.autoResizeColumns(1, userHeaders.length);

  SpreadsheetApp.flush();
  Logger.log('工作表初始化完成：Equipment, Logs, Settings, Users');
}

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
      const users = getAllUsers_(ss, false);
      const settingsMap = getSettingsMap_(ss);
      return jsonResponse_({
        success: true,
        data: data,
        users: users,
        settings: {
          system_title: settingsMap.system_title || '智慧型器材借閱管理系統',
          pin_required: String(settingsMap.admin_pin || '1234').trim() !== ''
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

    // 驗證管理員 PIN 碼（無需鎖定試算表）
    if (payload.action === 'verifyAdminPin') {
      return handleVerifyAdminPin_(payload);
    }

    if (payload.action !== 'submitTransaction') {
      return jsonResponse_({
        success: false,
        processed: [],
        failed: [],
        message: '不支援的 POST action：' + String(payload.action || '')
      });
    }

    // 寫入交易前取得 LockService 鎖定（最多等待 10 秒）
    lock.waitLock(10000);
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
 * 驗證管理員 PIN 碼（比對 Settings 工作表中的 admin_pin）
 */
function handleVerifyAdminPin_(payload) {
  const ss = getSpreadsheet_();
  const settingsMap = getSettingsMap_(ss);
  const expectedPin = String(settingsMap.admin_pin !== undefined ? settingsMap.admin_pin : '1234').trim();
  const inputPin = String(payload.pin || '').trim();

  if (expectedPin === '') {
    return jsonResponse_({ success: true, message: '未設定管理員 PIN 碼，直接進入' });
  }
  if (inputPin && inputPin === expectedPin) {
    return jsonResponse_({ success: true, message: '管理員身分驗證成功' });
  }
  return jsonResponse_({ success: false, message: '管理員 PIN 碼錯誤，請重新確認' });
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

  const ss = getSpreadsheet_();
  const settingsMap = getSettingsMap_(ss);

  // 歸還作業強制驗證管理員 PIN 碼
  if (type === ACTION_ENUM.RETURN) {
    const expectedPin = String(settingsMap.admin_pin !== undefined ? settingsMap.admin_pin : '1234').trim();
    const inputPin = String(payload.admin_pin || '').trim();
    if (expectedPin !== '' && inputPin !== expectedPin) {
      return jsonResponse_({
        success: false,
        processed: [],
        failed: [],
        message: '管理員 PIN 碼驗證失敗，無權辦理歸還作業'
      });
    }
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

  const eqSheet = ss.getSheetByName(SHEET_NAMES.EQUIPMENT);
  const logsSheet = ss.getSheetByName(SHEET_NAMES.LOGS);

  if (!eqSheet || !logsSheet) {
    throw new Error('找不到 Equipment 或 Logs 工作表，請先執行 setupSheets()。');
  }

  const eqLastRow = eqSheet.getLastRow();
  const eqValues = eqLastRow >= 2 ? eqSheet.getRange(2, 1, eqLastRow - 1, 8).getValues() : [];

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
      if (eq.status === STATUS_ENUM.MAINTENANCE) {
        failed.push({ item_id: eq.itemId, reason: '器材標記為維修中，請由管理員於試算表調整狀態' });
        continue;
      }

      const prevUnit = eq.currentUnit;
      const prevBorrower = eq.currentBorrower;

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
 * 依單位＋姓名（或僅姓名）查詢 Users 名單中的 Email
 */
function buildUserEmailLookup_(users) {
  const byUnitName = {};
  const byName = {};
  for (let i = 0; i < users.length; i++) {
    const u = users[i];
    if (!u.email || u.email.indexOf('@') === -1) continue;
    const nameKey = u.name.trim().toLowerCase();
    const unitKey = u.unit.trim().toLowerCase();
    if (unitKey && nameKey) {
      byUnitName[unitKey + '|' + nameKey] = u.email;
    }
    if (nameKey && !byName[nameKey]) {
      byName[nameKey] = u.email;
    }
  }
  return { byUnitName: byUnitName, byName: byName };
}

function findUserEmail_(lookup, unit, name) {
  const u = String(unit || '').trim().toLowerCase();
  const n = String(name || '').trim().toLowerCase();
  if (!n) return '';
  if (u && lookup.byUnitName[u + '|' + n]) {
    return lookup.byUnitName[u + '|' + n];
  }
  return lookup.byName[n] || '';
}

/**
 * 每日排程：檢查逾期未歸還器材
 * 1. 若借閱人在 Users 名單中有設定 Email，直接寄發個別逾期提醒信給借閱人
 * 2. 同時彙整總表（含個別寄信狀態）寄給管理員 (admin_email)
 */
function sendOverdueEmailNotification() {
  const ss = getSpreadsheet_();
  const settings = getSettingsMap_(ss);
  const adminEmail = settings.admin_email || 'ada@clsh.ntpc.edu.tw';
  const overdueHours = parseFloat(settings.overdue_hours || '24') || 24;
  const systemTitle = settings.system_title || '智慧型器材借閱管理系統';
  const notifyBorrower = String(settings.notify_borrower_on_overdue || 'TRUE').trim().toUpperCase() !== 'FALSE';

  const eqList = getAllEquipment_(ss);
  const users = getAllUsers_(ss, true);
  const emailLookup = buildUserEmailLookup_(users);

  const now = new Date();
  const thresholdMs = overdueHours * 60 * 60 * 1000;
  const overdueItems = [];

  for (let i = 0; i < eqList.length; i++) {
    const eq = eqList[i];
    if (eq.status === STATUS_ENUM.BORROWED && eq.last_updated) {
      const updatedDate = new Date(eq.last_updated.replace(/-/g, '/'));
      if (!isNaN(updatedDate.getTime()) && (now.getTime() - updatedDate.getTime()) > thresholdMs) {
        const hoursElapsed = Math.floor((now.getTime() - updatedDate.getTime()) / (60 * 60 * 1000));
        const borrowerEmail = findUserEmail_(emailLookup, eq.current_unit, eq.current_borrower);
        overdueItems.push({
          item_id: eq.item_id,
          item_name: eq.item_name,
          location: eq.location,
          borrower: eq.current_borrower,
          unit: eq.current_unit,
          email: borrowerEmail,
          last_updated: eq.last_updated,
          hoursElapsed: hoursElapsed,
          notifyStatus: ''
        });
      }
    }
  }

  if (overdueItems.length === 0) {
    Logger.log('今日檢查無逾期未歸還器材（門檻：' + overdueHours + ' 小時）。');
    return;
  }

  // 依借閱人 Email 分組並寄發個人提醒信
  const todayStr = Utilities.formatDate(now, TIMEZONE, 'yyyy/MM/dd');
  if (notifyBorrower) {
    const groupedByEmail = {};
    for (let i = 0; i < overdueItems.length; i++) {
      const item = overdueItems[i];
      if (!item.email) {
        item.notifyStatus = '未建置信箱（需管理員手動催還）';
        continue;
      }
      if (!groupedByEmail[item.email]) {
        groupedByEmail[item.email] = {
          borrowerName: item.borrower,
          unit: item.unit,
          items: []
        };
      }
      groupedByEmail[item.email].items.push(item);
    }

    const emails = Object.keys(groupedByEmail);
    for (let k = 0; k < emails.length; k++) {
      const targetEmail = emails[k];
      const group = groupedByEmail[targetEmail];
      const userSubject = '⏰ 【' + systemTitle + '】器材逾期歸還提醒 (' + todayStr + ')';

      let userBody = '<p><strong>' + (group.unit ? group.unit + ' ' : '') + group.borrowerName + '</strong> 您好：</p>';
      userBody += '<p>系統檢查到您有以下 <strong>' + group.items.length + ' 項</strong>器材借出已超過 <strong>' + overdueHours + ' 小時</strong>尚未歸還，請於方便時將器材交還給管理人員辦理歸還點收：</p>';
      userBody += '<table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%; text-align: left;">';
      userBody += '<tr style="background-color: #FEF3C7;"><th>器材編號</th><th>器材名稱</th><th>存放位置</th><th>借出時間</th><th>已借出時數</th></tr>';
      for (let m = 0; m < group.items.length; m++) {
        const it = group.items[m];
        userBody += '<tr>';
        userBody += '<td><b>' + it.item_id + '</b></td>';
        userBody += '<td>' + it.item_name + '</td>';
        userBody += '<td>' + it.location + '</td>';
        userBody += '<td>' + it.last_updated + '</td>';
        userBody += '<td style="color: #DC2626; font-weight: bold;">' + it.hoursElapsed + ' 小時</td>';
        userBody += '</tr>';
      }
      userBody += '</table>';
      userBody += '<p style="color:#6B7280;font-size:12px;">※ 若您已歸還器材但狀態尚未更新，請聯繫器材室管理人員協助點收。<br>此信件由 ' + systemTitle + ' 自動發送。</p>';

      try {
        MailApp.sendEmail({
          to: targetEmail,
          subject: userSubject,
          htmlBody: userBody
        });
        for (let m = 0; m < group.items.length; m++) {
          group.items[m].notifyStatus = '已自動寄信通知 (' + targetEmail + ')';
        }
      } catch (mailErr) {
        for (let m = 0; m < group.items.length; m++) {
          group.items[m].notifyStatus = '寄信失敗：' + mailErr.message;
        }
      }
    }
  } else {
    for (let i = 0; i < overdueItems.length; i++) {
      overdueItems[i].notifyStatus = '已關閉借閱人自動通知';
    }
  }

  // 彙整寄給管理員
  const adminSubject = '🚨 【' + systemTitle + '】每日逾期未歸還彙整報告 (' + todayStr + ')';
  let adminBody = '<h3>管理員 您好，今日共有 ' + overdueItems.length + ' 筆借用超過 ' + overdueHours + ' 小時尚未歸還：</h3>';
  adminBody += '<table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%; text-align: left;">';
  adminBody += '<tr style="background-color: #FEF3C7;"><th>器材編號</th><th>器材名稱</th><th>借閱單位</th><th>借閱人</th><th>借出時間</th><th>已借出時數</th><th>個人通知狀態</th></tr>';

  for (let j = 0; j < overdueItems.length; j++) {
    const item = overdueItems[j];
    adminBody += '<tr>';
    adminBody += '<td><b>' + item.item_id + '</b></td>';
    adminBody += '<td>' + item.item_name + '</td>';
    adminBody += '<td>' + item.unit + '</td>';
    adminBody += '<td><b>' + item.borrower + '</b></td>';
    adminBody += '<td>' + item.last_updated + '</td>';
    adminBody += '<td style="color: #DC2626; font-weight: bold;">' + item.hoursElapsed + ' 小時</td>';
    adminBody += '<td>' + item.notifyStatus + '</td>';
    adminBody += '</tr>';
  }

  adminBody += '</table>';
  adminBody += '<p style="color:#6B7280;font-size:12px;">可於試算表「Users」工作表維護教師／使用者 Email 名單。此信件由 ' + systemTitle + ' 自動發送。</p>';

  MailApp.sendEmail({
    to: adminEmail,
    subject: adminSubject,
    htmlBody: adminBody
  });

  Logger.log('已成功完成逾期檢查並通知管理員 ' + adminEmail + '，共 ' + overdueItems.length + ' 筆。');
}

/**
 * 一鍵建立每日早上 8:00 自動執行逾期通知的排程觸發條件（請於編輯器手動執行一次即可）
 */
function setupOverdueTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'sendOverdueEmailNotification') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('sendOverdueEmailNotification')
    .timeBased()
    .everyDays(1)
    .atHour(8)
    .create();
  Logger.log('已建立每日早上 8:00～9:00 自動執行 sendOverdueEmailNotification 的觸發條件。');
}
