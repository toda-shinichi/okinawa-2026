// OKINAWA 2026 - 資料層（Store）與雲端同步（SyncManager）v3
// 依賴：無。必須在 index.html 主程式之前載入。
// 對外提供：Store、SyncManager、newId、tokyoNow 四個全域物件／函式。

const STORE_KEY = 'okinawa_2026_v3_records';
const OUTBOX_KEY = 'okinawa_2026_v3_outbox';
const SYNC_META_KEY = 'okinawa_2026_v3_syncmeta';
const SYNC_COLLECTIONS = ['expenses', 'itinerary', 'tastings', 'members', 'settings', 'places'];

function safeGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function safeSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.warn('localStorage 寫入失敗', key, e);
    return false;
  }
}

function newId(prefix) {
  return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
}

// 回傳沖繩當地時間的各欄位（不受手機時區設定影響）
function tokyoNow() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(new Date());
  const get = t => (parts.find(p => p.type === t) || {}).value;
  const hour = get('hour') === '24' ? '00' : get('hour');
  return {
    date: get('year') + '-' + get('month') + '-' + get('day'),
    md: Number(get('month')) + '/' + Number(get('day')),
    hm: hour + ':' + get('minute')
  };
}

const Store = {
  db: {},       // { collection: { id: record } }
  outbox: {},   // { 'collection|id': record }
  listeners: [],

  load() {
    this.db = safeGet(STORE_KEY, {});
    this.outbox = safeGet(OUTBOX_KEY, {});
    SYNC_COLLECTIONS.forEach(c => { if (!this.db[c]) this.db[c] = {}; });
  },

  persist() {
    safeSet(STORE_KEY, this.db);
    safeSet(OUTBOX_KEY, this.outbox);
  },

  whoAmI() {
    return safeGet('okinawa_2026_v3_me', '') || '';
  },

  // 新增或修改：data 為完整資料物件（不是局部欄位）
  put(collection, id, data) {
    const rec = { collection, id, updatedAt: Date.now(), deleted: false, by: this.whoAmI(), data };
    this._write(rec);
    return rec;
  },

  // 預設資料：updatedAt 設為 1，任何雲端版本都會蓋過它；不排入待送清單
  seed(collection, id, data) {
    if (this.db[collection][id]) return;
    this.db[collection][id] = { collection, id, updatedAt: 1, deleted: false, by: '', data };
    this.persist();
  },

  // 只更新部分欄位
  patch(collection, id, partial) {
    const cur = this.get(collection, id);
    return this.put(collection, id, Object.assign({}, cur || {}, partial));
  },

  // 刪除（墓碑標記，不真的移除，才能同步給旅伴）
  remove(collection, id) {
    const old = this.db[collection] && this.db[collection][id];
    const rec = { collection, id, updatedAt: Date.now(), deleted: true, by: this.whoAmI(), data: old ? old.data : {} };
    this._write(rec);
    return rec;
  },

  // 復原刪除
  restore(collection, id) {
    const old = this.db[collection] && this.db[collection][id];
    if (!old) return null;
    const rec = Object.assign({}, old, { updatedAt: Date.now(), deleted: false, by: this.whoAmI() });
    this._write(rec);
    return rec;
  },

  _write(rec) {
    // 同一毫秒內連續寫入同一筆時，確保 updatedAt 遞增
    const prev = this.db[rec.collection][rec.id];
    if (prev && prev.updatedAt >= rec.updatedAt) rec.updatedAt = prev.updatedAt + 1;
    this.db[rec.collection][rec.id] = rec;
    this.outbox[rec.collection + '|' + rec.id] = rec;
    this.persist();
    this.emit('local', rec.collection);
    if (typeof SyncManager !== 'undefined') SyncManager.schedulePush();
  },

  get(collection, id) {
    const rec = this.db[collection] && this.db[collection][id];
    return rec && !rec.deleted ? rec.data : null;
  },

  // 回傳未刪除的資料陣列，每筆附上 id
  list(collection) {
    return Object.values(this.db[collection] || {})
      .filter(r => !r.deleted)
      .map(r => Object.assign({ id: r.id }, r.data));
  },

  // 回傳原始紀錄（含已刪除），行程合併時使用
  raw(collection) {
    return this.db[collection] || {};
  },

  // 套用伺服器傳回的紀錄；回傳有變動的 collection 清單
  applyRemote(records) {
    const changed = new Set();
    records.forEach(rec => {
      if (!SYNC_COLLECTIONS.includes(rec.collection)) return;
      const key = rec.collection + '|' + rec.id;
      const local = this.db[rec.collection][rec.id];
      const pending = this.outbox[key];
      if (pending && pending.updatedAt > rec.updatedAt) return; // 本機尚未送出的版本比較新
      if (local && local.updatedAt > rec.updatedAt) return;
      this.db[rec.collection][rec.id] = rec;
      if (pending && pending.updatedAt <= rec.updatedAt) delete this.outbox[key];
      changed.add(rec.collection);
    });
    if (changed.size) {
      this.persist();
      changed.forEach(c => this.emit('remote', c));
    }
    return Array.from(changed);
  },

  // 伺服器確認收到後，從待送清單移除（若期間又被改過則保留）
  ack(sentRecords) {
    sentRecords.forEach(rec => {
      const key = rec.collection + '|' + rec.id;
      const cur = this.outbox[key];
      if (cur && cur.updatedAt === rec.updatedAt) delete this.outbox[key];
    });
    this.persist();
  },

  pendingCount() {
    return Object.keys(this.outbox).length;
  },

  onChange(fn) {
    this.listeners.push(fn);
  },

  emit(source, collection) {
    this.listeners.forEach(fn => {
      try { fn(source, collection); } catch (e) { console.warn('畫面更新失敗', e); }
    });
  },

  exportAll() {
    return { version: 3, exportedAt: new Date().toISOString(), db: this.db };
  },

  // 匯入備份：逐筆以「新者勝」合併，並排入待送清單
  importAll(payload) {
    if (!payload || payload.version !== 3 || !payload.db) throw new Error('備份檔格式不符');
    let count = 0;
    SYNC_COLLECTIONS.forEach(c => {
      Object.values(payload.db[c] || {}).forEach(rec => {
        if (!rec || rec.collection !== c || typeof rec.id !== 'string') return;
        const local = this.db[c][rec.id];
        if (local && local.updatedAt >= rec.updatedAt) return;
        this.db[c][rec.id] = rec;
        this.outbox[c + '|' + rec.id] = rec;
        count++;
      });
    });
    this.persist();
    SYNC_COLLECTIONS.forEach(c => this.emit('import', c));
    if (typeof SyncManager !== 'undefined') SyncManager.schedulePush();
    return count;
  }
};

