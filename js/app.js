// OKINAWA 2026 - 介面邏輯 v3（行程、分帳、品飲、設定、同步燈號、天氣、匯率、主題）
// 依賴：js/sync.js、js/model.js，以及 index.html 主程式裡的 DEFAULT_BANNERS、escStr、escapeHtml、
//       openTaxiModal、renderPlaces、renderCultureChapters、renderPhrases、renderFlashcards、renderClaimsChecklist

// ==================== A. 共用介面元件：提示訊息、對話框 ====================

function toast(message, opts) {
  opts = opts || {};
  const box = document.getElementById('toast-box');
  if (!box) return;
  const el = document.createElement('div');
  el.className = 'toast-item';
  const text = document.createElement('span');
  text.textContent = message;
  el.appendChild(text);
  if (opts.actionLabel && typeof opts.onAction === 'function') {
    const btn = document.createElement('button');
    btn.className = 'toast-action';
    btn.textContent = opts.actionLabel;
    btn.onclick = () => { opts.onAction(); el.remove(); };
    el.appendChild(btn);
  }
  box.appendChild(el);
  setTimeout(() => el.remove(), opts.duration || 5000);
}

// 開啟對話框。actions: [{ label, primary, onClick }]；onClick 回傳 false 時不關閉
function openDialog(title, bodyHtml, actions) {
  const wrap = document.getElementById('app-dialog');
  document.getElementById('app-dialog-title').textContent = title;
  document.getElementById('app-dialog-body').innerHTML = bodyHtml;
  const bar = document.getElementById('app-dialog-actions');
  bar.innerHTML = '';
  (actions || [{ label: '關閉' }]).forEach(a => {
    const btn = document.createElement('button');
    btn.textContent = a.label;
    btn.className = a.primary ? 'dlg-btn dlg-btn-primary' : 'dlg-btn';
    btn.onclick = () => {
      const keep = a.onClick ? a.onClick() === false : false;
      if (!keep) closeDialog();
    };
    bar.appendChild(btn);
  });
  wrap.classList.remove('hidden');
}

function closeDialog() {
  document.getElementById('app-dialog').classList.add('hidden');
}

function confirmDialog(title, message, okLabel, onOk) {
  openDialog(title, '<p class="text-sm leading-relaxed">' + escapeHtml(message) + '</p>', [
    { label: '取消' },
    { label: okLabel || '確定', primary: true, onClick: onOk }
  ]);
}

function formatTwd(n) {
  return 'NT$ ' + Math.round(n).toLocaleString();
}

// ==================== B. 頁籤切換（記住頁籤與捲動位置） ====================

const TAB_NAMES = ['itinerary', 'places', 'flashcards', 'split', 'culture', 'sos'];

// isInit 為 true 時（App 剛開啟）不記錄目前捲動位置，避免把上次的位置蓋成 0
function switchTab(tabName, isInit) {
  if (!TAB_NAMES.includes(tabName)) tabName = 'itinerary';
  if (!isInit && prefs.currentTab) prefs.scrollByTab[prefs.currentTab] = window.scrollY;
  TAB_NAMES.forEach(t => {
    const sec = document.getElementById('tab-' + t);
    const nav = document.getElementById('nav-' + t);
    if (sec) sec.classList.add('hidden');
    if (nav) nav.classList.remove('tab-active');
  });
  const targetSec = document.getElementById('tab-' + tabName);
  const targetNav = document.getElementById('nav-' + tabName);
  if (targetSec) targetSec.classList.remove('hidden');
  if (targetNav) targetNav.classList.add('tab-active');
  prefs.currentTab = tabName;
  savePrefs();
  window.scrollTo({ top: prefs.scrollByTab[tabName] || 0 });
}

let scrollSaveTimer = null;
window.addEventListener('scroll', () => {
  clearTimeout(scrollSaveTimer);
  scrollSaveTimer = setTimeout(() => {
    prefs.scrollByTab[prefs.currentTab] = window.scrollY;
    savePrefs();
  }, 400);
}, { passive: true });

// ==================== C. 行程 ====================

function selectDay(day) {
  prefs.currentDay = day;
  savePrefs();
  [1, 2, 3, 4].forEach(d => {
    const btn = document.getElementById('day-btn-' + d);
    if (btn) btn.classList.toggle('pill-active', d === day);
  });
  const satSelector = document.getElementById('sat-route-selector');
  if (satSelector) satSelector.classList.toggle('hidden', day !== 3);
  const banner = document.getElementById('day-transport-banner');
  if (banner) banner.innerHTML = DEFAULT_BANNERS[day];
  renderItinerary();
}

function selectSatRoute(routeKey) {
  if (getSatRoute() !== routeKey) setSatRoute(routeKey);
  renderItinerary();
}

function highlightSatRoute() {
  const route = getSatRoute();
  ['south', 'central', 'north'].forEach(k => {
    const btn = document.getElementById('sat-btn-' + k);
    if (btn) btn.classList.toggle('subpill-active', k === route);
  });
}

