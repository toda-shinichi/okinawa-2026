// ==================== 資料模型 v3（行程、成員、開銷、偏好設定、v2 遷移） ====================
// 依賴：sync.js 的 Store、newId、tokyoNow；index.html 內的 DEFAULT_ITINERARY、SAT_ROUTES。

const PREFS_KEY = 'okinawa_2026_v3_prefs';
const LEGACY_V2_KEY = 'okinawa_2026_tzh_v2';
const DEFAULT_MEMBERS = ['子桓', '旅伴 A'];

const DEFAULT_PREFS = {
  currentDay: 1,
  currentTab: 'itinerary',
  scrollByTab: {},
  fxRate: 0.215,
  fxManual: false,
  fxUpdatedAt: 0,
  favorites: ['ChIJhwJPV4Jp5TQRLsNITjiDb_c', 'ChIJq6q623Bp5TQRyBCEGsY59Cg', 'ChIJs43e5hpp5TQR_ZLpsAh3gbA', 'ChIJibDKt55p5TQRDQmhA4CNR8o'],
  sourceFilter: 'all',
  regionFilter: 'all',
  tagFilter: 'all',
  taxBasket: [],
  checkedClaims: {},
  customFlashcards: [],
  theme: 'auto',
  carReturnTime: '20:00'
};

let prefs = Object.assign({}, DEFAULT_PREFS);

function loadPrefs() {
  prefs = Object.assign({}, DEFAULT_PREFS, safeGet(PREFS_KEY, {}));
}

function savePrefs() {
  safeSet(PREFS_KEY, prefs);
}

// ---------- 時間工具 ----------

