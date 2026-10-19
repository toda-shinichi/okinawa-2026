/**
 * OKINAWA 2026 隨身助理 - Google Apps Script 同步 API（v3）
 *
 * 資料模型：所有同步資料存在「Records」工作表，一列一筆紀錄。
 *   欄位：collection | id | updatedAt | deleted | by | rev | data(JSON)
 * 另外自動產生三張給人看的報表：Expenses_View、Itinerary_View、Tasting_View
 *
 * 前端只用 POST（Content-Type: text/plain），body 為 JSON：
 *   { action: "ping", token }
 *   { action: "pull", token, since }        -> 回傳 rev > since 的所有紀錄
 *   { action: "push", token, records: [...] } -> 依 updatedAt 新者勝寫入
 */

var RECORD_SHEET = 'Records';
var RECORD_HEADERS = ['collection', 'id', 'updatedAt', 'deleted', 'by', 'rev', 'data'];
var ALLOWED_COLLECTIONS = ['expenses', 'itinerary', 'tastings', 'members', 'settings', 'places'];
var MAX_RECORDS_PER_PUSH = 300;

/** 第一次部署前，在編輯器選取 setup 後按「執行」一次。 */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(RECORD_SHEET) || ss.insertSheet(RECORD_SHEET);
  sheet.getRange(1, 1, 1, RECORD_HEADERS.length).setValues([RECORD_HEADERS]);
  sheet.getRange('A:G').setNumberFormat('@');
  sheet.setFrozenRows(1);
  ['Expenses_View', 'Itinerary_View', 'Tasting_View'].forEach(function (name) {
    if (!ss.getSheetByName(name)) ss.insertSheet(name);
  });
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('TOKEN')) {
    props.setProperty('TOKEN', Utilities.getUuid().replace(/-/g, '').slice(0, 16));
  }
  if (!props.getProperty('REV')) props.setProperty('REV', '0');
  Logger.log('同步密碼（請抄到 App 的雲端設定）：' + props.getProperty('TOKEN'));
}

function doGet() {
  return json_({ status: 'ok', message: 'OKINAWA 2026 sync API. Use POST.' });
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ status: 'error', code: 'bad_json', message: '無法解析請求內容' });
  }

  var token = PropertiesService.getScriptProperties().getProperty('TOKEN');
  if (!token || body.token !== token) {
    return json_({ status: 'error', code: 'unauthorized', message: '同步密碼錯誤' });
  }

  if (body.action === 'ping') return json_({ status: 'ok' });

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    return json_({ status: 'error', code: 'busy', message: '伺服器忙碌中，稍後自動重試' });
  }
  try {
    if (body.action === 'pull') return json_(pull_(Number(body.since) || 0));
    if (body.action === 'push') return json_(push_(body.records));
    return json_({ status: 'error', code: 'bad_action', message: '未知的 action' });
  } catch (err) {
    return json_({ status: 'error', code: 'server', message: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function pull_(since) {
  var rows = readRecords_();
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].rev > since) out.push(rows[i].rec);
  }
  return { status: 'ok', rev: currentRev_(), records: out };
}

function push_(records) {
  if (!Array.isArray(records)) return { status: 'error', code: 'bad_records', message: 'records 必須是陣列' };
  if (records.length > MAX_RECORDS_PER_PUSH) return { status: 'error', code: 'too_many', message: '單次最多 ' + MAX_RECORDS_PER_PUSH + ' 筆' };

  var sheet = recordSheet_();
  var rows = readRecords_();
  var index = {};
  rows.forEach(function (r) { index[r.rec.collection + '|' + r.rec.id] = r; });

  var props = PropertiesService.getScriptProperties();
  var rev = Number(props.getProperty('REV')) || 0;
  var appended = [];
  var touched = {};
  var accepted = [];
  var rejected = [];
  var conflicts = [];

  records.forEach(function (rec) {
    if (!validRecord_(rec)) { rejected.push(rec && rec.id); return; }
    var key = rec.collection + '|' + rec.id;
    var existing = index[key];
    // 新者勝：伺服器版本比較新時，忽略這筆（前端下次 pull 會拿到較新的版本）
    if (existing && existing.rec.updatedAt > rec.updatedAt) {
      accepted.push(key);
      conflicts.push(existing.rec);
      return;
    }
    rev += 1;
    var row = toRow_(rec, rev);
    if (existing) {
      sheet.getRange(existing.rowNumber, 1, 1, RECORD_HEADERS.length).setValues([row]);
      existing.rec = rec;
      existing.rev = rev;
    } else {
      appended.push(row);
      index[key] = { rec: rec, rev: rev, rowNumber: -1 };
    }
    touched[rec.collection] = true;
    accepted.push(key);
  });

  if (appended.length) {
    var start = sheet.getLastRow() + 1;
    var range = sheet.getRange(start, 1, appended.length, RECORD_HEADERS.length);
    range.setNumberFormat('@');
    range.setValues(appended);
  }
  props.setProperty('REV', String(rev));

  if (touched.expenses || touched.members) rebuildExpensesView_();
  if (touched.itinerary) rebuildItineraryView_();
  if (touched.tastings) rebuildTastingView_();

  return { status: 'ok', rev: rev, accepted: accepted, rejected: rejected, conflicts: conflicts };
}