let itineraryCache = [];

function renderItinerary() {
  const day = prefs.currentDay;
  highlightSatRoute();
  renderWeatherStrip();
  renderDriveCard();
  const list = getDayItems(day);
  itineraryCache = list;
  const marker = getNowMarker(day, list);
  const container = document.getElementById('itinerary-list');
  if (!container) return;
  if (!list.length) {
    container.innerHTML = '<div class="bg-white rounded-xl p-6 text-center text-sm text-stone-500 border border-stone-200">本日沒有行程，可在下方新增，或按「還原預設行程」。</div>';
    return;
  }
  container.innerHTML = list.map(item => {
    const gmapUrl = item.pid
      ? 'https://www.google.com/maps/place/?q=place_id:' + encodeURIComponent(item.pid)
      : 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(item.title + ' 沖縄');
    const isNow = marker && marker.currentId === item.id;
    const isNext = marker && marker.nextId === item.id;
    const stateBadge = isNow ? '<span class="text-xs font-bold bg-ryukyu-teal text-white px-2.5 py-1 rounded">目前</span>'
      : isNext ? '<span class="text-xs font-bold bg-amber-500 text-white px-2.5 py-1 rounded">下一站</span>' : '';
    const id = escStr(item.id);
    return `
      <div class="bg-white rounded-xl p-4 shadow-sm border ${isNow ? 'border-ryukyu-teal border-2' : 'border-stone-200'} relative ${item.done ? 'opacity-60' : ''}">
        <div class="flex items-start justify-between gap-2">
          <div class="flex flex-wrap items-center gap-2">
            <span class="bg-ryukyu-indigo text-white font-mono text-xs sm:text-sm font-bold px-3 py-1 rounded">${escapeHtml(item.time)}</span>
            <span class="text-xs font-bold text-ryukyu-terracotta bg-orange-50 px-2.5 py-1 rounded">${escapeHtml(item.cat || '行程節點')}</span>
            ${stateBadge}
          </div>
          <div class="flex items-center">
            <button onclick="toggleItemDone('${id}')" class="hit text-sm font-bold rounded-lg border ${item.done ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-stone-300 text-stone-600'}" title="標記完成">${item.done ? '已完成' : '完成'}</button>
            <button onclick="deleteItineraryItem('${id}')" class="hit text-stone-400 hover:text-stone-700 text-base" title="刪除此行程">✕</button>
          </div>
        </div>
        <h3 class="text-base sm:text-lg font-bold text-stone-900 mt-2.5 leading-snug ${item.done ? 'line-through' : ''}">${escapeHtml(item.title)}</h3>
        ${item.addr ? `<p class="text-xs sm:text-sm text-stone-500 font-mono mt-1">${escapeHtml(item.addr)}</p>` : ''}
        ${item.note ? `<p class="text-sm text-stone-700 mt-2 leading-relaxed bg-stone-50 p-3 rounded-lg border border-stone-100">${escapeHtml(item.note)}</p>` : ''}
        <div class="flex flex-wrap gap-2 mt-3.5 pt-2.5 border-t border-stone-100">
          <a href="${gmapUrl}" target="_blank" rel="noopener" class="bg-stone-900 hover:bg-stone-800 text-white text-xs sm:text-sm font-medium px-3.5 py-2.5 rounded-lg">Google 導航</a>
          <button onclick="openTaxiModal('${escStr(item.title)}', '${escStr(item.addr)}', 'ここまでお願いします。（請載我到這個地點）')" class="border border-stone-300 text-stone-700 text-xs sm:text-sm font-medium px-3.5 py-2.5 rounded-lg">${prefs.currentDay === 3 ? '車機導航卡' : '司機指路卡'}</button>
        </div>
      </div>
    `;
  }).join('');
}

function findCachedItem(id) {
  return itineraryCache.find(i => i.id === id);
}

function toggleItemDone(id) {
  const item = findCachedItem(id);
  if (!item) return;
  setItemDone(item, !item.done);
}

function deleteItineraryItem(id) {
  const item = findCachedItem(id);
  if (!item) return;
  removeItem(item);
  toast('已刪除「' + item.title + '」', {
    actionLabel: '復原',
    onAction: () => Store.restore('itinerary', id)
  });
}

function addCustomItineraryItem() {
  const time = normalizeTime(document.getElementById('new-item-time').value);
  const title = document.getElementById('new-item-title').value.trim();
  const note = document.getElementById('new-item-note').value.trim();
  if (!time) return toast('請輸入正確時間，例如 15:30');
  if (!title) return toast('請輸入地點或活動名稱');
  addCustomItem(prefs.currentDay, { time, title, cat: '自訂行程', note });
  document.getElementById('new-item-time').value = '';
  document.getElementById('new-item-title').value = '';
  document.getElementById('new-item-note').value = '';
  toast('已加入 ' + time + ' ' + title);
}