// 把使用者輸入的時間整理成 HH:MM；格式不對回傳 null
function normalizeTime(input) {
  const m = String(input || '').trim().replace('：', ':').match(/^(\d{1,2}):?(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return String(h).padStart(2, '0') + ':' + String(min).padStart(2, '0');
}

function timeToMinutes(t) {
  const n = normalizeTime(t);
  if (!n) return 9999;
  return Number(n.slice(0, 2)) * 60 + Number(n.slice(3));
}

// ---------- 行程 ----------

const TRIP_DATES = { 1: '2026-10-22', 2: '2026-10-23', 3: '2026-10-24', 4: '2026-10-25' };

function getSatRoute() {
  const s = Store.get('settings', 'satRoute');
  return (s && s.value) || 'south';
}

function setSatRoute(route) {
  Store.put('settings', 'satRoute', { value: route });
}

// 預設行程的固定 ID。注意：DEFAULT_ITINERARY 與 SAT_ROUTES 陣列只能在尾端新增，不可插入或重新排序。
function defaultItemsFor(day, route) {
  if (day === 3) {
    return (SAT_ROUTES[route] || []).map((it, i) => Object.assign({}, it, {
      id: 'def-d3-' + route + '-' + String(i + 1).padStart(2, '0'), day: 3, route, done: false, isDefault: true
    }));
  }
  return (DEFAULT_ITINERARY[day] || []).map((it, i) => Object.assign({}, it, {
    id: 'def-d' + day + '-' + String(i + 1).padStart(2, '0'), day, route: '', done: false, isDefault: true
  }));
}

function recordMatchesDay(data, day, route) {
  if (!data || Number(data.day) !== day) return false;
  return day !== 3 || data.route === route;
}

// 取得某天實際要顯示的行程：預設行程 + 雲端／本機的修改 + 自訂行程，依時間排序
function getDayItems(day) {
  const route = day === 3 ? getSatRoute() : '';
  const raw = Store.raw('itinerary');
  const items = [];
  defaultItemsFor(day, route).forEach(def => {
    const rec = raw[def.id];
    if (rec && rec.deleted) return;
    items.push(rec ? Object.assign({}, def, rec.data, { id: def.id, isDefault: true }) : def);
  });
  Object.values(raw).forEach(rec => {
    if (rec.deleted || rec.id.indexOf('cust-') !== 0) return;
    if (!recordMatchesDay(rec.data, day, route)) return;
    items.push(Object.assign({}, rec.data, { id: rec.id, isDefault: false }));
  });
  return items.sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
}

function itemToData(item) {
  return {
    day: item.day, route: item.route || '', time: item.time, title: item.title,
    cat: item.cat || '', addr: item.addr || '', pid: item.pid || '', note: item.note || '', done: !!item.done
  };
}

function addCustomItem(day, fields) {
  const route = day === 3 ? getSatRoute() : '';
  const id = newId('cust');
  Store.put('itinerary', id, itemToData(Object.assign({ day, route, done: false }, fields)));
  return id;
}

function setItemDone(item, done) {
  Store.put('itinerary', item.id, itemToData(Object.assign({}, item, { done })));
}

function removeItem(item) {
  if (item.isDefault && !Store.raw('itinerary')[item.id]) {
    Store.put('itinerary', item.id, itemToData(item));
  }
  Store.remove('itinerary', item.id);
}

// 還原某天（週六只還原目前路線）為預設：自訂行程刪除，預設行程恢復原樣
function resetDay(day) {
  const route = day === 3 ? getSatRoute() : '';
  const defaults = {};
  defaultItemsFor(day, route).forEach(d => { defaults[d.id] = d; });
  Object.values(Store.raw('itinerary')).forEach(rec => {
    if (defaults[rec.id]) {
      Store.put('itinerary', rec.id, itemToData(defaults[rec.id]));
    } else if (!rec.deleted && rec.id.indexOf('cust-') === 0 && recordMatchesDay(rec.data, day, route)) {
      Store.remove('itinerary', rec.id);
    }
  });
}

// 目前／下一站：只有當天日期才回傳，否則回傳 null
function getNowMarker(day, items) {
  const now = tokyoNow();
  if (now.date !== TRIP_DATES[day]) return null;
  const nowMin = timeToMinutes(now.hm);
  let currentId = null;
  let nextId = null;
  items.forEach(it => {
    const t = timeToMinutes(it.time);
    if (t <= nowMin) currentId = it.id;
    else if (!nextId) nextId = it.id;
  });
  return { currentId, nextId };
}

// ---------- 成員 ----------

function memberId(name) {
  return 'm-' + encodeURIComponent(name).slice(0, 70);
}

function getMembers() {
  return Store.list('members')
    .sort((a, b) => (a.order || 0) - (b.order || 0) || String(a.name).localeCompare(String(b.name)))
    .map(m => m.name);
}

function addMemberRecord(name) {
  const clean = String(name || '').trim().slice(0, 20);
  if (!clean) return false;
  if (getMembers().includes(clean)) return false;
  Store.put('members', memberId(clean), { name: clean, order: Date.now() });
  return true;
}

// 回傳仍引用此成員的開銷筆數；大於 0 時不可刪除
function memberUsage(name) {
  return Store.list('expenses').filter(e => e.payer === name || (e.splitters || []).includes(name)).length;
}

function removeMemberRecord(name) {
  Store.remove('members', memberId(name));
}

function ensureDefaultMembers() {
  if (Object.keys(Store.raw('members')).length === 0) {
    DEFAULT_MEMBERS.forEach((n, i) => Store.seed('members', memberId(n), { name: n, order: i }));
  }
}

// ---------- 開銷與結算 ----------

const EXPENSE_CATEGORIES = ['餐飲', '交通', '住宿', '購物', '門票體驗', '其他'];

function expenseTwd(e) {
  const amt = Number(e.amount) || 0;
  return e.currency === 'JPY' ? amt * (Number(e.rate) || prefs.fxRate) : amt;
}

function computeSettlement(expenses) {
  const balances = {};
  let totalTwd = 0;
  expenses.forEach(e => {
    const splitters = (e.splitters || []).filter(Boolean);
    if (!splitters.length) return;
    const twd = expenseTwd(e);
    totalTwd += twd;
    balances[e.payer] = (balances[e.payer] || 0) + twd;
    const share = twd / splitters.length;
    splitters.forEach(s => { balances[s] = (balances[s] || 0) - share; });
  });
  const debtors = [];
  const creditors = [];
  Object.keys(balances).forEach(p => {
    if (balances[p] < -0.5) debtors.push({ person: p, amt: -balances[p] });
    else if (balances[p] > 0.5) creditors.push({ person: p, amt: balances[p] });
  });
  debtors.sort((a, b) => b.amt - a.amt);
  creditors.sort((a, b) => b.amt - a.amt);
  const transfers = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amt, creditors[j].amt);
    transfers.push({ from: debtors[i].person, to: creditors[j].person, twd: Math.round(pay) });
    debtors[i].amt -= pay;
    creditors[j].amt -= pay;
    if (debtors[i].amt < 0.5) i++;
    if (creditors[j].amt < 0.5) j++;
  }
  return { totalTwd, balances, transfers };
}