const SyncManager = {
  // 部署 GAS 後，把網址貼在這裡（網址本身可以公開，密碼不可以）
  API_URL: '',
  status: 'local',   // local | syncing | ok | offline | error | auth
  lastSyncAt: 0,
  lastError: '',
  busy: false,
  pushTimer: null,
  pollTimer: null,
  statusListeners: [],

  token() { return safeGet('okinawa_2026_v3_token', ''); },
  setToken(t) { safeSet('okinawa_2026_v3_token', String(t || '').trim()); },
  enabled() { return !!(this.API_URL && this.token()); },

  meta() { return safeGet(SYNC_META_KEY, { rev: 0, lastSyncAt: 0 }); },
  saveMeta(m) { safeSet(SYNC_META_KEY, m); },

  setStatus(s, err) {
    this.status = s;
    this.lastError = err || '';
    this.statusListeners.forEach(fn => { try { fn(this); } catch (e) {} });
  },

  onStatus(fn) { this.statusListeners.push(fn); },

  async call(body) {
    const res = await fetch(this.API_URL, {
      method: 'POST',
      // 用 text/plain 避免 CORS 預檢（GAS 不支援 OPTIONS）
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ token: this.token() }, body)),
      redirect: 'follow'
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (data.status !== 'ok') {
      const err = new Error(data.message || '同步失敗');
      err.code = data.code;
      throw err;
    }
    return data;
  },

  // 完整同步一輪：先送出本機變更，再拉回別人的變更
  async syncNow() {
    if (!this.enabled()) { this.setStatus('local'); return false; }
    if (this.busy) return false;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { this.setStatus('offline'); return false; }
    this.busy = true;
    this.setStatus('syncing');
    try {
      const pending = Object.values(Store.outbox);
      for (let i = 0; i < pending.length; i += 200) {
        const chunk = pending.slice(i, i + 200);
        const pushed = await this.call({ action: 'push', records: chunk });
        Store.ack(chunk);
        Store.applyRemote(pushed.conflicts || []);
      }
      const meta = this.meta();
      const pulled = await this.call({ action: 'pull', since: meta.rev || 0 });
      Store.applyRemote(pulled.records || []);
      this.lastSyncAt = Date.now();
      this.saveMeta({ rev: pulled.rev, lastSyncAt: this.lastSyncAt });
      this.setStatus(Store.pendingCount() ? 'syncing' : 'ok');
      if (Store.pendingCount()) this.schedulePush();
      return true;
    } catch (e) {
      if (e.code === 'unauthorized') this.setStatus('auth', '同步密碼錯誤，請到雲端設定重新輸入');
      else if (e.code) this.setStatus('error', e.message);
      else this.setStatus('offline', '連線失敗，資料已保留在手機，恢復網路後自動補送');
      return false;
    } finally {
      this.busy = false;
    }
  },

  // 本機有變更時，1.5 秒後合併送出（連續操作只送一次）
  schedulePush() {
    if (!this.enabled()) return;
    clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => this.syncNow(), 1500);
  },

  start() {
    this.lastSyncAt = this.meta().lastSyncAt || 0;
    if (!this.enabled()) { this.setStatus('local'); return; }
    this.syncNow();
    window.addEventListener('online', () => this.syncNow());
    window.addEventListener('offline', () => this.setStatus('offline'));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.syncNow();
    });
    // 畫面開著時每 60 秒拉一次旅伴的更新
    clearInterval(this.pollTimer);
    this.pollTimer = setInterval(() => {
      if (document.visibilityState === 'visible') this.syncNow();
    }, 60000);
  },

  // 換密碼或換試算表時使用：清掉同步進度，下一次重新完整拉取
  resetCursor() {
    this.saveMeta({ rev: 0, lastSyncAt: 0 });
  }
};