function resetDefaultItinerary() {
  const label = prefs.currentDay === 3 ? '本日目前路線' : '本日行程';
  confirmDialog('還原預設行程', '確定要將' + label + '還原為系統預設排程嗎？自訂項目會被刪除，完成標記會清除。', '還原', () => {
    resetDay(prefs.currentDay);
    toast('已還原預設行程');
  });
}

// 從地點清單加入行程（取代原本的 prompt）
function sendPlaceToItinerary(name, addr, pid, cat) {
  const dayOptions = [1, 2, 3, 4].map(d =>
    `<option value="${d}" ${d === prefs.currentDay ? 'selected' : ''}>${['', '10/22 (四) Day 1', '10/23 (五) Day 2', '10/24 (六) Day 3 自駕', '10/25 (日) Day 4'][d]}</option>`
  ).join('');
  openDialog('排入行程：' + name, `
    <label class="dlg-label">哪一天</label>
    <select id="dlg-day" class="dlg-input">${dayOptions}</select>
    <label class="dlg-label">預計時間</label>
    <input id="dlg-time" type="time" value="15:00" class="dlg-input">
    <p class="text-xs text-stone-500 mt-2">選擇 Day 3 時，會加入目前選定的自駕路線。</p>
  `, [
    { label: '取消' },
    {
      label: '加入', primary: true, onClick: () => {
        const day = Number(document.getElementById('dlg-day').value);
        const time = normalizeTime(document.getElementById('dlg-time').value);
        if (!time) { toast('請輸入正確時間'); return false; }
        addCustomItem(day, { time, title: name, cat: cat || '地圖隨記', addr, pid, note: '從地點資料庫加入' });
        selectDay(day);
        switchTab('itinerary');
        toast('已加入 Day ' + day + ' ' + time);
      }
    }
  ]);
}

// ==================== D. 週六自駕工具（還車倒數、加油、停車） ====================

function renderDriveCard() {
  const box = document.getElementById('drive-card');
  if (!box) return;
  if (prefs.currentDay !== 3) { box.classList.add('hidden'); return; }
  box.classList.remove('hidden');
  const now = tokyoNow();
  let countdown = '自駕日當天會顯示還車倒數';
  if (now.date === TRIP_DATES[3]) {
    const left = timeToMinutes(prefs.carReturnTime) - timeToMinutes(now.hm);
    countdown = left > 0
      ? '距離還車還有 ' + Math.floor(left / 60) + ' 小時 ' + (left % 60) + ' 分'
      : '已超過預定還車時間 ' + Math.abs(left) + ' 分鐘，請盡快聯絡 ORBIT';
  }
  box.innerHTML = `
    <div class="flex items-center justify-between gap-2">
      <h3 class="text-sm font-bold text-ryukyu-indigo">自駕日工具</h3>
      <label class="text-xs text-stone-600 flex items-center gap-1.5">預定還車
        <input type="time" value="${escapeHtml(prefs.carReturnTime)}" onchange="setCarReturnTime(this.value)" class="border border-stone-300 rounded px-2 py-1 font-mono text-sm">
      </label>
    </div>
    <p class="text-base font-bold text-stone-900">${escapeHtml(countdown)}</p>
    <ul class="text-sm text-stone-700 list-disc pl-5 space-y-1">
      <li>還車前在附近加油站加滿 Regular（紅色油槍），保留加油收據</li>
      <li>出發前拍下車身四面照片；任何擦撞都要先打 110 報警</li>
      <li>景點停車場多數收現金，請準備 ¥100 硬幣</li>
    </ul>
    <div class="flex flex-wrap gap-2">
      <button onclick="openTaxiModal('加油站', 'Regyura- mantan de onegaishimasu.', 'レギュラー満タンでお願いします。')" class="border border-stone-300 text-stone-700 text-sm px-3.5 py-2.5 rounded-lg">加油用語卡</button>
      <button onclick="openTaxiModal('停車場', 'Senyou chuushajou wa arimasu ka?', '専用駐車場はありますか？')" class="border border-stone-300 text-stone-700 text-sm px-3.5 py-2.5 rounded-lg">停車用語卡</button>
    </div>
  `;
}

function setCarReturnTime(v) {
  const t = normalizeTime(v);
  if (!t) return;
  prefs.carReturnTime = t;
  savePrefs();
  renderDriveCard();
}

// ==================== E. 天氣（Open-Meteo，免金鑰） ====================

const WEATHER_KEY = 'okinawa_2026_v3_weather';
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast?latitude=26.2124&longitude=127.6809'
  + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,sunset'
  + '&timezone=Asia%2FTokyo&start_date=2026-10-22&end_date=2026-10-25';

function weatherText(code) {
  if (code === 0) return '晴';
  if (code <= 2) return '晴時多雲';
  if (code === 3) return '陰';
  if (code === 45 || code === 48) return '霧';
  if (code >= 51 && code <= 57) return '毛毛雨';
  if (code >= 61 && code <= 67) return '雨';
  if (code >= 80 && code <= 82) return '陣雨';
  if (code >= 95) return '雷雨';
  return '多變';
}