function validRecord_(rec) {
  if (!rec || typeof rec !== 'object') return false;
  if (ALLOWED_COLLECTIONS.indexOf(rec.collection) < 0) return false;
  if (typeof rec.id !== 'string' || !rec.id || rec.id.length > 80) return false;
  if (typeof rec.updatedAt !== 'number' || !isFinite(rec.updatedAt)) return false;
  if (rec.data !== null && typeof rec.data !== 'object') return false;
  if (JSON.stringify(rec.data || {}).length > 20000) return false;
  return true;
}

function toRow_(rec, rev) {
  return [
    rec.collection,
    rec.id,
    String(rec.updatedAt),
    rec.deleted ? '1' : '0',
    String(rec.by || '').slice(0, 40),
    String(rev),
    JSON.stringify(rec.data || {})
  ];
}

function readRecords_() {
  var sheet = recordSheet_();
  var last = sheet.getLastRow();
  if (last < 2) return [];
  var values = sheet.getRange(2, 1, last - 1, RECORD_HEADERS.length).getValues();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var v = values[i];
    if (!v[0] || !v[1]) continue;
    var data;
    try { data = JSON.parse(v[6] || '{}'); } catch (err) { data = {}; }
    out.push({
      rowNumber: i + 2,
      rev: Number(v[5]) || 0,
      rec: {
        collection: String(v[0]),
        id: String(v[1]),
        updatedAt: Number(v[2]) || 0,
        deleted: String(v[3]) === '1',
        by: String(v[4] || ''),
        data: data
      }
    });
  }
  return out;
}

function recordSheet_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(RECORD_SHEET);
  if (!sheet) throw new Error('找不到 Records 工作表，請先執行 setup()');
  return sheet;
}

function currentRev_() {
  return Number(PropertiesService.getScriptProperties().getProperty('REV')) || 0;
}

// ---------- 報表工作表（給人看、可下載 Excel；App 不會讀這些表） ----------

function liveRecords_(collection) {
  return readRecords_()
    .map(function (r) { return r.rec; })
    .filter(function (rec) { return rec.collection === collection && !rec.deleted; });
}

// numericCols：要保留為數字的欄位（從 0 起算），其餘欄位一律存成純文字
function writeView_(name, headers, rows, numericCols) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  sheet.clearContents();
  numericCols = numericCols || [];
  var all = [headers].concat(rows.map(function (r) {
    return r.map(function (v, i) {
      if (numericCols.indexOf(i) >= 0) return Number(v) || 0;
      return safeCell_(v);
    });
  }));
  var range = sheet.getRange(1, 1, all.length, headers.length);
  range.setNumberFormat('@');
  numericCols.forEach(function (i) {
    if (all.length > 1) sheet.getRange(2, i + 1, all.length - 1, 1).setNumberFormat('#,##0.####');
  });
  range.setValues(all);
  sheet.setFrozenRows(1);
}

/** 防公式注入：文字開頭是 = + - @ 或 tab 時，前面加單引號。 */
function safeCell_(v) {
  if (v === null || v === undefined) return '';
  var s = String(v);
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

function rebuildExpensesView_() {
  var rows = liveRecords_('expenses')
    .sort(function (a, b) { return (a.data.createdAt || 0) - (b.data.createdAt || 0); })
    .map(function (rec) {
      var d = rec.data;
      var rate = Number(d.rate) || 0;
      var twd = d.currency === 'JPY' ? Math.round(Number(d.amount) * rate) : Math.round(Number(d.amount));
      return [d.time, d.title, d.category, d.amount, d.currency, d.currency === 'JPY' ? rate : 1, twd,
        d.payer, d.method, (d.splitters || []).join('、'), rec.by];
    });
  writeView_('Expenses_View',
    ['時間', '項目', '分類', '原始金額', '幣別', '匯率', '折合台幣', '墊付人', '付款方式', '分攤成員', '最後修改者'],
    rows, [3, 5, 6]);
}

function rebuildItineraryView_() {
  var rows = liveRecords_('itinerary')
    .sort(function (a, b) {
      return (a.data.day - b.data.day) || String(a.data.time).localeCompare(String(b.data.time));
    })
    .map(function (rec) {
      var d = rec.data;
      return ['Day ' + d.day, d.route || '', d.time, d.title, d.note, d.done ? '已完成' : '', rec.by];
    });
  writeView_('Itinerary_View', ['天數', '自駕路線', '時間', '標題', '備註', '完成', '最後修改者'], rows);
}

function rebuildTastingView_() {
  var rows = liveRecords_('tastings')
    .sort(function (a, b) { return (a.data.createdAt || 0) - (b.data.createdAt || 0); })
    .map(function (rec) {
      var d = rec.data;
      return [d.time, d.type, d.name, d.rating, d.shop, d.note, rec.by];
    });
  writeView_('Tasting_View', ['日期', '類型', '品項', '評分', '店家', '心得', '記錄者'], rows, [3]);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