function dailySubtotals(expenses) {
  const out = {};
  expenses.forEach(e => {
    const day = String(e.time || '').split(' ')[0] || '未標日期';
    out[day] = (out[day] || 0) + expenseTwd(e);
  });
  return out;
}

function categoryTotals(expenses) {
  const out = {};
  expenses.forEach(e => {
    const c = e.category || '其他';
    out[c] = (out[c] || 0) + expenseTwd(e);
  });
  return out;
}

// ---------- v2 → v3 遷移（只執行一次） ----------

function migrateFromV2() {
  if (safeGet('okinawa_2026_v3_migrated', false)) return false;
  const old = safeGet(LEGACY_V2_KEY, null);
  safeSet('okinawa_2026_v3_migrated', true);
  if (!old) return false;

  ['currentDay', 'fxRate', 'favorites', 'sourceFilter', 'regionFilter', 'tagFilter', 'taxBasket', 'checkedClaims', 'customFlashcards']
    .forEach(k => { if (old[k] !== undefined) prefs[k] = old[k]; });
  savePrefs();

  (old.members || []).forEach((n, i) => {
    if (n) Store.put('members', memberId(n), { name: String(n), order: i });
  });

  // 範例資料（id 為 1）不搬移，避免假資料同步到雲端
  (old.expenses || []).filter(e => e && e.id !== 1).forEach(e => {
    Store.put('expenses', 'exp-' + e.id, {
      title: e.title, amount: Number(e.amount) || 0, currency: e.currency || 'JPY',
      rate: e.currency === 'JPY' ? (Number(old.fxRate) || 0.215) : 1,
      payer: e.payer, method: e.method || '現金', splitters: e.splitters || [],
      category: '其他', time: e.time || '', createdAt: Number(e.id) || Date.now()
    });
  });

  (old.tastingNotes || []).filter(t => t && t.id !== 1).forEach(t => {
    Store.put('tastings', 't-' + t.id, {
      type: t.type, rating: String(t.rating || ''), name: t.name, shop: t.shop || '',
      note: t.note || '', time: t.time || '', createdAt: Number(t.id) || Date.now()
    });
  });

  if (old.satRoute && old.satRoute !== 'south') setSatRoute(old.satRoute);

  // 自訂過的行程：用「時間＋標題」比對預設項目，比對不到的預設項目視為已刪除，多出來的視為自訂
  const custom = old.customItinerary || {};
  Object.keys(custom).forEach(dayKey => {
    const day = Number(dayKey);
    const list = Array.isArray(custom[dayKey]) ? custom[dayKey] : [];
    const route = day === 3 ? (old.satRoute || 'south') : '';
    const defaults = defaultItemsFor(day, route);
    const sig = it => normalizeTime(it.time) + '|' + it.title;
    const keep = new Set(list.map(sig));
    defaults.forEach(d => {
      if (!keep.has(sig(d))) {
        Store.put('itinerary', d.id, itemToData(d));
        Store.remove('itinerary', d.id);
      }
    });
    const defaultSigs = new Set(defaults.map(sig));
    list.filter(it => !defaultSigs.has(sig(it))).forEach(it => {
      Store.put('itinerary', newId('cust'), itemToData({
        day, route, time: normalizeTime(it.time) || '12:00', title: it.title, cat: it.cat,
        addr: it.addr, pid: it.pid, note: it.note, done: false
      }));
    });
  });
  return true;
}