async function refreshWeather(force) {
  const cached = safeGet(WEATHER_KEY, null);
  if (!force && cached && Date.now() - cached.fetchedAt < 3 * 3600 * 1000) return;
  try {
    const res = await fetch(WEATHER_URL);
    if (!res.ok) return;
    const data = await res.json();
    if (!data.daily || !data.daily.time) return;
    safeSet(WEATHER_KEY, { fetchedAt: Date.now(), daily: data.daily });
    renderWeatherStrip();
  } catch (e) {
    // 離線時沿用上次的資料
  }
}

function renderWeatherStrip() {
  const box = document.getElementById('weather-strip');
  if (!box) return;
  const cached = safeGet(WEATHER_KEY, null);
  const date = TRIP_DATES[prefs.currentDay];
  const d = cached && cached.daily;
  const i = d ? d.time.indexOf(date) : -1;
  if (i < 0) {
    box.innerHTML = '<span class="text-stone-500">天氣預報：連上網路後自動更新（出發前 16 天內才有預報）</span>';
    return;
  }
  const wind = d.wind_speed_10m_max[i];
  const sunset = String(d.sunset[i] || '').slice(11, 16);
  const updated = new Date(cached.fetchedAt);
  box.innerHTML = `
    <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
      <b class="text-stone-900">${weatherText(d.weather_code[i])}</b>
      <span>${Math.round(d.temperature_2m_min[i])}–${Math.round(d.temperature_2m_max[i])}°C</span>
      <span>降雨機率 ${d.precipitation_probability_max[i]}%</span>
      <span>最大風速 ${Math.round(wind)} km/h</span>
      ${sunset ? `<span>日落 ${sunset}</span>` : ''}
    </div>
    ${wind >= 50 ? '<p class="text-ryukyu-terracotta font-bold mt-1">風速偏強，請留意颱風動態與班機、渡輪異動。</p>' : ''}
    <p class="text-xs text-stone-400 mt-1">預報更新於 ${updated.getMonth() + 1}/${updated.getDate()} ${String(updated.getHours()).padStart(2, '0')}:${String(updated.getMinutes()).padStart(2, '0')}</p>
  `;
}

// ==================== F. 匯率（自動抓取，可手動覆寫） ====================

async function refreshFxRate(force) {
  if (prefs.fxManual && !force) return renderFxStatus();
  if (!force && Date.now() - (prefs.fxUpdatedAt || 0) < 6 * 3600 * 1000) return renderFxStatus();
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/JPY');
    const data = await res.json();
    const rate = data && data.rates && data.rates.TWD;
    if (rate > 0) {
      prefs.fxRate = Math.round(rate * 10000) / 10000;
      prefs.fxManual = false;
      prefs.fxUpdatedAt = Date.now();
      savePrefs();
      const input = document.getElementById('fx-rate');
      if (input) input.value = prefs.fxRate;
      calcFromJpy();
      renderTaxBasket();
    }
  } catch (e) {
    // 離線時沿用上次的匯率
  }
  renderFxStatus();
}

function renderFxStatus() {
  const el = document.getElementById('fx-status');
  if (!el) return;
  if (prefs.fxManual) {
    el.innerHTML = '手動匯率 <button onclick="useAutoFx()" class="underline text-ryukyu-ocean">改回自動</button>';
  } else if (prefs.fxUpdatedAt) {
    const d = new Date(prefs.fxUpdatedAt);
    el.textContent = '自動匯率，更新於 ' + (d.getMonth() + 1) + '/' + d.getDate() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  } else {
    el.textContent = '尚未取得自動匯率';
  }
}

function useAutoFx() {
  prefs.fxManual = false;
  savePrefs();
  refreshFxRate(true);
}

// 使用者手動修改匯率：只影響之後新增的帳，舊帳維持記帳當下的匯率
function updateFxRate() {
  const val = parseFloat(document.getElementById('fx-rate').value);
  if (!(val > 0)) return;
  prefs.fxRate = val;
  prefs.fxManual = true;
  savePrefs();
  calcFromJpy();
  renderTaxBasket();
  renderFxStatus();
  toast('之後新增的日圓帳目會用 ' + val + ' 換算，舊帳不變');
}

// ==================== G. 分帳 ====================

function addMember() {
  const input = document.getElementById('new-member-name');
  const name = input.value.trim();
  if (!name) return;
  if (!addMemberRecord(name)) return toast('名稱重複或無效');
  input.value = '';
}

function removeMember(name) {
  if (getMembers().length <= 1) return toast('至少需保留一位成員');
  const used = memberUsage(name);
  if (used > 0) return toast('「' + name + '」還有 ' + used + ' 筆相關帳目，請先修改或刪除這些帳目');
  removeMemberRecord(name);
  toast('已移除 ' + name, { actionLabel: '復原', onAction: () => Store.restore('members', memberId(name)) });
}

