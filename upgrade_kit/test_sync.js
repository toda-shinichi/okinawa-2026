const vm = require('vm'), fs = require('fs'), assert = require('assert');
const eq=(a,b)=>require("assert").deepStrictEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)));
// ---------- mock Google Apps Script ----------
function makeGas() {
  const sheets = {}; const props = {};
  function mkSheet(name){ const s={name,cells:[],fmt:{},frozen:0,
    getLastRow(){ let n=this.cells.length; while(n>0 && (this.cells[n-1]||[]).every(v=>v===''||v===undefined)) n--; return n;},
    getRange(a,b,c,d){ const sh=this; if(typeof a==='string') return {setNumberFormat(){return this;}};
      const r=a,col=b,nr=c||1,nc=d||1; return {
        setValues(v){ assert.strictEqual(v.length,nr); for(let i=0;i<nr;i++){assert.strictEqual(v[i].length,nc); sh.cells[r-1+i]=sh.cells[r-1+i]||[]; for(let j=0;j<nc;j++) sh.cells[r-1+i][col-1+j]=v[i][j];} return this;},
        getValues(){ const o=[]; for(let i=0;i<nr;i++){const row=[]; for(let j=0;j<nc;j++) row.push(((sh.cells[r-1+i]||[])[col-1+j]) ?? ''); o.push(row);} return o;},
        setNumberFormat(){return this;} };},
    clearContents(){ this.cells=[]; }, setFrozenRows(n){this.frozen=n;} }; return s; }
  const ss = { getSheetByName:n=>sheets[n]||null, insertSheet:n=>(sheets[n]=mkSheet(n)) };
  const ctx = {
    SpreadsheetApp:{ getActiveSpreadsheet:()=>ss },
    PropertiesService:{ getScriptProperties:()=>({ getProperty:k=>props[k]??null, setProperty:(k,v)=>{props[k]=v;} }) },
    LockService:{ getScriptLock:()=>({ tryLock:()=>true, releaseLock(){} }) },
    Utilities:{ getUuid:()=> 'abcd1234-ef56-7890-abcd-ef1234567890' },
    Logger:{ log(){} },
    ContentService:{ MimeType:{JSON:'json'}, createTextOutput:t=>({ text:t, setMimeType(){return this;} }) },
    console };
  vm.createContext(ctx); vm.runInContext(fs.readFileSync(__dirname+'/Code.gs','utf8'), ctx);
  ctx.setup();
  return { ctx, sheets, props, post(body){ return JSON.parse(ctx.doPost({postData:{contents:typeof body==='string'?body:JSON.stringify(body)}}).text); } };
}
// ---------- mock browser client ----------
function makeClient(gas, name, opts={}) {
  const ls = {}; let online = true;
  const ctx = { console, Intl, Date, Math, JSON, Promise, Object, Array, Set, String, Number, encodeURIComponent,
    setTimeout:()=>0, clearTimeout(){}, setInterval:()=>0, clearInterval(){},
    localStorage:{ getItem:k=>k in ls?ls[k]:null, setItem:(k,v)=>{ls[k]=String(v);}, removeItem:k=>{delete ls[k];} },
    navigator:{ get onLine(){return online;} },
    window:{ addEventListener(){} }, document:{ addEventListener(){}, visibilityState:'visible' },
    fetch: async (url, init) => { if(!online) throw new TypeError('Failed to fetch');
      assert.strictEqual(init.headers['Content-Type'],'text/plain;charset=utf-8');
      const out = gas.post(init.body); if (opts.dropResponse && opts.dropResponse()) throw new TypeError('lost'); return { ok:true, status:200, json: async()=>out }; } };
  vm.createContext(ctx);
  const dataSrc = `const DEFAULT_ITINERARY = {1:[{time:'10:05',title:'A'},{time:'14:00',title:'B'},{time:'9:30',title:'C'}],2:[],4:[]};
    const SAT_ROUTES = {south:[{time:'09:00',title:'S1'}],central:[{time:'09:00',title:'C1'}],north:[]};`;
  const exportSrc = ';globalThis.__x={Store,SyncManager,getDayItems,addCustomItem,setItemDone,removeItem,resetDay,setSatRoute,getSatRoute,addMemberRecord,getMembers,memberUsage,ensureDefaultMembers,computeSettlement,migrateFromV2,normalizeTime,prefs:()=>prefs,loadPrefs,tokyoNow,dailySubtotals,categoryTotals,removeMemberRecord};';
  vm.runInContext(dataSrc + fs.readFileSync(__dirname+'/sync.js','utf8') + fs.readFileSync(__dirname+'/model.js','utf8') + exportSrc, ctx);
  const x = ctx.__x; x.ls = ls; x.setOnline = v=>{online=v;};
  ls['okinawa_2026_v3_me'] = JSON.stringify(name);
  if (opts.legacy) ls['okinawa_2026_tzh_v2'] = JSON.stringify(opts.legacy);
  x.loadPrefs(); x.Store.load(); x.migrateFromV2(); x.ensureDefaultMembers();
  x.SyncManager.API_URL = 'https://script.google.com/macros/s/x/exec';
  x.SyncManager.setToken(opts.token ?? gas.props.TOKEN);
  return x;
}
(async () => {
  const gas = makeGas();
  // 1 auth
  assert.strictEqual(gas.post({action:'pull',token:'bad',since:0}).code,'unauthorized');
  assert.strictEqual(gas.post('not json').code,'bad_json');
  const A = makeClient(gas,'子桓'), B = makeClient(gas,'旅伴 A');
  // 2 time sort fix & normalize
  eq(A.getDayItems(1).map(i=>i.title), ['C','A','B']);
  assert.strictEqual(A.normalizeTime('9:5'), null); assert.strictEqual(A.normalizeTime('930'),'09:30'); assert.strictEqual(A.normalizeTime('25:00'),null); assert.strictEqual(A.normalizeTime('15：30'),'15:30');
  // 3 A adds expense + itinerary done, syncs; B pulls
  A.Store.put('expenses','exp-1a',{title:'午餐 =SUM(A1)',amount:3200,currency:'JPY',rate:0.2,payer:'子桓',method:'現金',splitters:['子桓','旅伴 A'],category:'餐飲',time:'10/22 12:30',createdAt:1});
  const firstItem = A.getDayItems(1)[0]; A.setItemDone(firstItem, true);
  assert.ok(await A.SyncManager.syncNow()); assert.strictEqual(A.Store.pendingCount(),0);
  assert.ok(await B.SyncManager.syncNow());
  assert.strictEqual(B.Store.list('expenses').length,1);
  assert.strictEqual(B.getDayItems(1)[0].done,true);
  // members seeded locally, not pushed (updatedAt 1)
  eq(Object.keys(B.getMembers()).length,2);
  // 4 views & formula injection
  const ev = gas.sheets.Expenses_View.cells; assert.strictEqual(ev[1][1], "'午餐 =SUM(A1)".replace("'","")); // starts with 午 -> no prefix
  A.Store.put('expenses','exp-2',{title:'=HYPERLINK("x")',amount:100,currency:'TWD',rate:1,payer:'旅伴 A',method:'現金',splitters:['子桓'],category:'其他',time:'10/22 13:00',createdAt:2});
  await A.SyncManager.syncNow();
  assert.strictEqual(gas.sheets.Expenses_View.cells[2][1], `'=HYPERLINK("x")`);
  assert.strictEqual(gas.sheets.Expenses_View.cells[1][6], 640); assert.strictEqual(gas.sheets.Expenses_View.cells[1][1], '午餐 =SUM(A1)');
  // 5 offline queue then resend; coalescing
  B.setOnline(false);
  B.Store.put('tastings','t-b1',{name:'泡盛',rating:'4',type:'泡盛 / 古酒',time:'10/22',createdAt:3});
  B.Store.patch('tastings','t-b1',{rating:'5'});
  assert.strictEqual(await B.SyncManager.syncNow(), false); assert.strictEqual(B.SyncManager.status,'offline');
  assert.strictEqual(B.Store.pendingCount(),1);
  B.setOnline(true); assert.ok(await B.SyncManager.syncNow()); assert.strictEqual(B.Store.pendingCount(),0);
  await A.SyncManager.syncNow(); assert.strictEqual(A.Store.get('tastings','t-b1').rating,'5');
  // 6 lost response -> resend must not duplicate
  let drop = true; const C = makeClient(gas,'C',{dropResponse:()=>{ if(drop){drop=false;return true;} return false;}});
  C.Store.put('expenses','exp-c1',{title:'x',amount:1,currency:'TWD',rate:1,payer:'C',method:'現金',splitters:['C'],time:'',createdAt:4});
  assert.strictEqual(await C.SyncManager.syncNow(), false); assert.strictEqual(C.Store.pendingCount(),1);
  assert.ok(await C.SyncManager.syncNow());
  const recRows = gas.sheets.Records.cells.filter(r=>r && r[1]==='exp-c1'); assert.strictEqual(recRows.length,1);
  // 7 delete propagates (tombstone) and doesn't resurrect
  A.Store.remove('expenses','exp-c1'); await A.SyncManager.syncNow(); await C.SyncManager.syncNow();
  assert.strictEqual(C.Store.get('expenses','exp-c1'), null);
  await C.SyncManager.syncNow(); assert.strictEqual(C.Store.get('expenses','exp-c1'), null);
  // 8 concurrent edit LWW + conflict return
  const t0 = Date.now();
  B.Store.put('expenses','exp-1a',Object.assign({},B.Store.get('expenses','exp-1a'),{title:'B改'}));
  const recB = B.Store.raw('expenses')['exp-1a']; recB.updatedAt = t0 + 100000; B.Store.outbox['expenses|exp-1a'] = recB; // B newer
  A.Store.put('expenses','exp-1a',Object.assign({},A.Store.get('expenses','exp-1a'),{title:'A改'}));
  await B.SyncManager.syncNow(); await A.SyncManager.syncNow();
  assert.strictEqual(A.Store.get('expenses','exp-1a').title,'B改');
  assert.strictEqual(A.Store.pendingCount(),0);
  // 9 sat route switch keeps per-route state
  A.setSatRoute('central'); assert.strictEqual(A.getDayItems(3)[0].title,'C1');
  A.addCustomItem(3,{time:'12:00',title:'中部自訂'}); A.setSatRoute('south');
  eq(A.getDayItems(3).map(i=>i.title),['S1']); A.setSatRoute('central');
  eq(A.getDayItems(3).map(i=>i.title),['C1','中部自訂']);
  // 10 remove default + reset
  A.removeItem(A.getDayItems(1)[1]); eq(A.getDayItems(1).map(i=>i.title),['C','B']);
  A.addCustomItem(1,{time:'08:00',title:'早'}); A.resetDay(1);
  eq(A.getDayItems(1).map(i=>i.title+(i.done?'v':'')),['C','A','B']);
  await A.SyncManager.syncNow(); await B.SyncManager.syncNow();
  eq(B.getDayItems(1).map(i=>i.title),['C','A','B']);
  // 11 member usage + settlement with per-expense rate
  assert.ok(A.memberUsage('旅伴 A')>0);
  const s = A.computeSettlement([{amount:1000,currency:'JPY',rate:0.2,payer:'X',splitters:['X','Y']},{amount:100,currency:'TWD',payer:'Y',splitters:['Y']}]);
  assert.strictEqual(Math.round(s.totalTwd),300); eq(JSON.parse(JSON.stringify(s.transfers)),[{from:'Y',to:'X',twd:100}]);
  // 12 migration from v2
  const legacy = { currentDay:2, fxRate:0.21, members:['子桓','小美'], satRoute:'north',
    expenses:[{id:1,title:'範例',amount:8500,currency:'JPY',payer:'子桓',splitters:['子桓'],time:'x'},{id:1729000000000,title:'真帳',amount:500,currency:'JPY',payer:'小美',method:'現金',splitters:['子桓','小美'],time:'10/22 10:00'}],
    tastingNotes:[{id:1,name:'範例'}], customItinerary:{1:[{time:'10:05',title:'A'},{time:'16:00',title:'自訂X'}]} };
  const gas2 = makeGas(); const M = makeClient(gas2,'子桓',{legacy});
  assert.strictEqual(M.prefs().currentDay,2); eq(M.getMembers(),['子桓','小美']);
  eq(M.Store.list('expenses').map(e=>e.title),['真帳']); assert.strictEqual(M.Store.list('expenses')[0].rate,0.21);
  assert.strictEqual(M.Store.list('tastings').length,0); assert.strictEqual(M.getSatRoute(),'north');
  eq(M.getDayItems(1).map(i=>i.title),['A','自訂X']);
  assert.strictEqual(M.migrateFromV2(), false); // idempotent
  await M.SyncManager.syncNow(); assert.strictEqual(M.Store.pendingCount(),0);
  // 13 import/export
  const dump = JSON.parse(JSON.stringify(M.Store.exportAll())); const N = makeClient(gas,'N');
  assert.ok(N.Store.importAll(dump) > 0); assert.ok(N.Store.list('expenses').some(e=>e.title==='真帳'));
  assert.throws(()=>N.Store.importAll({version:2}));
  // 14 wrong token client
  const W = makeClient(gas,'W',{token:'nope'}); assert.strictEqual(await W.SyncManager.syncNow(),false); assert.strictEqual(W.SyncManager.status,'auth');
  // 15 validation
  eq(gas.post({action:'push',token:gas.props.TOKEN,records:[{collection:'hack',id:'1',updatedAt:1,data:{}}]}).rejected,['1']);
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(A.tokyoNow().date));
  console.log('ALL TESTS PASSED');
})().catch(e=>{console.error(e);process.exit(1);});