function readExpenseForm() {
  const title = document.getElementById('exp-title').value.trim();
  const amount = parseFloat(document.getElementById('exp-amount').value);
  const currency = document.getElementById('exp-currency').value;
  const payer = document.getElementById('exp-payer').value;
  const method = document.getElementById('exp-method').value;
  const category = document.getElementById('exp-category').value;
  const splitters = Array.from(document.querySelectorAll('.splitter-checkbox:checked')).map(cb => cb.value);
  if (!title || isNaN(amount) || amount <= 0) { toast('請輸入消費項目名稱與有效金額'); return null; }
  if (!payer) { toast('請選擇墊付人'); return null; }
  if (!splitters.length) { toast('請至少勾選一位分攤成員'); return null; }
  return { title, amount, currency, payer, method, category, splitters };
}

function addExpense() {
  const f = readExpenseForm();
  if (!f) return;
  const editId = document.getElementById('exp-edit-id').value;
  if (editId) {
    const old = Store.get('expenses', editId);
    if (!old) { cancelEditExpense(); return toast('這筆帳已被刪除'); }
    const rate = f.currency === 'JPY' ? (old.currency === 'JPY' ? old.rate : prefs.fxRate) : 1;
    Store.put('expenses', editId, Object.assign({}, old, f, { rate }));
    cancelEditExpense();
    return toast('已更新帳目');
  }
  const now = tokyoNow();
  Store.put('expenses', newId('exp'), Object.assign({}, f, {
    rate: f.currency === 'JPY' ? prefs.fxRate : 1,
    time: now.md + ' ' + now.hm,
    createdAt: Date.now()
  }));
  document.getElementById('exp-title').value = '';
  document.getElementById('exp-amount').value = '';
  toast('已記下：' + f.title);
}

function startEditExpense(id) {
  const e = Store.get('expenses', id);
  if (!e) return;
  document.getElementById('exp-edit-id').value = id;
  document.getElementById('exp-title').value = e.title;
  document.getElementById('exp-amount').value = e.amount;
  document.getElementById('exp-currency').value = e.currency;
  document.getElementById('exp-method').value = e.method;
  document.getElementById('exp-category').value = e.category || '其他';
  renderExpenseFormMembers(e.payer, e.splitters);
  document.getElementById('exp-submit-btn').textContent = '更新這筆帳目';
  document.getElementById('exp-cancel-btn').classList.remove('hidden');
  document.getElementById('exp-form-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function cancelEditExpense() {
  document.getElementById('exp-edit-id').value = '';
  document.getElementById('exp-title').value = '';
  document.getElementById('exp-amount').value = '';
  document.getElementById('exp-submit-btn').textContent = '儲存這筆帳目';
  document.getElementById('exp-cancel-btn').classList.add('hidden');
  renderExpenseFormMembers();
}

function deleteExpense(id) {
  const e = Store.get('expenses', id);
  Store.remove('expenses', id);
  toast('已刪除：' + (e ? e.title : '帳目'), { actionLabel: '復原', onAction: () => Store.restore('expenses', id) });
}

// 重畫墊付人下拉與分攤勾選；editing 時帶入原本的值
function renderExpenseFormMembers(payer, splitters) {
  const members = getMembers();
  const payerSelect = document.getElementById('exp-payer');
  const keepPayer = payer || payerSelect.value || Store.whoAmI() || members[0];
  payerSelect.innerHTML = members.map(m => `<option value="${escapeHtml(m)}" ${m === keepPayer ? 'selected' : ''}>${escapeHtml(m)}</option>`).join('');
  const checked = splitters || members;
  document.getElementById('exp-splitters').innerHTML = members.map(m => `
    <label class="flex items-center space-x-2 bg-stone-50 border border-stone-200 px-3 py-2.5 rounded-lg text-sm cursor-pointer">
      <input type="checkbox" value="${escapeHtml(m)}" ${checked.includes(m) ? 'checked' : ''} class="splitter-checkbox accent-ryukyu-indigo w-4 h-4">
      <span>${escapeHtml(m)}</span>
    </label>
  `).join('');
}

function renderSplitSection() {
  renderTaxBasket();
  renderFxStatus();
  const members = getMembers();
  document.getElementById('members-list').innerHTML = members.map(m => `
    <span class="bg-stone-100 border border-stone-300 text-stone-800 text-sm pl-3 rounded-full flex items-center">
      <span>${escapeHtml(m)}${m === Store.whoAmI() ? '（我）' : ''}</span>
      <button onclick="removeMember('${escStr(m)}')" class="hit text-stone-400 hover:text-red-600 font-bold" title="移除">✕</button>
    </span>
  `).join('');

  if (!document.getElementById('exp-edit-id').value) renderExpenseFormMembers();

  const expenses = Store.list('expenses').sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const result = computeSettlement(expenses);
  document.getElementById('total-trip-spend').textContent = '總支出：約 ' + formatTwd(result.totalTwd);

  const settleContainer = document.getElementById('settlement-list');
  settleContainer.innerHTML = result.transfers.length === 0
    ? '<div class="text-slate-300 py-1">目前所有成員帳目已平衡，無須轉帳。</div>'
    : result.transfers.map(s => `
      <div class="bg-white/10 rounded-lg p-3 flex items-center justify-between">
        <span class="text-sm sm:text-base"><b>${escapeHtml(s.from)}</b> 應付給 <b>${escapeHtml(s.to)}</b></span>
        <span class="font-mono font-bold text-base sm:text-lg text-amber-300">${formatTwd(s.twd)} <span class="text-xs text-slate-300 font-normal">(約 ¥${Math.round(s.twd / prefs.fxRate).toLocaleString()})</span></span>
      </div>
    `).join('');

  renderExpenseStats(expenses);

  const expContainer = document.getElementById('expense-list');
  if (!expenses.length) {
    expContainer.innerHTML = '<div class="text-stone-400 py-4 text-center text-sm">尚無帳目</div>';
    return;
  }
  expContainer.innerHTML = expenses.map(e => {
    const id = escStr(e.id);
    return `
      <div class="py-2.5 flex items-center justify-between gap-2">
        <div class="min-w-0 flex-1">
          <div class="text-sm sm:text-base font-bold text-stone-900 break-words">${escapeHtml(e.title)}
            <span class="text-xs font-normal text-stone-600 bg-stone-100 px-2 py-0.5 rounded ml-1">${escapeHtml(e.category || '其他')}</span>
            <span class="text-xs font-normal text-stone-600 bg-stone-100 px-2 py-0.5 rounded">${escapeHtml(e.method)}</span>
          </div>
          <div class="text-xs sm:text-sm text-stone-500 mt-1">${escapeHtml(e.payer)} 先墊 ｜ 分攤：${escapeHtml((e.splitters || []).join('、'))} ｜ ${escapeHtml(e.time)}${e.currency === 'JPY' ? ' ｜ 匯率 ' + e.rate : ''}</div>
        </div>
        <div class="text-right flex items-center shrink-0">
          <div>
            <div class="text-base sm:text-lg font-mono font-bold text-stone-900">${e.currency === 'JPY' ? '¥' : 'NT$ '}${Number(e.amount).toLocaleString()}</div>
            ${e.currency === 'JPY' ? `<div class="text-xs font-mono text-stone-400">≈ ${formatTwd(expenseTwd(e))}</div>` : ''}
          </div>
          <button onclick="startEditExpense('${id}')" class="hit text-stone-500 hover:text-ryukyu-indigo text-sm" title="編輯">改</button>
          <button onclick="deleteExpense('${id}')" class="hit text-stone-400 hover:text-red-500" title="刪除">✕</button>
        </div>
      </div>
    `;
  }).join('');
}

function renderExpenseStats(expenses) {
  const box = document.getElementById('expense-stats');
  if (!box) return;
  if (!expenses.length) { box.innerHTML = ''; return; }
  const byDay = dailySubtotals(expenses);
  const byCat = categoryTotals(expenses);
  const max = Math.max.apply(null, Object.values(byCat));
  box.innerHTML = `
    <div class="space-y-1.5">
      <h4 class="text-sm font-bold text-stone-800">每日小計</h4>
      ${Object.keys(byDay).sort().map(d => `<div class="flex justify-between text-sm"><span>${escapeHtml(d)}</span><span class="font-mono">${formatTwd(byDay[d])}</span></div>`).join('')}
    </div>
    <div class="space-y-1.5 pt-2">
      <h4 class="text-sm font-bold text-stone-800">分類占比</h4>
      ${Object.keys(byCat).sort((a, b) => byCat[b] - byCat[a]).map(c => `
        <div class="text-sm">
          <div class="flex justify-between"><span>${escapeHtml(c)}</span><span class="font-mono">${formatTwd(byCat[c])}</span></div>
          <div class="w-full bg-stone-200 h-2 rounded-full overflow-hidden"><div class="bg-ryukyu-teal h-full" style="width:${Math.round(byCat[c] / max * 100)}%"></div></div>
        </div>`).join('')}
    </div>
  `;
}

function exportExpensesText() {
  const lines = ['【2026 沖繩旅行分帳明細】'];
  Store.list('expenses').sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)).forEach(e => {
    lines.push('- ' + e.time + ' ' + e.title + '：' + e.currency + ' ' + e.amount + '（' + e.payer + ' 先墊，分攤：' + (e.splitters || []).join('/') + '）');
  });
  copyText(lines.join('\n'), '已複製帳目明細，可貼到 LINE 群組');
}

function settlementText() {
  const result = computeSettlement(Store.list('expenses'));
  const lines = ['【沖繩分帳結算】', '總支出約 ' + formatTwd(result.totalTwd)];
  if (!result.transfers.length) lines.push('帳目已平衡，不需轉帳');
  result.transfers.forEach(t => lines.push(t.from + ' 付給 ' + t.to + ' ' + formatTwd(t.twd)));
  return lines.join('\n');
}

function shareSettlement() {
  const text = settlementText();
  if (navigator.share) {
    navigator.share({ text }).catch(() => {});
  } else {
    window.open('https://line.me/R/share?text=' + encodeURIComponent(text), '_blank', 'noopener');
  }
}

function copyText(text, okMsg) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => toast(okMsg)).catch(() => showTextDialog(text));
  } else {
    showTextDialog(text);
  }
}

function showTextDialog(text) {
  openDialog('請手動複製', '<textarea class="dlg-input" rows="8" readonly>' + escapeHtml(text) + '</textarea>');
}

// ==================== H. 品飲筆記 ====================

function addTastingNote() {
  const type = document.getElementById('taste-type').value;
  const rating = document.getElementById('taste-rating').value;
  const name = document.getElementById('taste-name').value.trim();
  const shop = document.getElementById('taste-shop').value.trim();
  const note = document.getElementById('taste-note').value.trim();
  if (!name) return toast('請輸入酒款、咖啡豆或菜色名稱');
  const now = tokyoNow();
  Store.put('tastings', newId('t'), { type, rating, name, shop, note, time: now.md, createdAt: Date.now() });
  document.getElementById('taste-name').value = '';
  document.getElementById('taste-shop').value = '';
  document.getElementById('taste-note').value = '';
  toast('已新增品飲筆記');
}

function deleteTastingNote(id) {
  Store.remove('tastings', id);
  toast('已刪除筆記', { actionLabel: '復原', onAction: () => Store.restore('tastings', id) });
}

function renderTastingNotes() {
  const container = document.getElementById('tasting-list');
  if (!container) return;
  const notes = Store.list('tastings').sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  if (!notes.length) {
    container.innerHTML = '<div class="bg-white rounded-xl p-6 text-center text-sm text-stone-400 border border-stone-200">目前尚無品飲筆記，歡迎在上方新增第一筆紀錄。</div>';
    return;
  }
  container.innerHTML = notes.map(t => `
    <div class="bg-white rounded-xl p-4 shadow-sm border border-stone-200 space-y-2">
      <div class="flex items-center justify-between">
        <span class="text-xs font-bold bg-ryukyu-indigo text-white px-2.5 py-1 rounded">${escapeHtml(t.type)}</span>
        <div class="flex items-center">
          <span class="text-xs sm:text-sm font-mono font-bold text-amber-600">評分 ${escapeHtml(t.rating)} / 5.0</span>
          <button onclick="deleteTastingNote('${escStr(t.id)}')" class="hit text-stone-400 hover:text-stone-600" title="刪除此筆記">✕</button>
        </div>
      </div>
      <h4 class="text-base sm:text-lg font-bold text-stone-900 leading-snug">${escapeHtml(t.name)}</h4>
      <p class="text-xs sm:text-sm text-ryukyu-terracotta font-medium">${t.shop ? '@ ' + escapeHtml(t.shop) : ''} <span class="text-stone-400 font-normal ml-1">${escapeHtml(t.time)}</span></p>
      ${t.note ? `<p class="text-sm text-stone-700 leading-relaxed bg-stone-50 p-3 rounded-lg border border-stone-100">${escapeHtml(t.note)}</p>` : ''}
    </div>
  `).join('');
}

// ==================== I. 同步燈號與設定 ====================

function renderSyncChip() {
  const chip = document.getElementById('sync-chip');
  if (!chip) return;
  const pending = Store.pendingCount();
  const map = {
    local: ['僅存本機', 'bg-white/15 text-slate-200'],
    syncing: ['雲端同步中', 'bg-sky-500/30 text-sky-100'],
    ok: ['已與雲端同步', 'bg-emerald-500/30 text-emerald-100'],
    offline: ['離線暫存' + (pending ? ' ' + pending + ' 筆' : ''), 'bg-amber-500/40 text-amber-100'],
    error: ['同步失敗', 'bg-red-500/40 text-red-100'],
    auth: ['同步密碼錯誤', 'bg-red-500/40 text-red-100']
  };
  const m = map[SyncManager.status] || map.local;
  chip.textContent = m[0];
  chip.className = 'text-xs font-bold px-2.5 py-1.5 rounded ' + m[1];
}

function formatClock(ts) {
  if (!ts) return '尚未同步';
  const d = new Date(ts);
  return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

function openSettings(firstRun) {
  const members = getMembers();
  const me = Store.whoAmI();
  openDialog(firstRun ? '先告訴我你是誰' : '設定與雲端同步', `
    ${firstRun ? '<p class="text-sm text-stone-600 mb-2">選擇後，記帳會自動帶入你是墊付人，旅伴也看得到每筆資料是誰改的。</p>' : ''}
    <label class="dlg-label">我是</label>
    <select id="set-me" class="dlg-input">
      <option value="">（請選擇）</option>
      ${members.map(m => `<option value="${escapeHtml(m)}" ${m === me ? 'selected' : ''}>${escapeHtml(m)}</option>`).join('')}
    </select>
    <label class="dlg-label">雲端同步密碼</label>
    <input id="set-token" type="password" autocomplete="off" class="dlg-input" value="${escapeHtml(SyncManager.token())}" placeholder="向子桓索取">
    <p class="text-xs text-stone-500 mt-1">${SyncManager.API_URL ? '' : '尚未設定雲端網址，目前只存在本機。'}最後同步：${formatClock(SyncManager.lastSyncAt)}｜待送出 ${Store.pendingCount()} 筆${SyncManager.lastError ? '｜' + escapeHtml(SyncManager.lastError) : ''}</p>
    <label class="dlg-label">外觀</label>
    <select id="set-theme" class="dlg-input">
      <option value="auto" ${prefs.theme === 'auto' ? 'selected' : ''}>跟隨系統</option>
      <option value="light" ${prefs.theme === 'light' ? 'selected' : ''}>淺色</option>
      <option value="dark" ${prefs.theme === 'dark' ? 'selected' : ''}>深色</option>
    </select>
    <label class="dlg-label">資料備份</label>
    <div class="flex flex-wrap gap-2">
      <button onclick="downloadBackup()" class="dlg-btn">下載備份檔</button>
      <label class="dlg-btn cursor-pointer">匯入備份檔<input type="file" accept="application/json,.json" class="hidden" onchange="importBackup(this)"></label>
    </div>
  `, [
    { label: '關閉' },
    {
      label: '儲存', primary: true, onClick: () => {
        const meVal = document.getElementById('set-me').value;
        if (!meVal) { toast('請選擇你是誰'); return false; }
        safeSet('okinawa_2026_v3_me', meVal);
        const newToken = document.getElementById('set-token').value.trim();
        const tokenChanged = newToken !== SyncManager.token();
        SyncManager.setToken(newToken);
        if (tokenChanged) SyncManager.resetCursor();
        prefs.theme = document.getElementById('set-theme').value;
        savePrefs();
        applyTheme();
        renderAll();
        if (tokenChanged) SyncManager.start(); else SyncManager.syncNow();
        toast('設定已儲存');
      }
    }
  ]);
}

function downloadBackup() {
  const blob = new Blob([JSON.stringify(Store.exportAll(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'okinawa-2026-backup-' + tokyoNow().date + '.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function importBackup(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const n = Store.importAll(JSON.parse(reader.result));
      toast('已匯入 ' + n + ' 筆較新的資料');
    } catch (e) {
      toast('匯入失敗：' + e.message);
    }
  };
  reader.readAsText(file);
  input.value = '';
}

// ==================== J. 主題 ====================

const darkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

function applyTheme() {
  const pref = prefs.theme || 'auto';
  const dark = pref === 'dark' || (pref === 'auto' && darkQuery && darkQuery.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0f172a' : '#1E3A5F');
}

if (darkQuery && darkQuery.addEventListener) darkQuery.addEventListener('change', applyTheme);

// ==================== K. 啟動 ====================

function renderAll() {
  renderItinerary();
  renderSplitSection();
  renderTastingNotes();
  renderPlaces();
  renderSyncChip();
}

function initApp() {
  loadPrefs();
  Store.load();
  migrateFromV2();
  ensureDefaultMembers();
  applyTheme();

  const fxInput = document.getElementById('fx-rate');
  if (fxInput) fxInput.value = prefs.fxRate;
  const catSelect = document.getElementById('exp-category');
  if (catSelect) catSelect.innerHTML = EXPENSE_CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('');

  selectDay(prefs.currentDay || 1);
  renderPlaces();
  renderSplitSection();
  renderCultureChapters();
  renderTastingNotes();
  renderPhrases();
  renderFlashcards();
  renderClaimsChecklist();
  switchTab(prefs.currentTab || 'itinerary', true);

  // 資料變動時只重畫相關區塊
  Store.onChange((source, collection) => {
    if (collection === 'itinerary' || collection === 'settings') renderItinerary();
    if (collection === 'expenses' || collection === 'members') renderSplitSection();
    if (collection === 'tastings') renderTastingNotes();
    renderSyncChip();
  });
  SyncManager.onStatus(renderSyncChip);
  SyncManager.start();
  renderSyncChip();

  refreshWeather(false);
  refreshFxRate(false);
  // 每分鐘更新「目前／下一站」與還車倒數
  setInterval(() => { if (prefs.currentTab === 'itinerary') renderItinerary(); }, 60000);

  if (!Store.whoAmI()) openSettings(true);

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch(e => console.warn('離線快取註冊失敗', e));
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
