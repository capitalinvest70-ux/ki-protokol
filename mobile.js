/* Протоколи КИ – мобилен изглед (v2.1).
   Работи върху същата Програма за протокол (същите данни и API), само изгледът е направен за телефон.
   Ново събрание → всичко повтарящо се се попълва само → присъстващи с подпис → хора от входа → гласуване → подписи, PDF и край. */
(function () {
  'use strict';
  if (window.KIM) return;

  const ANDROID = !!window.KIAndroid;
  const DESK = !!window.KIDesktop;                 // приложението за Windows
  const N = window.KIAndroid || window.KIDesktop || null; // запис, отваряне, изпращане на файлове
  const store = (s, p) => ({
    get(k, d) { try { const v = s.getItem(p + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { s.setItem(p + k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { s.removeItem(p + k); } catch (e) {} },
  });
  const LS = store(window.localStorage, 'kim_');
  const SS = store(window.sessionStorage, 'kim_');

  const isRoot = location.pathname === '/' || location.pathname === '';
  const phone = ANDROID || Math.min(window.innerWidth, (window.screen && window.screen.width) || 9999) < 760;
  const on = isRoot && !SS.get('full', false) && (phone || DESK || LS.get('force', false));

  const KIM = window.KIM = {
    on,
    toMobile() { SS.del('full'); location.hash = ''; location.reload(); },
    toFull(open) { SS.set('full', true); if (open) SS.set('open', open); location.hash = ''; location.reload(); },
  };

  /* ---------- Пълна версия: при нужда отваря събранието/точката, от която сме дошли ---------- */
  if (!on) {
    let o = SS.get('open', null);
    const ob = SS.get('openB', null);
    if (!o && ob) o = { b: ob, m: null };
    if (o && isRoot) {
      SS.del('open'); SS.del('openB');
      const t0 = Date.now();
      const iv = setInterval(() => {
        try {
          const ready = typeof openMeeting === 'function' && typeof state !== 'undefined' && (state.currentUser || Date.now() - t0 > 4000);
          if (ready) {
            clearInterval(iv);
            state.buildingId = o.b; if (o.p) state.selectedAgendaId = o.p;
            if (o.m) openMeeting(o.m); else if (o.b && typeof openBuilding === 'function') openBuilding(o.b);
          }
        } catch (e) {}
        if (Date.now() - t0 > 20000) clearInterval(iv);
      }, 300);
    }
    return;
  }

  /* ---------- Помощни ---------- */
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = n => String(n).padStart(2, '0');
  const isoOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayIso = () => isoOf(new Date());
  const nowHm = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const bgDate = iso => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}.${m[2]}.${m[1]}` : (iso || ''); };
  const addDays = (iso, n) => { const d = new Date(String(iso).slice(0, 10) + 'T12:00:00'); d.setDate(d.getDate() + n); return isoOf(d); };
  const addMonths = (iso, n) => { const d = new Date(String(iso).slice(0, 10) + 'T12:00:00'); const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n); d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); return isoOf(d); };
  const monthsBetween = (a, b) => { const x = String(a || '').match(/^(\d{4})-(\d{2})/), y = String(b || '').match(/^(\d{4})-(\d{2})/); return x && y ? (+y[1] - +x[1]) * 12 + (+y[2] - +x[2]) : 0; };
  const num = v => Number(v || 0);
  const pct = v => (Math.round(num(v) * 100) / 100).toFixed(2).replace('.', ',') + '%';
  const norm = s => String(s || '').toLowerCase().replace(/[„“"'.,№\-]/g, ' ').replace(/\s+/g, ' ').trim();
  const fileSafe = s => String(s || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  const COMPANY = 'Капитал Инвест България ООД';
  const VOTES = [['ЗА', 'ЗА', 'za'], ['ПРОТИВ', 'ПРОТИВ', 'pr'], ['ВЪЗДЪРЖАЛ СЕ', 'ВЪЗД.', 'vz']];
  const TYPES = [
    ['manager_change', 'Смяна на управител', 'Избор на Капитал Инвест за управител'],
    ['renewal', 'Преподписване', 'Продължаване с Капитал Инвест'],
    ['regular', 'Редовно събрание', 'Свободен дневен ред'],
  ];
  const typeLabel = t => (TYPES.find(x => x[0] === t) || [, t || ''])[1];
  const fixedLimit = t => (t === 'renewal' ? 7 : t === 'manager_change' ? 8 : 0);
  // Коя точка какви подробности има (както в Програма за протокол)
  const KIND_NO = {
    manager_change: { termination: 1, appointment: 2, cashier: 3, control: 4, revision: 5, authorization: 6, fee: 7 },
    renewal: { appointment: 2, cashier: 3, control: 4, authorization: 5, fee: 6 },
  };
  const EP = { termination: 'termination-details', appointment: 'appointment-details', cashier: 'cashier-details', control: 'control-details', revision: 'revision-details', authorization: 'authorization-details', fee: 'fee-decision-details' };
  const QUORUM = [['initial', 'В обявения час', 51], ['one_hour', 'След 1 час', 26], ['next_day', 'Следващия ден', 0]];
  const isClosed = m => !!(m && (m.closed_time || m.closed_at));

  class AuthErr extends Error {}
  async function api(url, opt = {}) {
    const r = await fetch(url, { credentials: 'same-origin', ...opt, headers: { 'Content-Type': 'application/json', ...(opt.headers || {}) } });
    const t = await r.text();
    if (r.status === 401 && url !== '/api/auth/login') throw new AuthErr('Нужен е вход');
    if (!r.ok) {
      let msg = t; try { const j = JSON.parse(t); msg = j.error || j.message || t; } catch (e) {}
      msg = String(msg).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240);
      throw new Error(msg || ('Грешка ' + r.status));
    }
    if (!t) return {};
    try { return JSON.parse(t); } catch (e) { return t; }
  }
  const post = (u, b) => api(u, { method: 'POST', body: JSON.stringify(b || {}) });
  const patch = (u, b) => api(u, { method: 'PATCH', body: JSON.stringify(b || {}) });
  const del = u => api(u, { method: 'DELETE' });

  // Казваме и на самата програма кое събрание е отворено (за печата на термопринтер)
  const syncState = (bid, mid) => { try { if (typeof state !== 'undefined') { if (bid) state.buildingId = bid; if (mid) state.meetingId = mid; } } catch (e) {} };

  /* ---------- Подписи и снимки: пазят се на телефона (IndexedDB) ---------- */
  const idb = (() => {
    let p;
    const db = () => p || (p = new Promise((res, rej) => { const r = indexedDB.open('kim', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
    const tx = async (mode, fn) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction('kv', mode); const req = fn(t.objectStore('kv')); t.oncomplete = () => res(req && req.result); t.onerror = () => rej(t.error); }); };
    return { get: k => tx('readonly', s => s.get(k)), set: (k, v) => tx('readwrite', s => s.put(v, k)), del: k => tx('readwrite', s => s.delete(k)), keys: () => tx('readonly', s => s.getAllKeys()) };
  })();
  const SIG = {}; // mid -> { key: value }
  async function loadSigs(mid) {
    if (SIG[mid]) return SIG[mid];
    const out = {};
    try { for (const k of (await idb.keys()) || []) if (String(k).startsWith(mid + ':')) out[String(k).slice(String(mid).length + 1)] = await idb.get(k); } catch (e) {}
    SIG[mid] = out;
    // първо отваряне на събранието: взимаме и подписите от другите устройства (чакаме най-много 4 сек)
    await Promise.race([Promise.all([syncSigs(mid), syncContacts()]).catch(() => {}), new Promise(r => setTimeout(r, 4000))]);
    return out;
  }

  /* ---------- 🔄 Общи подписи: пазят се и в Програма за протокол, за да ги виждат всички устройства ----------
     Място: /api/settings/<ключ> (общо за всички потребители на програмата).
       ki_i_<събрание>            – списък: { ключ: време }  (отрицателно време = изтрит)
       ki_s_<събрание>_<ключ>     – самият подпис / снимка на пълномощно
       ki_contacts                – имейли и телефони по обект
     На устройството остава копие (IndexedDB) – работи и без интернет; печели по-новият запис. */
  const REM = {
    get: async k => { const r = await api('/api/settings/' + k); if (!r || !r.value) return null; try { return JSON.parse(r.value); } catch (e) { return null; } },
    set: (k, v) => post('/api/settings/' + k, { value: v == null ? '' : JSON.stringify(v) }),
  };
  const sxGet = async mid => (await idb.get('sx:' + mid).catch(() => null)) || {};
  const sxSet = (mid, L) => idb.set('sx:' + mid, L).catch(() => {});
  const syncBusy = {};
  let syncInfo = { at: 0, ok: null };
  async function syncSigs(mid) {
    if (!mid || syncBusy[mid]) return false;
    syncBusy[mid] = true;
    let changed = false;
    try {
      const s = SIG[mid] || (SIG[mid] = {});
      const R = (await REM.get('ki_i_' + mid)) || {}, L = await sxGet(mid);
      const mine = {};   // това, което това устройство качва сега
      for (const k of new Set([...Object.keys(R), ...Object.keys(L), ...Object.keys(s)])) {
        const r = +R[k] || 0; let l = +L[k] || 0;
        if (!l && s[k]) l = 1;                         // стар подпис отпреди общото пазене
        if (Math.abs(r) > Math.abs(l)) {               // на другото устройство е по-ново
          if (r < 0) { if (s[k]) { delete s[k]; await idb.del(mid + ':' + k).catch(() => {}); changed = true; } }
          else { const v = await REM.get('ki_s_' + mid + '_' + k); if (v) { s[k] = v; await idb.set(mid + ':' + k, v); changed = true; } else continue; }
          L[k] = r;
        } else if (Math.abs(l) > Math.abs(r)) {        // тук е по-ново – качваме
          if (l < 0) { mine[k] = l; await REM.set('ki_s_' + mid + '_' + k, null).catch(() => {}); }
          else if (s[k]) {
            const t = l === 1 ? Date.now() : l;
            let v = s[k], js = JSON.stringify(v);
            if (js.length > 300000 && v.dyn && v.dyn.data) { v = Object.assign({}, v, { dyn: Object.assign({}, v.dyn, { data: undefined }) }); js = JSON.stringify(v); }
            if (js.length > 850000) continue;          // твърде голяма снимка – остава само на това устройство
            await REM.set('ki_s_' + mid + '_' + k, v);
            mine[k] = t; L[k] = t;
          }
        }
      }
      if (Object.keys(mine).length) {                  // списъкът се чете пак точно преди запис – друго устройство може да е писало
        const R2 = (await REM.get('ki_i_' + mid)) || {};
        for (const k in mine) if (Math.abs(mine[k]) >= Math.abs(+R2[k] || 0)) R2[k] = mine[k];
        await REM.set('ki_i_' + mid, R2);
      }
      await sxSet(mid, L);
      syncInfo = { at: Date.now(), ok: true };
    } catch (e) { if (e instanceof AuthErr) throw e; syncInfo = { at: Date.now(), ok: false }; }
    finally { syncBusy[mid] = false; }
    return changed;
  }
  let contactsBusy = false;
  const contactsPending = new Set();   // контакти, които чакат качване
  async function syncContacts(push) {
    (push || []).forEach(id => contactsPending.add(String(id)));
    if (contactsBusy) return false; contactsBusy = true;
    let changed = false;
    try {
      push = [...contactsPending];
      const R = (await REM.get('ki_contacts')) || {};
      for (const id in R) {
        const c = await idb.get('c:u' + id).catch(() => null);
        if (!c || (+R[id].t || 0) > (+c.t || 0)) { await idb.set('c:u' + id, R[id]).catch(() => {}); changed = true; }
      }
      if (push && push.length) {
        let w = false;
        for (const id of push) { const c = await idb.get('c:u' + id).catch(() => null); if (c && (+c.t || 0) >= (+(R[id] || {}).t || 0)) { R[id] = c; w = true; } }
        if (w) await REM.set('ki_contacts', R);
        push.forEach(id => contactsPending.delete(id));
      }
    } catch (e) { if (e instanceof AuthErr) throw e; }
    finally { contactsBusy = false; }
    return changed;
  }
  async function putSig(mid, key, val) {
    // към подписа се пази и как е направен: време, скорост, черти и точките с времената им
    if (val && val.img && typeof sigDyn !== 'undefined' && sigDyn.has(val.img)) { const d0 = sigDyn.get(val.img); sigDyn.delete(val.img); val = Object.assign({}, val, { dyn: d0 }); }
    const s = await loadSigs(mid);
    if (val == null) { delete s[key]; await idb.del(mid + ':' + key).catch(() => {}); }
    else { s[key] = val; await idb.set(mid + ':' + key, val); }
    const L = await sxGet(mid); L[key] = val == null ? -Date.now() : Date.now(); await sxSet(mid, L);
    syncSigs(mid).catch(() => {});   // веднага към другите устройства
  }

  // Имейл и телефон за всеки обект – пазят се на телефона (телефонът отива и в програмата)
  const contactOf = async unitId => {
    const c = (await idb.get('c:u' + unitId).catch(() => null)) || {};
    if (!c.t && (c.email || c.phone)) { c.t = 1; putContact(unitId, c, 1); }   // стар контакт – качваме го веднъж
    return c;
  };
  const putContact = async (unitId, c, t) => {
    await idb.set('c:u' + unitId, Object.assign({}, c, { t: t || Date.now() })).catch(() => {});
    syncContacts([unitId]).catch(() => {});
  };
  async function contactsFor(units) {
    const out = [];
    for (const u of units) { const c = await contactOf(u.id); const email = c.email || ''; const phone = c.phone || u.phone || ''; if (email || phone) out.push({ u, email, phone }); }
    return out;
  }
  const validEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

  /* ---------- Вид ---------- */
  if (!document.querySelector('meta[name=viewport]')) {
    const vm = document.createElement('meta'); vm.name = 'viewport'; vm.content = 'width=device-width, initial-scale=1, viewport-fit=cover';
    document.head.appendChild(vm);
  }
  const css = `
  html.kim-on, html.kim-on body { overflow:hidden !important; height:100% !important; }
  #kim { --navy:#0b2a5b; --navy2:#16448f; --gold:#f2b632; --bg:#eef2f8; --card:#fff; --ink:#0d1626; --mut:#5b6b85; --line:#d6dfee;
    --ok:#138a4b; --okbg:#e3f6ea; --bad:#c62828; --badbg:#fde8e8; --warn:#9a6700; --warnbg:#fff4d6; --fs:18px;
    position:fixed; inset:0; z-index:2147483500; background:var(--bg); color:var(--ink); display:flex; flex-direction:column;
    font:var(--fs)/1.35 "Segoe UI", Roboto, Arial, sans-serif; -webkit-tap-highlight-color:transparent; }
  #kim *, #kim *::before, #kim *::after { box-sizing:border-box; font-family:inherit; }
  #kim button { font:inherit; color:inherit; border:0; background:none; cursor:pointer; margin:0; min-height:0; padding:0; border-radius:0; }
  #kim input, #kim select, #kim textarea { font:inherit; color:var(--ink); width:100%; border:2px solid var(--line); border-radius:12px; padding:10px 12px; background:#fff; min-height:48px; margin:0; }
  #kim textarea { min-height:110px; resize:vertical; line-height:1.4; }
  #kim input:focus, #kim select:focus, #kim textarea:focus { outline:none; border-color:var(--navy2); box-shadow:0 0 0 3px rgba(242,182,50,.45); }
  #kim .top { background:linear-gradient(90deg,var(--navy),var(--navy2)); color:#fff; display:flex; align-items:center; gap:6px;
    padding:calc(env(safe-area-inset-top) + 8px) 8px 8px; min-height:60px; flex:none; box-shadow:0 2px 8px rgba(0,0,0,.2); }
  #kim .top .ib { width:48px; height:48px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:1.5em; flex:none; }
  #kim .top .ib:active { background:rgba(255,255,255,.15); }
  #kim .top .tt { flex:1; min-width:0; }
  #kim .top .t1 { font-weight:700; font-size:1.05em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  #kim .top .t2 { font-size:.78em; opacity:.85; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  #kim .main { flex:1; overflow-y:auto; -webkit-overflow-scrolling:touch; padding:12px 12px 28px; }
  #kim .tabs { flex:none; display:flex; background:#fff; border-top:1px solid var(--line); padding-bottom:env(safe-area-inset-bottom); }
  #kim .tabs button { flex:1; padding:8px 2px 10px; display:flex; flex-direction:column; align-items:center; gap:2px; color:var(--mut); font-size:.7em; font-weight:600; border-top:3px solid transparent; }
  #kim .tabs button b { font-size:1.6em; line-height:1.1; font-weight:400; }
  #kim .tabs button.on { color:var(--navy); border-top-color:var(--gold); background:#f6f8fc; }
  #kim .tabs button i { font-style:normal; display:inline-block; min-width:18px; padding:0 4px; border-radius:9px; background:var(--bad); color:#fff; font-size:.85em; margin-left:2px; }
  #kim .card { background:var(--card); border-radius:16px; padding:14px; margin-bottom:12px; box-shadow:0 1px 3px rgba(11,42,91,.12); }
  #kim h2 { font-size:1.12em; margin:0 0 10px; color:var(--navy); display:flex; align-items:center; gap:8px; }
  #kim h2 .chip { margin-left:auto; }
  #kim h3 { font-size:.95em; margin:14px 0 8px; color:var(--mut); text-transform:uppercase; letter-spacing:.03em; }
  #kim label.l { display:block; font-weight:600; font-size:.88em; margin:12px 0 6px; color:var(--mut); }
  #kim .mut { color:var(--mut); font-size:.85em; }
  #kim .row { display:flex; gap:8px; align-items:center; }
  #kim .grow { flex:1; min-width:0; }
  #kim .btn { display:flex; align-items:center; justify-content:center; gap:8px; width:100%; min-height:56px; padding:10px 14px; border-radius:14px;
    background:var(--navy); color:#fff; font-weight:700; text-align:center; margin-top:10px; }
  #kim .btn:active { transform:scale(.98); filter:brightness(1.1); }
  #kim .btn.big { min-height:68px; font-size:1.1em; }
  #kim .btn.gold { background:var(--gold); color:var(--navy); }
  #kim .btn.ok { background:var(--ok); }
  #kim .btn.bad { background:var(--bad); }
  #kim .btn.lite { background:#e4eaf5; color:var(--navy); }
  #kim .btn.out { background:#fff; color:var(--navy); border:2px solid var(--line); }
  #kim .btn.col { flex-direction:column; gap:2px; }
  #kim .btn.sm { min-height:44px; width:auto; margin:0; padding:6px 14px; font-size:.9em; }
  #kim .btn[disabled] { opacity:.45; pointer-events:none; }
  #kim .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
  #kim .grid2 .btn { margin-top:0; }
  #kim .item { display:flex; align-items:center; gap:12px; width:100%; text-align:left; background:#fff; border-radius:14px; padding:14px; margin-bottom:10px;
    box-shadow:0 1px 3px rgba(11,42,91,.12); min-height:64px; }
  #kim .item:active { background:#f4f7fc; }
  #kim .item .arr { color:var(--mut); font-size:1.3em; flex:none; }
  #kim .ttl { font-weight:700; }
  #kim .chip { display:inline-block; padding:2px 10px; border-radius:20px; font-size:.75em; font-weight:700; background:#e4eaf5; color:var(--navy); white-space:nowrap; }
  #kim .chip.ok { background:var(--okbg); color:var(--ok); } #kim .chip.bad { background:var(--badbg); color:var(--bad); } #kim .chip.warn { background:var(--warnbg); color:var(--warn); }
  #kim .seg { display:flex; background:#e4eaf5; border-radius:12px; padding:3px; gap:3px; }
  #kim .seg button { flex:1; min-height:44px; border-radius:10px; font-weight:700; font-size:.85em; color:var(--navy); padding:4px 6px; }
  #kim .seg button.on { background:var(--navy); color:#fff; box-shadow:0 1px 3px rgba(0,0,0,.25); }
  #kim .seg.v button.on.za { background:var(--ok); } #kim .seg.v button.on.pr { background:var(--bad); } #kim .seg.v button.on.vz { background:#7a5b00; }
  #kim .search { position:sticky; top:-12px; z-index:2; background:var(--bg); padding:0 0 10px; margin-top:-2px; }
  #kim .q { display:flex; align-items:center; gap:14px; }
  #kim .q .big { font-size:2.2em; font-weight:800; line-height:1; }
  #kim .bar { height:12px; background:#e4eaf5; border-radius:8px; overflow:hidden; position:relative; margin-top:10px; }
  #kim .bar i { position:absolute; left:0; top:0; bottom:0; background:var(--ok); border-radius:8px; }
  #kim .bar u { position:absolute; top:-4px; bottom:-4px; width:3px; background:var(--navy); }
  #kim .unit { background:#fff; border-radius:14px; margin-bottom:10px; box-shadow:0 1px 3px rgba(11,42,91,.12); border:2px solid transparent; display:flex; align-items:stretch; }
  #kim .unit.on { border-color:var(--ok); background:#f6fcf8; }
  #kim .unit .tk { padding:12px 4px 12px 12px; display:flex; align-items:center; }
  #kim .unit .ubody { flex:1; min-width:0; text-align:left; padding:12px 12px 12px 8px; display:flex; align-items:center; gap:10px; }
  #kim .unit .sigt { height:38px; max-width:96px; object-fit:contain; flex:none; }
  #kim .tick { width:44px; height:44px; border-radius:50%; border:3px solid #b9c6dc; flex:none; display:flex; align-items:center; justify-content:center; font-size:1.3em; color:#fff; font-weight:800; }
  #kim .unit.on .tick { background:var(--ok); border-color:var(--ok); }
  #kim .need { border-color:var(--bad) !important; background:var(--badbg) !important; }
  #kim .vrow { padding:10px 0; border-top:1px solid var(--line); }
  #kim .vrow:first-child { border-top:0; }
  #kim .vrow .who { font-weight:600; margin-bottom:6px; }
  #kim .res { display:flex; gap:8px; text-align:center; }
  #kim .res > div { flex:1; border-radius:12px; padding:8px 4px; background:#f1f4fa; }
  #kim .res b { display:block; font-size:1.25em; }
  #kim .res .za b { color:var(--ok); } #kim .res .pr b { color:var(--bad); } #kim .res .vz b { color:#7a5b00; }
  #kim .num { width:44px; height:44px; border-radius:50%; background:var(--navy); color:#fff; display:flex; align-items:center; justify-content:center; font-weight:800; flex:none; }
  #kim .num.ok { background:var(--ok); }
  #kim .iss { padding:8px 0; border-top:1px solid var(--line); font-size:.9em; }
  #kim .iss:first-child { border-top:0; }
  #kim .iss.w { color:#5c4300; }
  #kim .note { background:var(--warnbg); color:#5c4300; border-radius:12px; padding:10px 12px; font-size:.88em; margin-top:10px; }
  #kim .okbox { background:var(--okbg); color:#0b5a31; border-radius:12px; padding:12px; font-weight:600; }
  #kim .chips { display:flex; flex-wrap:wrap; gap:8px; }
  #kim .chips button { border:2px solid var(--line); background:#fff; border-radius:24px; padding:8px 12px; font-size:.85em; font-weight:600; min-height:44px; text-align:left; }
  #kim .chips button.on { border-color:var(--navy); background:var(--navy); color:#fff; }
  #kim .chips button small { display:block; font-weight:400; opacity:.75; font-size:.85em; }
  #kim .padw { position:relative; border:1.5px solid #cfdcf0; border-radius:18px; background:#fff; margin-top:8px; touch-action:none; overflow:hidden;
    box-shadow:inset 0 2px 8px rgba(13,45,107,.06), 0 4px 14px rgba(13,45,107,.06); transition:border-color .2s, box-shadow .2s; }
  #kim .padw.ink { border-color:#2e9e45; box-shadow:inset 0 2px 8px rgba(13,45,107,.04), 0 0 0 3px rgba(46,158,69,.14); }
  #kim .padw canvas { display:block; width:100%; height:210px; touch-action:none; }
  #kim .padw .ph { position:absolute; left:0; right:0; bottom:60px; text-align:center; color:#b4c2d9; pointer-events:none; font-weight:600; font-size:1.05em; }
  #kim .padw .ph[hidden] { display:none; }
  #kim .padw .ln { position:absolute; left:22px; right:22px; bottom:46px; border-bottom:2px solid #dbe4f2; pointer-events:none; }
  #kim .padw .ln::before { content:'✕'; position:absolute; left:0; bottom:4px; color:#b4c2d9; font-size:1.1em; font-weight:700; }
  #kim .padw .pclr { position:absolute; right:8px; top:8px; min-height:38px; padding:4px 12px; border-radius:20px; background:rgba(232,241,255,.95); color:var(--navy); font-weight:700; font-size:.8em; border:0; }
  #kim .padw .pclr[hidden] { display:none; }
  #kim [data-pad=done] { margin-top:10px; animation:kimpop .3s var(--ease, ease-out) both; }
  #kim .sigok .grow { color:#0b5a31; font-weight:700; }
  #kim .sigok { display:flex; align-items:center; gap:10px; background:var(--okbg); border-radius:12px; padding:8px 12px; margin-top:8px; }
  #kim .sigok img { height:48px; max-width:60%; object-fit:contain; }
  #kim .photo { width:100%; max-height:220px; object-fit:contain; border-radius:10px; margin-top:8px; background:#f1f4fa; }
  #kim .toast { position:fixed; left:12px; right:12px; top:calc(env(safe-area-inset-top) + 72px); z-index:9; background:#0d1626; color:#fff; padding:14px 16px;
    border-radius:14px; font-weight:600; box-shadow:0 6px 20px rgba(0,0,0,.35); transition:opacity .25s, transform .25s; }
  #kim .toast.err { background:var(--bad); }
  #kim .toast.hide { opacity:0; transform:translateY(-20px); pointer-events:none; }
  #kim .busy { position:fixed; inset:0; z-index:8; background:rgba(11,42,91,.25); display:flex; align-items:center; justify-content:center; }
  #kim .busy div { background:#fff; border-radius:16px; padding:18px 22px; font-weight:700; color:var(--navy); box-shadow:0 6px 20px rgba(0,0,0,.3); display:flex; gap:12px; align-items:center; max-width:86vw; }
  #kim .spin { width:26px; height:26px; border:4px solid #d6dfee; border-top-color:var(--navy); border-radius:50%; animation:kimspin .8s linear infinite; flex:none; }
  @keyframes kimspin { to { transform:rotate(360deg); } }
  #kim .menu { position:fixed; inset:0; z-index:7; background:rgba(5,15,35,.5); display:flex; flex-direction:column; justify-content:flex-end; }
  #kim .menu .sheet { background:#f6f8fc; border-radius:20px 20px 0 0; padding:14px 14px calc(14px + env(safe-area-inset-bottom)); max-height:94vh; overflow:auto; }
  #kim .menu .sheet > h2 { margin-bottom:4px; }
  #kim .login { max-width:460px; margin:8vh auto 0; }
  #kim .logo { text-align:center; color:var(--navy); margin-bottom:18px; }
  #kim .logo b { display:block; font-size:1.6em; } #kim .logo span { color:var(--mut); }
  #kim .empty { text-align:center; color:var(--mut); padding:30px 10px; }
  #kim .stick { position:sticky; bottom:-28px; background:linear-gradient(transparent, var(--bg) 30%); padding:14px 0 6px; margin:0 -2px; }
  #kim .steps { display:flex; gap:6px; margin-bottom:12px; }
  #kim .steps span { flex:1; height:6px; border-radius:4px; background:#d6dfee; }
  #kim .steps span.on { background:var(--ok); }
  `;
  const brandCss = `  /* ===== Вид „Капитал Инвест“ – като рекламата ===== */
  #kim { --navy:#0b2d6b; --navy2:#1553c7; --blue:#1a6fe0; --sky:#e8f1ff; --gold:#e9a922; --green:#2e9e45; --purple:#7046c2;
    --bg:#f3f7fd; --ink:#0c1a36; --mut:#5a6b88; --line:#d8e3f3; --ok:#2e9e45; --okbg:#e6f6ea;
    font-family:"Montserrat","Segoe UI",Roboto,Arial,sans-serif;
    background:linear-gradient(180deg,#e6f0fe 0%,#f5f9ff 220px,#f3f7fd 100%); }
  #kim .top { background:linear-gradient(100deg,#09265c 0%,#0f3a88 55%,#1757cc 100%); border-bottom:3px solid #3b8bff; }
  #kim .top .t1 { font-weight:800; letter-spacing:.01em; }
  #kim .top .t2 { color:#a8ccff; opacity:1; }
  #kim .top.pt { align-items:flex-start; padding-bottom:10px; }
  #kim .top.pt .tt { display:flex; flex-direction:column-reverse; padding-top:4px; }
  #kim .top.pt .t2 { font-size:.66em; text-transform:uppercase; letter-spacing:.09em; font-weight:700; margin-bottom:3px; }
  #kim .top.pt .t1 { white-space:normal; font-size:.9em; line-height:1.22; font-weight:700; display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:5; overflow:hidden; }
  #kim .top .lgw { height:36px; width:auto; margin:0 4px 0 6px; flex:none; }
  #kim .main { background:transparent; }
  #kim .card { border-radius:18px; border:1px solid #e2eaf6; box-shadow:0 6px 18px rgba(13,45,107,.07), 0 1px 2px rgba(13,45,107,.05); }
  #kim h2 { color:var(--navy); font-weight:800; }
  #kim h3 { color:var(--navy2); letter-spacing:.09em; font-weight:700; }
  #kim label.l { color:#3d5079; }
  #kim input, #kim select, #kim textarea { border-color:#d3e0f3; border-radius:14px; }
  #kim .btn { background:linear-gradient(135deg,#1f78ea,#0c45b3); box-shadow:0 6px 14px rgba(21,83,199,.25); border-radius:16px; letter-spacing:.01em; }
  #kim .btn.ok { background:linear-gradient(135deg,#43bb59,#21863a); box-shadow:0 6px 14px rgba(46,158,69,.25); }
  #kim .btn.gold { background:linear-gradient(135deg,#f6c64a,#e19b12); color:#2a1c00; box-shadow:0 6px 14px rgba(225,155,18,.25); }
  #kim .btn.bad { background:linear-gradient(135deg,#ea5249,#b8231b); box-shadow:0 6px 14px rgba(198,40,40,.25); }
  #kim .btn.lite { background:#e8f1ff; color:var(--navy); box-shadow:none; }
  #kim .btn.out { background:#fff; color:var(--navy); border:2px solid #d3e1f5; box-shadow:none; }
  #kim .item { border:1px solid #e2eaf6; border-left:6px solid var(--blue); box-shadow:0 4px 14px rgba(13,45,107,.06); border-radius:16px; }
  #kim .item .ttl { color:var(--navy); }
  #kim .search input { border-radius:30px; padding-left:18px; box-shadow:0 4px 14px rgba(13,45,107,.06); }
  #kim .seg { background:#e8f1ff; }
  #kim .seg button.on { background:linear-gradient(135deg,#1f78ea,#0c45b3); }
  #kim .num { background:linear-gradient(135deg,#1f78ea,#0c45b3); }
  #kim .num.ok, #kim .unit.on .tick { background:linear-gradient(135deg,#43bb59,#21863a); border-color:#2e9e45; }
  #kim .chips button.on { background:var(--navy2); border-color:var(--navy2); }
  #kim .tabs { background:#fff; border-top:0; box-shadow:0 -6px 18px rgba(13,45,107,.08); }
  #kim .tabs button { border-top:0; color:#4d5f80; }
  #kim .tabs button b { width:42px; height:42px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:1.25em; background:#eef3fb; margin-bottom:2px; transition:transform .15s; }
  #kim .tabs button.on { background:none; color:var(--navy); }
  #kim .tabs button.on b { transform:scale(1.08); box-shadow:0 4px 10px rgba(13,45,107,.25); }
  #kim .tabs button:nth-child(1).on b { background:linear-gradient(135deg,#2f86ef,#1253c4); }
  #kim .tabs button:nth-child(2).on b { background:linear-gradient(135deg,#5cbf4f,#2a8a35); }
  #kim .tabs button:nth-child(3).on b { background:linear-gradient(135deg,#f3c34a,#d99212); }
  #kim .tabs button:nth-child(4).on b { background:linear-gradient(135deg,#8b5ad8,#5b31a8); }
  /* лого, надписи, снимка */
  #kim .wm { font-weight:800; font-size:1.45em; letter-spacing:.01em; color:var(--navy); line-height:1.05; white-space:nowrap; }
  #kim .wm span { color:var(--blue); }
  #kim .wsub { display:inline-block; margin-top:6px; padding-top:5px; border-top:2px solid var(--blue); font-size:.56em; letter-spacing:.2em; color:#24395f; font-weight:600; }
  #kim .script { font-family:"Caveat","Segoe Script",cursive; color:var(--blue); font-size:1.55em; line-height:1; font-weight:600; }
  #kim .hero { position:relative; overflow:hidden; border-radius:22px; margin-bottom:14px; background:#fff var(--hero) right center / cover no-repeat;
    box-shadow:0 8px 24px rgba(13,45,107,.12); border:1px solid #e2eaf6; }
  #kim .hero::before { content:''; position:absolute; inset:0; background:linear-gradient(90deg,rgba(255,255,255,.98) 0%,rgba(255,255,255,.95) 55%,rgba(255,255,255,.4) 82%,rgba(255,255,255,0) 100%); }
  #kim .hero .in { position:relative; display:flex; align-items:center; gap:12px; padding:16px; }
  #kim .hero .lg { height:72px; width:auto; flex:none; }
  #kim .hero .band { position:relative; background:linear-gradient(100deg,#09265c,#1553c7); color:#fff; padding:10px 16px; display:flex; flex-wrap:wrap; gap:4px 14px; font-size:.78em; font-weight:600; }
  #kim .ticks span { display:inline-flex; align-items:center; gap:6px; }
  #kim .ticks span::before { content:'✓'; width:20px; height:20px; border-radius:50%; background:#3b8bff; color:#fff; display:inline-flex; align-items:center; justify-content:center; font-size:.8em; font-weight:800; }
  #kim .icons4 { display:grid; grid-template-columns:repeat(4,1fr); gap:6px; text-align:center; margin:16px 0 6px; }
  #kim .icons4 i { width:56px; height:56px; margin:0 auto 6px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:1.6em; font-style:normal; box-shadow:0 6px 14px rgba(13,45,107,.18); }
  #kim .icons4 div { font-size:.62em; font-weight:800; color:var(--navy); letter-spacing:.02em; text-transform:uppercase; line-height:1.15; }
  #kim .i1 { background:linear-gradient(135deg,#2f86ef,#1253c4); } #kim .i2 { background:linear-gradient(135deg,#5cbf4f,#2a8a35); }
  #kim .i3 { background:linear-gradient(135deg,#f3c34a,#d99212); } #kim .i4 { background:linear-gradient(135deg,#8b5ad8,#5b31a8); }
  #kim .login { margin-top:2vh; }
  #kim .login .hero .in { flex-direction:column; align-items:flex-start; padding:20px 18px 16px; }
  #kim .login .hero .lg { height:96px; }
  /* AI редакция */
  #kim .aibar { display:grid; grid-template-columns:1fr 1.25fr 1fr; gap:6px; margin-top:6px; }
  #kim .aibar button { min-height:44px; padding:4px 6px; border-radius:14px; background:#f2ecfd; color:#5a33a8; font-weight:700; font-size:.72em; line-height:1.15; border:1px solid #e1d5fa; text-align:center; }
  #kim .aibar button[disabled] { opacity:.4; }
  #kim .aibar button:active { background:#e4d8fb; }
  /* Запис */
  #kim .top .recb { display:flex; align-items:center; gap:6px; height:42px; padding:0 12px; border-radius:22px; background:rgba(255,255,255,.14); color:#fff; font-weight:700; font-size:.85em; flex:none; font-variant-numeric:tabular-nums; }
  #kim .top .recb.on { background:#e2453c; animation:kimpulse 1.4s infinite; }
  #kim .top .recb.pz { background:#d99212; }
  @keyframes kimpulse { 50% { box-shadow:0 0 0 6px rgba(226,69,60,.3); } }
  #kim .recbig { width:124px; height:124px; border-radius:50%; margin:14px auto 6px; display:flex; align-items:center; justify-content:center; font-size:3em; color:#fff;
    background:linear-gradient(135deg,#f0625a,#c62828); box-shadow:0 10px 26px rgba(198,40,40,.35); }
  #kim .recbig:active { transform:scale(.96); }
  #kim .rectime { text-align:center; font-size:2.4em; font-weight:800; color:var(--navy); font-variant-numeric:tabular-nums; margin-top:6px; }
  #kim .recrow { display:flex; align-items:center; gap:8px; padding:10px 0; border-top:1px solid var(--line); }
  #kim .recrow .btn { margin:0; }
  #kim.desk .hero .lg { height:84px; }

  /* ===== iPhone стил: стъкло, пружини, плавни движения ===== */
  #kim { --ease:cubic-bezier(.16,1,.3,1); --spring:cubic-bezier(.34,1.56,.64,1); }
  #kim::before { content:''; position:absolute; inset:0; pointer-events:none; z-index:0;
    background:radial-gradient(45% 32% at 8% 12%, rgba(59,139,255,.24), transparent 70%), radial-gradient(38% 30% at 96% 34%, rgba(139,90,216,.17), transparent 70%),
      radial-gradient(42% 30% at 25% 96%, rgba(243,195,74,.17), transparent 70%), radial-gradient(36% 26% at 92% 88%, rgba(92,191,79,.15), transparent 70%); }
  #kim .main { position:relative; z-index:1; padding-top:calc(var(--toph,64px) + 12px); padding-bottom:calc(var(--tabh,0px) + var(--dockh,0px) + 28px); }
  #kim .top { position:absolute; top:0; left:0; right:0; z-index:5; background:linear-gradient(100deg,rgba(8,34,86,.93),rgba(16,66,170,.88));
    -webkit-backdrop-filter:blur(22px) saturate(180%); backdrop-filter:blur(22px) saturate(180%); border-bottom:1px solid rgba(120,175,255,.55); box-shadow:0 8px 24px rgba(9,38,92,.16); }
  #kim .tabs { position:absolute; left:0; right:0; bottom:0; z-index:5; background:rgba(255,255,255,.7);
    -webkit-backdrop-filter:blur(22px) saturate(180%); backdrop-filter:blur(22px) saturate(180%); border-top:1px solid rgba(255,255,255,.75); }
  #kim .tabs[hidden], #kim.kbd .tabs { display:none; }
  #kim.wide.kbd .tabs { display:flex; }
  #kim.tablet .padw canvas { height:300px; }
  #kim.tablet .menu .sheet { width:min(760px, 94vw); }
  #kim.tablet:not(.wide) .tabs button { font-size:14px; }
  /* прозорец с подпис: без прозрачност и замъгляване – иначе писането по екрана изостава */
  #kim .menu.haspad { background:rgba(5,15,35,.5); }
  #kim .menu .sheet.haspad { -webkit-backdrop-filter:none; backdrop-filter:none; background:#f5f8fe; }
  #kim .menu .sheet.haspad .card { background:#fff; }
  #kim .padw canvas { will-change:contents; }
  /* подписване: на цял екран, жълто и голямо поле */
  #kim .menu.haspad { align-items:stretch; justify-content:stretch; padding:0; }
  #kim .menu .sheet.haspad { width:100% !important; max-width:none !important; height:100% !important; max-height:none !important; border-radius:0 !important; border:0;
    margin:0 !important; padding:calc(18px + env(safe-area-inset-top, 0px)) clamp(14px, 4vw, 44px) 28px; overflow-y:auto; animation:kimfull .3s var(--ease, ease-out) both !important; }
  #kim .menu .sheet.haspad::before { display:none; }
  @keyframes kimfull { from { opacity:0; transform:translateY(24px); } }
  #kim .menu .sheet.haspad .padw { background:#fff6b8; border:2.5px solid #e9b400; box-shadow:inset 0 2px 10px rgba(160,120,0,.12), 0 6px 18px rgba(233,180,0,.22); }
  #kim .menu .sheet.haspad .padw.ink { border-color:#2e9e45; box-shadow:inset 0 2px 10px rgba(160,120,0,.1), 0 0 0 4px rgba(46,158,69,.18); }
  #kim .menu .sheet.haspad .padw canvas { height:150px !important; }
  #kim .padw:not(.full) { cursor:pointer; }
  #kim .padw .pfh, #kim .padw .pff { display:none; }
  /* екранът за подписване: точно колкото екрана, нищо не се мести и не се плъзга */
  #kim .menu > .padw.full { background:#fff6b8; position:fixed; left:0; top:0; right:0; bottom:0; width:100vw; height:100vh; height:100dvh; z-index:80; margin:0; border:0; border-radius:0; box-shadow:none;
    display:flex; flex-direction:column; padding:env(safe-area-inset-top, 0px) 0 env(safe-area-inset-bottom, 0px); box-sizing:border-box; touch-action:none; overscroll-behavior:none;
    -webkit-user-select:none; user-select:none; animation:kimpf .2s ease-out both; }
  @keyframes kimpf { from { opacity:0; } }
  #kim .padw.full .pfh { display:flex; align-items:center; gap:12px; flex:none; padding:10px 12px 10px 18px; background:#0b2a5b; color:#fff; }
  #kim .padw.full .pfh .grow { min-width:0; flex:1; }
  #kim .padw.full .pfh b { display:block; font-size:1.05em; }
  #kim .padw.full .pfh span { display:block; opacity:.82; font-size:.82em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  #kim .padw.full .pfx { flex:none; width:50px; height:50px; border-radius:50%; border:0; background:rgba(255,255,255,.16); color:#fff; font-size:1.2em; font-weight:700; }
  #kim .menu > .padw.full canvas { flex:1 1 0; min-height:0; height:0 !important; width:100%; }
  #kim .padw.full .pff { display:flex; gap:12px; flex:none; align-items:stretch; padding:10px 14px 12px; background:#fff; border-top:2.5px solid #e9b400; }
  #kim .padw.full .pff .btn { margin:0; }
  #kim .padw.full .pff [data-pf=clear] { flex:0 0 auto; width:auto; padding:0 20px; }
  #kim .padw.full .pff [data-pf=done] { flex:1 1 auto; width:auto; }
  #kim .menu > .padw.full .pclr { display:none; }
  #kim .menu > .padw.full .ln::before { color:#b88a00; font-size:1.4em; }
  #kim .menu > .padw.full .ln { border-bottom-color:#c99a00; bottom:calc(96px + 20%); left:6%; right:6%; }
  #kim .menu > .padw.full .ph { color:#a98200; bottom:calc(118px + 20%); font-size:1.5em; }
  #kim .menu .sheet.haspad .padw .ln { border-bottom-color:#c99a00; bottom:22%; }
  #kim .menu .sheet.haspad .padw .ln::before { color:#b88a00; font-size:1.4em; }
  #kim .menu .sheet.haspad .padw .ph { color:#a98200; font-size:1.3em; bottom:calc(22% + 18px); }
  #kim .menu .sheet.haspad .padw .pclr { background:#fff; box-shadow:0 2px 8px rgba(0,0,0,.12); }
  #kim .sigok .dyn { display:block; font-weight:500; color:#3d6a52; font-size:.8em; margin-top:2px; }
  /* вход: докато се пише, остава само картата с полетата и бутонът „Вход“ се вижда */
  #kim.kbd .login .hero, #kim.kbd .login .icons4 { display:none; }
  #kim.kbd .login { margin-top:0; display:block; max-width:680px; }
  #kim .errbox { margin-top:12px; padding:12px 14px; border-radius:14px; background:#fdecea; color:#a32018; font-weight:600; }
  #kim.desk.wide .login .card { order:-1; }
  /* долните раздели не растат с буквите – да се събират и 5-те на тесен телефон */
  #kim:not(.wide) .tabs button { flex:1 1 0; min-width:0; font-size:11px; letter-spacing:-.01em; line-height:1.15; padding-left:2px; padding-right:2px; overflow:hidden; }
  #kim:not(.wide) .tabs button b { font-size:20px; }
  #kim .dock { position:absolute; left:0; right:0; bottom:var(--tabh,0px); z-index:4; display:flex; gap:8px; padding:8px 12px;
    background:rgba(250,252,255,.96); -webkit-backdrop-filter:blur(22px) saturate(180%); backdrop-filter:blur(22px) saturate(180%);
    border-top:1px solid rgba(13,45,107,.1); box-shadow:0 -6px 18px rgba(13,45,107,.07); }
  #kim .dock[hidden], #kim.kbd .dock { display:none; }
  #kim .dock .btn { margin:0; min-height:54px; width:auto; }
  #kim .dock .grow { flex:1; }
  #kim .dock .sq { flex:none; width:60px; font-size:1.5em; padding:0; }
  #kim.desk.wide.side .dock { left:var(--sidew); padding:10px 40px 10px 32px; }
  #kim.desk.wide .dock .btn { max-width:420px; }
  #kim.desk.wide .dock { justify-content:center; }
  #kim.kbd .stick { position:static; }
  #kim .main { scroll-padding-top:calc(var(--toph,64px) + 10px); scroll-padding-bottom:calc(var(--tabh,0px) + var(--dockh,0px) + 16px); }
  #kim .navrow { margin-top:4px; }
  #kim .search { top:calc(var(--toph,64px) - 2px); background:transparent; padding-top:6px; }
  #kim .search input { background:rgba(255,255,255,.82); -webkit-backdrop-filter:blur(16px); backdrop-filter:blur(16px); }
  #kim .stick { bottom:calc(var(--tabh,0px) - 28px); background:linear-gradient(rgba(243,247,253,0), rgba(243,247,253,.92) 35%); }
  #kim .card, #kim .item, #kim .unit { background:rgba(255,255,255,.86); }
  #kim .unit.on { background:rgba(240,251,244,.92); }
  #kim .toast { background:rgba(13,26,54,.84); -webkit-backdrop-filter:blur(20px); backdrop-filter:blur(20px); border-radius:18px; transition:opacity .3s, transform .45s var(--spring); }
  /* натискане: потъва до 95% и пружинира обратно */
  #kim .btn, #kim .item, #kim .seg button, #kim .chips button, #kim .aibar button, #kim .tabs button b, #kim .recbig, #kim .top .ib, #kim .recb, #kim .unit .ubody, #kim .tick {
    transition:transform .5s var(--spring), filter .2s, background-color .2s, box-shadow .25s; }
  #kim .btn:active, #kim .seg button:active, #kim .chips button:active, #kim .aibar button:active, #kim .recbig:active, #kim .top .ib:active, #kim .recb:active, #kim .tick:active {
    transform:scale(.95); transition-duration:.08s; }
  #kim .item:active, #kim .unit .ubody:active { transform:scale(.97); transition-duration:.08s; }
  #kim .tabs button:active b { transform:scale(.86); transition-duration:.08s; }
  /* прозорците отдолу: прозрачни, плъзгат се нагоре, затварят се с плъзгане надолу */
  #kim .menu { background:rgba(5,15,35,.34); animation:kimfade .3s ease-out both; }
  #kim .menu .sheet { position:relative; background:rgba(247,249,254,.8); -webkit-backdrop-filter:blur(30px) saturate(180%); backdrop-filter:blur(30px) saturate(180%);
    border-radius:28px 28px 0 0; border:1px solid rgba(255,255,255,.7); box-shadow:0 -12px 40px rgba(9,38,92,.25); padding-top:24px; animation:kimsheet .35s var(--ease) both; }
  #kim .menu .sheet::before { content:''; position:absolute; top:9px; left:50%; width:42px; height:5px; margin-left:-21px; border-radius:3px; background:rgba(13,45,107,.25); }
  #kim .menu .sheet.drag { animation:none; transition:none; }
  #kim .menu.out { animation:kimfadeout .26s ease-in both; pointer-events:none; }
  #kim .menu.out .sheet { animation:kimsheetout .26s cubic-bezier(.4,0,1,1) both; }
  #kim .menu .card { background:rgba(255,255,255,.75); }
  @keyframes kimsheet { from { transform:translateY(100%); } to { transform:none; } }
  @keyframes kimsheetout { to { transform:translateY(100%); } }
  @keyframes kimfade { from { background:rgba(5,15,35,0); } }
  @keyframes kimfadeout { to { background:rgba(5,15,35,0); } }
  #kim.desk .menu .sheet { border-radius:26px; animation:kimpop .35s var(--ease) both; }
  #kim.desk .menu.out .sheet { animation:kimpopout .22s ease-in both; }
  @keyframes kimpop { from { opacity:0; transform:translateY(22px) scale(.96); } }
  @keyframes kimpopout { to { opacity:0; transform:scale(.96); } }
  /* екраните влизат плавно – бързо в началото, после забавя (ease-out 350 ms) */
  #kim .main.enter > * { animation:kimin .35s var(--ease) both; }
  #kim .main.enter.back > * { animation-name:kiminb; }
  #kim .main.enter > *:nth-child(2) { animation-delay:.03s; } #kim .main.enter > *:nth-child(3) { animation-delay:.06s; }
  #kim .main.enter > *:nth-child(4) { animation-delay:.09s; } #kim .main.enter > *:nth-child(5) { animation-delay:.12s; }
  #kim .main.enter > *:nth-child(n+6) { animation-delay:.15s; }
  @keyframes kimin { from { opacity:0; transform:translateX(24px); } }
  @keyframes kiminb { from { opacity:0; transform:translateX(-24px); } }
  #kim details > *:not(summary) { animation:kimdown .35s var(--ease) both; }
  @keyframes kimdown { from { opacity:0; transform:translateY(-8px); } }
  /* въртящи се цифри */
  #kim .roll { display:inline-flex; overflow:hidden; height:1.15em; line-height:1.15em; vertical-align:bottom; }
  #kim .roll .col { display:flex; flex-direction:column; transition:transform .6s cubic-bezier(.2,.9,.25,1.12); }
  #kim .roll .col i { display:block; height:1.15em; font-style:normal; }
  /* дръпни надолу за обновяване */
  #kim .ptr { position:absolute; left:50%; top:calc(var(--toph,64px) + 6px); z-index:4; width:42px; height:42px; margin-left:-21px; border-radius:50%;
    background:rgba(255,255,255,.9); -webkit-backdrop-filter:blur(12px); backdrop-filter:blur(12px); box-shadow:0 6px 16px rgba(13,45,107,.22);
    display:flex; align-items:center; justify-content:center; opacity:0; pointer-events:none; }
  #kim .ptr svg { width:22px; height:22px; }
  #kim .ptr.spin svg { animation:kimspin .8s linear infinite; }
  #kim .ptr.back, #kim .main.ptr-back { transition:transform .45s var(--spring), opacity .3s; }
  /* плъзгане за подредба */
  #kim #k-bl .item.shift { transition:transform .25s var(--ease); }
  #kim #k-bl .item.lift { position:relative; z-index:3; transition:box-shadow .2s; box-shadow:0 20px 44px rgba(13,45,107,.3); }
  #kim .hint { color:var(--mut); font-size:.78em; margin:-2px 4px 10px; }
  /* успех: първо се рисува кръгът, после отметката */
  #kim .okfx { position:fixed; inset:0; z-index:10; display:flex; align-items:center; justify-content:center; pointer-events:none; }
  #kim .okfx > div { background:rgba(255,255,255,.84); -webkit-backdrop-filter:blur(26px) saturate(180%); backdrop-filter:blur(26px) saturate(180%);
    border-radius:30px; padding:22px 26px 18px; min-width:190px; max-width:82vw; text-align:center; box-shadow:0 22px 54px rgba(9,38,92,.28);
    color:var(--navy); font-weight:700; animation:kimpop .35s var(--ease) both; }
  #kim .okfx.out > div { animation:kimpopout .25s ease-in both; }
  #kim .okfx svg { width:76px; height:76px; display:block; margin:0 auto 10px; }
  #kim .okfx .c { fill:none; stroke:#2e9e45; stroke-width:5; stroke-linecap:round; stroke-dasharray:164; stroke-dashoffset:164; transform:rotate(-90deg); transform-origin:50% 50%; animation:kimdraw .45s var(--ease) .05s forwards; }
  #kim .okfx .t { fill:none; stroke:#2e9e45; stroke-width:6; stroke-linecap:round; stroke-linejoin:round; stroke-dasharray:40; stroke-dashoffset:40; animation:kimdraw .28s ease-out .45s forwards; }
  @keyframes kimdraw { to { stroke-dashoffset:0; } }
  /* обновяване */
  #kim .updp .bar i { transition:width .3s var(--ease); background:linear-gradient(90deg,#1f78ea,#43bb59); }
  /* 🎤 Говори */
  #kim .aibar .dict { grid-column:1 / -1; min-height:50px; font-size:.9em; background:linear-gradient(135deg,#1f78ea,#0c45b3); color:#fff; border:0; box-shadow:0 6px 14px rgba(21,83,199,.25); }
  #kim .aibar .dict.on { background:linear-gradient(135deg,#f0625a,#c62828); animation:kimpulse 1.4s infinite; }
  #kim .dlive { grid-column:1 / -1; min-height:1.3em; padding:6px 10px; border-radius:12px; background:rgba(31,120,234,.08); color:#1553c7; font-size:.85em; font-style:italic; }
  #kim .dlive:empty { display:none; }
  /* 🎙️ Запис – 5-ти бутон в долната лента */
  #kim .tabs button.rt b { background:linear-gradient(135deg,#f0625a,#c62828); color:#fff; }
  #kim .tabs button.rt.on b { animation:kimpulse 1.4s infinite; }
  #kim .tabs button.rt.on { color:#c62828; font-variant-numeric:tabular-nums; }

  /* ===== Компютър (Windows): меню отляво, съдържание в колони ===== */
  #kim.desk.wide { --sidew:264px; }
  #kim.desk.wide .top { padding-left:18px; padding-right:18px; min-height:68px; }
  #kim.desk.wide .top .lgw { height:40px; }
  #kim.desk.wide .main { padding-left:40px; padding-right:40px; }
  #kim.desk.wide.side .main { padding-left:calc(var(--sidew) + 32px); }
  #kim.desk.wide .tabs { top:var(--toph,68px); bottom:0; left:0; right:auto; width:var(--sidew); flex-direction:column; justify-content:flex-start; gap:6px;
    padding:18px 14px; border-top:0; border-right:1px solid rgba(13,45,107,.08); background:rgba(255,255,255,.68); box-shadow:8px 0 26px rgba(13,45,107,.06); }
  #kim.desk.wide .tabs button { flex:none; flex-direction:row; justify-content:flex-start; align-items:center; gap:14px; min-height:60px; padding:8px 12px;
    border-radius:16px; font-size:.95em; text-align:left; color:#3d5079; }
  #kim.desk.wide .tabs button b { margin:0; flex:none; }
  #kim.desk.wide .tabs button:hover { background:rgba(31,120,234,.07); }
  #kim.desk.wide .tabs button.on { background:rgba(31,120,234,.12); color:var(--navy); }
  #kim .tabs .sbrand { display:none; }
  #kim.desk.wide .tabs .sbrand { display:flex; align-items:center; gap:10px; padding:2px 8px 16px; margin-bottom:6px; border-bottom:1px solid rgba(13,45,107,.08); }
  #kim.desk.wide .tabs .sbrand img { height:46px; width:auto; }
  #kim.desk.wide .tabs .sbrand .wm { font-size:1.02em; }
  #kim.desk.wide .tabs .sbrand .wsub { font-size:.48em; letter-spacing:.14em; }
  /* колони според екрана */
  #kim.desk.wide .main > * { min-width:0; }
  #kim.desk.wide .main[data-r=p], #kim.desk.wide .main[data-r=pts], #kim.desk.wide .main[data-r=ppl], #kim.desk.wide .main[data-r=end], #kim.desk.wide .main[data-r=b] {
    display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); column-gap:18px; align-content:start; align-items:start; }
  #kim.desk.wide .main[data-r=p] > :not(.card):not(.item), #kim.desk.wide .main[data-r=pts] > :not(.card):not(.item),
  #kim.desk.wide .main[data-r=ppl] > :not(.card):not(.item), #kim.desk.wide .main[data-r=end] > :not(.card):not(.item),
  #kim.desk.wide .main[data-r=b] > :not(.card):not(.item), #kim.desk.wide .main[data-r=p] > .card:first-child { grid-column:1 / -1; }
  #kim.desk.wide #k-ul { display:grid; grid-template-columns:repeat(auto-fill, minmax(340px, 1fr)); gap:12px; }
  #kim.desk.wide #k-ul .unit { margin:0; }
  #kim.desk.wide #k-ul .empty { grid-column:1 / -1; }
  #kim.desk.wide .main[data-r=list] #k-bl { display:grid; grid-template-columns:repeat(auto-fill, minmax(340px, 1fr)); gap:14px; }
  #kim.desk.wide .main[data-r=list] #k-bl .item { margin:0; }
  #kim.desk.wide .main[data-r=list] .hint { display:none; }
  #kim.desk.wide .main[data-r=list] .search { max-width:680px; }
  #kim.desk.wide .stick { position:static; background:none; display:flex; gap:12px; align-items:stretch; padding:6px 0 0; margin:0; }
  #kim.desk.wide .stick > .btn { flex:1.3; margin:0 !important; }
  #kim.desk.wide .stick > .grid2 { flex:2; margin:0 !important; }
  #kim.desk.wide .hero .in { padding:24px 30px; gap:22px; }
  #kim.desk.wide .hero .lg { height:104px; }
  #kim.desk.wide .hero .wm { font-size:2.1em; }
  #kim.desk.wide .login { max-width:1040px; margin:3vh auto 0; display:grid; grid-template-columns:1fr 1fr; gap:22px; align-items:center; }
  #kim.desk.wide .login .hero { grid-column:1 / -1; margin:0; }
  #kim.desk.wide .login .icons4 { margin:0; gap:14px; }
  #kim.desk.wide .login .card { margin:0; }
  #kim.desk .item:hover { transform:translateY(-2px); box-shadow:0 12px 28px rgba(13,45,107,.14); }
  #kim.desk .btn:hover, #kim.desk .aibar button:hover { filter:brightness(1.07); }
  #kim.desk .unit:hover { box-shadow:0 8px 22px rgba(13,45,107,.14); }
  @media (prefers-reduced-motion: reduce) { #kim *, #kim *::before, #kim *::after { animation-duration:.01ms !important; animation-delay:0s !important; transition-duration:.01ms !important; } }
  `;
  const deskCss = `
  #kim.desk .top { padding-left:max(8px, calc(50% - 500px)); padding-right:max(8px, calc(50% - 500px)); }
  #kim.desk .main { padding-left:max(12px, calc(50% - 490px)); padding-right:max(12px, calc(50% - 490px)); }
  #kim.desk .tabs { padding-left:max(0px, calc(50% - 500px)); padding-right:max(0px, calc(50% - 500px)); }
  #kim.desk .menu { align-items:center; justify-content:center; }
  #kim.desk .menu .sheet { width:min(680px, 96vw); border-radius:20px; max-height:92vh; }
  #kim.desk .toast { left:50%; right:auto; width:min(640px, 92vw); transform:translateX(-50%); }
  #kim.desk .toast.hide { transform:translate(-50%, -20px); }
  #kim.desk .padw canvas { height:240px; }
  #kim.desk .item:hover, #kim.desk .unit:hover { box-shadow:0 2px 10px rgba(11,42,91,.22); }`;
  const st = document.createElement('style'); st.id = 'kim-css'; st.textContent = css + brandCss + deskCss; document.head.appendChild(st);
  document.documentElement.classList.add('kim-on');
  if (!document.getElementById('kim-fonts')) {
    const fl = document.createElement('link'); fl.id = 'kim-fonts'; fl.rel = 'stylesheet';
    fl.href = 'https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700;800&family=Caveat:wght@600&display=swap';
    document.head.appendChild(fl);
  }
  const BR = window.KI_BRAND || {};

  const root = document.createElement('div'); root.id = 'kim';
  if (BR.hero) root.style.setProperty('--hero', `url(${BR.hero})`);
  // Таблет: широк екран – подреждаме като на компютър
  const TABLET = !DESK && Math.min((window.screen && window.screen.width) || 0, (window.screen && window.screen.height) || 0) >= 600;
  if (DESK || TABLET) root.classList.add('desk');
  if (TABLET) root.classList.add('tablet');
  root.innerHTML = `<div class="top"></div><div class="main"></div><div class="dock" hidden></div><div class="tabs" hidden></div><div class="toast hide"></div>`;
  document.body.appendChild(root);
  const $top = root.querySelector('.top'), $main = root.querySelector('.main'), $tabs = root.querySelector('.tabs'), $toast = root.querySelector('.toast'), $dock = root.querySelector('.dock');
  const setDock = h => { $dock.innerHTML = h || ''; $dock.hidden = !h; if (typeof setBars === 'function') try { setBars(); } catch (e) {} };
  const FS_DEF = DESK ? 21 : 22;
  const setFs = v => { v = Math.max(15, Math.min(30, v)); LS.set('fs2', v); root.style.setProperty('--fs', v + 'px'); return v; };
  setFs(LS.get('fs2', FS_DEF));

  let toastT;
  function toast(msg, err) {
    if (!err && /^✓|✓$/.test(String(msg).trim())) { success(String(msg).replace(/^✓\s*|\s*✓$/g, '')); return; }
    $toast.textContent = msg; $toast.classList.toggle('err', !!err); $toast.classList.remove('hide');
    clearTimeout(toastT); toastT = setTimeout(() => $toast.classList.add('hide'), err ? 5000 : 2400);
  }
  function busy(on, msg) {
    let b = root.querySelector('.busy');
    if (!on) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('div'); b.className = 'busy'; root.appendChild(b); }
    b.innerHTML = `<div><span class="spin"></span><span>${esc(msg || 'Момент…')}</span></div>`;
  }
  const busyOn = () => !!root.querySelector('.busy');
  const busyText = msg => { const b = root.querySelector('.busy span:last-child'); if (b) b.textContent = msg; };
  // Изпълнява действие с индикатор и показва грешката разбираемо
  async function run(msg, fn) {
    busy(true, msg);
    try { return await fn(); }
    catch (e) { if (e instanceof AuthErr) { go('#/login'); } else toast(e.message || String(e), true); return undefined; }
    finally { busy(false); }
  }

  /* ---------- Данни ---------- */
  const D = { user: null, buildings: null, b: {}, m: {}, chair: {}, sec: {}, det: {}, fees: {} };
  async function loadBuildings(force) { if (!D.buildings || force) { const r = await api('/api/buildings'); D.buildings = r.buildings || r; } return D.buildings; }
  async function loadBuilding(id, force) { if (!D.b[id] || force) D.b[id] = await api('/api/buildings/' + id); return D.b[id]; }
  async function loadMeeting(id, force) {
    if (!D.m[id] || force) D.m[id] = await api('/api/meetings/' + id);
    syncState(D.m[id].meeting.building_id, id);
    return D.m[id];
  }
  async function loadChair(id, force) { if (!D.chair[id] || force) D.chair[id] = await api(`/api/meetings/${id}/chair-details`).catch(() => ({ details: null, votes: [] })); return D.chair[id]; }
  async function loadSec(id, force) { if (!D.sec[id] || force) D.sec[id] = await api(`/api/meetings/${id}/secretary-candidates`).catch(() => ({ candidates: [], votes: [] })); return D.sec[id]; }
  const itemFor = (d, kind) => { const no = (KIND_NO[d.meeting.meeting_type] || {})[kind]; return no ? (d.agenda || []).find(a => num(a.item_no) === no) : null; };
  const getDet = async (itemId, kind) => { const r = await api(`/api/agenda/${itemId}/${EP[kind]}`).catch(() => null); return r && (r.details || (r.people && r.people.length)) ? { details: r.details || {}, people: r.people || [] } : null; };
  /* ---------- Такси: общи или разделени режийни (както в Програма за протокол) ---------- */
  const DEF_FEES = [['elevator_maintenance', 'Поддръжка асансьор', 'object'], ['elevator_electricity', 'Ток асансьор', 'person'], ['staircase_electricity', 'Ток стълбище', 'person'],
    ['water', 'Вода', 'person'], ['cleaning', 'Хигиена', 'object'], ['common_room', 'Общо помещение', 'common_room']];
  const BASIS = [['object', 'на обект'], ['person', 'на човек'], ['floor', 'на човек / по етажи'], ['common_room', 'на ползвано общо помещение']];
  async function loadFees(itemId) {
    const det = await api(`/api/agenda/${itemId}/fee-decision-details`).catch(() => null);
    const of = await api(`/api/agenda/${itemId}/operating-fees`).catch(() => null);
    const items = (of && of.items) || [], rules = {};
    for (const i of items) if (i.basis === 'floor') {
      const r = await api(`/api/agenda/${itemId}/fee-rules/${encodeURIComponent(i.fee_key)}`).catch(() => null);
      if (r) rules[i.fee_key] = { default_percent: r.setting && r.setting.default_percent != null ? num(r.setting.default_percent) : 100, items: (r.items || []).map(x => ({ rule_type: 'floor', floor_no: num(x.floor_no), percent: num(x.percent) })) };
    }
    const cr = await api(`/api/agenda/${itemId}/fee-rules/operating_common`).catch(() => null);
    const common = cr && cr.setting ? { rule_mode: cr.setting.rule_mode || 'all', default_percent: cr.setting.default_percent != null ? num(cr.setting.default_percent) : 100,
      items: (cr.items || []).map(x => x.rule_type === 'object' ? { rule_type: 'object', unit_id: num(x.unit_id), percent: num(x.percent) } : { rule_type: 'floor', floor_no: num(x.floor_no), percent: num(x.percent) }) } : null;
    return { details: (det && det.details) || null, items, rules, common };
  }
  // Стандартните такси + каквото има записано
  function mergeFees(items) {
    const out = DEF_FEES.map(([k, n, b], i) => { const f = (items || []).find(x => x.fee_key === k); return f ? { ...f } : { fee_key: k, fee_name: n, is_standard: 1, amount: 0, basis: b, is_active: k === 'common_room' ? 0 : 1, sort_order: i + 1 }; });
    (items || []).forEach(x => { if (!out.some(o => o.fee_key === x.fee_key)) out.push({ ...x }); });
    return out;
  }
  async function saveFees(itemId, f) {
    await post(`/api/agenda/${itemId}/fee-decision-details`, f.details);
    if (f.details.operating_mode === 'separate' && f.items && f.items.length) {
      await post(`/api/agenda/${itemId}/operating-fees`, { items: f.items.map(i => ({ fee_key: i.fee_key, fee_name: i.fee_name, is_standard: num(i.is_standard) ? 1 : 0, amount: num(i.amount), basis: i.basis || 'object', is_active: num(i.is_active == null ? 1 : i.is_active) ? 1 : 0 })) });
      for (const i of f.items) if (i.basis === 'floor' && f.rules && f.rules[i.fee_key])
        await post(`/api/agenda/${itemId}/fee-rules/${encodeURIComponent(i.fee_key)}`, { rule_mode: 'floor', default_percent: f.rules[i.fee_key].default_percent, items: f.rules[i.fee_key].items });
    }
    if (f.details.operating_mode === 'common' && f.common && f.common.rule_mode !== 'all') await post(`/api/agenda/${itemId}/fee-rules/operating_common`, f.common);
  }
  const floorsOf = d => { const fl = (d.units || []).map(u => num(u.floor)); return Math.max(1, num((d.building || {}).floors), ...fl); };

  async function loadDet(mid, force) {
    if (D.det[mid] && !force) return D.det[mid];
    const d = await loadMeeting(mid), out = {};
    await Promise.all(Object.keys(KIND_NO[d.meeting.meeting_type] || {}).map(async k => { const it = itemFor(d, k); if (it) out[k] = await getDet(it.id, k); }));
    return (D.det[mid] = out);
  }

  const scopeUnits = d => {
    const m = d.meeting || {};
    let u = d.units || [];
    if (m.scope_type === 'entrance' && m.scope_entrance) u = u.filter(x => String(x.entrance || '') === String(m.scope_entrance));
    return [...u].sort((a, b) => (num(a.floor) - num(b.floor)) || (parseInt(a.unit_no, 10) || 0) - (parseInt(b.unit_no, 10) || 0) || String(a.unit_no).localeCompare(String(b.unit_no)));
  };
  const quorumOf = d => (d.attendance || []).reduce((s, a) => s + num(a.ideal_parts), 0);
  // чл. 15 ЗУЕС: 51% / след 1 час 26% / следващия ден – без минимум; ако един собственик има над 51% – нужни са 75%
  function quorumNeed(d) {
    const mode = d.meeting.quorum_mode || 'initial';
    const byOwner = {};
    scopeUnits(d).forEach(u => { const k = norm(u.owner_name); if (k) byOwner[k] = (byOwner[k] || 0) + num(u.ideal_parts); });
    const big = Object.values(byOwner).some(v => v > 51);
    const base = (QUORUM.find(x => x[0] === mode) || QUORUM[0])[2];
    return { need: big && base ? 75 : base, big, mode };
  }
  const unitLabel = u => `${u.type && u.type !== 'апартамент' ? u.type : 'Ап.'} ${u.unit_no}${u.entrance ? ' · вх. ' + u.entrance : ''}`;
  const proxyCount = (d, name, exceptUnit) => (d.attendance || []).filter(a => a.status === 'Пълномощник' && norm(a.person_name) === norm(name) && num(a.unit_id) !== num(exceptUnit)).length;

  function issuesOf(d, sec, sigs, det) {
    const out = [], warn = [], m = d.meeting, agenda = d.agenda || [], att = d.attendance || [], votes = d.votes || [];
    const q = quorumOf(d), qn = quorumNeed(d);
    const hasQ = qn.need ? q >= qn.need : q > 0;
    if (!String(m.meeting_date || '').trim()) out.push(['Няма дата на събранието', 'full']);
    if (!String(m.meeting_time || '').trim()) out.push(['Няма час на събранието', 'full']);
    if (!String(m.place || '').trim()) out.push(['Няма място на събранието', 'full']);
    if (!att.length) out.push(['Няма отбелязани присъстващи', 'att']);
    att.forEach(a => { if (!String(a.person_name || '').trim()) out.push([`Липсва име на присъстващ за ${a.represents || 'обект'}`, 'att']); });
    if (!hasQ) out.push([`Кворумът е ${pct(q)} – нужни са ${qn.need}%${qn.big ? ' (един собственик има над 51%)' : ''}`, 'end']);
    // чл. 14: един пълномощник – най-много трима собственици; копие от писменото пълномощно се прилага към протокола
    const px = {};
    att.filter(a => a.status === 'Пълномощник').forEach(a => { const k = norm(a.person_name); px[k] = (px[k] || 0) + 1; });
    Object.entries(px).forEach(([k, n]) => { if (k && n > 3) out.push([`Пълномощникът „${att.find(a => norm(a.person_name) === k).person_name}“ представлява ${n} обекта – по закон най-много 3`, 'att']); });
    if (sigs) att.filter(a => a.status === 'Пълномощник' && a.proxy_auth_type !== 'oral' && !sigs['px' + a.unit_id]).forEach(a => warn.push([`Няма снимка на писменото пълномощно за ${a.represents}`, 'att']));
    if (!agenda.length) out.push(['Няма точки в дневния ред', 'pts']);
    if (det) {
      const T = m.meeting_type;
      const need = { control: 'контрольор', authorization: 'упълномощен за договора', termination: 'досегашния управител', revision: 'комисия за ревизия', fee: 'таксите', appointment: 'управителя', cashier: 'касиера' };
      Object.keys(KIND_NO[T] || {}).forEach(k => { if (!det[k]) out.push([`Не е попълнено: ${need[k]}`, 'ppl']); });
    }
    agenda.forEach(a => {
      const generic = m.meeting_type === 'regular' || num(a.item_no) > fixedLimit(m.meeting_type) || (m.meeting_type === 'renewal' && num(a.item_no) === 1);
      if (generic && !String(a.proposal || '').trim()) out.push([`Точка ${a.item_no}: няма предложение/решение`, 'p' + a.id]);
      const miss = att.filter(p => !votes.some(v => num(v.agenda_item_id) === num(a.id) && num(v.attendance_id) === num(p.id) && String(v.vote || '').trim())).length;
      if (miss) out.push([`Точка ${a.item_no}: не са гласували ${miss}`, 'p' + a.id]);
      if (num(a.is_completed) !== 1) out.push([`Точка ${a.item_no}: не е приключена`, 'p' + a.id]);
    });
    if (!(sec && (sec.candidates || []).some(c => num(c.is_selected) === 1))) out.push(['Няма избран протоколчик', 'chair']);
    if (!isClosed(m)) out.push(['Събранието не е закрито (час на закриване)', 'end']);
    if (sigs) {
      const unsigned = att.filter(a => !sigs['u' + a.unit_id]).length;
      if (unsigned) warn.push([`${unsigned} присъстващи не са се подписали`, 'att']);
      if (!sigs.chair) warn.push(['Председателят не е подписал протокола', 'sign']);
      if (!sigs.sec) warn.push(['Протоколчикът не е подписал протокола', 'sign']);
    }
    return { out, warn };
  }

  /* ---------- Рамка: горна лента, табове, маршрути ---------- */
  let ptTitle = '';
  function top(title, sub, back, extra) {
    $top.classList.remove('pt');
    $top.innerHTML = `${back ? `<button class="ib" data-go="${esc(back)}" aria-label="Назад">←</button>` : BR.logoW ? `<img class="lgw" src="${BR.logoW}" alt="">` : '<span style="width:8px"></span>'}
      <div class="tt"><div class="t1">${esc(title)}</div>${sub ? `<div class="t2">${esc(sub)}</div>` : ''}</div>
      ${extra || ''}${recBtn()}<button class="ib" data-act="menu" aria-label="Меню">⋮</button>`;
  }
  function tabs(mid, cur) {
    if (!mid) { $tabs.hidden = true; $tabs.innerHTML = ''; return; }
    if (cur === 'chair') cur = 'ppl';
    const T = [['att', '👥', 'Присъстващи'], ['ppl', '🧑‍💼', 'Хора и такси'], ['pts', '🗳️', 'Гласуване'], ['end', '✍️', 'Подписи и край']];
    $tabs.hidden = false;
    $tabs.innerHTML = (DESK ? `<div class="sbrand">${BR.logo ? `<img src="${BR.logo}" alt="">` : ''}${wordmark('ПРОТОКОЛИ')}</div>` : '') + T.map(([k, i, l]) => `<button class="${cur === k ? 'on' : ''}" data-go="#/m/${mid}/${k}"><b>${i}</b>${l}</button>`).join('') + recTab();
  }
  let lastDepth = 0, enterT = null;
  const html = (h, keepScroll) => {
    const prev = keepScroll ? rollSnap() : null;
    if (dictT && window.KIAndroid && window.KIAndroid.dictStop) { window.KIAndroid.dictStop(); dictT = null; }
    setDock('');
    const hp = (location.hash || '#/').replace(/^#\/?/, '').split('/').filter(Boolean);
    $main.dataset.r = !hp.length ? 'list' : hp[0] === 'b' ? (hp[2] === 'new' ? 'new' : 'b') : hp[0] === 'm' ? (hp[2] === 'p' ? 'p' : (hp[2] || 'att')) : hp[0];
    const y = $main.scrollTop; $main.innerHTML = h; decorateAi($main); $main.scrollTop = keepScroll ? y : 0;
    setBars();
    if (prev) rollApply(prev);
    if (!keepScroll) {
      const dpt = (location.hash || '#/').split('/').filter(Boolean).length;
      $main.classList.remove('enter', 'back'); void $main.offsetWidth;
      $main.classList.add('enter'); if (dpt < lastDepth) $main.classList.add('back');
      lastDepth = dpt; clearTimeout(enterT); enterT = setTimeout(() => $main.classList.remove('enter', 'back'), 750);
    }
  };

  // Камерата на компютъра: жива картина и бутон „Снимай“. Връща снимката, null при отказ, undefined ако няма камера.
  async function camShot() {
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false }); }
    catch (e) { return undefined; }
    return new Promise(res => {
      const m = sheet(`<h2>📷 Снимка на пълномощното</h2>
        <video autoplay playsinline muted style="width:100%;max-height:58vh;border-radius:16px;background:#000;display:block"></video>
        <button class="btn big ok" data-x="shot">📸 Снимай</button><button class="btn out" data-x="no">Отказ</button>`);
      const v = m.querySelector('video'); v.srcObject = stream;
      let done = false;
      const stop = () => stream.getTracks().forEach(t => t.stop());
      const rm = m.remove; m.remove = () => { if (!done) { done = true; stop(); res(null); } rm(); };
      m.querySelector('[data-x=no]').onclick = () => m.remove();
      m.querySelector('[data-x=shot]').onclick = () => {
        if (!v.videoWidth) { toast('Камерата още зарежда…', true); return; }
        const sc = Math.min(1, 1600 / Math.max(v.videoWidth, v.videoHeight));
        const c = document.createElement('canvas'); c.width = Math.round(v.videoWidth * sc); c.height = Math.round(v.videoHeight * sc);
        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
        done = true; stop(); res(c.toDataURL('image/jpeg', 0.88)); rm();
      };
    });
  }

  // Прозорец за въвеждане на текст (вместо prompt(), който не работи в програмата за компютър)
  function askText(title, label, placeholder, value) {
    return new Promise(res => {
      let done = false;
      const m = sheet(`<h2>${esc(title)}</h2><label class="l">${esc(label)}</label>
        <textarea class="k-ask" style="min-height:110px" placeholder="${esc(placeholder || '')}">${esc(value || '')}</textarea>
        <button class="btn big ok" data-x="ok">✓ Добави</button><button class="btn out" data-x="no">Отказ</button>`);
      const t = m.querySelector('.k-ask');
      const fin = v => { if (done) return; done = true; res(v); m.remove(); };
      const rm = m.remove; m.remove = () => { if (!done) { done = true; res(null); } rm(); };
      m.querySelector('[data-x=ok]').onclick = () => { const v = t.value.trim(); if (!v) { toast('Напишете заглавие', true); t.focus(); return; } fin(v); };
      m.querySelector('[data-x=no]').onclick = () => fin(null);
      t.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || !e.shiftKey) && DESK) { e.preventDefault(); m.querySelector('[data-x=ok]').click(); } });
      setTimeout(() => t.focus(), 380);
    });
  }

  /* ---------- ✨ Редакция на текста (същата като в пълната версия на програмата) ---------- */
  const AI_MODES = [['edit', '✨ Редактирай'], ['professional', '🧾 Професионално'], ['short', '✂️ Кратко и ясно']];
  function decorateAi(box) {
    if (!box) return;
    box.querySelectorAll('textarea').forEach(t => {
      if (t.dataset.noai || (t.nextElementSibling && t.nextElementSibling.classList.contains('aibar'))) return;
      const bar = document.createElement('div'); bar.className = 'aibar';
      bar.innerHTML = (DICT ? `<button type="button" class="dict" data-act="dict" ${t.disabled ? 'disabled' : ''}>🎤 Говори – текстът се изписва сам</button><div class="dlive"></div>` : '')
        + AI_MODES.map(([m, l]) => `<button type="button" data-act="ai" data-mode="${m}" ${t.disabled ? 'disabled' : ''}>${l}</button>`).join('');
      t.after(bar);
    });
  }
  function aiContext(t) {
    const ptT = /\/p\//.test(location.hash) ? ptTitle : '';
    if (t.dataset.f === 'discussion') return 'Обсъждане по точка от дневния ред' + (ptT ? ': ' + ptT : '');
    if (t.dataset.f === 'proposal') return 'Предложение за решение по точка от дневния ред' + (ptT ? ': ' + ptT : '');
    let lab = t.previousElementSibling;
    while (lab && lab.tagName !== 'LABEL') lab = lab.previousElementSibling;
    const l = lab ? lab.textContent.replace(/\(.*?\)/g, '').trim() : 'Текст в протокол от общо събрание';
    return l + ' – протокол от общо събрание на етажна собственост';
  }
  async function aiRewrite(el) {
    const t = el.parentElement && el.parentElement.previousElementSibling;
    if (!t || t.tagName !== 'TEXTAREA') return;
    const old = t.value, text = old.trim();
    if (!text) { toast('Първо напиши текст, после натисни бутона', true); return; }
    const mode = el.dataset.mode;
    const r = await run('Редактирам текста…', () => post('/api/ai/rewrite', { text, context: aiContext(t), mode }));
    if (!r) return;
    const out = String(r.text || '').trim();
    if (!out) { toast('Не се получи текст – опитай пак', true); return; }
    const title = mode === 'professional' ? 'Професионален вариант' : mode === 'short' ? 'Кратък и ясен вариант' : 'Редактиран текст';
    const m = sheet(`<div class="row"><h2 class="grow" style="margin:0">✨ ${title}</h2><button class="btn lite sm" data-act="closeMenu">✕</button></div>
      <div class="mut" style="margin-top:6px">Прегледай и поправи, ако трябва. Старият текст се сменя само с „Сложи този текст“.</div>
      <textarea data-noai="1" class="k-air" style="min-height:220px;margin-top:10px">${esc(out)}</textarea>
      <button class="btn big ok" data-x="use">✓ Сложи този текст</button>
      <div class="grid2"><button class="btn lite" data-x="add">＋ Добави след стария</button><button class="btn out" data-x="no">Отказ</button></div>
      <details style="margin-top:12px"><summary class="mut">Стар текст</summary><div class="mut" style="white-space:pre-wrap;margin-top:6px">${esc(old)}</div></details>`);
    const put = v => { t.value = v; t.dispatchEvent(new Event('input', { bubbles: true })); t.dispatchEvent(new Event('change', { bubbles: true })); m.remove(); toast('Текстът е сменен ✓'); };
    m.querySelector('[data-x=use]').onclick = () => put(m.querySelector('.k-air').value.trim());
    m.querySelector('[data-x=add]').onclick = () => put(old.replace(/\s+$/, '') + '\n' + m.querySelector('.k-air').value.trim());
    m.querySelector('[data-x=no]').onclick = () => m.remove();
  }

  /* ---------- ✨ Плавност: ленти, вибрация, успех, въртящи се цифри ---------- */
  let dragging = null, suppressClick = false;
  const WIDE = () => (DESK || TABLET) && window.innerWidth >= 900;
  function setBars() {
    const w = WIDE();
    root.classList.toggle('wide', w); root.classList.toggle('side', w && !$tabs.hidden);
    root.style.setProperty('--toph', $top.offsetHeight + 'px');
    const k = root.classList.contains('kbd');
    root.style.setProperty('--tabh', (w || $tabs.hidden || k ? 0 : $tabs.offsetHeight) + 'px');
    root.style.setProperty('--dockh', ($dock.hidden || k ? 0 : $dock.offsetHeight) + 'px');
  }
  // Клавиатурата: телефонът казва колко е висока (KIM_kbd). Докато е отворена, долните ленти се скриват,
  // а ако покрива страницата, страницата се вдига точно над нея – полето за писане остава видимо.
  let fullH = window.innerHeight, fullW = window.innerWidth, nativeKb = null;
  const typing = () => { const a = document.activeElement; return !!(a && root.contains(a) && /^(TEXTAREA|INPUT|SELECT)$/.test(a.tagName) && !/^(checkbox|radio|button|file)$/.test(a.type || '')); };
  function kbdCheck() {
    if (window.innerWidth !== fullW) { fullW = window.innerWidth; fullH = window.innerHeight; }
    if (!typing() && !(nativeKb > 60)) fullH = Math.max(fullH, window.innerHeight);
    const shrunk = Math.max(0, fullH - window.innerHeight);
    const open = nativeKb != null ? nativeKb > 60 : (typing() && window.innerHeight < fullH * 0.8);
    const cover = nativeKb > 60 ? Math.max(0, nativeKb - shrunk) : 0;   // клавиатурата е върху страницата
    root.style.bottom = cover > 24 ? cover + 'px' : '';
    const was = root.classList.contains('kbd');
    if (was !== open) { root.classList.toggle('kbd', open); setBars(); }
    if (open && typing()) { const a = document.activeElement; setTimeout(() => { try { a.scrollIntoView({ block: 'nearest' }); } catch (e) {} }, was ? 0 : 120); }
  }
  window.KIM_kbd = h => { nativeKb = +h || 0; kbdCheck(); };
  window.addEventListener('resize', kbdCheck);
  root.addEventListener('focusin', () => setTimeout(kbdCheck, 350));
  root.addEventListener('focusout', () => setTimeout(kbdCheck, 150));
  if (window.ResizeObserver) { const ro = new ResizeObserver(setBars); ro.observe($top); ro.observe($tabs); }
  window.addEventListener('resize', setBars);
  const haptic = ms => { try { if (navigator.vibrate) navigator.vibrate(ms || 8); } catch (e) {} };
  root.addEventListener('pointerdown', e => { if (e.pointerType === 'touch' && e.target.closest('.btn, .seg button, .tabs button, .recbig, .tick, .aibar button')) haptic(6); }, { passive: true });
  root.addEventListener('click', e => { if (suppressClick) { suppressClick = false; e.stopPropagation(); e.preventDefault(); } }, true);

  function success(msg) {
    const old = root.querySelector('.okfx'); if (old) old.remove();
    const o = document.createElement('div'); o.className = 'okfx';
    o.innerHTML = `<div><svg viewBox="0 0 64 64"><circle class="c" cx="32" cy="32" r="26"/><path class="t" d="M20 33 l8 8 l16 -17"/></svg>${esc(msg || 'Готово')}</div>`;
    root.appendChild(o); setTimeout(() => haptic(14), 450);
    setTimeout(() => o.classList.add('out'), 1350); setTimeout(() => o.remove(), 1620);
  }

  // Числата се завъртат до новата стойност – цифра по цифра
  const ROLL_SEL = '.q .big, .res b, [data-roll]';
  function rollSnap() { return { h: location.hash, v: [...$main.querySelectorAll(ROLL_SEL)].map(e => e.textContent) }; }
  function rollApply(p) {
    if (!p || p.h !== location.hash) return;
    [...$main.querySelectorAll(ROLL_SEL)].forEach((el, i) => { const o = p.v[i]; if (o != null && o !== el.textContent && /\d/.test(el.textContent)) rollTo(el, o, el.textContent); });
  }
  function rollTo(el, from, to) {
    const f = from.length >= to.length ? from.slice(from.length - to.length) : from.padStart(to.length, ' ');
    const wrap = document.createElement('span'); wrap.className = 'roll'; wrap.setAttribute('aria-label', to);
    const cols = [];
    [...to].forEach((ch, i) => {
      if (!/\d/.test(ch)) { const t = document.createElement('span'); t.textContent = ch; wrap.appendChild(t); return; }
      const od = /\d/.test(f[i]) ? +f[i] : 0;
      const c = document.createElement('span'); c.className = 'col';
      c.innerHTML = '<i>0</i><i>1</i><i>2</i><i>3</i><i>4</i><i>5</i><i>6</i><i>7</i><i>8</i><i>9</i>';
      c.style.transform = `translateY(${-od * 1.15}em)`;
      wrap.appendChild(c); cols.push([c, +ch, od]);
    });
    el.textContent = ''; el.appendChild(wrap);
    let k = 0;
    requestAnimationFrame(() => requestAnimationFrame(() => cols.forEach(([c, d, od]) => { if (d !== od) { c.style.transitionDelay = (k++ * 70) + 'ms'; } c.style.transform = `translateY(${-d * 1.15}em)`; })));
    setTimeout(() => { if (wrap.isConnected) el.textContent = to; }, 750 + k * 70 + cols.length * 70);
  }

  // Дръпни надолу за обновяване: пръстът минава целия път, списъкът – само 35%
  (function pullToRefresh() {
    const ind = document.createElement('div'); ind.className = 'ptr';
    ind.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#1553c7" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/></svg>';
    root.appendChild(ind);
    let y0 = null, dy = 0, working = false;
    const reset = () => {
      $main.classList.add('ptr-back'); ind.classList.add('back');
      $main.style.transform = ''; ind.style.opacity = 0; ind.style.transform = '';
      setTimeout(() => { $main.classList.remove('ptr-back'); ind.classList.remove('back'); }, 470);
    };
    $main.addEventListener('touchstart', e => {
      y0 = working || dragging || $main.scrollTop > 0 || e.touches.length !== 1 || e.target.closest('.padw, textarea, input, select') ? null : e.touches[0].clientY; dy = 0;
    }, { passive: true });
    $main.addEventListener('touchmove', e => {
      if (y0 == null || dragging) return;
      dy = e.touches[0].clientY - y0;
      if (dy <= 0 || $main.scrollTop > 0) { if (dy < -4) y0 = null; $main.style.transform = ''; ind.style.opacity = 0; return; }
      if (e.cancelable) e.preventDefault();
      const pull = dy * 0.35, k = Math.min(1, pull / 64);
      $main.style.transform = `translateY(${pull}px)`;
      ind.style.opacity = k; ind.style.transform = `translateY(${pull - 24}px) rotate(${pull * 5}deg) scale(${0.6 + 0.4 * k})`;
      if (pull >= 64 && !ind.dataset.armed) { ind.dataset.armed = 1; haptic(10); } else if (pull < 64) delete ind.dataset.armed;
    }, { passive: false });
    $main.addEventListener('touchend', async () => {
      if (y0 == null) return; y0 = null; delete ind.dataset.armed;
      if (dy * 0.35 < 64) { reset(); return; }
      working = true; $main.classList.add('ptr-back'); ind.classList.add('back', 'spin');
      $main.style.transform = 'translateY(58px)'; ind.style.opacity = 1; ind.style.transform = 'translateY(34px)';
      try {
        D.buildings = null; D.all = null; D.b = {}; D.m = {}; D.chair = {}; D.sec = {}; D.det = {}; D.fees = {};
        await render(true); success('Обновено');
      } finally { working = false; ind.classList.remove('spin'); reset(); }
    });
  })();

  // Задръж и плъзни за подредба на входовете: редът се повдига с 5%, другите се отместват
  (function dragReorder() {
    let timer = null, start = null;
    $main.addEventListener('pointerdown', e => {
      const it = e.target.closest('#k-bl .item');
      if (!it || WIDE() || SS.get('q', '') || (e.button && e.button > 0)) return;
      start = { x: e.clientX, y: e.clientY, it, id: e.pointerId };
      clearTimeout(timer); timer = setTimeout(lift, 380);
    });
    $main.addEventListener('pointermove', e => {
      if (!start) return;
      if (!dragging) { if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) { clearTimeout(timer); start = null; } return; }
      e.preventDefault(); move(e.clientY);
    });
    const end = () => { clearTimeout(timer); if (dragging) drop(); start = null; };
    $main.addEventListener('pointerup', end);
    $main.addEventListener('pointercancel', end);
    $main.addEventListener('touchmove', e => { if (dragging && e.cancelable) e.preventDefault(); }, { passive: false });
    $main.addEventListener('contextmenu', e => { if (dragging || start) e.preventDefault(); });
    function lift() {
      if (!start) return;
      const list = [...$main.querySelectorAll('#k-bl .item')], i = list.indexOf(start.it);
      if (i < 0 || list.length < 2) return;
      const h = list[1].getBoundingClientRect().top - list[0].getBoundingClientRect().top;
      dragging = { list, i, to: i, y0: start.y, h, it: start.it };
      try { start.it.setPointerCapture(start.id); } catch (e) {}
      list.forEach(x => { if (x !== start.it) x.classList.add('shift'); });
      start.it.classList.add('lift'); start.it.style.transition = 'transform .2s cubic-bezier(.34,1.56,.64,1), box-shadow .2s'; start.it.style.transform = 'scale(1.05)';
      setTimeout(() => { if (dragging) dragging.it.style.transition = 'box-shadow .2s'; }, 200);
      haptic(14);
    }
    function move(y) {
      const d = dragging, dy = y - d.y0;
      d.it.style.transform = `translateY(${dy}px) scale(1.05)`;
      const to = Math.max(0, Math.min(d.list.length - 1, d.i + Math.round(dy / d.h)));
      if (to !== d.to) { d.to = to; haptic(5); }
      d.list.forEach((x, k) => {
        if (x === d.it) return;
        let sft = 0;
        if (d.i < to && k > d.i && k <= to) sft = -d.h;
        if (d.i > to && k < d.i && k >= to) sft = d.h;
        x.style.transform = sft ? `translateY(${sft}px)` : '';
      });
    }
    function drop() {
      const d = dragging; dragging = null;
      suppressClick = true; setTimeout(() => { suppressClick = false; }, 450);
      d.it.style.transition = 'transform .3s cubic-bezier(.16,1,.3,1), box-shadow .3s';
      d.it.style.transform = `translateY(${(d.to - d.i) * d.h}px)`; d.it.classList.remove('lift');
      const ids = d.list.map(x => +x.dataset.id); const [moved] = ids.splice(d.i, 1); ids.splice(d.to, 0, moved);
      if (d.to !== d.i) { LS.set('border', ids); toast('Подредбата е запазена'); }
      setTimeout(() => {
        const l = root.querySelector('#k-bl');
        if (l && D.buildings) l.innerHTML = bList(D.buildings.filter(b => !b.status || b.status === 'Активна'), '');
      }, 310);
    }
  })();

  // 🔄 Докато е отворено събрание: на всеки 6 сек се проверява за подписи от другите устройства
  let syncRender = false, syncTick = 0;
  setInterval(async () => {
    const mid = curMid();
    if (!mid || !D.user || document.hidden) return;
    try {
      syncTick++;
      const got = await syncSigs(mid);
      if (got) syncRender = true;
      if ((got || contactsPending.size || syncTick % 3 === 0) && await syncContacts()) syncRender = true;
      if (syncRender && !root.querySelector('.menu') && !typing() && !busyOn()) { syncRender = false; await render(true); toast('🔄 Нови подписи от друго устройство'); }
    } catch (e) {}
  }, 6000);

  /* ---------- 🚀 Обновяване: проверява за нова версия и се обновява само ---------- */
  const UPD_REPO = 'capitalinvest70-ux/ki-protokol';
  async function myVer() {
    try {
      if (window.KIAndroid && window.KIAndroid.appVersion) { const v = JSON.parse(window.KIAndroid.appVersion()); return { name: v.name, build: +v.code }; }
      if (window.KIDesktop && window.KIDesktop.appVersion) return await window.KIDesktop.appVersion();
    } catch (e) {}
    return null;
  }
  const canUpdate = () => !!(window.KIAndroid ? window.KIAndroid.update : window.KIDesktop && window.KIDesktop.update);
  let updHooked = false;
  async function checkUpdate(manual) {
    const me = await myVer();
    if (!me || !canUpdate()) { if (manual) toast('Обновяването работи в приложението за телефон и компютър', true); return; }
    let rel;
    try {
      // през приложението (страницата на програмата не позволява връзки към GitHub)
      const nat = window.KIAndroid && window.KIAndroid.latestRelease ? window.KIAndroid.latestRelease()
        : window.KIDesktop && window.KIDesktop.latestRelease ? await window.KIDesktop.latestRelease() : null;
      if (nat == null) throw new Error('Тази версия не може да проверява сама – свалете последната веднъж ръчно от GitHub');
      if (/^ERR/.test(nat)) throw new Error(/404/.test(nat) ? 'Не виждам новите версии – хранилището ki-protokol трябва да е публично' : 'Няма връзка с GitHub (' + nat.replace(/^ERR\s*/, '') + ')');
      rel = JSON.parse(nat);
    } catch (e) { if (manual) toast(e.message || 'Няма връзка с интернет', true); return; }
    LS.set('updAt', Date.now());
    const b = +((String(rel.tag_name || '').match(/build(\d+)/) || [])[1] || 0);
    const asset = (rel.assets || []).find(a => window.KIAndroid ? /\.apk$/i.test(a.name) : /\.exe$/i.test(a.name));
    if (!asset || b <= me.build) { if (manual) success(`Имате последната версия · ${me.name}`); return; }
    if (!manual && LS.get('updSkip', 0) === b) return;
    updSheet(rel, asset, me, b);
  }
  const relNotes = body => String(body || '').split('\n').map(x => x.trim())
    .filter(x => x && !/^(Co-Authored-By|Claude-Session|📱|💻|🤖)/i.test(x)).map(x => x.replace(/^v[\d.]+:\s*/, '')).slice(0, 8);
  function updSheet(rel, asset, me, b) {
    if (window.KIDesktop && window.KIDesktop.onUpdate && !updHooked) { updHooked = true; window.KIDesktop.onUpdate((p, msg) => window.KIM_updP && window.KIM_updP(p, msg)); }
    const ver = (String(rel.tag_name || '').match(/v([\d.]+)/) || [])[1] || rel.name || '';
    const notes = relNotes(rel.body);
    const m = sheet(`<div style="text-align:center"><div style="font-size:3.2em;line-height:1">🚀</div>
        <h2 style="justify-content:center;margin:8px 0 2px">Нова версия ${esc(ver)}</h2>
        <div class="mut">Сега имате ${esc(me.name)} · ${(asset.size / 1048576).toFixed(1)} MB</div></div>
      ${notes.length ? `<div class="card" style="margin-top:12px"><h3 style="margin-top:0">Какво ново</h3>${notes.map(x => `<div class="iss">• ${esc(x)}</div>`).join('')}</div>` : ''}
      <div class="updp" hidden><div class="bar"><i style="width:0%"></i></div><div class="mut updt" style="text-align:center;margin-top:8px"></div></div>
      <button class="btn big ok" data-u="go">⬇️ Обнови сега</button>
      <div class="grid2"><button class="btn lite" data-u="later">По-късно</button><button class="btn out" data-u="skip">Пропусни тази</button></div>`);
    const box = m.querySelector('.updp'), bar = box.querySelector('i'), txt = box.querySelector('.updt'), goB = m.querySelector('[data-u=go]');
    window.KIM_updP = (p, msg) => {
      box.hidden = false;
      if (p < 0) { txt.textContent = msg || 'Свалянето спря'; txt.style.color = 'var(--bad)'; goB.disabled = false; goB.textContent = '↻ Опитай пак'; return; }
      txt.style.color = ''; bar.style.width = p + '%';
      txt.textContent = p >= 100 ? (window.KIAndroid ? 'Готово – натиснете „Инсталиране“' : 'Инсталирам… приложението ще се отвори само') : `Свалям… ${p}%`;
      if (p >= 100) haptic(14);
    };
    m.addEventListener('click', async e => {
      const u = e.target.closest('[data-u]'); if (!u) return;
      if (u.dataset.u === 'later') { m.remove(); return; }
      if (u.dataset.u === 'skip') { LS.set('updSkip', b); m.remove(); return; }
      goB.disabled = true; goB.textContent = 'Свалям…'; window.KIM_updP(0);
      const r = window.KIAndroid ? window.KIAndroid.update(asset.browser_download_url) : await window.KIDesktop.update(asset.browser_download_url, asset.name);
      if (r === 'PERM') {
        goB.disabled = false; goB.textContent = '↻ Разреших – продължи';
        txt.textContent = 'Разрешете „Инсталиране на неизвестни приложения“ за Протоколи КИ и се върнете тук.';
      } else if (/^ERR/.test(r || '')) window.KIM_updP(-1, String(r).replace(/^ERR\s*/, ''));
    });
  }
  if (canUpdate()) {
    const autoCheck = () => { if (D.user && !document.hidden && Date.now() - LS.get('updAt', 0) > 3600e3 && !root.querySelector('.menu')) checkUpdate(false); };
    setTimeout(autoCheck, 5000); setInterval(autoCheck, 20 * 60e3);
    document.addEventListener('visibilitychange', autoCheck);
  }

  /* ---------- 🎤 Диктуване: говориш и текстът се изписва в полето ---------- */
  const DICT = !!(window.KIAndroid && window.KIAndroid.dictStart) || DESK;
  let dictT = null, dictBase = '';   // полето, в което се пише, и текстът в него преди текущото изречение
  function dictUi(on) {
    root.querySelectorAll('.aibar .dict').forEach(b => {
      const mine = on && dictT && b.parentElement.previousElementSibling === dictT;
      b.classList.toggle('on', !!mine);
      b.textContent = mine ? '■ Спри – слушам…' : '🎤 Говори – текстът се изписва сам';
    });
    root.querySelectorAll('.aibar .dlive').forEach(d => { d.textContent = on && dictT && d.parentElement.previousElementSibling === dictT ? '● Слушам – говорете. Текстът се пише горе в полето.' : ''; });
  }
  const dictJoin = (base, add) => {
    add = String(add || '').trim(); if (!add) return base;
    if (!base.trim() || /[.!?…]\s*$/.test(base)) add = add.charAt(0).toUpperCase() + add.slice(1);
    return base + (base && !/\s$/.test(base) ? ' ' : '') + add;
  };
  const dictFire = t => { t.dispatchEvent(new Event('input', { bubbles: true })); };
  function dictEnd() {
    const t = dictT; if (!t) return;
    dictT = null; dictUi(false);
    if (t.isConnected) { dictFire(t); t.dispatchEvent(new Event('change', { bubbles: true })); }
  }
  window.KIM_dict = (kind, text) => {
    const t = dictT; if (!t) return;
    if (kind === 'part') { if (text) { t.value = dictJoin(dictBase, text); t.scrollTop = t.scrollHeight; } }
    else if (kind === 'final') { if (text) t.value = dictJoin(dictBase, text); dictBase = t.value; t.scrollTop = t.scrollHeight; dictFire(t); }
    else if (kind === 'err') { toast(text, true); dictEnd(); }
    else if (kind === 'end') dictEnd();
  };
  function dictToggle(el) {
    const t = el.parentElement && el.parentElement.previousElementSibling;
    if (!t || t.tagName !== 'TEXTAREA') return;
    if (DESK && !window.KIAndroid) {
      t.focus(); t.setSelectionRange(t.value.length, t.value.length);
      toast('Натиснете клавишите ⊞ Windows + H и говорете – текстът се изписва в полето (безплатно, вградено в Windows)');
      return;
    }
    if (dictT === t) { window.KIAndroid.dictStop(); return; }
    if (dictT) window.KIAndroid.dictStop();
    if (REC && recSt().state === 'rec') toast('Внимание: докато се записва събранието, микрофонът може да е зает');
    const r = window.KIAndroid.dictStart();
    if (r === 'PERM') {
      toast('Разрешете достъп до микрофона');
      window.KIM_dictPerm = ok => { window.KIM_dictPerm = null; if (ok) dictToggle(el); else toast('Без разрешение за микрофона не може да се диктува', true); };
      return;
    }
    if (/^ERR/.test(r)) { toast(r.replace(/^ERR\s*/, ''), true); return; }
    dictT = t; dictBase = t.value; dictUi(true); haptic(10);
  }

  /* ---------- 🎙️ Запис на събранието от микрофона (приложението за Android) ---------- */
  const REC = !!(window.KIAndroid && window.KIAndroid.recStart);
  const recSt = () => { try { return JSON.parse(window.KIAndroid.recState()); } catch (e) { return { state: 'idle', ms: 0 }; } };
  const fmtMs = ms => { const t = Math.floor((ms || 0) / 1000), h = Math.floor(t / 3600); return (h ? h + ':' : '') + pad(Math.floor(t / 60) % 60) + ':' + pad(t % 60); };
  function recTab() {
    if (!REC) return '';
    const st = recSt();
    return `<button class="rt ${st.state !== 'idle' ? 'on' : ''}" data-act="rec"><b>${st.state === 'paused' ? '⏸' : '🎙️'}</b><span class="rtl">${st.state === 'idle' ? 'Запис' : (st.state === 'rec' ? '● ' : '') + fmtMs(st.ms)}</span></button>`;
  }
  function recBtn() {
    if (!REC) return '';
    const st = recSt();
    if (st.state === 'idle' || curMid()) return '';
    return `<button class="recb ${st.state === 'rec' ? 'on' : st.state === 'paused' ? 'pz' : ''}" data-act="rec" aria-label="Запис">${st.state === 'rec' ? '● ' + fmtMs(st.ms) : st.state === 'paused' ? '⏸ ' + fmtMs(st.ms) : '🎙️'}</button>`;
  }
  if (REC) setInterval(() => {
    const b = root.querySelector('.top .recb'), big = root.querySelector('.menu .rectime'), tb = root.querySelector('.tabs .rt');
    if (!b && !big && !tb) return;
    const st = recSt();
    if (tb) { tb.classList.toggle('on', st.state !== 'idle'); tb.querySelector('b').textContent = st.state === 'paused' ? '⏸' : '🎙️'; tb.querySelector('.rtl').textContent = st.state === 'idle' ? 'Запис' : (st.state === 'rec' ? '● ' : '') + fmtMs(st.ms); }
    if (b) { b.className = 'recb ' + (st.state === 'rec' ? 'on' : st.state === 'paused' ? 'pz' : ''); b.textContent = st.state === 'rec' ? '● ' + fmtMs(st.ms) : st.state === 'paused' ? '⏸ ' + fmtMs(st.ms) : '🎙️'; }
    if (big) big.textContent = fmtMs(st.ms);
  }, 1000);
  const recFileName = () => {
    const mid = curMid(), d = mid && D.m[mid];
    const bn = d && d.building ? d.building.name : 'Събрание';
    const no = d && d.meeting ? ' – събрание №' + d.meeting.meeting_no : '';
    const t = new Date();
    return `Запис ${bn}${no} – ${bgDate(isoOf(t))} ${pad(t.getHours())}-${pad(t.getMinutes())}.m4a`.replace(/[\\/:*?"<>|]/g, '_');
  };
  const refreshTop = () => { const b = root.querySelector('.top .recb'); if (b || REC) { const st = recSt(); if (b) b.outerHTML = recBtn(); else if (st.state !== 'idle') render(true); } };
  function recSheet() {
    const st = recSt();
    const mid = st.state !== 'idle' ? LS.get('recMid', curMid()) : curMid();
    const all = LS.get('recs', []);
    const list = all.map((r, i) => ({ ...r, i })).filter(r => !mid || r.mid === mid).reverse();
    const m = sheet(`<div class="row"><h2 class="grow" style="margin:0">🎙️ Запис на събранието</h2><button class="btn lite sm" data-act="closeMenu">✕</button></div>
      <div class="rectime">${fmtMs(st.ms)}</div>
      <div class="mut" style="text-align:center">${st.state === 'rec' ? '● Записва. Може да работиш в приложението, да заключиш екрана или да отвориш друго приложение.' : st.state === 'paused' ? '⏸ На пауза' : 'Записва от микрофона на телефона.'}</div>
      ${st.state === 'idle' ? `<button class="recbig" data-x="start" aria-label="Започни запис">●</button>
        <div style="text-align:center;font-weight:700;color:var(--navy)">Започни запис</div>
        <div class="note">Кажете на присъстващите, че събранието се записва.</div>`
        : `<div class="grid2" style="margin-top:12px">${st.state === 'rec' ? '<button class="btn gold big" data-x="pause">⏸ Пауза</button>' : '<button class="btn big" data-x="resume">▶ Продължи</button>'}
           <button class="btn bad big" data-x="stop">■ Спри и запази</button></div>`}
      ${list.length ? `<h3>Записи${mid ? ' на това събрание' : ''}</h3>${list.map(r => `<div class="recrow"><div class="grow"><div class="ttl" style="font-size:.85em">${esc(r.name)}</div><div class="mut">${fmtMs(r.ms)} · ${esc(r.at)}</div></div>
        <button class="btn lite sm" data-x="play" data-i="${r.i}" aria-label="Пусни">▶</button><button class="btn lite sm" data-x="send" data-i="${r.i}" aria-label="Изпрати">📤</button></div>`).join('')}` : ''}
      <div class="mut" style="margin-top:12px">Записите са в Изтегляния / Протоколи / Записи.</div>`);
    const again = () => { m.remove(); recSheet(); refreshTop(); };
    m.addEventListener('click', async e => {
      const x = e.target.closest('[data-x]'); if (!x) return;
      const k = x.dataset.x, r = all[+x.dataset.i];
      if (k === 'start') {
        const res = window.KIAndroid.recStart(recFileName());
        if (res === 'PERM') {
          toast('Разрешете достъп до микрофона');
          window.KIM_recPerm = ok => { window.KIM_recPerm = null; if (ok) { m.remove(); recSheet(); const b = root.querySelector('.menu:not(.out) [data-x=start]'); if (b) b.click(); } else toast('Без разрешение за микрофона не може да се записва', true); };
          return;
        }
        if (/^ERR/.test(res)) { toast(res.replace(/^ERR\s*/, ''), true); return; }
        LS.set('recMid', curMid()); toast('● Записът започна'); again();
      }
      else if (k === 'pause') { window.KIAndroid.recPause(); again(); }
      else if (k === 'resume') { window.KIAndroid.recResume(); again(); }
      else if (k === 'stop') {
        busy(true, 'Запазвам записа…');
        await new Promise(res => setTimeout(res, 80));
        let out;
        try { out = window.KIAndroid.recStop(); } finally { busy(false); }
        if (!out || /^ERR/.test(out)) { toast((out || 'Грешка').replace(/^ERR\s*/, ''), true); again(); return; }
        const o = JSON.parse(out);
        const recs = LS.get('recs', []);
        recs.push({ mid: LS.get('recMid', curMid()), name: o.name, uri: o.uri, ms: o.ms, at: stamp() });
        LS.set('recs', recs.slice(-60)); LS.del('recMid');
        toast('✓ Записът е запазен в Изтегляния / Протоколи / Записи'); again();
      }
      else if (k === 'play' && r) N.openFile(r.uri, 'audio/mp4');
      else if (k === 'send' && r) {
        const s2 = sheet(`<h2>📤 Изпрати записа</h2><div class="mut">${esc(r.name)}</div>
          <div class="grid2" style="margin-top:10px"><button class="btn lite" data-y="viber" style="color:#7360f2">💬 Viber</button><button class="btn lite" data-y="email">📧 Имейл</button></div>
          <button class="btn out" data-y="share">📤 Друго…</button><button class="btn out" data-y="close">Готово</button>`);
        s2.addEventListener('click', ev => {
          const y = ev.target.closest('[data-y]'); if (!y) return;
          const subj = r.name.replace(/\.m4a$/i, '');
          if (y.dataset.y === 'viber') N.shareTo(r.uri, 'audio/mp4', 'viber', '', subj, subj);
          else if (y.dataset.y === 'email') N.shareTo(r.uri, 'audio/mp4', 'email', '', subj, `Здравейте,\n\nИзпращаме Ви записа от общото събрание.\n\nПоздрави,\n${COMPANY}`);
          else if (y.dataset.y === 'share') N.shareFile(r.uri, 'audio/mp4');
          s2.remove();
        });
      }
    });
  }

  function go(hash, replace) {
    if (location.hash === hash) { render(true); return; }
    if (replace) { history.replaceState(null, '', hash); render(); } else location.hash = hash;
  }
  window.addEventListener('hashchange', () => render());

  let rendering = 0;
  async function render(keep) {
    const my = ++rendering;
    const h = location.hash || '#/';
    const p = h.replace(/^#\/?/, '').split('/').filter(Boolean);
    try {
      if (!D.user) {
        const s = await api('/api/auth/status').catch(() => ({}));
        if (s.authenticated) D.user = s.user;
      }
      if (my !== rendering) return;
      if (!D.user) return scrLogin();
      if (p[0] === 'login') return go('#/', true);
      if (p[0] === 'b' && p[2] === 'new') return await scrNew(+p[1]);
      if (p[0] === 'b') return await scrBuilding(+p[1], keep);
      if (p[0] === 'm' && p[2] === 'p') return await scrPoint(+p[1], +p[3], keep);
      if (p[0] === 'm') return await scrMeeting(+p[1], p[2] || 'att', keep);
      return await scrBuildings(keep);
    } catch (e) {
      if (e instanceof AuthErr) { D.user = null; return scrLogin(); }
      top('Грешка', '', '#/'); tabs();
      html(`<div class="card"><h2>Нещо се обърка</h2><p>${esc(e.message || e)}</p><button class="btn" data-act="reload">Опитай пак</button></div>`);
    }
  }

  /* ---------- Марка „Капитал Инвест“ ---------- */
  const wordmark = sub => `<div><div class="wm">CAPITAL <span>INVEST</span></div><div class="wsub">${sub || 'ИНВЕСТИРАМЕ ВЪВ ВАШЕТО БЪДЕЩЕ'}</div></div>`;
  const heroHtml = (inner, band) => `<div class="hero"><div class="in">${BR.logo ? `<img class="lg" src="${BR.logo}" alt="Capital Invest">` : ''}${inner}</div>${band ? `<div class="band ticks">${band}</div>` : ''}</div>`;

  /* ---------- Вход в програмата ---------- */
  function scrLogin() {
    $top.innerHTML = `${BR.logoW ? `<img class="lgw" src="${BR.logoW}" alt="">` : ''}<div class="tt" style="padding-left:6px"><div class="t1">Протоколи КИ</div><div class="t2">Капитал Инвест България</div></div>`;
    tabs();
    html(`<div class="login">${heroHtml(`${wordmark()}<div class="script" style="margin-top:10px">Инвестираме в хората.</div>`,
        '<span>Прозрачност</span><span>Професионализъм</span><span>Доверие</span><span>Резултати</span>')}
      <div class="icons4"><div><i class="i1">🏠</i>Управление<br>на имоти</div><div><i class="i2">🌿</i>Поддръжка<br>и грижа</div><div><i class="i3">📈</i>Стабилни<br>инвестиции</div><div><i class="i4">👥</i>Доволни<br>съседи</div></div>
      <div class="card"><h2>🔐 Вход в Протоколи</h2><label class="l">Потребител</label><input id="k-u" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="next" value="${esc(LS.get('user', ''))}">
      <label class="l">Парола</label><input id="k-p" type="password" autocomplete="current-password" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="go">
      <label class="row" style="margin-top:10px;gap:10px;cursor:pointer"><input type="checkbox" id="k-show" style="width:26px;height:26px;min-height:0;flex:none"> <span>Покажи паролата</span></label>
      <div id="k-le" class="errbox" hidden></div>
      <button class="btn big" data-act="login">Вход</button></div></div>`);
    const lu = root.querySelector('#k-u'), lp = root.querySelector('#k-p');
    root.querySelector('#k-show').onchange = e => { lp.type = e.target.checked ? 'text' : 'password'; };
    lu.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); lp.focus(); } });
    lp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doLogin(); } });
    lp.addEventListener('focus', () => setTimeout(() => { try { root.querySelector('[data-act=login]').scrollIntoView({ block: 'end', behavior: 'smooth' }); } catch (e) {} }, 500));
    setTimeout(() => (root.querySelector('#k-u').value ? root.querySelector('#k-p') : root.querySelector('#k-u')).focus(), 50);
  }
  async function doLogin() {
    const u = root.querySelector('#k-u').value.trim(), pw = root.querySelector('#k-p').value;
    const er = root.querySelector('#k-le'); er.textContent = ''; er.hidden = true;
    if (!u || !pw) { er.textContent = 'Въведете потребител и парола'; er.hidden = false; return; }
    try { if (document.activeElement) document.activeElement.blur(); } catch (e) {}
    busy(true, 'Влизам…');
    try {
      const r = await post('/api/auth/login', { username: u, password: pw });
      LS.set('user', u); D.user = r.user || { display_name: u };
      try { if (typeof state !== 'undefined') state.currentUser = r.user; } catch (e) {}
      go('#/', true);
    } catch (e) {
      const msg = /fetch|network|Failed/i.test(e.message || '') ? 'Няма връзка с интернет или програмата не отговаря. Проверете интернета на устройството.' : (e.message || 'Грешно име или парола');
      er.textContent = '⚠️ ' + msg + (/парол|име|потребител|401|invalid/i.test(msg) ? ' Проверете главни/малки букви – отметнете „Покажи паролата“.' : '');
      er.hidden = false; try { er.scrollIntoView({ block: 'center' }); } catch (x) {}
    }
    finally { busy(false); }
  }

  /* ---------- Входове ---------- */
  async function scrBuildings(keep) {
    top('Входове', D.user ? D.user.display_name || D.user.username : '');
    tabs();
    if (!D.buildings) html('<div class="empty">Зареждам…</div>');
    const list = (await loadBuildings()).filter(b => !b.status || b.status === 'Активна');
    const q = SS.get('q', '');
    const recent = LS.get('recent', []);
    const rec = recent.map(id => list.find(b => b.id === id)).filter(Boolean).slice(0, 3);
    html(`${q ? '' : heroHtml(`<div>${wordmark('ОБЩИ СЪБРАНИЯ И ПРОТОКОЛИ')}<div class="mut" style="margin-top:8px;font-weight:600">${list.length} активни входа</div></div>`)}
      <div class="search"><input id="k-q" type="search" placeholder="🔎 Търси вход или адрес…" value="${esc(q)}"></div>
      ${rec.length && !q ? `<h3>Последно отваряни</h3>${rec.map(bItem).join('')}<h3>Всички входове (${list.length})</h3>` : ''}
      ${q ? '' : '<div class="hint">↕️ Задръж вход и го плъзни, за да го преместиш</div>'}
      <div id="k-bl">${bList(list, q)}</div>
      ${q ? '' : '<button class="btn out" data-act="newBuilding" style="margin-top:14px">➕ Нова етажна собственост</button>'}`, keep);
  }

  // Нова етажна собственост: един вход, еднакъв брой апартаменти на етаж (няколко входа – в пълната версия)
  function newBuildingSheet() {
    let elev = true;
    const m = sheet(`<h2>➕ Нова етажна собственост</h2>
      <label class="l">Име (кратко)</label><input id="nb-name" placeholder="напр. Абритус 23 вход А" autocomplete="off">
      <label class="l">Адрес</label><input id="nb-addr" placeholder="гр. Разград, ул. …" autocomplete="off">
      <label class="l">Идентификатор (ако го знаете)</label><input id="nb-id" placeholder="61710.502…" autocomplete="off">
      <div class="grid2"><div><label class="l">Етажи</label><input id="nb-fl" type="number" inputmode="numeric" min="1" max="40" value="5"></div>
      <div><label class="l">Апартаменти на етаж</label><input id="nb-pf" type="number" inputmode="numeric" min="1" max="30" value="3"></div></div>
      <div class="grid2"><div><label class="l">Първият апартамент е №</label><input id="nb-st" type="number" inputmode="numeric" min="1" value="1"></div>
      <div><label class="l">Асансьор</label><div class="seg" id="nb-el"><button class="on" data-v="1">Има</button><button data-v="0">Няма</button></div></div></div>
      <div class="okbox" id="nb-sum" style="margin-top:12px"></div>
      <div class="mut" style="margin-top:6px">Имената на собствениците и идеалните части се попълват после в „Хора и такси“. Блок с няколко входа се създава от пълната версия.</div>
      <button class="btn big ok" data-x="ok">✓ Създай</button><button class="btn out" data-x="no">Отказ</button>`);
    const v = id => m.querySelector(id).value.trim(), n = id => Math.max(0, Math.round(Number(m.querySelector(id).value) || 0));
    const sum = () => { const fl = n('#nb-fl'), pf = n('#nb-pf'), st = Math.max(1, n('#nb-st')); m.querySelector('#nb-sum').textContent = fl && pf ? `Ще се създадат ${fl * pf} апартамента: от №${st} до №${st + fl * pf - 1}` : 'Въведете етажи и апартаменти на етаж'; };
    m.querySelectorAll('#nb-fl, #nb-pf, #nb-st').forEach(i => i.addEventListener('input', sum)); sum();
    m.querySelectorAll('#nb-el button').forEach(b => b.onclick = () => { elev = b.dataset.v === '1'; m.querySelectorAll('#nb-el button').forEach(x => x.classList.toggle('on', x === b)); });
    m.querySelector('[data-x=no]').onclick = () => m.remove();
    m.querySelector('[data-x=ok]').onclick = async () => {
      const name = v('#nb-name'), fl = n('#nb-fl'), pf = n('#nb-pf'), st = Math.max(1, n('#nb-st'));
      if (!name) { m.querySelector('#nb-name').classList.add('need'); m.querySelector('#nb-name').focus(); toast('Въведете име', true); return; }
      if (!fl || !pf) { toast('Въведете етажи и апартаменти на етаж', true); return; }
      if (fl * pf > 400) { toast('Твърде много апартаменти – проверете числата', true); return; }
      const body = { name, address: v('#nb-addr'), identifier: v('#nb-id'), floors: fl, units_per_floor: pf, distribution_mode: 'equal', single_start_no: st,
        floor_counts: Array.from({ length: fl }, (_, i) => ({ floor: i + 1, count: pf })), entrance_mode: 'single', entrances: [],
        next_meeting_number: 1, has_elevator: elev, has_common_rooms: false, common_rooms_count: 0 };
      const r = await run('Създавам…', () => post('/api/buildings', body));
      if (!r) return;
      D.buildings = null; D.all = null; m.remove();
      success('Етажната собственост е създадена');
      if (r.id) go('#/b/' + r.id); else render(true);
    };
  }
  const bItem = b => `<button class="item" data-id="${b.id}" data-go="#/b/${b.id}"><div class="grow"><div class="ttl">${esc(b.name)}</div><div class="mut">${esc(b.address || '')}</div></div><span class="arr">›</span></button>`;
  function bList(list, q) {
    const nq = norm(q);
    let f = nq ? list.filter(b => nq.split(' ').every(w => norm(b.name + ' ' + b.address).includes(w))) : list;
    const ord = nq ? [] : LS.get('border', []);
    if (ord.length) { const pos = id => { const k = ord.indexOf(id); return k < 0 ? 1e6 : k; }; f = f.map((b, i) => [b, i]).sort((a, b) => (pos(a[0].id) - pos(b[0].id)) || (a[1] - b[1])).map(x => x[0]); }
    return f.length ? f.map(bItem).join('') : '<div class="empty">Няма такъв вход</div>';
  }

  /* ---------- Един вход ---------- */
  async function scrBuilding(id, keep) {
    const d = await loadBuilding(id, true);
    const b = d.building;
    LS.set('recent', [id, ...LS.get('recent', []).filter(x => x !== id)].slice(0, 6));
    syncState(id);
    top(b.name, b.address, '#/');
    tabs();
    const ms = [...(d.meetings || [])].sort((a, c) => String(c.meeting_date).localeCompare(String(a.meeting_date)) || c.id - a.id);
    html(`<button class="btn big gold" data-go="#/b/${id}/new" style="margin-top:0">➕ Ново събрание</button>
      <h3>Събрания (${ms.length})</h3>
      ${ms.length ? ms.map(m => `<button class="item" data-go="#/m/${m.id}/${isClosed(m) ? 'end' : 'att'}">
        <div class="num ${isClosed(m) ? 'ok' : ''}">${esc(m.meeting_no || '')}</div>
        <div class="grow"><div class="ttl">${esc(bgDate(m.meeting_date))}${m.meeting_time ? ' · ' + esc(m.meeting_time) : ''}</div>
        <div class="mut">${esc(typeLabel(m.meeting_type))}</div></div>
        ${isClosed(m) ? '<span class="chip ok">Закрито</span>' : '<span class="chip warn">Отворено</span>'}</button>`).join('')
        : '<div class="empty">Още няма събрания в този вход</div>'}
      <div class="card" style="margin-top:16px"><div class="row"><div class="grow"><div class="ttl">${(d.units || []).length} обекта</div>
      <div class="mut">${esc(b.identifier || '')}${b.floors ? ' · ' + b.floors + ' етажа' : ''}</div></div>
      <button class="btn out sm" data-act="full" data-b="${id}">Редакция ›</button></div></div>`, keep);
  }

  /* ---------- Ново събрание ---------- */
  async function scrNew(bid) {
    const d = await loadBuilding(bid);
    const last = LS.get('last', { time: '18:30', place: 'пред входа на етажната собственост' });
    // Ако входът вече е имал събрание за управител с нас – предлагаме преподписване, иначе – смяна на управител
    const had = (d.meetings || []).some(m => (m.meeting_type === 'manager_change' || m.meeting_type === 'renewal') && isClosed(m));
    const type = had ? 'renewal' : 'manager_change';
    top('Ново събрание', d.building.name, '#/b/' + bid);
    tabs();
    html(`<div class="card"><h2>Вид на събранието</h2>
      ${TYPES.map(([v, l, s]) => `<button class="item k-type" data-act="pickType" data-v="${v}" style="box-shadow:none;border:2px solid ${v === type ? 'var(--navy)' : 'var(--line)'};${v === type ? 'background:#eef3fc' : ''}">
        <div class="tick" style="${v === type ? 'background:var(--navy);border-color:var(--navy)' : ''}">${v === type ? '✓' : ''}</div>
        <div class="grow"><div class="ttl">${l}</div><div class="mut">${s}</div></div></button>`).join('')}
      <input type="hidden" id="k-type" value="${esc(type)}">
      <div class="grid2"><div><label class="l">Дата</label><input id="k-date" type="date" value="${todayIso()}"></div>
      <div><label class="l">Час</label><input id="k-time" type="time" value="${esc(last.time || '18:30')}"></div></div>
      <label class="l">Място</label><input id="k-place" value="${esc(last.place || '')}">
      <label class="row" style="margin-top:14px;gap:12px;font-weight:600"><input id="k-fill" type="checkbox" checked style="width:28px;height:28px;min-height:0;flex:none"> Попълни всичко повтарящо се автоматично</label>
      <div class="mut" style="margin:6px 0 0 40px">Управител, касиер, председател, протоколчик, такси и текстове – от предишните събрания. Хората от входа – от последното му събрание.</div>
      </div><button class="btn big" data-act="createMeeting" data-b="${bid}">⚡ Създай събранието</button>`);
  }
  async function createMeeting(bid) {
    const body = {
      meeting_type: root.querySelector('#k-type').value, meeting_date: root.querySelector('#k-date').value || todayIso(),
      meeting_time: root.querySelector('#k-time').value, place: root.querySelector('#k-place').value.trim() || 'пред входа на етажната собственост',
      scope_type: 'all', scope_entrance: '',
    };
    const fill = root.querySelector('#k-fill').checked;
    let report = null;
    const r = await run('Създавам събранието…', async () => {
      LS.set('last', { time: body.meeting_time, place: body.place });
      const res = await post(`/api/buildings/${bid}/meetings`, body);
      delete D.b[bid];
      if (fill) report = await autoSetup(res.id, busyText).catch(e => ({ done: [], need: ['Автоматичното попълване спря: ' + (e.message || e)] }));
      return res;
    });
    if (r && r.id) {
      if (report) LS.set('auto_' + r.id, report);
      go(`#/m/${r.id}/att`, true);
      if (report) toast(`Попълних автоматично ${report.done.length} неща${report.need.length ? ` · остават ${report.need.length} – виж „Хора и такси“` : ''}`);
      // покана до собствениците по SMS и имейл – веднага след създаването
      setTimeout(() => nSendSheet(r.id, 'invite', 'Събранието е създадено ✓ Прати поканата на собствениците по SMS и имейл:').catch(() => {}), 1200);
    }
  }

  /* ---------- Автоматично попълване от предишни събрания ---------- */
  async function allMeetings() {
    if (D.all) return D.all;
    const list = await loadBuildings(), out = [];
    for (const b of list) { const d = await api('/api/buildings/' + b.id).catch(() => null); ((d && d.meetings) || []).forEach(m => out.push({ ...m, building_id: m.building_id || b.id })); }
    return (D.all = out);
  }
  const ts = m => Date.parse(m.closed_at || m.meeting_date) || 0;
  async function autoSetup(mid, say) {
    say = say || (() => {});
    const done = [], need = [];
    say('Търся предишни събрания…');
    const cur = await api('/api/meetings/' + mid);
    const T = cur.meeting.meeting_type, bid = cur.meeting.building_id, date = cur.meeting.meeting_date || todayIso();
    const all = (await allMeetings()).filter(m => m.id !== mid);
    // образец за повтарящото се: последното приключило от същия вид (първо от същия вход)
    const tplMeta = all.filter(m => m.meeting_type === T && isClosed(m)).sort((a, b) => (b.building_id === bid) - (a.building_id === bid) || ts(b) - ts(a))[0];
    // за хората от входа: последното събрание за управител в същия вход
    const sameMeta = all.filter(m => m.building_id === bid && (m.meeting_type === 'manager_change' || m.meeting_type === 'renewal')).sort((a, b) => isClosed(b) - isClosed(a) || ts(b) - ts(a))[0];
    const tpl = tplMeta ? await api('/api/meetings/' + tplMeta.id) : null;
    const same = sameMeta ? await api('/api/meetings/' + sameMeta.id) : null;

    // 1) текстовете по точките
    if (tpl) {
      say('Попълвам текстовете…');
      let n = 0;
      for (const a of cur.agenda || []) {
        const s = (tpl.agenda || []).find(x => num(x.item_no) === num(a.item_no));
        if (!s || (!s.discussion && !s.proposal)) continue;
        await patch('/api/agenda/' + a.id, { title: a.title, discussion: a.discussion || s.discussion || '', proposal: a.proposal || s.proposal || '', required_majority: a.required_majority, majority_base: a.majority_base });
        n++;
      }
      if (n) done.push(`Текстове по ${n} точки`);
    }

    // 2) подробностите по точките
    const K = KIND_NO[T] || {};
    const fromMeeting = async (src, kind) => { const it = src && itemFor(src, kind); return it ? getDet(it.id, kind) : null; };
    const target = kind => itemFor(cur, kind);
    const people = ps => (ps || []).map(p => ({ source_type: p.source_type || 'manual', unit_id: p.unit_id || null, person_name: p.person_name || '', property_no: String(p.property_no || ''), person_quality: p.person_quality || 'owner' }));
    let rep = 'Калин Рибаров';
    if (K.appointment) {
      say('Управител…');
      const s = await fromMeeting(tpl, 'appointment');
      if (s && s.details.management_type === 'professional') {
        const x = s.details; rep = x.representative_name || rep;
        const months = monthsBetween(x.start_date, x.end_date) || 12;
        await post(`/api/agenda/${target('appointment').id}/appointment-details`, { management_type: 'professional', company_name: x.company_name || COMPANY, representative_name: x.representative_name || '', start_date: date, end_date: addMonths(date, months), extra_text: x.extra_text || '', people: [] });
        done.push(`Управител: ${x.company_name || COMPANY} (${months} мес.)`);
      } else need.push('Управител');
    }
    if (K.cashier) {
      say('Касиер…');
      const s = await fromMeeting(tpl, 'cashier');
      if (s && s.details.cashier_type) {
        const x = s.details, months = num(x.term_months) || monthsBetween(x.start_date, x.end_date) || 12;
        await post(`/api/agenda/${target('cashier').id}/cashier-details`, { cashier_type: x.cashier_type, person_name: x.cashier_type === 'person' ? '' : (x.person_name || ''), property_no: x.cashier_type === 'person' ? '' : (x.property_no || ''), company_name: x.company_name || '', term_months: months, start_date: date, end_date: addMonths(date, months), monthly_fee: x.monthly_fee == null ? '' : String(x.monthly_fee) });
        if (x.cashier_type === 'person') need.push('Касиер'); else done.push(`Касиер: ${x.company_name}`);
      } else need.push('Касиер');
    }
    // хората от входа – само от същия вход (контрольор, упълномощен; при смяна – и предишното управление/ревизия не се копират)
    for (const kind of ['control', 'authorization']) {
      if (!K[kind]) continue;
      say(kind === 'control' ? 'Контрольор…' : 'Упълномощен…');
      const s = await fromMeeting(same, kind);
      if (s && (kind !== 'control' || (s.people || []).length)) {
        if (kind === 'control') await post(`/api/agenda/${target(kind).id}/control-details`, { control_type: s.details.control_type || 'inspector', extra_text: s.details.extra_text || '', people: people(s.people) });
        else await post(`/api/agenda/${target(kind).id}/authorization-details`, { source_type: s.details.source_type || 'manual', unit_id: s.details.unit_id || null, person_name: s.details.person_name || '', property_no: String(s.details.property_no || ''), person_quality: s.details.person_quality || 'owner', extra_text: s.details.extra_text || '' });
        done.push(kind === 'control' ? `Контрольор: ${(s.people || []).map(p => p.person_name).join(', ')}` : `Упълномощен: ${s.details.person_name}`);
      } else need.push(kind === 'control' ? 'Контрольор' : 'Упълномощен за договора');
    }
    if (K.termination) need.push('Досегашен управител');
    if (K.revision) need.push('Ревизия');
    if (K.fee) {
      say('Такси…');
      let srcM = null, f = null;
      for (const sm of [same, tpl]) { const it = sm && itemFor(sm, 'fee'); if (!it) continue; const ff = await loadFees(it.id); if (ff.details) { srcM = sm; f = ff; break; } }
      if (f) {
        const x = f.details, sep = x.operating_mode === 'separate';
        f.details = { manager_fee_amount: num(x.manager_fee_amount), cashier_fee_amount: num(x.cashier_fee_amount), repair_fund_amount: num(x.repair_fund_amount),
          repair_fund_mode: x.repair_fund_mode || 'fixed_object', operating_mode: sep ? 'separate' : 'common', operating_common_amount: sep ? 0 : num(x.operating_common_amount),
          operating_common_basis: x.operating_common_basis || 'object', extra_text: x.extra_text || '' };
        if (srcM !== same) f.common = null; // изключенията по обекти важат само за същия вход
        await saveFees(target('fee').id, f);
        done.push(`Такси: управление ${num(x.manager_fee_amount)} €, ремонт ${num(x.repair_fund_amount)} €, ${sep ? 'разделени режийни (' + f.items.filter(i => num(i.is_active)).length + ' вида)' : 'общи режийни ' + num(x.operating_common_amount) + ' €'}${srcM === same ? ' – като последния път' : ''}`);
        if (srcM !== same) need.push('Такси – провери за този вход');
      } else need.push('Такси');
    }

    // 3) председател и протоколчик
    say('Председател и протоколчик…');
    const ch = tpl ? await api(`/api/meetings/${tpl.meeting.id}/chair-details`).catch(() => null) : null;
    const c = ch && ch.details;
    if (c && c.chair_mode === 'present_manager' && c.source_type === 'professional') {
      await post(`/api/meetings/${mid}/chair-details`, { chair_mode: 'present_manager', source_type: 'professional', unit_id: null, person_name: '', property_no: '', person_quality: 'owner', company_name: c.company_name || COMPANY, representative_name: c.representative_name || rep });
      done.push(`Председател: ${c.representative_name || rep}`);
    } else {
      await post(`/api/meetings/${mid}/chair-details`, { chair_mode: 'present_manager', source_type: 'professional', unit_id: null, person_name: '', property_no: '', person_quality: 'owner', company_name: COMPANY, representative_name: rep });
      done.push(`Председател: ${rep}`);
    }
    const sc = tpl ? await api(`/api/meetings/${tpl.meeting.id}/secretary-candidates`).catch(() => null) : null;
    const sel = sc && (sc.candidates || []).find(x => num(x.is_selected) === 1 && x.source_type === 'professional');
    const secName = sel ? sel.candidate_name : ((D.user && D.user.display_name) || rep);
    const secOrg = sel ? (sel.candidate_org || COMPANY) : COMPANY;
    const r = await post(`/api/meetings/${mid}/secretary-candidates`, { source_type: 'professional', unit_id: null, candidate_name: secName, candidate_org: secOrg, property_no: '', person_quality: 'owner' });
    let cid = r && (r.id || (r.candidate && r.candidate.id));
    if (!cid) { const s2 = await api(`/api/meetings/${mid}/secretary-candidates`); const last = (s2.candidates || []).slice(-1)[0]; cid = last && last.id; }
    if (cid) { await patch(`/api/secretary-candidates/${cid}/select`); done.push(`Протоколчик: ${secName}`); }
    delete D.m[mid]; delete D.det[mid]; delete D.chair[mid]; delete D.sec[mid];
    return { done, need, tpl: tplMeta ? tplMeta.id : null, same: sameMeta ? sameMeta.id : null };
  }

  /* ---------- Събрание ---------- */
  async function scrMeeting(mid, tab, keep) {
    const d = await loadMeeting(mid, !keep || !D.m[mid]);
    const m = d.meeting;
    top(d.building ? d.building.name : 'Събрание', `№${m.meeting_no || ''} · ${bgDate(m.meeting_date)} · ${typeLabel(m.meeting_type)}`, '#/b/' + m.building_id);
    tabs(mid, tab);
    if (tab === 'chair') return scrChair(mid, d, keep);
    if (tab === 'ppl') return scrPeople(mid, d, keep);
    if (tab === 'pts') return scrPoints(mid, d, keep);
    if (tab === 'end') return scrEnd(mid, d, keep);
    return scrAtt(mid, d, keep);
  }

  function quorumCard(d) {
    const q = quorumOf(d), qn = quorumNeed(d);
    const ok = qn.need ? q >= qn.need : q > 0;
    return `<div class="card"><div class="q"><div class="big" style="color:${ok ? 'var(--ok)' : 'var(--bad)'}">${pct(q)}</div>
      <div class="grow"><div class="ttl">${ok ? '✓ Има кворум' : 'Няма кворум'}</div>
      <div class="mut">${(d.attendance || []).length} от ${scopeUnits(d).length} обекта · нужни ${qn.need ? qn.need + '%' : 'без минимум'}${qn.big ? ' (собственик с над 51%)' : ''}</div></div></div>
      <div class="bar"><i style="width:${Math.min(100, q)}%"></i>${qn.need ? `<u style="left:${qn.need}%"></u>` : ''}</div></div>`;
  }

  /* ---------- 1. Присъстващи с подпис ---------- */
  async function scrAtt(mid, d, keep) {
    const att = d.attendance || [];
    const units = scopeUnits(d);
    const sigs = await loadSigs(mid);
    const q = SS.get('aq', '');
    const closed = isClosed(d.meeting);
    const signed = att.filter(a => sigs['u' + a.unit_id]).length;
    html(`${quorumCard(d)}
      ${att.length ? `<div class="mut" style="margin:-4px 4px 10px">✍️ Подписали се: <b>${signed} от ${att.length}</b> · натисни обекта за име, пълномощно и подпис</div>`
        : `<div class="note" style="margin:-2px 0 12px">Натисни <b>кръгчето</b> – отбелязва присъствие. Натисни <b>реда</b> – име, пълномощно и подпис с пръст.</div>`}
      ${closed ? '<div class="note">Събранието е закрито – присъствието се променя само в пълната версия. Подписите още може да се добавят.</div>' : ''}
      <div class="search"><input id="k-aq" type="search" placeholder="🔎 Номер или име…" value="${esc(q)}"></div>
      <div id="k-ul">${units.map(u => unitCard(u, att.find(a => num(a.unit_id) === num(u.id)), sigs, closed)).join('') || '<div class="empty">В този вход няма въведени обекти</div>'}</div>`, keep);
    filterUnits(q);
  }
  function unitCard(u, a, sigs, closed) {
    const name = a ? a.person_name : u.owner_name;
    const proxy = a && a.status === 'Пълномощник';
    const sg = a && sigs['u' + u.id];
    return `<div class="unit ${a ? 'on' : ''}" data-s="${esc(norm(u.unit_no + ' ' + (u.owner_name || '') + ' ' + (a ? a.person_name : '')))}">
      <button class="tk" data-act="togAtt" data-u="${u.id}" ${closed ? 'disabled' : ''} aria-label="Присъства"><span class="tick">${a ? '✓' : ''}</span></button>
      <button class="ubody" data-act="attSheet" data-u="${u.id}">
        <div class="grow"><div class="ttl">${esc(unitLabel(u))} <span class="mut">· ет. ${esc(u.floor)} · ${pct(u.ideal_parts)}</span></div>
        <div class="${a && !String(name || '').trim() ? '' : 'mut'}" style="${a && !String(name || '').trim() ? 'color:var(--bad);font-weight:600' : ''}">${a ? (String(name || '').trim() ? esc(name) : 'Въведи име!') : esc(u.owner_name || 'няма въведен собственик')}</div>
        ${a ? `<div style="margin-top:4px">${proxy ? `<span class="chip warn">Пълномощник${a.proxy_auth_type === 'oral' ? ' · устно' : ''}</span> ` : ''}${sg ? '' : '<span class="chip">без подпис</span>'}</div>` : ''}</div>
        ${sg ? `<img class="sigt" src="${sg.img}" alt="подпис">` : ''}</button></div>`;
  }
  function filterUnits(q) {
    const nq = norm(q);
    root.querySelectorAll('#k-ul .unit').forEach(el => { el.hidden = !!nq && !nq.split(' ').every(w => el.dataset.s.includes(w)); });
  }
  const curMid = () => { const m = (location.hash || '').match(/#\/m\/(\d+)/); return m ? +m[1] : null; };

  async function saveAtt(mid, unitId, patchObj) {
    const d = D.m[mid];
    const u = (d.units || []).find(x => num(x.id) === unitId);
    const a = (d.attendance || []).find(x => num(x.unit_id) === unitId) || {};
    const status = patchObj.status || a.status || 'Собственик';
    const body = {
      unit_id: unitId,
      person_name: patchObj.person_name != null ? patchObj.person_name : (a.person_name || (u && u.owner_name) || ''),
      status,
      proxy_auth_type: status === 'Пълномощник' ? (patchObj.proxy_auth_type || a.proxy_auth_type || 'written') : '',
    };
    await post(`/api/meetings/${mid}/attendance`, body);
  }
  async function togAtt(unitId) {
    const mid = curMid(); const d = D.m[mid];
    const present = (d.attendance || []).some(x => num(x.unit_id) === unitId);
    if (present) { const ok = await removeAtt(mid, unitId); if (!ok) return; }
    else {
      const u = (d.units || []).find(x => num(x.id) === unitId);
      if (!u || !String(u.owner_name || '').trim()) return openAttSheet(unitId);
      await run('Отбелязвам…', async () => { await saveAtt(mid, unitId, {}); await loadMeeting(mid, true); });
    }
    await render(true);
  }
  async function removeAtt(mid, unitId) {
    const d = D.m[mid];
    const a = (d.attendance || []).find(x => num(x.unit_id) === unitId);
    const voted = a && (d.votes || []).some(v => num(v.attendance_id) === num(a.id));
    if (voted && !confirm('Този обект вече е гласувал. Да го махна ли от присъстващите? Гласовете му ще отпаднат.')) return false;
    await run('Махам…', async () => { await del(`/api/meetings/${mid}/attendance/${unitId}`); await loadMeeting(mid, true); });
    await putSig(mid, 'u' + unitId, null); await putSig(mid, 'px' + unitId, null);
    return true;
  }

  /* ---------- Подпис с пръст ---------- */
  const sigDyn = new Map();
  const dynText = d => d ? `подписано за ${(d.ms / 1000).toFixed(1).replace('.', ',')} сек · ${d.strokes} ${d.strokes === 1 ? 'черта' : 'черти'} · ${d.speed} т/сек` : '';
  function sigPad(el) {
    const cv = el.querySelector('canvas'), ph = el.querySelector('.ph');
    const clr = el.querySelector('[data-pad=clear]'), sh = el.closest('.sheet');
    // „Готово“ прави същото като големия бутон за запис (само когато в прозореца има един подпис)
    const saveB = sh && sh.querySelectorAll('.padw').length === 1 ? sh.querySelector('[data-sh=save], [data-x=save]') : null;
    if (el.nextElementSibling && el.nextElementSibling.matches('[data-pad=done]')) el.nextElementSibling.remove();
    if (sh) { sh.classList.add('haspad'); if (sh.parentElement) sh.parentElement.classList.add('haspad'); }
    // Подписва се на отделен екран, който не мърда: горе име, в средата жълтото поле, долу „Изчисти“ и „Готово“
    let lab = el.previousElementSibling; while (lab && !lab.matches('label.l')) lab = lab.previousElementSibling;
    const h2 = sh && sh.querySelector('h2');
    const head = document.createElement('div'); head.className = 'pfh';
    head.innerHTML = `<div class="grow"><b>${esc(lab ? lab.textContent : '✍️ Подпис')}</b><span>${esc(h2 ? h2.textContent.replace(/^✍️\s*/, '') : '')}</span></div><button type="button" class="pfx" aria-label="Назад">✕</button>`;
    const foot = document.createElement('div'); foot.className = 'pff';
    foot.innerHTML = '<button type="button" class="btn out" data-pf="clear">↺ Изчисти</button><button type="button" class="btn big ok" data-pf="done">✓ Готово</button>';
    el.insertBefore(head, cv); el.appendChild(foot);
    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));   // над 2 само бави
    const g = cv.getContext('2d', { desynchronized: true }) || cv.getContext('2d');
    const LW = 2.6, INK = '#0a1f6b', r1 = v => Math.round(v * 10) / 10;
    // всяка черта е списък от точки [x, y, милисекунди от началото, натиск]; w0×h0 е размерът на полето, в което е писано
    let strokes = [], t0 = 0, w0 = 0, h0 = 0, cw = 0, ch = 0, T = { s: 1, ox: 0, oy: 0 }, rect = null, full = false;
    const paint = (c, st, f) => {
      if (!st.length) return; const a = f(st[0]);
      c.beginPath(); c.arc(a[0], a[1], c.lineWidth / 2, 0, 7); c.fill();
      if (st.length < 2) return;
      c.beginPath(); c.moveTo(a[0], a[1]); let l = a;
      for (let i = 1; i < st.length; i++) { const q = f(st[i]); c.quadraticCurveTo(l[0], l[1], (l[0] + q[0]) / 2, (l[1] + q[1]) / 2); l = q; }
      c.lineTo(l[0], l[1]); c.stroke();
    };
    const ui = () => { const on = strokes.length > 0; if (ph) ph.hidden = on; el.classList.toggle('ink', on); if (clr) clr.hidden = !on; };
    const redraw = () => {
      g.clearRect(0, 0, cv.width, cv.height);
      g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = INK; g.fillStyle = INK; g.lineWidth = LW * dpr * Math.max(.5, T.s);
      for (const st of strokes) paint(g, st, q => [(q[0] * T.s + T.ox) * dpr, (q[1] * T.s + T.oy) * dpr]);
      ui();
    };
    const setup = () => {
      const r = cv.getBoundingClientRect(); if (!r.width || !r.height) return;
      rect = r; cw = r.width; ch = r.height; cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
      if (strokes.length) { const k = Math.min(cw / w0, ch / h0); T = { s: k, ox: (cw - w0 * k) / 2, oy: (ch - h0 * k) / 2 }; }
      else { w0 = cw; h0 = ch; T = { s: 1, ox: 0, oy: 0 }; }
      redraw();
    };
    setup();
    if (window.ResizeObserver) new ResizeObserver(() => { const r = cv.getBoundingClientRect(); if (act == null && r.width && (Math.abs(r.width - cw) > 1 || Math.abs(r.height - ch) > 1)) setup(); }).observe(cv);
    // Длан върху екрана: рисува само едно докосване. Това, което стои на място или е по-голямо петно, е длан и не оставя следа.
    const P = new Map(); let act = null, pen = false, lastEnd = 0, last = null, mid = null;
    const dropSt = st => { const i = strokes.indexOf(st); if (i >= 0) strokes.splice(i, 1); if (!strokes.length) { w0 = cw; h0 = ch; T = { s: 1, ox: 0, oy: 0 }; } redraw(); };
    const add = (e, p) => {
      const cx = e.clientX - rect.left, cy = e.clientY - rect.top, n = p.st.length;
      if (n) p.len += Math.hypot(cx - p.x, cy - p.y);
      p.x = cx; p.y = cy;
      if (p.touch) { const z = Math.max(e.width || 0, e.height || 0); if (z > p.big) p.big = z; }
      p.st.push([r1((cx - T.ox) / T.s), r1((cy - T.oy) / T.s), Math.round((e.timeStamp || performance.now()) - t0), Math.round((e.pressure || 0) * 100) / 100]);
      return [cx * dpr, cy * dpr];
    };
    cv.addEventListener('pointerdown', e => {
      if (!full) return;
      e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch (x) {}
      rect = cv.getBoundingClientRect();
      const touch = e.pointerType === 'touch', sz = touch ? Math.max(e.width || 0, e.height || 0) : 0, now = e.timeStamp || performance.now();
      if (e.pointerType === 'pen') pen = true;
      if (touch && (pen || sz > 120)) { P.set(e.pointerId, { palm: true }); return; }   // пише се с писалка или петното е огромно
      if (act != null) {
        const a = P.get(act), dur = now - a.t, cy = e.clientY - rect.top; let newPalm;
        if (!touch && a.touch) newPalm = false;
        else if (sz > 0 && a.big > 0 && Math.max(sz, a.big) > 30 && Math.max(sz, a.big) >= 1.5 * Math.min(sz, a.big)) newPalm = sz > a.big;   // по-голямото петно е дланта
        else if (a.len >= 14 && !(a.len < 60 && dur > 300 && a.len / dur < .04)) newPalm = true;   // първото вече пише – второто е длан
        else newPalm = dur < 150 && cy > a.y + 50;   // първото стои на място – то е дланта (освен ако новото е доста по-долу)
        if (newPalm) { P.set(e.pointerId, { palm: true }); return; }
        a.palm = true; act = null; dropSt(a.st);
      }
      if (!strokes.length) t0 = now;
      const p = { st: [], len: 0, big: sz, t: now, x: 0, y: 0, touch, palm: false };
      strokes.push(p.st); P.set(e.pointerId, p); act = e.pointerId;
      last = add(e, p); mid = last;
      g.beginPath(); g.arc(last[0], last[1], g.lineWidth / 2, 0, 7); g.fill();
      if (ph) ph.hidden = true; el.classList.add('ink');
    });
    cv.addEventListener('pointermove', e => {
      const p = P.get(e.pointerId); if (!p || p.palm || e.pointerId !== act) return; e.preventDefault();
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
      const list = evs && evs.length ? evs : [e];
      g.beginPath(); g.moveTo(mid[0], mid[1]);
      for (const ev of list) {
        const q = add(ev, p), m2 = [(last[0] + q[0]) / 2, (last[1] + q[1]) / 2];
        g.quadraticCurveTo(last[0], last[1], m2[0], m2[1]);   // гладка линия през средите
        last = q; mid = m2;
      }
      g.stroke();
    });
    const end = cancel => e => {
      const p = P.get(e.pointerId); P.delete(e.pointerId);
      if (!p || p.palm || e.pointerId !== act) return;
      act = null; lastEnd = performance.now();
      g.beginPath(); g.moveTo(mid[0], mid[1]); g.lineTo(last[0], last[1]); g.stroke();
      const dur = (e.timeStamp || performance.now()) - p.t;
      // телефонът сам е познал длан, или нещо е стояло неподвижно на екрана – не е част от подписа
      if ((cancel && p.len < 40) || (p.touch && p.len < 6 && dur > 700)) dropSt(p.st); else ui();
    };
    cv.addEventListener('pointerup', end(false)); cv.addEventListener('pointercancel', end(true));
    // големият екран се закача направо за тъмния фон – така стои точно върху екрана, дори прозорецът отдолу да е превъртян
    const menu = sh && sh.parentElement, holder = document.createComment('pad');
    const open = () => { if (full) return; full = true; if (menu) { el.before(holder); menu.appendChild(el); } el.classList.add('full'); setup(); };
    const close = () => { if (!full) return; full = false; el.classList.remove('full'); if (holder.parentNode) holder.replaceWith(el); P.clear(); act = null; setup(); };
    const clear = () => { strokes = []; P.forEach(p => { p.palm = true; }); act = null; w0 = cw; h0 = ch; T = { s: 1, ox: 0, oy: 0 }; redraw(); };
    // докато се пише (и миг след това) бутоните не реагират – дланта да не натисне „Готово“ или „Изчисти“
    const calm = () => act == null && performance.now() - lastEnd > 300;
    el.addEventListener('click', e => {
      if (!full) { if (!e.target.closest('[data-pad=clear]')) open(); return; }
      if (e.target.closest('.pfx')) { if (calm()) close(); return; }
      const b = e.target.closest('[data-pf]'); if (!b || !calm()) return;
      if (b.dataset.pf === 'clear') clear();
      else { const has = strokes.length > 0; close(); if (has && saveB) saveB.click(); }
    });
    // прозорец само за подпис (без други полета) – направо се отваря големият екран
    if (sh && saveB && !sh.querySelector('input, select, textarea, .seg')) requestAnimationFrame(open);
    const dyn = () => {
      if (!strokes.length) return null;
      let len = 0, pts = 0, draw = 0, vmax = 0;
      for (const st of strokes) {
        pts += st.length; if (st.length) draw += st[st.length - 1][2] - st[0][2];
        for (let i = 1; i < st.length; i++) { const d = Math.hypot(st[i][0] - st[i - 1][0], st[i][1] - st[i - 1][1]), dt = st[i][2] - st[i - 1][2]; len += d; if (dt > 0 && d / dt > vmax) vmax = d / dt; }
      }
      const lastSt = strokes[strokes.length - 1], total = lastSt.length ? lastSt[lastSt.length - 1][2] : 0;
      return { v: 1, ms: total, drawMs: draw, strokes: strokes.length, points: pts, len: Math.round(len), speed: draw > 0 ? Math.round(len / draw * 1000) : 0, maxSpeed: Math.round(vmax * 1000),
        w: Math.round(w0), h: Math.round(h0), device: (navigator.userAgent.match(/Android [^;)]+; [^;)]+/) || [navigator.platform || ''])[0], data: strokes };
    };
    return {
      has: () => strokes.length > 0,
      clear, dyn, open, close,
      png() {
        if (!strokes.length) return null;
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        for (const st of strokes) for (const q of st) { if (q[0] < x0) x0 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[0] > x1) x1 = q[0]; if (q[1] > y1) y1 = q[1]; }
        x0 -= 8; y0 -= 8; const w = x1 + 8 - x0, h = y1 + 8 - y0, k = Math.min(2, 520 / w, 180 / h);
        const o = document.createElement('canvas'); o.width = Math.max(1, Math.round(w * k)); o.height = Math.max(1, Math.round(h * k));
        const c = o.getContext('2d'); c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = INK; c.fillStyle = INK; c.lineWidth = Math.max(2.4, LW * k);
        for (const st of strokes) paint(c, st, q => [(q[0] - x0) * k, (q[1] - y0) * k]);
        const img = o.toDataURL('image/png');
        const dy = dyn(); if (dy) sigDyn.set(img, dy);   // пази се заедно с подписа (виж putSig)
        return img;
      },
    };
  }
  const padHtml = (label, existing) => `<label class="l">✍️ ${esc(label)}</label>
    ${existing ? `<div class="sigok"><img src="${existing.img}" alt=""><div class="grow">✓ Има подпис${existing.dyn ? `<span class="dyn">${esc(dynText(existing.dyn))}</span>` : ''}</div></div>` : ''}
    <div class="padw"><canvas></canvas><div class="ln"></div><div class="ph">${existing ? 'Нов подпис – тук' : 'Подпишете се тук'}</div>
      <button type="button" class="pclr" data-pad="clear" hidden aria-label="Изчисти подписа">↺ Изчисти</button></div>
    <button type="button" class="btn big ok" data-pad="done" hidden>✓ Готово</button>`;
  function sheet(inner) {
    const m = document.createElement('div'); m.className = 'menu';
    m.innerHTML = `<div class="sheet">${inner}</div>`;
    m.addEventListener('click', e => { if (e.target === m) m.remove(); });
    const realRemove = m.remove.bind(m);
    m.remove = () => { if (m.classList.contains('out')) return; m.classList.add('out'); setTimeout(realRemove, 260); };
    const sh = m.querySelector('.sheet'); let sy = null, sd = 0;
    sh.addEventListener('touchstart', e => { sy = sh.scrollTop > 0 || e.target.closest('textarea, input, select, .padw') ? null : e.touches[0].clientY; sd = 0; }, { passive: true });
    sh.addEventListener('touchmove', e => {
      if (sy == null) return; sd = e.touches[0].clientY - sy;
      if (sd <= 0) { sh.style.transform = ''; return; }
      if (e.cancelable) e.preventDefault();
      sh.classList.add('drag'); sh.style.transform = `translateY(${sd}px)`;
    }, { passive: false });
    sh.addEventListener('touchend', () => {
      if (sy == null) return; sy = null; sh.classList.remove('drag');
      if (sd > 110) { m.remove(); return; }
      sh.style.transition = 'transform .45s cubic-bezier(.34,1.56,.64,1)'; sh.style.transform = '';
      setTimeout(() => { sh.style.transition = ''; }, 460);
    });
    root.appendChild(m);
    decorateAi(sh);
    return m;
  }
  const stamp = () => { const d = new Date(); return `${bgDate(isoOf(d))} ${nowHm()}`; };
  // Снимката се чете без blob: адрес – защитата на програмата (CSP) не го позволява
  async function imgFromFile(file, max) {
    let im = null;
    try { if (window.createImageBitmap) im = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { im = null; }
    if (!im) {
      const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(file); });
      im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('bad image')); i.src = data; });
    }
    const s = Math.min(1, (max || 1600) / Math.max(im.width, im.height));
    const c = document.createElement('canvas'); c.width = Math.round(im.width * s); c.height = Math.round(im.height * s);
    c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
    if (im.close) im.close();
    return c.toDataURL('image/jpeg', 0.82);
  }

  async function openAttSheet(unitId) {
    const mid = curMid(), d = D.m[mid];
    const u = (d.units || []).find(x => num(x.id) === unitId); if (!u) return;
    const a = (d.attendance || []).find(x => num(x.unit_id) === unitId);
    const sigs = await loadSigs(mid);
    const closed = isClosed(d.meeting);
    let status = a ? a.status || 'Собственик' : 'Собственик';
    let ptype = a && (a.proxy_auth_type === 'oral' || a.proxy_auth_type === 'устно упълномощен') ? 'oral' : 'written';
    let photo = sigs['px' + unitId] || null;
    const contact = await contactOf(unitId);
    const m = sheet(`<h2>${esc(unitLabel(u))} <span class="mut">· ${pct(u.ideal_parts)}</span></h2>
      <div class="mut">Собственик: ${esc(u.owner_name || '—')}</div>
      <label class="l">Кой присъства</label>
      <div class="seg" data-g="st"><button class="${status !== 'Пълномощник' ? 'on' : ''}" data-v="Собственик">Собственикът</button><button class="${status === 'Пълномощник' ? 'on' : ''}" data-v="Пълномощник">Пълномощник</button></div>
      <label class="l" id="k-nl">${status === 'Пълномощник' ? 'Три имена на пълномощника' : 'Име на присъстващия'}</label>
      <input id="k-an" value="${esc(a ? (a.person_name || '') : (u.owner_name || ''))}" placeholder="Три имена" ${closed ? 'disabled' : ''}>
      <div id="k-px" ${status === 'Пълномощник' ? '' : 'hidden'}>
        <label class="l">Пълномощно</label>
        <div class="seg" data-g="pt"><button class="${ptype === 'written' ? 'on' : ''}" data-v="written">Писмено</button><button class="${ptype === 'oral' ? 'on' : ''}" data-v="oral">Устно (на събранието)</button></div>
        <div id="k-pw" ${ptype === 'written' ? '' : 'hidden'}>
          <label class="btn lite" id="k-pcam" style="cursor:pointer">📷 ${photo ? 'Снимай пълномощното отново' : 'Снимай пълномощното'}<input id="k-pf" type="file" accept="image/*" capture="environment" hidden></label>
          <label class="btn out" style="cursor:pointer">🖼️ Избери снимка от ${DESK ? 'компютъра' : 'галерията'}<input id="k-pg" type="file" accept="image/*" hidden></label>
          ${photo ? `<img class="photo" id="k-pi" src="${photo.img}">` : '<img class="photo" id="k-pi" hidden>'}
          <div class="mut" style="margin-top:4px">По закон копие от писменото пълномощно се прилага към протокола.</div>
        </div>
        <div class="mut" style="margin-top:8px">Един пълномощник може да представлява най-много трима собственици.</div>
      </div>
      ${padHtml('Подпис', sigs['u' + unitId])}
      <div class="grid2" style="margin-top:4px"><div><label class="l">📧 Имейл</label><input id="k-em" type="email" inputmode="email" autocapitalize="none" value="${esc(contact.email || '')}" placeholder="за копие от протокола"></div>
      <div><label class="l">📞 Телефон</label><input id="k-tel" type="tel" inputmode="tel" value="${esc(contact.phone || u.phone || '')}" placeholder="08…"></div></div>
      <div class="mut" style="margin-top:4px">По закон протоколът се изпраща по имейл на тези, които са дали имейл.</div>
      <button class="btn big ok" data-sh="save">✓ ${a ? 'Запази' : 'Присъства – запази'}</button>
      ${a && !closed ? '<button class="btn out" data-sh="remove" style="color:var(--bad)">Не присъства – махни</button>' : ''}
      <button class="btn lite" data-sh="cancel">Отказ</button>`);
    const pad = sigPad(m.querySelector('.padw'));
    m.querySelector('[data-pad=clear]').onclick = () => pad.clear();
    m.querySelectorAll('.seg[data-g] button').forEach(b => b.onclick = () => {
      b.parentNode.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
      if (b.parentNode.dataset.g === 'st') {
        status = b.dataset.v; m.querySelector('#k-px').hidden = status !== 'Пълномощник';
        m.querySelector('#k-nl').textContent = status === 'Пълномощник' ? 'Три имена на пълномощника' : 'Име на присъстващия';
        const n = m.querySelector('#k-an'); if (status === 'Пълномощник' && n.value === (u.owner_name || '')) { n.value = ''; n.focus(); } else if (status !== 'Пълномощник' && !n.value) n.value = u.owner_name || '';
      } else { ptype = b.dataset.v; m.querySelector('#k-pw').hidden = ptype !== 'written'; }
    });
    const showPhoto = img => { photo = { img, at: stamp() }; const i = m.querySelector('#k-pi'); i.src = img; i.hidden = false; toast('Снимката е сложена – натиснете „Запази“'); };
    const onPick = async e => {
      const f = e.target.files && e.target.files[0]; e.target.value = ''; if (!f) return;
      try { showPhoto(await imgFromFile(f, 1600)); } catch (err) { toast('Снимката не се отвори', true); }
    };
    m.querySelector('#k-pf').onchange = onPick;
    m.querySelector('#k-pg').onchange = onPick;
    // На компютъра няма „камера на телефона“ – пускаме камерата на компютъра в наш прозорец
    if (DESK) m.querySelector('#k-pcam').addEventListener('click', async e => {
      e.preventDefault();
      const img = await camShot();
      if (img === undefined) { toast('Не намирам камера на компютъра – изберете снимка от файл', true); m.querySelector('#k-pg').click(); }
      else if (img) showPhoto(img);
    });
    m.querySelector('[data-sh=cancel]').onclick = () => m.remove();
    const rm = m.querySelector('[data-sh=remove]');
    if (rm) rm.onclick = async () => { m.remove(); if (await removeAtt(mid, unitId)) render(true); };
    m.querySelector('[data-sh=save]').onclick = async () => {
      const name = m.querySelector('#k-an').value.trim();
      if (!name) { m.querySelector('#k-an').classList.add('need'); m.querySelector('#k-an').focus(); toast('Въведи името', true); return; }
      if (status === 'Пълномощник') {
        if (norm(name) === norm(u.owner_name)) { toast('Пълномощникът е друг човек, не собственикът', true); return; }
        if (proxyCount(d, name, unitId) >= 3) { toast(`${name} вече представлява 3 обекта – по закон не може повече`, true); return; }
      }
      const email = m.querySelector('#k-em').value.trim(), tel = m.querySelector('#k-tel').value.trim();
      if (email && !validEmail(email)) { m.querySelector('#k-em').classList.add('need'); toast('Имейлът не изглежда правилен', true); return; }
      const img = pad.png();
      const ok = await run('Записвам…', async () => {
        if (email !== (contact.email || '') || tel !== (contact.phone || '')) await putContact(unitId, { email, phone: tel, at: stamp() });
        if (tel && tel !== (u.phone || '')) {
          // телефонът отива и в Програма за протокол (картата на обекта)
          await patch('/api/units/' + unitId, { unit_no: u.unit_no, floor: u.floor, entrance: u.entrance || '', type: u.type, owner_name: u.owner_name || '', phone: tel,
            ideal_parts: num(u.ideal_parts), residents_count: num(u.residents_count), dogs_count: num(u.dogs_count), common_rooms_used: num(u.common_rooms_used), uses_elevator: u.uses_elevator == null ? true : !!num(u.uses_elevator) }).catch(() => {});
        }
        if (!closed) await saveAtt(mid, unitId, { person_name: name, status, proxy_auth_type: ptype });
        if (img) await putSig(mid, 'u' + unitId, { img, name, at: stamp() });
        if (status === 'Пълномощник' && ptype === 'written' && photo) await putSig(mid, 'px' + unitId, photo);
        if (status !== 'Пълномощник' || ptype !== 'written') await putSig(mid, 'px' + unitId, null);
        await loadMeeting(mid, true); return true;
      });
      if (ok) { m.remove(); render(true); if (!img && !sigs['u' + unitId]) toast('Записано – без подпис'); else toast('Записано ✓'); }
    };
  }

  /* ---------- 2. Хора от входа и такси ---------- */
  function unitChips(d, group, max, selected) {
    const att = d.attendance || [];
    const units = scopeUnits(d).map(u => { const a = att.find(x => num(x.unit_id) === num(u.id)); return { u, a, name: (a && a.status !== 'Пълномощник' && a.person_name) || u.owner_name || '' }; })
      .filter(x => String(x.name).trim()).sort((x, y) => (!!y.a - !!x.a));
    const sel = (selected || []).map(Number);
    return `<div class="chips" data-pick="${group}" data-max="${max}">${units.map(x => `<button data-act="pick" data-u="${x.u.id}" data-n="${esc(x.name)}" data-p="${esc(x.u.unit_no)}" class="${sel.includes(num(x.u.id)) ? 'on' : ''}">${x.a ? '✓ ' : ''}${esc(x.name)}<small>ап. ${esc(x.u.unit_no)}</small></button>`).join('') || '<span class="mut">Няма обекти с въведени имена</span>'}</div>`;
  }
  const picked = group => [...root.querySelectorAll(`[data-pick="${group}"] button.on`)].map(b => ({ unit_id: +b.dataset.u, person_name: b.dataset.n, property_no: b.dataset.p }));
  const stChip = ok => ok ? '<span class="chip ok">✓ готово</span>' : '<span class="chip bad">попълни</span>';

  async function scrPeople(mid, d, keep) {
    if (!keep) html('<div class="empty">Зареждам…</div>');
    const T = d.meeting.meeting_type, K = KIND_NO[T] || {};
    const [det, ch, sec] = await Promise.all([loadDet(mid, !keep), loadChair(mid, !keep), loadSec(mid, !keep)]);
    const auto = LS.get('auto_' + mid, null);
    const c = ch && ch.details, selSec = ((sec && sec.candidates) || []).find(x => num(x.is_selected) === 1);
    const chairTxt = c ? (c.source_type === 'professional' ? `${c.representative_name} (${c.company_name})` : `${c.person_name}${c.property_no ? ', ап. ' + c.property_no : ''}`) : '';
    const closed = isClosed(d.meeting);
    const dis = closed ? 'disabled' : '';
    const parts = [];
    if (auto && (auto.done || []).length) parts.push(`<div class="card"><h2>⚡ Попълнено автоматично</h2>${auto.done.map(x => `<div class="iss">✓ ${esc(x)}</div>`).join('')}
      <div class="mut" style="margin-top:6px">Взето от предишни събрания. Прегледай – особено имената и сумите.</div></div>`);
    parts.push(`<div class="card"><h2>🧑‍⚖️ Председател и протоколчик ${stChip(c && selSec)}</h2>
      <div class="iss">Председател: <b>${esc(chairTxt || '—')}</b></div><div class="iss">Протоколчик: <b>${esc(selSec ? selSec.candidate_name : '—')}</b></div>
      <button class="btn lite" data-go="#/m/${mid}/chair">Промени ›</button></div>`);
    if (K.control) {
      const x = det.control, n = x ? (x.details.control_type === 'council3' ? 3 : x.details.control_type === 'council5' ? 5 : 1) : 1;
      parts.push(`<div class="card"><h2>🔎 Контрол ${stChip(x)}</h2>
        <div class="seg" data-g="ctl">${[['inspector', 'Контрольор (1)'], ['council3', 'Съвет (3)'], ['council5', 'Съвет (5)']].map(([v, l]) => `<button class="${(x ? x.details.control_type : 'inspector') === v ? 'on' : ''}" data-act="ctlType" data-v="${v}" ${dis}>${l}</button>`).join('')}</div>
        <label class="l">Избери ${n === 1 ? 'контрольора' : n + ' души'}</label>
        ${unitChips(d, 'ctl', n, x ? (x.people || []).map(p => p.unit_id) : [])}
        <button class="btn" data-act="saveCtl" ${dis}>💾 Запиши контрола</button></div>`);
    }
    if (K.authorization) {
      const x = det.authorization;
      parts.push(`<div class="card"><h2>🖊️ Подписва договора ${stChip(x)}</h2>
        <div class="mut">Собственик, упълномощен да подпише договора за управление.</div>
        <label class="l">Избери един</label>
        ${unitChips(d, 'auth', 1, x && x.details.unit_id ? [x.details.unit_id] : [])}
        ${x && !x.details.unit_id ? `<div class="iss">Сега: <b>${esc(x.details.person_name)}</b>, ап. ${esc(x.details.property_no)}</div>` : ''}
        <button class="btn" data-act="saveAuth" ${dis}>💾 Запиши</button></div>`);
    }
    if (K.termination) {
      const x = det.termination, t = x ? x.details.management_type : 'professional';
      const tp = (x && x.people && x.people[0]) || {};
      parts.push(`<div class="card"><h2>⏹️ Досегашен управител ${stChip(x)}</h2>
        <div class="seg" data-g="term">${[['professional', 'Фирма'], ['manager', 'Домоуправител'], ['none', 'Няма']].map(([v, l]) => `<button class="${t === v ? 'on' : ''}" data-act="termType" data-v="${v}" ${dis}>${l}</button>`).join('')}</div>
        <input type="hidden" id="k-tt" value="${esc(t)}">
        <div data-tt="professional" ${t === 'professional' ? '' : 'hidden'}><label class="l">Фирма</label><input id="k-tco" value="${esc(x ? x.details.company_name : '')}" ${dis}>
          <label class="l">Представител</label><input id="k-trep" value="${esc(x ? x.details.representative_name : '')}" ${dis}></div>
        <div data-tt="manager" ${t === 'manager' ? '' : 'hidden'}><label class="l">Три имена</label><input id="k-tname" value="${esc(tp.person_name || '')}" ${dis}>
          <label class="l">Апартамент №</label><input id="k-tprop" inputmode="numeric" value="${esc(tp.property_no || '')}" ${dis}></div>
        <div data-tt="reasons" ${t === 'none' ? 'hidden' : ''}><label class="l">Причини</label><textarea id="k-trs" ${dis}>${esc(x ? x.details.reasons : 'Изтичане на мандата и желание на собствениците за професионално управление.')}</textarea></div>
        ${t === 'board' ? '<div class="note">Беше управителен съвет – промени в пълната версия.</div>' : ''}
        <button class="btn" data-act="saveTerm" ${dis}>💾 Запиши</button></div>`);
    }
    if (K.revision) {
      const x = det.revision, mode = x ? x.details.revision_mode : 'no_commission';
      parts.push(`<div class="card"><h2>📋 Ревизия ${stChip(x)}</h2>
        <div class="seg" data-g="rev" style="flex-wrap:wrap">${[['commission', 'Комисия'], ['no_commission', 'Не желаят'], ['no_previous_management', 'Няма предишно упр.']].map(([v, l]) => `<button class="${mode === v ? 'on' : ''}" data-act="revMode" data-v="${v}" ${dis}>${l}</button>`).join('')}</div>
        <input type="hidden" id="k-rm" value="${esc(mode)}">
        <div data-rm ${mode === 'commission' ? '' : 'hidden'}><label class="l">Членове на комисията</label>${unitChips(d, 'rev', 5, x ? (x.people || []).map(p => p.unit_id) : [])}</div>
        <button class="btn" data-act="saveRev" ${dis}>💾 Запиши</button></div>`);
    }
    if (K.fee) {
      const F = (keep && D.fees[mid]) || (D.fees[mid] = await loadFees(itemFor(d, 'fee').id));
      const x = F.details || {}, sep = x.operating_mode === 'separate', rf = x.repair_fund_mode || 'fixed_object', cb = x.operating_common_basis || 'object';
      const items = mergeFees(F.items), floors = floorsOf(d);
      const feeRow = i => {
        const rule = F.rules[i.fee_key] || { default_percent: 100, items: [] };
        const pctFor = fl => { const r = rule.items.find(y => num(y.floor_no) === fl); return r ? r.percent : rule.default_percent; };
        return `<div class="vrow k-fee" data-key="${esc(i.fee_key)}" data-std="${num(i.is_standard) ? 1 : 0}">
          <label class="row" style="gap:10px"><input type="checkbox" class="k-fact" ${num(i.is_active == null ? 1 : i.is_active) ? 'checked' : ''} style="width:26px;height:26px;min-height:0;flex:none" ${dis}>
          ${num(i.is_standard) ? `<b class="grow">${esc(i.fee_name)}</b><input type="hidden" class="k-fn" value="${esc(i.fee_name)}">` : `<input class="k-fn grow" value="${esc(i.fee_name)}" placeholder="Име на таксата" ${dis}>`}</label>
          <div class="grid2" style="margin-top:6px"><div><input class="k-fa" inputmode="decimal" value="${esc(i.amount)}" placeholder="€" ${dis}></div>
          <div><select class="k-fb" ${dis}>${BASIS.map(([v, l]) => `<option value="${v}" ${(i.basis || 'object') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
          <div class="k-ffl" ${i.basis === 'floor' ? '' : 'hidden'} style="margin-top:6px"><div class="mut">Процент от таксата по етажи (напр. 1 етаж – 0%):</div>
            <div class="grid2" style="margin-top:4px;grid-template-columns:repeat(3,1fr);gap:6px">${Array.from({ length: floors }, (_, k) => k + 1).map(fl => `<label class="row" style="gap:4px;font-size:.85em">Ет.${fl}<input class="k-fp" data-fl="${fl}" inputmode="numeric" value="${esc(pctFor(fl))}" style="min-height:40px;padding:6px" ${dis}>%</label>`).join('')}</div></div>
        </div>`;
      };
      parts.push(`<div class="card" id="k-feecard"><h2>💶 Месечни такси ${stChip(F.details)}</h2>
        <div class="grid2"><div><label class="l">Управление, € на обект</label><input id="k-f1" inputmode="decimal" value="${esc(x.manager_fee_amount != null ? x.manager_fee_amount : '')}" ${dis}></div>
        <div><label class="l">Касиер, €</label><input id="k-f3" inputmode="decimal" value="${esc(x.cashier_fee_amount != null ? x.cashier_fee_amount : 0)}" ${dis}></div></div>
        <label class="l">Фонд „Ремонт и обновяване“, €</label><input id="k-f2" inputmode="decimal" value="${esc(x.repair_fund_amount != null ? x.repair_fund_amount : '')}" ${dis}>
        <div class="seg" style="margin-top:6px"><button class="${rf === 'fixed_object' ? 'on' : ''}" data-act="feeSeg" data-g="rf" data-v="fixed_object" ${dis}>Сума на обект</button><button class="${rf === 'ideal_parts_min' ? 'on' : ''}" data-act="feeSeg" data-g="rf" data-v="ideal_parts_min" ${dis}>По ид. части спрямо най-малкия</button></div>
        <input type="hidden" id="k-rf" value="${esc(rf)}">
        <h3>Режийни разходи</h3>
        <div class="seg"><button class="${sep ? '' : 'on'}" data-act="feeSeg" data-g="om" data-v="common" ${dis}>Общи режийни</button><button class="${sep ? 'on' : ''}" data-act="feeSeg" data-g="om" data-v="separate" ${dis}>Разделени по видове</button></div>
        <input type="hidden" id="k-om" value="${sep ? 'separate' : 'common'}">
        <div data-om="common" ${sep ? 'hidden' : ''}>
          <label class="l">Обща сума за режийни, €</label><input id="k-f4" inputmode="decimal" value="${esc(x.operating_common_amount != null ? x.operating_common_amount : 0)}" ${dis}>
          <div class="seg" style="margin-top:6px"><button class="${cb === 'object' ? 'on' : ''}" data-act="feeSeg" data-g="cb" data-v="object" ${dis}>на обект</button><button class="${cb === 'person' ? 'on' : ''}" data-act="feeSeg" data-g="cb" data-v="person" ${dis}>на човек</button></div>
          <input type="hidden" id="k-cb" value="${esc(cb)}">
          ${F.common && F.common.rule_mode !== 'all' ? `<div class="note">Има освобождаване ${F.common.rule_mode === 'floor' ? 'по етажи' : 'на отделни обекти'} – запазва се. Промяна – в пълната версия.</div>` : ''}
        </div>
        <div data-om="separate" ${sep ? '' : 'hidden'}>
          <div class="mut" style="margin:6px 0">Отметни таксите, които има входът, и въведи сумата.</div>
          <div id="k-fees">${items.map(feeRow).join('')}</div>
          ${closed ? '' : '<button class="btn lite" data-act="feeAdd">➕ Друга такса</button>'}
        </div>
        <button class="btn" data-act="saveFee" ${dis}>💾 Запиши таксите</button></div>`);
    }
    for (const k of ['appointment', 'cashier']) {
      if (!K[k]) continue;
      const x = det[k] && det[k].details;
      const txt = !x ? '' : k === 'appointment' ? `${x.company_name || (det[k].people || []).map(p => p.person_name).join(', ')} · ${bgDate(x.start_date)} – ${bgDate(x.end_date)}` : `${x.cashier_type === 'company' ? x.company_name : x.person_name} · ${x.term_months} мес.`;
      parts.push(`<div class="card"><div class="row"><div class="grow"><div class="ttl">${k === 'appointment' ? '🏢 Управител' : '💰 Касиер'} ${stChip(x)}</div><div class="mut">${esc(txt || 'не е попълнено')}</div></div>
        <button class="btn out sm" data-act="full" data-m="${mid}" data-p="${itemFor(d, k).id}">Промени ›</button></div></div>`);
    }
    if (!Object.keys(K).length) parts.push('<div class="card mut">При редовно събрание няма специални точки – попълни текста директно в „Гласуване“.</div>');
    html(parts.join(''), keep);
  }

  /* ---------- Председател и протоколчик (подробно) ---------- */
  function voteSeg(cur, act, extra) {
    return `<div class="seg v">${VOTES.map(([v, l, c]) => `<button class="${c} ${cur === v ? 'on' : ''}" data-act="${act}" data-v="${v}" ${extra}>${l}</button>`).join('')}</div>`;
  }
  function tally(att, votes, key) {
    const t = { 'ЗА': 0, 'ПРОТИВ': 0, 'ВЪЗДЪРЖАЛ СЕ': 0, n: 0, none: 0 };
    att.forEach(a => {
      const v = votes.find(x => num(x.attendance_id) === num(a.id) && (!key || key(x)));
      if (v && t[v.vote] != null) { t[v.vote] += num(a.ideal_parts); t.n++; } else t.none++;
    });
    return t;
  }
  // Показваме идеалните части (както в протокола: „ЗА – 55,32% ид. части“)
  const resBox = (t, present) => `<div class="res"><div class="za"><b>${pct(t['ЗА'])}</b>ЗА</div><div class="pr"><b>${pct(t['ПРОТИВ'])}</b>ПРОТИВ</div><div class="vz"><b>${pct(t['ВЪЗДЪРЖАЛ СЕ'])}</b>ВЪЗД.</div></div><div class="mut" style="margin-top:4px;text-align:center">идеални части${present != null ? ` · присъстват ${pct(present)} ид. ч.` : ''}</div>`;

  async function scrChair(mid, d, keep) {
    top('Председател и протоколчик', d.building ? d.building.name : '', `#/m/${mid}/ppl`);
    if (!keep) html('<div class="empty">Зареждам…</div>');
    const [ch, sec] = await Promise.all([loadChair(mid, !keep), loadSec(mid, !keep)]);
    const att = d.attendance || [];
    const c = (ch && ch.details) || null;
    const lastCh = LS.get('chair', { mode: 'present_manager', src: 'professional', company: COMPANY, rep: (D.user && D.user.display_name) || '' });
    const mode = c ? c.chair_mode : lastCh.mode;
    const src = c ? c.source_type : (mode === 'absent_manager' ? 'unit' : lastCh.src);
    const chairName = c ? (c.source_type === 'professional' ? `${c.representative_name} (${c.company_name})` : `${c.person_name}${c.property_no ? ', ап. ' + c.property_no : ''}`) : '';
    const chVotes = (ch && ch.votes) || [];
    const ct = tally(att, chVotes);
    const unitOpts = sel => `<option value="">— избери —</option>` + att.map(a => `<option value="${a.unit_id}" ${num(sel) === num(a.unit_id) ? 'selected' : ''}>${esc(a.represents || ('обект ' + a.unit_no))} – ${esc(a.person_name || a.owner_name || '')}</option>`).join('');
    const cands = (sec && sec.candidates) || [];
    const sv = (sec && sec.votes) || [];
    const me = (D.user && D.user.display_name) || '';
    html(`<div class="card"><h2>🧑‍⚖️ Председател</h2>
      ${c ? `<div class="okbox">✓ ${esc(chairName)}</div>` : '<div class="note">Още не е записан председател.</div>'}
      <label class="l">Кой води събранието</label>
      <div class="seg" id="k-chm"><button class="${mode === 'present_manager' ? 'on' : ''}" data-act="chMode" data-v="present_manager">Управителят е тук</button>
      <button class="${mode === 'absent_manager' ? 'on' : ''}" data-act="chMode" data-v="absent_manager">Гласуваме председател</button></div>
      <input type="hidden" id="k-chmode" value="${esc(mode)}">
      <label class="l">Председател е</label>
      <div class="seg"><button class="${src === 'professional' ? 'on' : ''}" data-act="chSrc" data-v="professional" ${mode === 'absent_manager' ? 'disabled style="opacity:.35"' : ''}>Фирма</button>
      <button class="${src === 'unit' ? 'on' : ''}" data-act="chSrc" data-v="unit">Присъстващ</button>
      <button class="${src === 'manual' ? 'on' : ''}" data-act="chSrc" data-v="manual">Друг</button></div>
      <input type="hidden" id="k-chsrc" value="${esc(src)}">
      <div ${src === 'professional' ? '' : 'hidden'}><label class="l">Фирма</label><input id="k-chco" value="${esc(c && c.company_name || lastCh.company || COMPANY)}">
        <label class="l">Представител</label><input id="k-chrep" value="${esc(c && c.representative_name || lastCh.rep || me)}"></div>
      <div ${src === 'unit' ? '' : 'hidden'}><label class="l">Избери от присъстващите</label><select id="k-chunit">${unitOpts(c && c.unit_id)}</select></div>
      <div ${src === 'manual' ? '' : 'hidden'}><label class="l">Три имена</label><input id="k-chname" value="${esc(c && c.source_type === 'manual' ? c.person_name : '')}">
        <label class="l">Номер на апартамента</label><input id="k-chprop" inputmode="numeric" value="${esc(c && c.source_type === 'manual' ? c.property_no : '')}"></div>
      <button class="btn" data-act="saveChair">💾 Запиши председателя</button>
      ${mode === 'absent_manager' && c ? `<h3>Гласуване за председател</h3>${resBox(ct, quorumOf(d))}
        <button class="btn ok" data-act="chairAll" data-v="ЗА" ${att.length ? '' : 'disabled'}>✅ Всички присъстващи ЗА</button>
        <div style="margin-top:8px">${att.map(a => { const v = chVotes.find(x => num(x.attendance_id) === num(a.id)); return `<div class="vrow"><div class="who">${esc(a.represents)} · ${esc(a.person_name || '')}</div>${voteSeg(v && v.vote, 'chairVote', `data-a="${a.id}"`)}</div>`; }).join('')}</div>` : ''}
      </div>

      <div class="card"><h2>✍️ Протоколчик</h2>
      ${cands.length ? cands.map(k => {
        const t = tally(att, sv, x => num(x.candidate_id) === num(k.id));
        return `<div class="vrow"><div class="row"><div class="grow"><div class="ttl">${esc(k.candidate_name)}</div><div class="mut">${esc(k.candidate_org || (k.property_no ? 'ап. ' + k.property_no : ''))}</div></div>
          ${num(k.is_selected) ? '<span class="chip ok">✓ Избран</span>' : ''}</div>
          <div class="mut" style="margin-top:6px">ЗА: ${pct(t['ЗА'])} ид. ч. · гласували ${t.n} от ${att.length}</div>
          <div class="grid2" style="margin-top:8px"><button class="btn ok" data-act="secAll" data-c="${k.id}" ${att.length ? '' : 'disabled'}>✅ Всички ЗА</button>
          ${num(k.is_selected) ? `<button class="btn lite" data-act="secOpen" data-c="${k.id}">По един ›</button>` : `<button class="btn" data-act="secSel" data-c="${k.id}">✓ Избран</button>`}</div>
          <div class="k-secv" data-c="${k.id}" hidden>${att.map(a => { const v = sv.find(x => num(x.candidate_id) === num(k.id) && num(x.attendance_id) === num(a.id)); return `<div class="vrow"><div class="who">${esc(a.represents)} · ${esc(a.person_name || '')}</div>${voteSeg(v && v.vote, 'secVote', `data-c="${k.id}" data-a="${a.id}"`)}</div>`; }).join('')}</div></div>`;
      }).join('') : `<button class="btn big gold col" data-act="secMe"><span>⚡ ${esc(me || 'Аз')} – ${COMPANY}</span><span style="font-weight:400;font-size:.8em">добави, всички ЗА и избран – с едно натискане</span></button>`}
      <details style="margin-top:12px"><summary class="mut" style="padding:8px 0;font-weight:600">➕ Друг кандидат</summary>
        <div class="seg"><button class="on" data-act="scSrc" data-v="professional">Фирма</button><button data-act="scSrc" data-v="unit">Присъстващ</button><button data-act="scSrc" data-v="manual">Друг</button></div>
        <input type="hidden" id="k-scsrc" value="professional">
        <div data-sc="professional"><label class="l">Име</label><input id="k-scname" value="${esc(me)}"><label class="l">Фирма</label><input id="k-scorg" value="${COMPANY}"></div>
        <div data-sc="unit" hidden><label class="l">Избери от присъстващите</label><select id="k-scunit">${unitOpts(null)}</select></div>
        <div data-sc="manual" hidden><label class="l">Три имена</label><input id="k-scmname"><label class="l">Номер на апартамента</label><input id="k-scprop" inputmode="numeric"></div>
        <button class="btn" data-act="secAdd">➕ Добави кандидата</button></details>
      </div>`, keep);
  }

  function chairPayload() {
    const mode = root.querySelector('#k-chmode').value, src = root.querySelector('#k-chsrc').value;
    const d = D.m[curMid()];
    const p = { chair_mode: mode, source_type: src, unit_id: null, person_name: '', property_no: '', person_quality: 'owner', company_name: '', representative_name: '' };
    if (src === 'unit') {
      const uid = +root.querySelector('#k-chunit').value; if (!uid) throw new Error('Избери председател от присъстващите');
      const a = d.attendance.find(x => num(x.unit_id) === uid) || {};
      Object.assign(p, { unit_id: uid, person_name: a.person_name || a.owner_name || '', property_no: String(a.unit_no || '') });
      if (!p.person_name) throw new Error('Този присъстващ няма въведено име');
    } else if (src === 'manual') {
      p.person_name = root.querySelector('#k-chname').value.trim(); p.property_no = root.querySelector('#k-chprop').value.replace(/\D/g, '');
      if (!p.person_name) throw new Error('Въведи името на председателя');
    } else {
      p.company_name = root.querySelector('#k-chco').value.trim(); p.representative_name = root.querySelector('#k-chrep').value.trim();
      if (!p.company_name || !p.representative_name) throw new Error('Въведи фирма и представител');
    }
    return p;
  }

  /* ---------- 3. Гласуване ---------- */
  function scrPoints(mid, d, keep) {
    const att = d.attendance || [], ag = d.agenda || [], votes = d.votes || [];
    const closed = isClosed(d.meeting);
    const allDone = ag.length && ag.every(a => num(a.is_completed) === 1);
    html(`${!att.length ? '<div class="note" style="margin-top:0;margin-bottom:12px">Първо отбележи присъстващите – после се гласува.</div>' : ''}
      ${closed || !att.length ? '' : `<button class="btn big ok col" data-act="allFor" style="margin-top:0"><span>⚡ Всички ЗА по всичко и приключи</span><span style="font-weight:400;font-size:.8em">председател, протоколчик и всички ${ag.length} точки</span></button>
        <div class="mut" style="margin:6px 4px 12px">Ако някой е против – отвори точката и смени само неговия глас.</div>`}
      ${ag.map(a => {
        const t = tally(att, votes, v => num(v.agenda_item_id) === num(a.id));
        const done = num(a.is_completed) === 1;
        const st = done ? '<span class="chip ok">✓ Приключена</span>' : t.n && !t.none ? '<span class="chip">Гласувана</span>' : t.n ? `<span class="chip warn">${t.n}/${att.length}</span>` : '<span class="chip bad">Не е гласувана</span>';
        return `<button class="item" data-go="#/m/${mid}/p/${a.id}"><div class="num ${done ? 'ok' : ''}">${a.item_no}</div>
          <div class="grow"><div class="ttl" style="font-weight:600">${esc(a.title)}</div><div style="margin-top:4px">${st}${t.n ? ` <span class="mut">ЗА ${pct(t['ЗА'])} ид. ч.</span>` : ''}</div></div><span class="arr">›</span></button>`;
      }).join('') || '<div class="empty">Няма точки в дневния ред</div>'}
      ${closed ? '' : `<div class="card"><h2>Още</h2>
        <button class="btn lite" data-act="fill">✍️ Готови текстове от последното събрание</button>
        ${allDone ? '' : `<button class="btn lite" data-act="doneAll" ${ag.length ? '' : 'disabled'}>☑️ Маркирай всички точки като приключени</button>`}
        ${d.meeting.meeting_type === 'regular' ? '<button class="btn out" data-act="addPoint">➕ Нова точка</button>' : ''}</div>`}`, keep);
  }

  async function scrPoint(mid, aid, keep) {
    const d = await loadMeeting(mid, !keep || !D.m[mid]);
    const m = d.meeting, ag = d.agenda || [], att = d.attendance || [];
    const i = ag.findIndex(x => num(x.id) === aid);
    const a = ag[i];
    if (!a) return go(`#/m/${mid}/pts`, true);
    const prev = ag[i - 1], next = ag[i + 1];
    top(a.title, `Точка ${a.item_no} от ${ag.length}${d.building ? ' · ' + d.building.name : ''}`, `#/m/${mid}/pts`);
    $top.classList.add('pt'); ptTitle = a.title;
    tabs(mid, 'pts');
    const votes = (d.votes || []).filter(v => num(v.agenda_item_id) === aid);
    const t = tally(att, votes);
    const base = a.majority_base === 'present' ? quorumOf(d) : 100;
    const zaP = base ? t['ЗА'] / base * 100 : 0;
    const req = String(a.required_majority || '');
    const reqN = parseFloat(req) || 50;
    const pass = /\+/.test(req) ? zaP > reqN : zaP >= reqN;
    const fixed = m.meeting_type !== 'regular' && num(a.item_no) <= fixedLimit(m.meeting_type);
    const special = Object.entries(KIND_NO[m.meeting_type] || {}).find(([, no]) => no === num(a.item_no));
    const closed = isClosed(m), done = num(a.is_completed) === 1;
    html(`<div class="card"><div class="mut">Нужно мнозинство: ${esc(req || '—')} от ${a.majority_base === 'present' ? 'присъстващите' : 'всички идеални части'}</div>
      ${done && !closed ? `<div class="row" style="margin-top:10px"><span class="chip ok">✓ Приключена</span><span class="grow"></span><button class="btn lite sm" data-act="done" data-v="0">↩️ Отвори отново</button></div>` : ''}
      ${special ? `<button class="btn out" data-go="#/m/${mid}/ppl">🧑‍💼 Имена и суми – „Хора и такси“ ›</button>` : fixed ? `<button class="btn out" data-act="full" data-m="${mid}" data-p="${aid}">⚙️ Подробности в пълната версия ›</button>` : ''}</div>

      <div class="card"><h2>🗳️ Гласуване</h2>${resBox(t, quorumOf(d))}
      <div class="mut" style="margin-top:8px">${att.length ? `${pass ? '✅ Решението се приема' : '❌ Още не се приема'} · ЗА ${pct(t['ЗА'])} ид. ч., нужни ${/\+/.test(req) ? 'над ' : ''}${pct(base * reqN / 100)} ид. ч. · гласували ${t.n} от ${att.length}` : 'Няма присъстващи'}</div>
      ${closed ? '' : `<div class="grid2" style="margin-top:10px"><button class="btn ok big" data-act="ptAll" data-v="ЗА" ${att.length ? '' : 'disabled'}>✅ Всички ЗА</button>
        <button class="btn lite" data-act="ptAllMenu" ${att.length ? '' : 'disabled'}>Всички други…</button></div>`}
      <div style="margin-top:10px">${att.map(p => { const v = votes.find(x => num(x.attendance_id) === num(p.id)); return `<div class="vrow"><div class="who">${esc(p.represents)} · ${esc(p.person_name || '')} <span class="mut">${pct(p.ideal_parts)}</span></div>${closed ? `<b>${esc(v ? v.vote : '—')}</b>` : voteSeg(v && v.vote, 'vote', `data-a="${p.id}"`)}</div>`; }).join('')}</div></div>

      <div class="card"><h2>📝 Текст в протокола</h2>
      <label class="l">Разисквания</label><textarea class="k-ag" data-f="discussion" ${closed ? 'disabled' : ''}>${esc(a.discussion || '')}</textarea>
      <label class="l">Предложение / решение${fixed && !(m.meeting_type === 'renewal' && num(a.item_no) === 1) ? '' : ' (задължително)'}</label><textarea class="k-ag ${!fixed && !String(a.proposal || '').trim() ? 'need' : ''}" data-f="proposal" ${closed ? 'disabled' : ''}>${esc(a.proposal || '')}</textarea>
      <div class="mut" id="k-agst" style="margin-top:6px">Записва се само.</div></div>`, keep);
    const nextGo = next ? `#/m/${mid}/p/${next.id}` : `#/m/${mid}/end`;
    setDock(!done && !closed
      ? `<button class="btn out sq" ${prev ? `data-go="#/m/${mid}/p/${prev.id}"` : 'disabled'} aria-label="Предишна точка">‹</button>
         <button class="btn ok grow" data-act="done" data-v="1">✓ Приключи${next ? ' и напред' : ' точката'}</button>
         <button class="btn out sq" data-go="${nextGo}" aria-label="Следваща">›</button>`
      : `<button class="btn out grow" ${prev ? `data-go="#/m/${mid}/p/${prev.id}"` : 'disabled'}>‹ Предишна</button>
         <button class="btn grow" data-go="${nextGo}">${next ? 'Следваща ›' : 'Към края ›'}</button>`);
  }
  const curAid = () => { const m = (location.hash || '').match(/\/p\/(\d+)/); return m ? +m[1] : null; };
  let agT = null;
  function agInput(el) {
    const s = root.querySelector('#k-agst'); if (s) s.textContent = 'Пиша…';
    if (el.dataset.f === 'proposal') el.classList.toggle('need', false);
    clearTimeout(agT); agT = setTimeout(saveAg, 900);
  }
  async function saveAg() {
    clearTimeout(agT); agT = null;
    const mid = curMid(), aid = curAid(); if (!mid || !aid) return;
    const a = (D.m[mid].agenda || []).find(x => num(x.id) === aid); if (!a) return;
    const vals = {}; root.querySelectorAll('.k-ag').forEach(t => { vals[t.dataset.f] = t.value; });
    const s = () => root.querySelector('#k-agst');
    if (vals.discussion === (a.discussion || '') && vals.proposal === (a.proposal || '')) { if (s()) s().textContent = 'Записано ✓'; return; }
    try {
      await patch('/api/agenda/' + aid, { title: a.title, discussion: vals.discussion, proposal: vals.proposal, required_majority: a.required_majority, majority_base: a.majority_base });
      a.discussion = vals.discussion; a.proposal = vals.proposal;
      if (s()) s().textContent = 'Записано ✓';
    } catch (e) { toast('Текстът не се записа: ' + (e.message || e), true); }
  }

  /* ---------- 4. Подписи, закриване, документи ---------- */
  async function scrEnd(mid, d, keep) {
    const [sec, ch, sigs, det] = await Promise.all([loadSec(mid, !keep), loadChair(mid, !keep), loadSigs(mid), loadDet(mid, !keep)]);
    const m = d.meeting, closed = isClosed(m);
    const { out: iss, warn } = issuesOf(d, sec, sigs, det);
    const mode = m.quorum_mode || 'initial';
    const c = ch && ch.details, selSec = ((sec && sec.candidates) || []).find(x => num(x.is_selected) === 1);
    const chairName = c ? (c.source_type === 'professional' ? c.representative_name : c.person_name) : '';
    const secName = selSec ? selSec.candidate_name : '';
    const docBtn = (act, icon, label, sub, extra = '') => `<button class="item" data-act="${act}" ${extra}><span style="font-size:1.6em">${icon}</span><div class="grow"><div class="ttl">${label}</div>${sub ? `<div class="mut">${sub}</div>` : ''}</div><span class="arr">›</span></button>`;
    const sigRow = (key, role, name) => `<div class="vrow"><div class="row"><div class="grow"><div class="ttl">${role}</div><div class="mut">${esc(name || '—')}</div></div>
      ${sigs[key] ? `<img src="${sigs[key].img}" style="height:44px;max-width:120px;object-fit:contain">` : ''}
      <button class="btn ${sigs[key] ? 'lite' : 'gold'} sm" data-act="signRole" data-k="${key}" data-r="${esc(role)}" data-n="${esc(name || '')}">${sigs[key] ? 'Отново' : '✍️ Подпис'}</button></div></div>`;
    const bname = (d.building || {}).name || '';
    const ref = closed ? (m.closed_at ? String(m.closed_at).slice(0, 10) : m.meeting_date) : m.meeting_date;
    const mgr = m.meeting_type !== 'regular';
    const contacts = await contactsFor(d.units || []);
    const emailsN = new Set(contacts.map(c => c.email).filter(validEmail)).size;
    const nc = await nCard(mid, d).catch(() => '');
    html(`<div class="card"><h2>${iss.length ? `⚠️ Липсват ${iss.length} неща` : '✅ Всичко задължително е готово'}</h2>
      ${iss.slice(0, 30).map(([t, where]) => `<div class="iss" ${where ? `data-act="fix" data-w="${esc(where)}" style="cursor:pointer"` : ''}>• ${esc(t)} ${where ? '<span class="mut">›</span>' : ''}</div>`).join('')}
      ${warn.map(([t, where]) => `<div class="iss w" ${where ? `data-act="fix" data-w="${esc(where)}" style="cursor:pointer"` : ''}>⚠️ ${esc(t)} ${where ? '<span class="mut">›</span>' : ''}</div>`).join('')}
      ${!iss.length && !warn.length ? '<div class="okbox">Протоколът може да се изготви и подпише.</div>' : ''}</div>

      <div class="card"><h2>⏱️ Кворум и закриване</h2>
      <label class="l">Събранието се провежда</label>
      <div class="seg">${QUORUM.map(([v, l]) => `<button class="${mode === v ? 'on' : ''}" data-act="quorum" data-v="${v}" ${closed ? 'disabled' : ''}>${l}</button>`).join('')}</div>
      ${closed ? `<div class="okbox" style="margin-top:12px">🔒 Закрито в ${esc(m.closed_time || '')} ч.</div>`
        : `<label class="l">Час на закриване</label><div class="row"><input id="k-ct" type="time" value="${nowHm()}" class="grow"><button class="btn lite sm" data-act="ctNow">Сега</button></div>
        <button class="btn big" data-act="close">🔒 Закрий събранието</button>`}</div>

      <div class="card" id="k-sign"><h2>✍️ Подписи на протокола</h2>
      ${sigRow('chair', 'Председател', chairName)}${sigRow('sec', 'Протоколчик', secName)}
      <div class="mut" style="margin-top:6px">Подписите се пазят на този телефон и влизат в PDF файловете отдолу.</div></div>

      ${nc}

      <div class="card"><h2>📄 Документи</h2>
      <div class="mut" style="margin-bottom:8px">Всеки документ: 🖨️ печат на C80 · 📧 имейл · 💬 Viber</div>
      ${docBtn('pdf', '🖋️', 'Протокол с подписи', 'PDF · ' + (emailsN ? `може да се прати на ${emailsN} с имейл` : 'още няма въведени имейли'), 'data-doc="protocol"')}
      ${docBtn('pdf', '👥', 'Присъствен списък с подписи', 'PDF · с копията на пълномощните', 'data-doc="attendance"')}
      ${docBtn('sdoc', '✉️', 'Покана за събранието', 'PDF', 'data-k="invitation"')}
      ${docBtn('sdoc', '⬇️', 'Протокол за Word', 'Без подписи – за редакция', 'data-k="word"')}
      ${mgr ? docBtn('sdoc', '📝', 'Договор за управление', closed ? 'Word' : 'След закриване', 'data-k="contract"') : ''}
      ${mgr ? docBtn('sdoc', '🏛️', 'Уведомление до общината', closed ? 'Word' : 'След закриване', 'data-k="notice"') : ''}
      ${docBtn('print', '🖨️', 'Печат на принтер', 'C80 (A4) или ролка 58/80 мм – документи от програмата')}
      </div>

      <div class="card"><h2>📇 Имейли и телефони (${contacts.length})</h2>
      ${contacts.length ? contacts.map(c => `<div class="iss">${esc(unitLabel(c.u))} · ${esc(c.u.owner_name || ((d.attendance || []).find(x => num(x.unit_id) === num(c.u.id)) || {}).person_name || '')}<br><span class="mut">${esc([c.email, c.phone].filter(Boolean).join(' · '))}</span></div>`).join('')
        : '<div class="mut">Въвеждат се при подписа на всеки присъстващ (раздел „Присъстващи“).</div>'}
      ${emailsN ? `<button class="btn gold" data-act="pdf" data-doc="protocol">📨 Изпрати протокола на всички с имейл (${emailsN})</button>` : ''}</div>

      <div class="card"><h2>⚖️ По закона (ЗУЕС)</h2>
      <div class="iss">📅 Протоколът се изготвя и подписва до <b>${bgDate(addDays(ref, 7))}</b> (7 дни).</div>
      <div class="iss">📌 В същия срок – <b>съобщение на входа</b>, че протоколът е готов + протокол за поставянето.</div>
      ${mgr ? `<div class="iss">🏛️ Уведомлението до общината – до <b>${bgDate(addMonths(ref, 1))}</b> (1 месец), със заверено копие от протокола.</div>` : ''}
      <div class="iss">✉️ Поканата се поставя поне 7 дни преди събранието (до ${bgDate(addDays(m.meeting_date, -7))}).</div>
      ${docBtn('posting', '📌', 'Съобщение за протокола + протокол за поставяне', 'PDF с подписи на управителя и един собственик', 'data-kind="protocol"')}
      ${docBtn('posting', '📋', 'Протокол за поставяне на поканата', 'PDF с подписи', 'data-kind="invitation"')}
      </div>
      <button class="btn out" data-act="full" data-m="${mid}">Пълна версия на събранието ›</button>`, keep);
  }

  async function openDoc(path) {
    const mid = curMid(); if (!mid) return;
    const url = `/api/meetings/${mid}/${path}`;
    if (ANDROID) location.href = url; else window.open(url, '_blank');
  }
  async function download(path, name) {
    const mid = curMid(); const url = `/api/meetings/${mid}/${path}`;
    if (ANDROID && window.KIAndroid.download) { window.KIAndroid.download(new URL(url, location.href).href, name); toast('Свалям… Ще е в Изтегляния/Протоколи'); return; }
    await run('Свалям…', async () => {
      const r = await fetch(url, { credentials: 'same-origin' });
      if (!r.ok) throw new Error((await r.text()).replace(/<[^>]+>/g, ' ').trim().slice(0, 200) || 'Документът още не е готов');
      const cd = r.headers.get('Content-Disposition') || '';
      const mm = cd.match(/filename\*=UTF-8''([^;]+)/i) || cd.match(/filename="?([^";]+)"?/i);
      saveBlob(await r.blob(), mm ? decodeURIComponent(mm[1]) : name);
    });
  }

  /* ---------- PDF: HTML → картинки → PDF (без сървър) ---------- */
  async function htmlToPages(htmlStr, landscape) {
    if (!window.html2canvas) throw new Error('Липсва модулът за PDF – обновете приложението');
    const W = landscape ? 1123 : 794, H = landscape ? 794 : 1123, SC = 1.6;
    const f = document.createElement('iframe');
    f.style.cssText = `position:fixed;left:-20000px;top:0;width:${W}px;height:${H}px;border:0;visibility:hidden`;
    document.body.appendChild(f);
    try {
      const d = f.contentDocument; d.open(); d.write(htmlStr); d.close();
      const s = d.createElement('style');
      s.textContent = `html,body{background:#fff!important;margin:0!important}body{width:${W}px!important;box-sizing:border-box;padding:34px 40px!important;max-width:none!important}`;
      d.head.appendChild(s);
      await Promise.all([...d.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })));
      await new Promise(r => setTimeout(r, 250));
      const body = d.body, full = Math.max(body.scrollHeight, d.documentElement.scrollHeight);
      f.style.height = full + 'px';
      const canvas = await window.html2canvas(body, { backgroundColor: '#ffffff', scale: SC, width: W, height: full, windowWidth: W, windowHeight: full, logging: false });
      // да не режем ред по средата: търсим край на елемент близо до края на страницата
      const ends = [...body.querySelectorAll('p,tr,h1,h2,h3,h4,li,img,.sign,.pb,div')].map(e => e.getBoundingClientRect().bottom).filter(y => y > 0).sort((a, b) => a - b);
      const breaks = [...body.querySelectorAll('.pb')].map(e => e.getBoundingClientRect().top);
      const pages = []; let y0 = 0;
      while (y0 < full - 4) {
        let y1 = Math.min(y0 + H, full);
        const forced = breaks.find(b => b > y0 + 10 && b < y1);
        if (forced) y1 = forced;
        else if (y1 < full) { const c = ends.filter(y => y <= y1 && y > y0 + H * 0.55); if (c.length) y1 = c[c.length - 1] + 2; }
        const pc = document.createElement('canvas'); pc.width = Math.round(W * SC); pc.height = Math.round(H * SC);
        const g = pc.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, pc.width, pc.height);
        g.drawImage(canvas, 0, Math.round(y0 * SC), pc.width, Math.round((y1 - y0) * SC), 0, 0, pc.width, Math.round((y1 - y0) * SC));
        const blob = await new Promise(r => pc.toBlob(r, 'image/jpeg', 0.85));
        pages.push({ data: new Uint8Array(await blob.arrayBuffer()), w: pc.width, h: pc.height });
        y0 = y1;
      }
      return pages;
    } finally { f.remove(); }
  }
  function buildPdf(pages, landscape) {
    const PW = landscape ? 842 : 595, PH = landscape ? 595 : 842;
    const enc = s => new TextEncoder().encode(s);
    const parts = [], offs = []; let len = 0;
    const push = u => { parts.push(u); len += u.length; };
    const obj = (n, ...chunks) => { offs[n] = len; push(enc(`${n} 0 obj\n`)); chunks.forEach(c => push(typeof c === 'string' ? enc(c) : c)); push(enc('\nendobj\n')); };
    push(enc('%PDF-1.4\n'));
    const N = pages.length;
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, `<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ')}] /Count ${N} >>`);
    pages.forEach((p, i) => {
      const po = 3 + i * 3, co = po + 1, io = po + 2;
      const s = Math.min(PW / p.w, PH / p.h), dw = p.w * s, dh = p.h * s;
      const cs = `q ${dw.toFixed(2)} 0 0 ${dh.toFixed(2)} ${((PW - dw) / 2).toFixed(2)} ${(PH - dh).toFixed(2)} cm /Im0 Do Q`;
      obj(po, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /XObject << /Im0 ${io} 0 R >> >> /Contents ${co} 0 R >>`);
      obj(co, `<< /Length ${cs.length} >>\nstream\n${cs}\nendstream`);
      obj(io, `<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.data.length} >>\nstream\n`, p.data, '\nendstream');
    });
    const total = 3 + N * 3, xref = len;
    let x = `xref\n0 ${total}\n0000000000 65535 f \n`;
    for (let n = 1; n < total; n++) x += String(offs[n]).padStart(10, '0') + ' 00000 n \n';
    push(enc(x + `trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`));
    return new Blob(parts, { type: 'application/pdf' });
  }
  function saveBlob(blob, name) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }
  const b64 = async blob => { const u = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  // Записва файла: в приложението – в Изтегляния/Протоколи и предлага „Изпрати“; в браузъра – сваляне
  // Лист за готовия файл: печат на C80 · имейл · Viber · до всички с имейл · отвори
  async function deliver(blob, name, opt = {}) {
    const mime = blob.type || 'application/pdf', isPdf = /pdf/.test(mime);
    const subject = opt.subject || name.replace(/\.[a-z]+$/i, '');
    const text = opt.text || `Здравейте,\n\nИзпращаме Ви „${subject}“.\n\nПоздрави,\n${COMPANY}`;
    const emails = opt.emails || [];
    let uri = null;
    if (N && N.saveFile) {
      uri = await N.saveFile(name, await b64(blob), mime);
      if (!uri || /^ERR/.test(uri)) throw new Error('Не можах да запиша файла: ' + (uri || ''));
    }
    const where = DESK ? 'Документи \\ Протоколи' : 'Изтегляния / Протоколи';
    const m = sheet(`<h2>✅ ${esc(opt.title || 'Готово')}</h2><div class="mut">${uri ? `Записано в ${where} / ` : ''}${esc(name)}</div>
      ${emails.length ? `<button class="btn big gold col" data-x="all"><span>📨 Изпрати на всички с имейл (${emails.length})</span><span style="font-weight:400;font-size:.8em">отваря пощата с всички адреси като скрито копие</span></button>` : ''}
      <div class="grid2" style="margin-top:10px">
        ${opt.html && window.KIPrint ? '<button class="btn" data-x="bt">🖨️ Печат C80</button>' : isPdf && !DESK ? '<button class="btn" data-x="c80">🖨️ Печат C80</button>' : '<button class="btn" data-x="open">📖 Отвори</button>'}
        <button class="btn lite" data-x="email">📧 Имейл</button>
        <button class="btn lite" data-x="viber" style="color:#7360f2">💬 Viber</button>
        <button class="btn lite" data-x="share">${DESK ? '📂 Покажи в папката' : '📤 Друго…'}</button></div>
      ${isPdf || (opt.html && window.KIPrint) ? '<button class="btn out" data-x="open">📖 Отвори</button>' : ''}
      ${isPdf && opt.html && window.KIPrint && !DESK ? '<button class="btn out" data-x="c80">🖨️ Печат чрез SharpFox</button>' : ''}
      ${DESK ? '<div class="mut" style="margin-top:6px">Имейл и Viber: файлът се маркира в папката и се копира – постави го с Ctrl+V или го завлачи в писмото/чата.</div>'
        : isPdf ? '<div class="mut" style="margin-top:6px">„Печат C80“ праща по Bluetooth направо към принтера. Ако не тръгне – „чрез SharpFox“ (приложението на ByteCintia).</div>' : ''}
      <button class="btn out" data-x="close">Готово</button>`);
    const on = (k, f) => { const el = m.querySelector(`[data-x=${k}]`); if (el) el.onclick = f; };
    const dl = () => saveBlob(blob, name);
    const nat = !!(uri && N && N.shareTo);
    const deskNote = () => { toast(DESK ? 'Файлът е копиран и маркиран в папката – постави го с Ctrl+V' : 'Отварям пощата… (файлът е прикачен)'); };
    on('close', () => m.remove());
    on('bt', () => { m.remove(); window.KIPrint.open({ title: name.replace(/\.[a-z]+$/i, ''), html: opt.html }); });
    on('open', () => { if (uri) N.openFile(uri, mime); else window.open(URL.createObjectURL(blob), '_blank'); });
    on('c80', () => { if (nat) N.shareTo(uri, mime, 'c80', '', subject, ''); else { dl(); toast('PDF-ът е свален – отпечатай го през SharpFox или драйвера на C80'); } });
    on('email', () => { if (nat) { N.shareTo(uri, mime, 'email', '', subject, text); deskNote(); } else { dl(); location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text + '\n\n(файлът е свален – прикачете го)')}`; } });
    on('all', () => {
      const list = emails.join(',');
      if (nat) { N.shareTo(uri, mime, 'email', list, subject, text); deskNote(); }
      else { dl(); location.href = `mailto:?bcc=${encodeURIComponent(list)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text + '\n\n(файлът е свален – прикачете го)')}`; }
    });
    on('viber', () => { if (nat) { N.shareTo(uri, mime, 'viber', '', subject, subject); deskNote(); } else if (!webShare(blob, name)) dl(); });
    on('share', () => { if (uri) N.shareFile(uri, mime); else if (!webShare(blob, name)) dl(); });
  }
  function webShare(blob, name) {
    try {
      const file = new File([blob], name, { type: blob.type });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], title: name }).catch(() => {}); return true; }
    } catch (e) {}
    return false;
  }
  async function meetingEmails(mid) {
    const d = D.m[mid] || await loadMeeting(mid);
    return [...new Set((await contactsFor(d.units || [])).map(c => c.email).filter(validEmail))];
  }

  const sigImg = (s, h) => s ? `<img src="${s.img}" style="height:${h || 40}px;max-width:220px;object-fit:contain;vertical-align:middle">` : '';
  async function signedProtocol(mid) {
    const sigs = await loadSigs(mid);
    const h = await (await fetch(`/api/meetings/${mid}/protocol-html`, { credentials: 'same-origin' })).text();
    const doc = new DOMParser().parseFromString(h, 'text/html');
    const [ch, sec] = [D.chair[mid] || await loadChair(mid), D.sec[mid] || await loadSec(mid)];
    const c = ch && ch.details, s = ((sec && sec.candidates) || []).find(x => num(x.is_selected) === 1);
    const names = { chair: c ? (c.source_type === 'professional' ? c.representative_name : c.person_name) : '', sec: s ? s.candidate_name : '' };
    let found = 0;
    doc.querySelectorAll('.sign > div, .sign div').forEach(el => {
      const t = el.textContent || '';
      const key = /ПРЕДСЕДАТЕЛ/i.test(t) ? 'chair' : /ПРОТОКОЛЧИК/i.test(t) ? 'sec' : null;
      if (!key || el.dataset.kim) return;
      el.dataset.kim = 1; found++;
      el.innerHTML = el.innerHTML.replace(/\.{5,}/, `${sigImg(sigs[key], 46) || '............................'}<br><span style="font-size:13px">/${esc(names[key] || '')}/</span>`);
    });
    if (!found) doc.body.insertAdjacentHTML('beforeend', `<div style="display:flex;justify-content:space-between;margin-top:30px"><div>ПРЕДСЕДАТЕЛ:<br>${sigImg(sigs.chair, 46)}<br>/${esc(names.chair)}/</div><div>ПРОТОКОЛЧИК:<br>${sigImg(sigs.sec, 46)}<br>/${esc(names.sec)}/</div></div>`);
    return '<!doctype html>' + doc.documentElement.outerHTML;
  }
  async function signedAttendance(mid) {
    const sigs = await loadSigs(mid), d = await loadMeeting(mid, true);
    const h = await (await fetch(`/api/meetings/${mid}/attendance-html`, { credentials: 'same-origin' })).text();
    const doc = new DOMParser().parseFromString(h, 'text/html');
    const tb = doc.querySelector('table');
    if (tb) {
      const head = [...(tb.rows[0] || { cells: [] }).cells].map(c => c.textContent.trim());
      const iSig = head.findIndex(x => /Подпис/i.test(x)), iRep = head.findIndex(x => /Представлява/i.test(x)), iName = head.findIndex(x => /Име/i.test(x));
      [...tb.rows].slice(1).forEach(r => {
        const rep = iRep >= 0 && r.cells[iRep] ? r.cells[iRep].textContent.trim() : '';
        const a = (d.attendance || []).find(x => norm(x.represents) === norm(rep));
        if (!a) return;
        if (iName >= 0 && r.cells[iName] && !r.cells[iName].textContent.trim()) r.cells[iName].textContent = a.person_name || '';
        const s = sigs['u' + a.unit_id];
        if (iSig >= 0 && r.cells[iSig] && s) r.cells[iSig].innerHTML = sigImg(s, 34);
      });
    }
    const proxies = (d.attendance || []).filter(a => sigs['px' + a.unit_id]);
    proxies.forEach((a, i) => doc.body.insertAdjacentHTML('beforeend', `<div class="pb" style="padding-top:10px"><h3 style="margin:0 0 8px">Приложение ${i + 1}: пълномощно – ${esc(a.represents)}, пълномощник ${esc(a.person_name)}</h3><img src="${sigs['px' + a.unit_id].img}" style="max-width:100%;max-height:980px"></div>`));
    doc.body.insertAdjacentHTML('beforeend', `<p style="font-size:11px;color:#555;margin-top:14px">Подписите са положени собственоръчно на сензорен екран при регистрацията на присъстващите.</p>`);
    return '<!doctype html>' + doc.documentElement.outerHTML;
  }
  async function makePdf(kind) {
    const mid = curMid(), d = D.m[mid], bname = fileSafe((d.building || {}).name);
    const sigs = await loadSigs(mid);
    if (kind === 'protocol' && (!sigs.chair || !sigs.sec) && !confirm('Председателят и/или протоколчикът още не са подписали. Да направя ли PDF без тези подписи?')) return;
    const r = await run('Правя PDF…', async () => {
      const land = kind === 'attendance';
      const htmlStr = kind === 'protocol' ? await signedProtocol(mid) : await signedAttendance(mid);
      busyText('Подреждам страниците…');
      const pages = await htmlToPages(htmlStr, land);
      return { html: htmlStr, blob: buildPdf(pages, land), name: `${kind === 'protocol' ? 'Протокол' : 'Присъствен списък'} ${d.meeting.meeting_no} - ${bname} - ${bgDate(d.meeting.meeting_date)}.pdf` };
    });
    if (!r) return;
    const emails = kind === 'protocol' ? await meetingEmails(mid) : [];
    const bn = (d.building || {}).name || '';
    await deliver(r.blob, r.name, {
      title: kind === 'protocol' ? 'Протоколът е готов' : 'Присъственият списък е готов', emails, html: r.html,
      subject: `${kind === 'protocol' ? 'Протокол' : 'Присъствен списък'} от общо събрание – ${bn}, ${bgDate(d.meeting.meeting_date)}`,
      text: kind === 'protocol' ? `Здравейте,\n\nПрилагаме протокола от общото събрание на етажната собственост – ${bn} (${(d.building || {}).address || ''}), проведено на ${bgDate(d.meeting.meeting_date)}.\n\nПоздрави,\n${COMPANY}` : '',
    }).catch(e => toast(e.message || String(e), true));
  }

  // Документите от Програма за протокол (Word, договор, уведомление, покана) – същият лист с печат/имейл/Viber
  async function serverDoc(kind) {
    const mid = curMid(), d = D.m[mid], bn = fileSafe((d.building || {}).name), no = d.meeting.meeting_no;
    const K = {
      word: ['protocol-html?download=word', `Протокол ${no} - ${bn}.doc`, 'application/msword'],
      contract: ['contract-docx', `Договор - ${bn}.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      notice: ['municipality-notice-docx', `Уведомление община - ${bn}.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      invitation: ['invitation-html', `Покана - ${bn} - ${bgDate(d.meeting.meeting_date)}.pdf`, 'pdf'],
    }[kind];
    const r = await run(kind === 'invitation' ? 'Правя PDF на поканата…' : 'Свалям…', async () => {
      const res = await fetch(`/api/meetings/${mid}/${K[0]}`, { credentials: 'same-origin' });
      if (!res.ok) throw new Error((await res.text()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200) || 'Документът още не е готов');
      if (K[2] === 'pdf') { const h = await res.text(); return { html: h, blob: buildPdf(await htmlToPages(h, false), false) }; }
      if (kind === 'word') { const h = await res.text(); return { html: h, blob: new Blob([h], { type: K[2] }) }; }
      const blob = new Blob([await res.blob()], { type: K[2] });
      // Word (.docx) → HTML, за да може да се печата на C80
      let html = null;
      try { busyText('Подготвям за печат…'); html = await docxToHtml(blob); } catch (e) { console.warn('docx', e); }
      return { blob, html };
    });
    if (r) await deliver(r.blob, K[1], { title: 'Документът е готов', html: r.html }).catch(e => toast(e.message || String(e), true));
  }

  // Модулът за Word се зарежда чак когато трябва (вграден е в приложението)
  async function loadMammoth() {
    if (window.mammoth) return window.mammoth;
    let code = '';
    if (N && N.asset) code = await N.asset('mammoth.js');
    if (!code) { const r = await fetch('/mammoth.js').catch(() => null); if (r && r.ok) code = await r.text(); }
    if (!code) throw new Error('Липсва модулът за Word');
    const sc = document.createElement('script'); sc.textContent = code; document.head.appendChild(sc); sc.remove();
    if (!window.mammoth) throw new Error('Модулът за Word не се зареди');
    return window.mammoth;
  }
  async function docxToHtml(blob) {
    const mm = await loadMammoth();
    const r = await mm.convertToHtml({ arrayBuffer: await blob.arrayBuffer() });
    return `<!doctype html><html><head><meta charset="utf-8"><style>
      body{font-family:"Times New Roman",serif;font-size:15px;line-height:1.45;color:#000}
      p{margin:0 0 7px;text-align:justify} h1,h2,h3{text-align:center;margin:10px 0}
      table{border-collapse:collapse;width:100%;margin:6px 0} td,th{border:1px solid #000;padding:3px 5px;vertical-align:top}
      img{max-width:100%}</style></head><body>${r.value}</body></html>`;
  }

  /* ---------- Съобщение за протокола / протоколи за поставяне (чл. 13 и чл. 16 ЗУЕС) ---------- */
  async function postingSheet(kind) {
    const mid = curMid(), d = D.m[mid], m = d.meeting, b = d.building || {};
    const sigs = await loadSigs(mid);
    const keyM = kind + 'Mgr', keyW = kind + 'Wit';
    const meta = LS.get(`post_${kind}_${mid}`, { date: kind === 'invitation' ? addDays(m.meeting_date, -7) : todayIso(), time: nowHm(), wit: '', mgr: (D.user && D.user.display_name) || '' });
    const sh = sheet(`<h2>${kind === 'invitation' ? '📋 Поставяне на поканата' : '📌 Съобщение за протокола'}</h2>
      <div class="mut">${kind === 'invitation' ? 'Протокол, че поканата е поставена на входа (поне 7 дни преди събранието).' : 'Съобщение, че протоколът е изготвен, и протокол за поставянето му на входа.'}</div>
      <div class="grid2"><div><label class="l">Дата на поставяне</label><input id="k-pd" type="date" value="${esc(meta.date)}"></div><div><label class="l">Час</label><input id="k-ph" type="time" value="${esc(meta.time)}"></div></div>
      <label class="l">Управител / представител (поставя)</label><input id="k-pm" value="${esc(meta.mgr)}">
      <div data-p="mgr">${padHtml('Подпис на управителя', sigs[keyM])}</div>
      <label class="l">Собственик/обитател – свидетел</label><input id="k-pw2" value="${esc(meta.wit)}" placeholder="Три имена, ап. №">
      <div data-p="wit">${padHtml('Подпис на свидетеля', sigs[keyW])}</div>
      <button class="btn big" data-x="go">📄 Направи PDF</button><button class="btn lite" data-x="cancel">Отказ</button>`);
    const pm = sigPad(sh.querySelector('[data-p=mgr] .padw')), pw = sigPad(sh.querySelector('[data-p=wit] .padw'));
    sh.querySelectorAll('[data-pad=clear]')[0].onclick = () => pm.clear();
    sh.querySelectorAll('[data-pad=clear]')[1].onclick = () => pw.clear();
    sh.querySelector('[data-x=cancel]').onclick = () => sh.remove();
    sh.querySelector('[data-x=go]').onclick = async () => {
      const v = { date: sh.querySelector('#k-pd').value, time: sh.querySelector('#k-ph').value, mgr: sh.querySelector('#k-pm').value.trim(), wit: sh.querySelector('#k-pw2').value.trim() };
      if (!v.date || !v.mgr || !v.wit) { toast('Попълни дата, управител и свидетел', true); return; }
      LS.set(`post_${kind}_${mid}`, v);
      const a1 = pm.png(), a2 = pw.png();
      if (a1) await putSig(mid, keyM, { img: a1, name: v.mgr, at: stamp() });
      if (a2) await putSig(mid, keyW, { img: a2, name: v.wit, at: stamp() });
      const s = await loadSigs(mid);
      sh.remove();
      const addr = esc(b.address || b.name || '');
      const meetTxt = `${bgDate(m.meeting_date)}${m.meeting_time ? ' от ' + esc(m.meeting_time) + ' ч.' : ''}`;
      const signs = `<table style="width:100%;margin-top:50px;font-size:15px"><tr><td style="width:50%;vertical-align:bottom">Поставил:<br>${sigImg(s[keyM], 44) || '<br>............................'}<br>/${esc(v.mgr)}/</td>
        <td style="vertical-align:bottom">Собственик/обитател:<br>${sigImg(s[keyW], 44) || '<br>............................'}<br>/${esc(v.wit)}/</td></tr></table>`;
      const style = `<style>body{font-family:"Times New Roman",serif;font-size:16px;line-height:1.5;color:#000} h1{text-align:center;font-size:22px;margin:0 0 4px} .c{text-align:center} p{text-align:justify}</style>`;
      let body;
      if (kind === 'invitation') {
        body = `<h1>ПРОТОКОЛ</h1><div class="c">за поставяне на покана за общо събрание на етажната собственост</div>
          <p style="margin-top:28px">Днес, ${bgDate(v.date)} г., в ${esc(v.time)} ч., в сградата с адрес: ${addr}, на основание чл. 13 от Закона за управление на етажната собственост, на видно и общодостъпно място на входа беше поставена покана за свикване на общо събрание на етажната собственост, което ще се проведе на ${meetTxt}, място: ${esc(m.place || '')}.</p>
          <p>Върху поканата са отбелязани датата и часът на поставянето ѝ.</p><p>Настоящият протокол се състави в един екземпляр.</p>${signs}`;
      } else {
        body = `<h1>СЪОБЩЕНИЕ</h1><div class="c">до собствениците, ползвателите и обитателите в сграда с адрес: ${addr}</div>
          <p style="margin-top:24px">Уведомяваме Ви, че протоколът от общото събрание на етажната собственост, проведено на ${meetTxt}, е изготвен${m.closed_at ? '' : ''} и е на разположение при управителя на етажната собственост – ${esc(COMPANY)}. Всеки собственик може да получи копие от протокола.</p>
          <p>На основание чл. 16 от ЗУЕС решенията на общото събрание могат да бъдат оспорени в сроковете по закона, считано от поставянето на настоящото съобщение.</p>
          <p style="margin-top:20px">Дата на поставяне: ${bgDate(v.date)} г., ${esc(v.time)} ч.</p><p>Управител: ${esc(COMPANY)}</p>
          <div class="pb" style="padding-top:20px"><h1>ПРОТОКОЛ</h1><div class="c">за поставяне на съобщение за изготвен протокол от общо събрание</div>
          <p style="margin-top:28px">Днес, ${bgDate(v.date)} г., в ${esc(v.time)} ч., в сградата с адрес: ${addr}, на основание чл. 16 от Закона за управление на етажната собственост, на видно и общодостъпно място на входа беше поставено съобщение за изготвения протокол от общото събрание на етажната собственост, проведено на ${meetTxt}.</p>
          <p>Настоящият протокол се състави в един екземпляр.</p>${signs}</div>`;
      }
      const full = `<!doctype html><html><head><meta charset="utf-8">${style}</head><body>${body}</body></html>`;
      const r = await run('Правя PDF…', async () => ({ blob: buildPdf(await htmlToPages(full, false), false) }));
      if (r) await deliver(r.blob, `${kind === 'invitation' ? 'Протокол поставяне покана' : 'Съобщение и протокол поставяне'} - ${fileSafe(b.name)} - ${bgDate(v.date)}.pdf`, { title: 'Готово', html: full }).catch(e => toast(e.message || String(e), true));
      render(true);
    };
  }

  function signRole(key, role, name) {
    const mid = curMid();
    loadSigs(mid).then(sigs => {
      const sh = sheet(`<h2>✍️ ${esc(role)}</h2><div class="mut">${esc(name || '')}</div>${padHtml('Подпис', sigs[key])}
        <button class="btn big ok" data-x="save">✓ Запази подписа</button>${sigs[key] ? '<button class="btn out" data-x="del" style="color:var(--bad)">Изтрий подписа</button>' : ''}<button class="btn lite" data-x="cancel">Отказ</button>`);
      const p = sigPad(sh.querySelector('.padw'));
      sh.querySelector('[data-pad=clear]').onclick = () => p.clear();
      sh.querySelector('[data-x=cancel]').onclick = () => sh.remove();
      const dl = sh.querySelector('[data-x=del]'); if (dl) dl.onclick = async () => { await putSig(mid, key, null); sh.remove(); render(true); };
      sh.querySelector('[data-x=save]').onclick = async () => {
        const img = p.png(); if (!img) { toast('Подпиши се в полето', true); return; }
        await putSig(mid, key, { img, name, at: stamp() }); sh.remove(); toast('Подписът е записан'); render(true);
      };
    });
  }

  /* ---------- Меню ---------- */
  let menu = function () {
    const mid = curMid();
    sheet(`<div class="row" style="margin-bottom:6px"><div class="grow"><div class="ttl">${esc((D.user && (D.user.display_name || D.user.username)) || 'Протоколи КИ')}</div><div class="mut">Протоколи КИ</div></div>
      <button class="btn lite sm" data-act="closeMenu">✕</button></div>
      <label class="l">Големина на буквите</label><div class="grid2"><button class="btn lite" data-act="fs" data-v="-1" style="margin:0">А−</button><button class="btn lite" data-act="fs" data-v="1" style="margin:0">А+</button></div>
      <button class="btn lite" data-act="refresh">🔄 Обнови данните</button>
      <button class="btn lite" data-act="nCfg">📣 SMS и имейл – настройки</button>
      ${window.KIAndroid || window.KIDesktop ? '<button class="btn lite" data-act="upd">🚀 Провери за нова версия</button><div class="mut k-ver" style="text-align:center;margin-top:6px"></div>' : ''}
      ${LS.get('border', []).length ? '<button class="btn out" data-act="ordReset">↕️ Входовете по подразбиране</button>' : ''}
      <button class="btn out" data-act="full" ${mid ? `data-m="${mid}"` : ''}>🖥️ Пълна версия на програмата</button>
      ${D.user ? '<button class="btn out" data-act="logout" style="color:var(--bad)">Изход</button>' : ''}`);
  }

  const _menu = menu;
  menu = function () { _menu(); myVer().then(v => { const e = root.querySelector('.menu:not(.out) .k-ver'); if (e && v) e.textContent = `Версия ${v.name} · build ${v.build}`; }); };
  const withMid = async (msg, fn, after) => { const mid = curMid(); const r = await run(msg, () => fn(mid)); if (after !== false) { delete D.det[mid]; render(true); } return r; };

  /* ---------- 📣 Покани и известия: SMS (SIM картата или SMSAPI.bg) и имейл (Gmail или Brevo) ----------
     Получателите са собствениците от входа: телефонът от картата на обекта + имейлът/телефонът от подписа.
     В едно поле може да има 2 и повече телефона – разделят се и SMS отива на всеки.
     Отчетът (на кого е стигнало) се пази в Програма за протокол (ki_n_<събрание>) – вижда се от всички устройства.
     Ключовете за SMSAPI / Brevo се пазят само на устройството. */
  const NCFG_DEF = { sms: ANDROID ? 'sim' : 'smsapi', smsBase: 'https://api.smsapi.bg', smsToken: '', smsFrom: '', mail: 'gmail', brevoKey: '', mailFrom: '', mailName: 'Капитал Инвест', sign: 'Капитал Инвест', pdf: true, latin: false };
  const ncfg = () => Object.assign({}, NCFG_DEF, LS.get('ncfg', {}));
  const NK = { invite: ['✉️', 'Покана за събранието'], remind: ['⏰', 'Напомняне'], done: ['📌', 'Протоколът е готов'], custom: ['💬', 'Съобщение'] };
  const nId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const fmtPhone = n9 => '0' + n9.slice(0, 3) + ' ' + n9.slice(3, 6) + ' ' + n9.slice(6);

  // „0888 123 456, 0899 111 222“, „0888123456/0877…“, „+359 88…“ → [{ n: '359888123456', show: '0888 123 456' }]
  function phonesOf(...vals) {
    const mob = [], other = [], seen = new Set();
    for (const v of vals) for (const seg of String(v || '').split(/[,;\/|\n]+|\s+(?:и|или)\s+/i)) {
      let s = seg.replace(/\D/g, '');
      while (s.length >= 8) {
        let n9 = null;
        if (s.startsWith('00359')) { n9 = s.slice(5, 14); s = s.slice(14); }
        else if (s.startsWith('359')) { n9 = s.slice(3, 12); s = s.slice(12); }
        else if (s[0] === '0' && /^0(8[7-9]|9[89])/.test(s)) { n9 = s.slice(1, 10); s = s.slice(10); }
        else if (s[0] === '0') { other.push(s.slice(0, 9)); s = s.slice(9); continue; }
        else if (/^(8[7-9]|9[89])/.test(s) && s.length >= 9) { n9 = s.slice(0, 9); s = s.slice(9); }
        else { other.push(s); break; }
        if (/^(8[7-9]|9[89])\d{7}$/.test(n9)) { if (!seen.has(n9)) { seen.add(n9); mob.push({ n: '359' + n9, show: fmtPhone(n9) }); } }
        else other.push(n9);
      }
      if (s.length) { if (s.length >= 5) other.push(s); }
    }
    return { mob, other };
  }
  const emailsOf = (...vals) => [...new Set(vals.flatMap(v => String(v || '').split(/[\s,;]+/)).map(e => e.trim().toLowerCase()).filter(validEmail))];

  async function recipientsOf(d) {
    const sms = {}, mail = {}, none = [], bad = [];
    const att = d.attendance || [];
    for (const u of d.units || []) {
      const c = await contactOf(u.id);
      const nm = u.owner_name || (att.find(x => num(x.unit_id) === num(u.id)) || {}).person_name || '';
      const who = unitLabel(u) + (nm ? ' · ' + nm : '');
      const ph = phonesOf(c.phone, u.phone);
      ph.mob.forEach(p => { const r = sms[p.n] = sms[p.n] || { to: p.n, show: p.show, who: [] }; if (!r.who.includes(who)) r.who.push(who); });
      if (ph.other.length) bad.push({ who, v: ph.other.join(', ') });
      const em = emailsOf(c.email, u.email);
      em.forEach(e => { const r = mail[e] = mail[e] || { to: e, show: e, who: [] }; if (!r.who.includes(who)) r.who.push(who); });
      if (!ph.mob.length && !em.length) none.push(who);
    }
    const fin = o => Object.values(o).map(r => ({ to: r.to, show: r.show, who: r.who.join('; ') }));
    return { sms: fin(sms), mail: fin(mail), none, bad };
  }

  function nTexts(d, kind) {
    const fit = smsFit(d, kind, !!ncfg().latin);
    const m = d.meeting, b = d.building || {}, sign = ncfg().sign || 'Капитал Инвест';
    const where = b.address || b.name || '', dt = bgDate(m.meeting_date), tm = String(m.meeting_time || '').slice(0, 5), pl = m.place || '';
    const ag = (d.agenda || []).map(a => `${a.item_no}. ${a.title}`).join('\n');
    const hi = 'Уважаеми собственици,\n\n', bye = `\n\nС уважение,\n${COMPANY}`;
    if (kind === 'invite') return {
      sms: fit,
      subj: `Покана за общо събрание – ${where} – ${dt}`,
      mail: `${hi}На основание чл. 13 от ЗУЕС Ви каним на общо събрание на етажната собственост на адрес ${where}, което ще се проведе на ${dt} от ${tm} ч., място: ${pl}.\n\nДневен ред:\n${ag}\n\nПри липса на кворум събранието ще се проведе един час по-късно, на същото място и при същия дневен ред.\n\nМоля, носете документ за самоличност. Ако не можете да присъствате, може да упълномощите друго лице с писмено пълномощно.${bye}` };
    if (kind === 'remind') return {
      sms: fit,
      subj: `Напомняне: общо събрание – ${where} – ${dt} от ${tm} ч.`,
      mail: `${hi}Напомняме Ви, че на ${dt} от ${tm} ч., място: ${pl}, ще се проведе общото събрание на етажната собственост на адрес ${where}.\n\nДневен ред:\n${ag}\n\nОчакваме Ви!${bye}` };
    if (kind === 'done') return {
      sms: fit,
      subj: `Протокол от общото събрание – ${where} – ${dt}`,
      mail: `${hi}Протоколът от общото събрание на етажната собственост на адрес ${where}, проведено на ${dt}, е изготвен и е поставен на видно място на входа.\n\nПри въпроси – свържете се с нас.${bye}` };
    return { sms: fit, subj: `${where} – съобщение`, mail: `${hi}${bye}` };
  }
  // кирилицата: 70 знака в един SMS, 67 в дълъг; латиница: 160 / 153
  const smsParts = t => { const uc = /[^\x0A\x0D\x20-\x7E]/.test(t), n = t.length; return { n, parts: !n ? 0 : uc ? (n <= 70 ? 1 : Math.ceil(n / 67)) : (n <= 160 ? 1 : Math.ceil(n / 153)), uc }; };
  // Латиница: 160 знака в 1 SMS вместо 70 (по Закона за транслитерацията)
  const TRL = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sht', ъ: 'a', ь: 'y', ю: 'yu', я: 'ya', ѝ: 'i' };
  const translit = t => String(t || '').replace(/[„“”«»]/g, '"').replace(/[–—]/g, '-').replace(/№/g, 'No').replace(/[Ѐ-ӿѝ]/g, ch => {
    const lo = ch.toLowerCase(), r = TRL[lo]; if (r == null) return ''; return ch === lo ? r : r.charAt(0).toUpperCase() + r.slice(1); });
  // Текстът на SMS-а – най-подробният вариант, който се събира в 1 SMS (70 знака на кирилица, 160 на латиница)
  function smsFit(d, kind, latin, maxO) {
    const m = d.meeting, b = d.building || {}, max = maxO || (latin ? 160 : 70), cfg = ncfg();
    const dd = bgDate(m.meeting_date).slice(0, 5), tm = String(m.meeting_time || '').slice(0, 5);
    const p = String(m.place || '').replace(/пред входа на етажната собственост/i, 'пред входа').replace(/етажната собственост/gi, 'ЕС').replace(/\s+/g, ' ').trim();
    const cut = x => String(x || '').replace(/^\s*(гр\.|град|с\.)\s*[^,]+,\s*/i, '').replace(/^жилищна сграда\s*/i, '').replace(/\s+/g, ' ').trim();
    const al = [cut(b.address), cut(b.name)].filter(Boolean).sort((x, y) => x.length - y.length);
    let a = al[0] || '';
    const signs = [...new Set([cfg.sign || 'Капитал Инвест', 'Капитал Инвест', 'КИ'])];
    const V = {
      invite: [
        (a, s) => `Покана: общо събрание на етажната собственост ${a} на ${dd} от ${tm} ч., ${p}. Дневният ред е на входа. ${s}`,
        (a, s) => `Покана: общо събрание на ЕС ${a} на ${dd} от ${tm}ч, ${p}. ${s}`,
        (a, s) => `Общо събрание ЕС ${a} на ${dd} от ${tm}ч, ${p}. ${s}`,
        (a, s) => `Събрание ЕС ${a} ${dd} ${tm}ч, ${p}. ${s}`,
        (a, s) => `Събрание ЕС ${a} ${dd} ${tm}ч. ${s}`],
      remind: [
        (a, s) => `Напомняне: общо събрание на етажната собственост ${a} на ${dd} от ${tm} ч., ${p}. Очакваме Ви! ${s}`,
        (a, s) => `Напомняне: събрание ЕС ${a} ${dd} ${tm}ч, ${p}. ${s}`,
        (a, s) => `Напомняне: събрание ЕС ${a} ${dd} ${tm}ч. ${s}`,
        (a, s) => `Събрание ЕС ${a} ${dd} ${tm}ч. ${s}`],
      done: [
        (a, s) => `Протоколът от общото събрание на етажната собственост ${a} от ${dd} е готов и е поставен на входа. ${s}`,
        (a, s) => `Протоколът от събранието на ЕС ${a} е на входа. ${s}`,
        (a, s) => `Протокол от събрание ЕС ${a} - на входа. ${s}`],
      custom: [(a, s) => s],
    }[kind] || [(a, s) => s];
    const out = t => (latin ? translit(t) : t).replace(/\s+/g, ' ').replace(/\s+([.,])/g, '$1').trim();
    for (const sg of signs) for (const v of V) { const t = out(v(a, sg)); if (t.length <= max) return t; }   // първо с пълния подпис
    // и най-краткият не стига – съкращаваме адреса
    const last = V[V.length - 1];
    while (a.length > 3) { a = a.slice(0, -1); const t = out(last(a.trim() + '.', 'КИ')); if (t.length <= max) return t; }
    return out(last('', 'КИ')).slice(0, max);
  }

  /* --- връзка навън: страницата не може сама, минава през приложението --- */
  function nHttp(method, url, headers, body) {
    if (ANDROID && N.http) return new Promise(res => {
      const id = nId(); const cb = window.__kiHttpCb = window.__kiHttpCb || {};
      const t = setTimeout(() => { delete cb[id]; res({ status: 0, body: 'ERR няма отговор' }); }, 75000);
      cb[id] = (s, b) => { clearTimeout(t); delete cb[id]; res({ status: s, body: b }); };
      N.http(id, method, url, JSON.stringify(headers || {}), body || '');
    });
    if (DESK && N.http) return N.http(method, url, JSON.stringify(headers || {}), body || '');
    return Promise.resolve({ status: 0, body: 'ERR Работи в приложението за телефон и компютър (обнови го)' });
  }
  const SMSW = {};
  window.KIM_smsCb = (id, ok, err) => { const w = SMSW[id]; if (w && w.res) { w.res({ ok, err }); w.res = null; } };
  window.KIM_smsDlv = (id, ok) => { const w = SMSW[id]; if (w && w.onDlv) w.onDlv(ok); delete SMSW[id]; };
  let smsPermRes = null;
  window.KIM_smsPerm = ok => { if (smsPermRes) { smsPermRes(ok); smsPermRes = null; } };
  function simPerm() {
    if (!ANDROID || !N.smsPerm) return Promise.resolve(false);
    if (N.smsPerm() === 'OK') return Promise.resolve(true);
    return new Promise(res => { smsPermRes = res; setTimeout(() => { if (smsPermRes) { smsPermRes(false); smsPermRes = null; } }, 90000); });
  }
  function simSend(to, text, onDlv) {
    return new Promise(res => {
      const id = nId(); SMSW[id] = { res, onDlv };
      const r = String(N.simSms(id, '+' + to, text));
      if (!/^OK/.test(r)) { delete SMSW[id]; res({ ok: false, err: r === 'PERM' ? 'Няма разрешение за SMS' : r.replace(/^ERR\s*/, '') }); return; }
      setTimeout(() => { const w = SMSW[id]; if (w && w.res) { w.res({ ok: false, err: 'Телефонът не потвърди изпращането' }); w.res = null; } }, 45000);
    });
  }
  const SMSAPI_ERR = { 8: 'грешка в заявката', 11: 'съобщението е твърде дълго', 13: 'грешен номер', 14: 'името на подателя не е одобрено', 101: 'грешен ключ (token)', 102: 'грешен ключ (token)', 103: 'няма достатъчно кредит', 105: 'забранен адрес' };
  const smsBase = cfg => (cfg.smsBase || NCFG_DEF.smsBase).replace(/\/+$/, '');
  const smsHdr = cfg => ({ Authorization: 'Bearer ' + String(cfg.smsToken || '').trim(), 'Content-Type': 'application/x-www-form-urlencoded' });
  const jsonOf = t => { try { return JSON.parse(t); } catch (e) { return null; } };
  async function smsapiSend(cfg, to, text) {
    const p = new URLSearchParams({ to, message: text, format: 'json', encoding: 'utf-8' });
    if (cfg.smsFrom) p.set('from', cfg.smsFrom.trim());
    const r = await nHttp('POST', smsBase(cfg) + '/sms.do', smsHdr(cfg), p.toString());
    const j = jsonOf(r.body);
    if (j && j.list && j.list.length) { const x = j.list[0]; return x.error ? { ok: false, err: SMSAPI_ERR[x.error] || 'грешка ' + x.error } : { ok: true, sid: x.id }; }
    if (j && j.error) return { ok: false, err: SMSAPI_ERR[j.error] || j.message || 'грешка ' + j.error };
    return { ok: false, err: String(r.body || 'Грешка ' + r.status).replace(/^ERR\s*/, '').replace(/<[^>]+>/g, ' ').trim().slice(0, 160) };
  }
  async function brevoSend(cfg, email, subject, text, att) {
    const body = { sender: { name: cfg.mailName || COMPANY, email: String(cfg.mailFrom || '').trim() }, to: [{ email }], subject, textContent: text,
      htmlContent: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.55;color:#0d1626">${esc(text).replace(/\n/g, '<br>')}</div>` };
    if (att) body.attachment = [{ name: att.name, content: att.b64 }];
    const r = await nHttp('POST', 'https://api.brevo.com/v3/smtp/email', { 'api-key': String(cfg.brevoKey || '').trim(), 'Content-Type': 'application/json', Accept: 'application/json' }, JSON.stringify(body));
    if (r.status >= 200 && r.status < 300) return { ok: true };
    const j = jsonOf(r.body);
    return { ok: false, err: (j && j.message) || String(r.body || 'Грешка ' + r.status).replace(/^ERR\s*/, '').slice(0, 160) };
  }
  async function invitationPdf(mid) {
    const d = D.m[mid] || await loadMeeting(mid);
    const res = await fetch(`/api/meetings/${mid}/invitation-html`, { credentials: 'same-origin' });
    if (!res.ok) throw new Error('Поканата още не може да се направи');
    return { blob: buildPdf(await htmlToPages(await res.text(), false), false), name: `Покана - ${fileSafe((d.building || {}).name)} - ${bgDate(d.meeting.meeting_date)}.pdf` };
  }

  /* --- отчет --- */
  const NL = {};
  async function nLog(mid, fresh) {
    if (NL[mid] && !fresh) return NL[mid];
    const r = await REM.get('ki_n_' + mid).catch(() => undefined);
    const got = (r && r.runs) ? r : (LS.get('n_' + mid, null) || { runs: [] });
    // това, което се праща от това устройство, е по-ново – пазим същите редове (там идва „доставено“)
    if (NL[mid]) { const mine = {}; NL[mid].runs.forEach(x => { mine[x.id] = x; }); got.runs = got.runs.map(x => mine[x.id] || x); NL[mid].runs.forEach(x => { if (!got.runs.includes(x) && x.items.some(i => i.st === 'wait' || i.st === 'ok')) got.runs.unshift(x); }); }
    NL[mid] = got;
    return NL[mid];
  }
  async function nSave(mid) { const L = NL[mid]; if (!L) return; LS.set('n_' + mid, L); await REM.set('ki_n_' + mid, L).catch(() => {}); }
  let nSaveT = null;
  const nSaveSoon = mid => { clearTimeout(nSaveT); nSaveT = setTimeout(() => nSave(mid), 2500); };
  const ST = { wait: ['⏳', 'чака'], ok: ['☑️', 'изпратено'], dlv: ['✅', 'доставено'], err: ['❌', 'не стигна'], open: ['📨', 'в пощата – натисни „Изпрати“'], vbo: ['💬', 'отворено във Viber'] };
  function nCount(r) {
    const c = { sms: 0, mail: 0, vb: 0, dlv: 0, ok: 0, err: 0, wait: 0, open: 0, vbo: 0 };
    for (const i of r.items) { c[i.ch]++; c[i.st] = (c[i.st] || 0) + 1; }
    return c;
  }
  const nSum = c => [c.sms ? `📱 ${c.sms} SMS` : '', c.vb ? `💬 ${c.vb} Viber · ${c.vbo} отворени` : '', c.mail ? `📧 ${c.mail} имейла` : '', c.dlv ? `✅ ${c.dlv} доставени` : '', c.ok ? `☑️ ${c.ok} изпратени` : '', c.open ? `📨 ${c.open} в пощата` : '', c.wait ? `⏳ ${c.wait} чакат` : '', c.err ? `❌ ${c.err} не стигнаха` : ''].filter(Boolean).join(' · ');

  // Изпраща и записва отчета. o: { kind, label, sms, mail, smsText, subj, mailText, pdf, only }
  async function sendRun(mid, o) {
    const cfg = ncfg(), d = D.m[mid] || await loadMeeting(mid);
    const rc = o.only ? null : await recipientsOf(d);
    const L = await nLog(mid, true);
    const items = o.only ? o.only.map(i => ({ ch: i.ch, to: i.to, show: i.show, who: i.who }))
      : [...(o.sms ? rc.sms.map(r => ({ ch: 'sms', ...r })) : []), ...(o.mail ? rc.mail.map(r => ({ ch: 'mail', ...r })) : [])];
    if (!items.length) throw new Error('Няма на кого да се прати');
    const hasSms = items.some(i => i.ch === 'sms'), hasMail = items.some(i => i.ch === 'mail');
    if (hasSms) {
      if (cfg.sms === 'off') throw new Error('SMS е изключен – виж ⚙️ Настройки');
      if (cfg.sms === 'sim' && !ANDROID) throw new Error('През SIM карта се праща само от телефона. На компютъра избери SMSAPI.bg в ⚙️ Настройки');
      if (cfg.sms === 'smsapi' && !cfg.smsToken) throw new Error('Липсва ключът (token) от SMSAPI.bg – виж ⚙️ Настройки');
      if (cfg.sms === 'sim' && !await simPerm()) throw new Error('Разреши на „Протоколи КИ“ да праща SMS (Настройки на телефона → Приложения → Протоколи КИ → Разрешения → SMS)');
    }
    if (hasMail && cfg.mail === 'brevo' && (!cfg.brevoKey || !validEmail(String(cfg.mailFrom || '').trim()))) throw new Error('За Brevo трябват ключ и имейл на подателя – виж ⚙️ Настройки');
    const run1 = { id: nId(), at: stamp(), kind: o.kind, label: o.label || NK[o.kind][1], smsVia: hasSms ? cfg.sms : '', mailVia: hasMail ? cfg.mail : '',
      text: o.smsText, subj: o.subj, mtext: o.mailText, pdf: !!o.pdf, items: items.map(i => ({ ...i, st: 'wait', err: '' })) };
    L.runs.unshift(run1); L.runs = L.runs.slice(0, 40);
    await nSave(mid);
    const smsI = run1.items.filter(i => i.ch === 'sms'), mailI = run1.items.filter(i => i.ch === 'mail');
    let k = 0;
    for (const it of smsI) {
      busyText(`📱 SMS ${++k} от ${smsI.length} · ${it.show}`);
      const r = cfg.sms === 'sim'
        ? await simSend(it.to, o.smsText, ok => { if (ok) { it.st = 'dlv'; nSaveSoon(mid); } })
        : await smsapiSend(cfg, it.to, o.smsText);
      if (it.st !== 'dlv') it.st = r.ok ? 'ok' : 'err';
      it.err = r.ok ? '' : (r.err || 'грешка'); if (r.sid) it.sid = r.sid;
      if (k % 5 === 0) nSave(mid);
      if (cfg.sms === 'sim' && k < smsI.length) await sleep(1500);   // да не ни спре операторът
    }
    if (mailI.length) {
      let att = null;
      if (o.pdf) { busyText('📎 Правя PDF на поканата…'); att = await invitationPdf(mid).catch(() => null); }
      if (cfg.mail === 'brevo') {
        const a = att ? { name: att.name, b64: await b64(att.blob) } : null; k = 0;
        for (const it of mailI) {
          busyText(`📧 Имейл ${++k} от ${mailI.length} · ${it.show}`);
          const r = await brevoSend(cfg, it.to, o.subj, o.mailText, a);
          it.st = r.ok ? 'ok' : 'err'; it.err = r.ok ? '' : r.err;
        }
      } else {
        // Gmail: отваря пощата с всички като скрито копие – остава само „Изпрати“
        const bcc = mailI.map(i => i.to).join(',');
        let uri = null;
        if (att && N && N.saveFile) uri = await N.saveFile(att.name, await b64(att.blob), 'application/pdf').catch(() => null);
        if (uri && /^ERR/.test(uri)) uri = null;
        if (ANDROID && uri) N.shareTo(uri, 'application/pdf', 'email', bcc, o.subj, o.mailText);
        else if (N && N.mailTo) { N.mailTo(bcc, o.subj, o.mailText + (att ? '\n\n(поканата е в приложения файл)' : '')); if (DESK && uri) N.shareFile(uri); }
        else location.href = `mailto:?bcc=${encodeURIComponent(bcc)}&subject=${encodeURIComponent(o.subj)}&body=${encodeURIComponent(o.mailText)}`;
        mailI.forEach(i => { i.st = 'open'; });
        if (DESK && uri) toast('Пощата е отворена. Поканата (PDF) е маркирана в папката – завлечи я в писмото', false);
      }
    }
    await nSave(mid);
    return run1;
  }

  /* --- 💬 Viber от моя телефон: един по един, с готовия текст --- */
  function viberOpen(to, text) {
    if (N && N.viberChat) return N.viberChat('+' + to, text);
    location.href = `viber://chat?number=%2B${to}&draft=${encodeURIComponent(text)}`;
  }
  async function nViber(mid, kind, text) {
    const d = D.m[mid] || await loadMeeting(mid), rc = await recipientsOf(d);
    if (!rc.sms.length) { toast('Няма мобилни номера', true); return; }
    await nLog(mid, true);
    const run1 = { id: nId(), at: stamp(), kind, label: NK[kind][1] + ' – Viber', smsVia: '', mailVia: '', vb: true, text, items: rc.sms.map(r => ({ ch: 'vb', ...r, st: 'wait', err: '' })) };
    NL[mid].runs.unshift(run1); NL[mid].runs = NL[mid].runs.slice(0, 40);
    await nSave(mid);
    nViberSheet(mid, run1.id);
  }
  function nViberSheet(mid, rid) {
    const r = (NL[mid] || { runs: [] }).runs.find(x => x.id === rid); if (!r) return;
    const body = () => {
      const left = r.items.filter(i => i.st === 'wait');
      return `<div class="row"><h2 class="grow">💬 Viber – един по един</h2><button class="btn lite sm" data-x="close">✕</button></div>
        <div class="mut">„Следващ“ отваря Viber при човека с готовия текст → натискаш „Изпрати“ → връщаш се тук. Текстът е и копиран – ако не е в полето, задръж и „Постави“.</div>
        <div class="okbox" style="margin:10px 0">Отворени ${r.items.length - left.length} от ${r.items.length}</div>
        ${left.length ? `<button class="btn big col" data-x="next" style="background:#7360f2;color:#fff"><span>💬 Следващ: ${esc(left[0].show)}</span><span style="font-weight:400;font-size:.8em">${esc(left[0].who)}</span></button>` : '<div class="okbox">✅ Всички са отворени във Viber</div>'}
        ${r.items.map((i, k) => `<div class="iss row" style="gap:8px"><div class="grow">${i.st === 'wait' ? '⏳' : '✅'} <b>${esc(i.show)}</b><br><span class="mut">${esc(i.who)}</span></div><button class="btn lite sm" data-x="one" data-k="${k}">${i.st === 'wait' ? 'Отвори' : 'Пак'}</button></div>`).join('')}
        <label class="l">Текст</label><div class="iss">${esc(r.text)}</div>
        <button class="btn out" data-x="done">Готово</button>`;
    };
    const m = sheet(body()), sh = m.querySelector('.sheet');
    const open = it => { viberOpen(it.to, r.text); it.st = 'vbo'; nSaveSoon(mid); const y = sh.scrollTop; sh.innerHTML = body(); sh.scrollTop = y; };
    sh.addEventListener('click', e => {
      const b = e.target.closest('[data-x]'); if (!b) return;
      const x = b.dataset.x;
      if (x === 'close' || x === 'done') { nSave(mid); m.remove(); if (/\/end$/.test(location.hash)) render(true); return; }
      if (x === 'next') { const it = r.items.find(i => i.st === 'wait'); if (it) open(it); }
      if (x === 'one') open(r.items[+b.dataset.k]);
    });
  }

  /* --- карта в „Подписи и край“ --- */
  async function nCard(mid, d) {
    const L = await nLog(mid, true), closed = isClosed(d.meeting);
    const inv = L.runs.find(r => r.kind === 'invite');
    const rows = L.runs.slice(0, 6).map(r => `<button class="item" data-act="nRun" data-r="${r.id}"><span style="font-size:1.4em">${(NK[r.kind] || NK.custom)[0]}</span>
      <div class="grow"><div class="ttl">${esc(r.label)}</div><div class="mut">${esc(r.at)} · ${nSum(nCount(r))}</div></div><span class="arr">›</span></button>`).join('');
    return `<div class="card" id="k-notify"><h2>📣 Покани и известия – SMS и имейл</h2>
      ${!closed && !inv ? '<div class="iss w">⚠️ Поканата още не е пратена на собствениците по SMS и имейл.</div>' : ''}
      ${!closed ? `<button class="btn big ${inv ? 'lite' : 'gold'}" data-act="nSend" data-k="invite">✉️ ${inv ? 'Покана отново' : 'Изпрати поканата – SMS и имейл'}</button>
        <button class="btn lite" data-act="nSend" data-k="remind">⏰ Напомняне (ден преди събранието)</button>`
        : '<button class="btn gold" data-act="nSend" data-k="done">📌 Протоколът е готов – SMS и имейл</button>'}
      <button class="btn lite" data-act="nSend" data-k="custom">💬 Друго съобщение до всички</button>
      ${rows ? `<label class="l">Изпратено</label>${rows}` : ''}
      <button class="btn out" data-act="nCfg">⚙️ Настройки за SMS и имейл</button></div>`;
  }

  /* --- прозорец „Изпрати“ --- */
  async function nSendSheet(mid, kind, intro) {
    const d = D.m[mid] || await run('Зареждам…', () => loadMeeting(mid)); if (!d) return;
    const cfg = ncfg(), rc = await recipientsOf(d), t = nTexts(d, kind);
    const via = { sim: 'през SIM картата на телефона', smsapi: 'през SMSAPI.bg', off: 'изключен' }[cfg.sms];
    const viaM = cfg.mail === 'brevo' ? 'автоматично през Brevo' : 'отваря Gmail – всички като скрито копие';
    const cb = (id, on, dis) => `<input id="${id}" type="checkbox" ${on ? 'checked' : ''} ${dis ? 'disabled' : ''} style="width:28px;height:28px;min-height:0;flex:none">`;
    const smsOk = cfg.sms !== 'off' && !(cfg.sms === 'sim' && !ANDROID);
    const lst = (arr, f) => arr.map(f).join('') || '<div class="mut">—</div>';
    const m = sheet(`<h2>${NK[kind][0]} ${NK[kind][1]}</h2>
      ${intro ? `<div class="okbox" style="margin-bottom:10px">${esc(intro)}</div>` : ''}
      <div class="mut">${esc((d.building || {}).name || '')} · ${bgDate(d.meeting.meeting_date)} ${esc(String(d.meeting.meeting_time || '').slice(0, 5))}</div>
      <label class="row" style="margin-top:14px;gap:12px;font-weight:700">${cb('n-sms', smsOk && rc.sms.length, !smsOk || !rc.sms.length)} 📱 SMS до ${rc.sms.length} номера</label>
      <div class="mut" style="margin:2px 0 6px 40px">${smsOk ? via : cfg.sms === 'off' ? 'SMS е изключен в настройките' : 'на компютъра – само през SMSAPI.bg (⚙️ Настройки)'}</div>
      <textarea id="n-st" rows="3">${esc(t.sms)}</textarea><div class="mut" id="n-cnt"></div>
      <label class="row" style="margin-top:6px;gap:12px;font-weight:600">${cb('n-lat', cfg.latin)} 🔤 Латиница – 160 знака в 1 SMS (на кирилица са 70)</label>
      <label class="row" style="margin-top:14px;gap:12px;font-weight:700">${cb('n-mail', rc.mail.length, !rc.mail.length)} 📧 Имейл до ${rc.mail.length}</label>
      <div class="mut" style="margin:2px 0 6px 40px">${viaM}</div>
      <label class="l">Тема</label><input id="n-subj" value="${esc(t.subj)}">
      <label class="l">Текст</label><textarea id="n-mt" rows="9">${esc(t.mail)}</textarea>
      ${kind === 'invite' ? `<label class="row" style="margin-top:10px;gap:12px;font-weight:600">${cb('n-pdf', cfg.pdf)} 📎 Прикачи поканата (PDF)</label>` : ''}
      <details style="margin-top:12px"><summary style="font-weight:700;cursor:pointer">👥 Получатели (${rc.sms.length + rc.mail.length})${rc.none.length ? ` · ${rc.none.length} без телефон и имейл` : ''}</summary>
        <label class="l">📱 Телефони</label>${lst(rc.sms, r => `<div class="iss">${esc(r.show)} <span class="mut">· ${esc(r.who)}</span></div>`)}
        <label class="l">📧 Имейли</label>${lst(rc.mail, r => `<div class="iss">${esc(r.show)} <span class="mut">· ${esc(r.who)}</span></div>`)}
        ${rc.bad.length ? `<label class="l">⚠️ Не са мобилни – без SMS</label>${lst(rc.bad, r => `<div class="iss w">${esc(r.v)} <span class="mut">· ${esc(r.who)}</span></div>`)}` : ''}
        ${rc.none.length ? `<label class="l">Без телефон и имейл</label><div class="mut">${esc(rc.none.join(' · '))}</div><div class="mut" style="margin-top:6px">Телефонът се добавя в картата на обекта (пълната версия) или при подписа.</div>` : ''}
      </details>
      <button class="btn big gold" data-x="go">📣 Изпрати</button>
      ${rc.sms.length ? `<button class="btn lite" data-x="vb" style="color:#7360f2">💬 През моя Viber – един по един (${rc.sms.length})</button>` : ''}
      <div class="grid2"><button class="btn out" data-x="cfg">⚙️ Настройки</button><button class="btn out" data-x="close">Отказ</button></div>`);
    const q = s => m.querySelector(s), st = q('#n-st');
    const cnt = () => { const p = smsParts(st.value.trim()), el = q('#n-cnt');
      el.innerHTML = `${p.n} от ${p.uc ? 70 : 160} знака · <b>${p.parts} SMS</b> на човек${rc.sms.length ? ` · общо ${p.parts * rc.sms.length} SMS` : ''}${p.parts > 1 ? ' – <b>съкрати текста или избери латиница</b>' : ' ✓'}`;
      el.style.color = p.parts > 1 ? 'var(--bad)' : 'var(--ok)'; };
    st.addEventListener('input', cnt); cnt();
    q('#n-lat').onchange = () => { const lat = q('#n-lat').checked; LS.set('ncfg', Object.assign(LS.get('ncfg', {}), { latin: lat })); st.value = smsFit(d, kind, lat); cnt(); };
    q('[data-x=close]').onclick = () => m.remove();
    q('[data-x=cfg]').onclick = () => { m.remove(); nCfgSheet(); };
    const vbBtn = q('[data-x=vb]');
    if (vbBtn) vbBtn.onclick = () => { m.remove(); nViber(mid, kind, smsFit(d, kind, false, 1000)).catch(e => toast(e.message || String(e), true)); };
    q('[data-x=go]').onclick = async () => {
      const o = { kind, label: NK[kind][1], sms: q('#n-sms').checked, mail: q('#n-mail').checked, smsText: st.value.trim(), subj: q('#n-subj').value.trim(), mailText: q('#n-mt').value.trim(), pdf: !!(q('#n-pdf') && q('#n-pdf').checked) };
      if (!o.sms && !o.mail) { toast('Избери SMS и/или имейл', true); return; }
      if (o.sms && o.smsText.length < 5) { toast('Напиши текста на SMS-а', true); return; }
      if (kind === 'invite') LS.set('ncfg', Object.assign(LS.get('ncfg', {}), { pdf: o.pdf }));
      m.remove();
      const r = await run('Изпращам…', () => sendRun(mid, o));
      if (r) { if (curMid() === mid && /\/end$/.test(location.hash)) render(true); nRunSheet(mid, r.id); }
    };
  }

  /* --- отчет на едно изпращане --- */
  async function nRunSheet(mid, rid) {
    const L = await nLog(mid); const r = L.runs.find(x => x.id === rid); if (!r) return;
    const body = () => {
      const fail = r.items.filter(i => i.st === 'err');
      const row = i => `<div class="iss ${i.st === 'err' ? 'w' : ''}">${ST[i.st][0]} ${i.ch === 'sms' ? '📱' : i.ch === 'vb' ? '💬' : '📧'} <b>${esc(i.show)}</b> <span class="mut">· ${esc(i.who || '')}</span><br><span class="mut">${esc(ST[i.st][1])}${i.err ? ' – ' + esc(i.err) : ''}</span></div>`;
      return `<h2>${(NK[r.kind] || NK.custom)[0]} ${esc(r.label)}</h2><div class="mut">${esc(r.at)}${r.smsVia ? ` · SMS ${r.smsVia === 'sim' ? 'през SIM' : 'през SMSAPI.bg'}` : ''}${r.mailVia ? ` · имейл ${r.mailVia === 'brevo' ? 'през Brevo' : 'през Gmail'}` : ''}</div>
        <div class="okbox" style="margin:10px 0">${nSum(nCount(r)) || '—'}</div>
        ${r.vb ? `<button class="btn gold" data-x="vbgo" style="color:#fff;background:#7360f2">💬 ${r.items.some(i => i.st === 'wait') ? 'Продължи във Viber' : 'Отвори списъка за Viber'}</button>` : ''}
        ${fail.length ? `<button class="btn gold" data-x="retry">🔁 Прати пак на неуспешните (${fail.length})</button>` : ''}
        ${r.items.some(i => i.sid && i.st === 'ok') ? '<button class="btn lite" data-x="chk">🔄 Провери доставката (SMSAPI)</button>' : ''}
        ${r.items.map(row).join('')}
        ${r.text ? `<label class="l">Текст на SMS</label><div class="iss">${esc(r.text)}</div>` : ''}
        <button class="btn out" data-x="close">Готово</button>`;
    };
    const m = sheet(body()), sh = m.querySelector('.sheet');
    const wire = () => {
      const on = (k, f) => { const el = m.querySelector(`[data-x=${k}]`); if (el) el.onclick = f; };
      on('close', () => m.remove());
      on('vbgo', () => { m.remove(); nViberSheet(mid, r.id); });
      on('retry', async () => {
        const only = r.items.filter(i => i.st === 'err'); m.remove();
        const x = await run('Изпращам пак…', () => sendRun(mid, { kind: r.kind, label: r.label + ' (повторно)', smsText: r.text, subj: r.subj, mailText: r.mtext, pdf: r.pdf, only }));
        if (x) { if (/\/end$/.test(location.hash)) render(true); nRunSheet(mid, x.id); }
      });
      on('chk', async () => {
        const cfg = ncfg(), ids = r.items.filter(i => i.sid && i.st === 'ok');
        await run('Проверявам…', async () => {
          const res = await nHttp('GET', `${smsBase(cfg)}/sms.do?status=${encodeURIComponent(ids.map(i => i.sid).join('|'))}&format=json`, smsHdr(cfg), '');
          const j = jsonOf(res.body);
          ((j && j.list) || []).forEach(x => { const it = ids.find(i => String(i.sid) === String(x.id)); if (!it) return;
            const s = String(x.status || '').toUpperCase();
            if (s === 'DELIVERED') it.st = 'dlv'; else if (/UNDELIVERED|FAILED|EXPIRED|REJECTED|NOT_FOUND/.test(s)) { it.st = 'err'; it.err = 'операторът: ' + s; } });
          if (!j || !j.list) toast('SMSAPI не върна статус – опитай след малко', true);
          await nSave(mid);
        });
        sh.innerHTML = body(); wire();
      });
    };
    wire();
    // SMS през SIM: „доставено“ идва по-късно – обновяваме, докато прозорецът е отворен
    const iv = setInterval(() => { if (!m.isConnected) { clearInterval(iv); return; } if (r.items.some(i => i.st === 'ok' && i.ch === 'sms' && r.smsVia === 'sim')) { const y = sh.scrollTop; sh.innerHTML = body(); sh.scrollTop = y; wire(); } }, 4000);
  }

  /* --- ⚙️ Настройки --- */
  function nCfgSheet() {
    const c = ncfg();
    const seg = (name, opts) => `<div class="seg" data-seg="${name}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" class="${c[name] === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    const m = sheet(`<div class="row"><h2 class="grow">⚙️ SMS и имейл</h2><button class="btn lite sm" data-x="close">✕</button></div>
      <label class="l">📱 SMS се праща</label>
      ${seg('sms', [...(ANDROID ? [['sim', 'SIM картата']] : []), ['smsapi', 'SMSAPI.bg'], ['off', 'Без SMS']])}
      <div data-for="sms:sim" class="mut" style="margin-top:8px">От номера на този телефон, по тарифата ти. Първия път телефонът ще пита за разрешение. Вижда се „изпратено“ и „доставено“.</div>
      <div data-for="sms:smsapi">
        <label class="l">Ключ (API token)</label><input id="c-tok" type="password" autocomplete="off" value="${esc(c.smsToken)}" placeholder="от portal.smsapi.bg → API → Tokens">
        <label class="l">Име на подателя</label><input id="c-from" value="${esc(c.smsFrom)}" placeholder="напр. KapInvest – одобрено в SMSAPI; празно = по подразбиране">
        <label class="l">Сървър</label><div class="seg" data-seg="smsBase">${[['https://api.smsapi.bg', 'smsapi.bg'], ['https://api.smsapi.com', 'smsapi.com']].map(([v, l]) => `<button type="button" data-v="${v}" class="${c.smsBase === v ? 'on' : ''}">${l}</button>`).join('')}</div>
        <button class="btn lite" data-x="pts">💰 Провери сметката</button><div class="mut" id="c-pts"></div>
      </div>
      <label class="l">Подпис в SMS</label><input id="c-sign" value="${esc(c.sign)}">
      <label class="l" style="margin-top:18px">📧 Имейлът се праща</label>
      ${seg('mail', [['gmail', 'Gmail (ти натискаш Изпрати)'], ['brevo', 'Brevo – автоматично']])}
      <div data-for="mail:gmail" class="mut" style="margin-top:8px">Отваря Gmail с всички адреси като скрито копие и прикачената покана – натискаш само „Изпрати“.</div>
      <div data-for="mail:brevo">
        <div class="mut" style="margin-top:8px">Безплатно до 300 имейла на ден. Регистрация в brevo.com → SMTP &amp; API → API Keys. Подателят трябва да е потвърден в Brevo (най-добре адрес на capitalinvest.bg).</div>
        <label class="l">Brevo ключ (API key)</label><input id="c-bk" type="password" autocomplete="off" value="${esc(c.brevoKey)}" placeholder="xkeysib-…">
        <label class="l">Имейл на подателя</label><input id="c-mf" type="email" autocapitalize="none" value="${esc(c.mailFrom)}" placeholder="office@capitalinvest.bg">
        <label class="l">Име на подателя</label><input id="c-mn" value="${esc(c.mailName)}">
      </div>
      <label class="l" style="margin-top:18px">🧪 Проба</label>
      <div class="row"><input id="c-tp" type="tel" inputmode="tel" class="grow" placeholder="твоят телефон" value="${esc(LS.get('ntp', ''))}"><button class="btn lite sm" data-x="tsms">SMS</button></div>
      <div class="row" style="margin-top:8px"><input id="c-te" type="email" autocapitalize="none" class="grow" placeholder="твоят имейл" value="${esc(LS.get('nte', ''))}"><button class="btn lite sm" data-x="tmail">Имейл</button></div>
      <div class="mut" style="margin-top:6px">Ключовете се пазят само на това устройство.</div>
      <button class="btn big" data-x="save">✓ Запиши</button>`);
    const q = s => m.querySelector(s);
    const show = () => m.querySelectorAll('[data-for]').forEach(el => { const [k, v] = el.dataset.for.split(':'); el.hidden = c[k] !== v; });
    m.querySelectorAll('[data-seg]').forEach(g => g.addEventListener('click', e => { const b = e.target.closest('button[data-v]'); if (!b) return; c[g.dataset.seg] = b.dataset.v; g.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); show(); }));
    show();
    const read = () => Object.assign(c, { smsToken: q('#c-tok').value.trim(), smsFrom: q('#c-from').value.trim(), sign: q('#c-sign').value.trim(), brevoKey: q('#c-bk').value.trim(), mailFrom: q('#c-mf').value.trim(), mailName: q('#c-mn').value.trim() });
    const save = () => { read(); LS.set('ncfg', c); };
    q('[data-x=close]').onclick = () => m.remove();
    q('[data-x=save]').onclick = () => { save(); m.remove(); toast('Записано ✓'); if (/\/end$/.test(location.hash)) render(true); };
    q('[data-x=pts]').onclick = async () => {
      save();
      const r = await run('Проверявам…', () => nHttp('GET', smsBase(c) + '/profile', smsHdr(c), ''));
      const j = r && jsonOf(r.body);
      q('#c-pts').textContent = j && j.points != null ? `✅ Връзката е наред · кредит: ${j.points}` : j && j.error ? `❌ ${SMSAPI_ERR[j.error] || j.message || j.error}` : `❌ ${String((r && r.body) || '').replace(/^ERR\s*/, '').slice(0, 120) || 'няма отговор'}`;
    };
    q('[data-x=tsms]').onclick = async () => {
      save(); const tel = q('#c-tp').value.trim(); LS.set('ntp', tel);
      const p = phonesOf(tel).mob[0]; if (!p) { toast('Напиши мобилен номер (08…)', true); return; }
      const x = await run('Пращам пробен SMS…', () => sendRunTest('sms', p, `Проба от Протоколи КИ ✓ ${c.sign}`));
      if (x) toast(x.ok ? 'SMS-ът тръгна ✓' : '❌ ' + x.err, !x.ok);
    };
    q('[data-x=tmail]').onclick = async () => {
      save(); const e = q('#c-te').value.trim(); LS.set('nte', e);
      if (!validEmail(e)) { toast('Напиши имейл', true); return; }
      if (c.mail !== 'brevo') { if (N && N.mailTo) N.mailTo(e, 'Проба от Протоколи КИ', 'Здравейте, това е проба.'); else location.href = `mailto:${e}?subject=Проба`; return; }
      const x = await run('Пращам пробен имейл…', () => brevoSend(c, e, 'Проба от Протоколи КИ', `Здравейте,\n\nТова е проба – имейлите от Протоколи КИ работят.\n\n${COMPANY}`));
      if (x) toast(x.ok ? 'Имейлът тръгна ✓' : '❌ ' + x.err, !x.ok);
    };
  }
  async function sendRunTest(ch, p, text) {
    const c = ncfg();
    if (c.sms === 'off') return { ok: false, err: 'SMS е изключен' };
    if (c.sms === 'sim') { if (!ANDROID) return { ok: false, err: 'SIM – само от телефона' }; if (!await simPerm()) return { ok: false, err: 'Няма разрешение за SMS' }; return simSend(p.n, text); }
    if (!c.smsToken) return { ok: false, err: 'Липсва ключ (token)' };
    return smsapiSend(c, p.n, text);
  }

  /* ---------- Действия ---------- */
  const A = {
    login: () => doLogin(),
    menu: () => menu(),
    ai: el => aiRewrite(el),
    dict: el => dictToggle(el),
    upd: el => { el.closest('.menu').remove(); return run('Проверявам за нова версия…', () => checkUpdate(true)); },
    ordReset: el => { LS.del('border'); el.closest('.menu').remove(); render(true); toast('Входовете са по подразбиране'); },
    rec: () => recSheet(),
    nSend: el => nSendSheet(curMid(), el.dataset.k),
    nRun: el => nRunSheet(curMid(), el.dataset.r),
    nCfg: el => { const mm = el.closest('.menu'); if (mm) mm.remove(); nCfgSheet(); },
    closeMenu: el => el.closest('.menu').remove(),
    reload: () => render(),
    refresh: async el => { el.closest('.menu') && el.closest('.menu').remove(); D.buildings = null; D.all = null; D.b = {}; D.m = {}; D.chair = {}; D.sec = {}; D.det = {}; D.fees = {}; await render(); toast('Обновено'); },
    fs: el => { setFs(LS.get('fs2', FS_DEF) + num(el.dataset.v)); },
    newBuilding: () => newBuildingSheet(),
    logout: async () => { await post('/api/auth/logout').catch(() => {}); D.user = null; location.hash = '#/'; location.reload(); },
    full: el => {
      const mid = el.dataset.m ? +el.dataset.m : null, d = mid && D.m[mid];
      const bid = el.dataset.b ? +el.dataset.b : d ? d.meeting.building_id : null;
      if (mid) KIM.toFull({ m: mid, b: bid, p: el.dataset.p ? +el.dataset.p : null });
      else if (bid) { SS.set('full', true); SS.set('openB', bid); location.hash = ''; location.reload(); }
      else KIM.toFull();
    },
    pickType: el => {
      root.querySelector('#k-type').value = el.dataset.v;
      root.querySelectorAll('.k-type').forEach(b => {
        const on = b === el; b.style.borderColor = on ? 'var(--navy)' : 'var(--line)'; b.style.background = on ? '#eef3fc' : '#fff';
        const t = b.querySelector('.tick'); t.textContent = on ? '✓' : ''; t.style.background = on ? 'var(--navy)' : ''; t.style.borderColor = on ? 'var(--navy)' : '';
      });
    },
    createMeeting: el => createMeeting(+el.dataset.b),
    togAtt: el => togAtt(+el.dataset.u),
    attSheet: el => openAttSheet(+el.dataset.u),
    pick: el => {
      const box = el.closest('[data-pick]'), max = +box.dataset.max || 1;
      if (el.classList.contains('on')) { el.classList.remove('on'); return; }
      const on = [...box.querySelectorAll('button.on')];
      if (on.length >= max) (max === 1 ? on : on.slice(0, 1)).forEach(b => b.classList.remove('on'));
      el.classList.add('on');
    },
    ctlType: el => {
      el.parentNode.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === el));
      const n = el.dataset.v === 'council3' ? 3 : el.dataset.v === 'council5' ? 5 : 1;
      const box = root.querySelector('[data-pick=ctl]'); box.dataset.max = n;
      [...box.querySelectorAll('button.on')].slice(n).forEach(b => b.classList.remove('on'));
      box.previousElementSibling.textContent = `Избери ${n === 1 ? 'контрольора' : n + ' души'}`;
    },
    saveCtl: () => {
      const t = root.querySelector('[data-g=ctl] button.on').dataset.v, n = t === 'council3' ? 3 : t === 'council5' ? 5 : 1;
      const ps = picked('ctl'); if (ps.length !== n) return toast(`Избери ${n === 1 ? 'един човек' : n + ' души'}`, true);
      const d = D.m[curMid()], it = itemFor(d, 'control');
      return withMid('Записвам…', () => post(`/api/agenda/${it.id}/control-details`, { control_type: t, extra_text: '', people: ps.map(p => ({ source_type: 'unit', unit_id: p.unit_id, person_name: p.person_name, property_no: p.property_no, person_quality: 'owner' })) }));
    },
    saveAuth: () => {
      const ps = picked('auth'); if (ps.length !== 1) return toast('Избери един човек', true);
      const d = D.m[curMid()], it = itemFor(d, 'authorization'), p = ps[0];
      return withMid('Записвам…', () => post(`/api/agenda/${it.id}/authorization-details`, { source_type: 'unit', unit_id: p.unit_id, person_name: p.person_name, property_no: p.property_no, person_quality: 'owner', extra_text: '' }));
    },
    termType: el => {
      el.parentNode.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === el));
      root.querySelector('#k-tt').value = el.dataset.v;
      root.querySelectorAll('[data-tt]').forEach(b => { b.hidden = b.dataset.tt === 'reasons' ? el.dataset.v === 'none' : b.dataset.tt !== el.dataset.v; });
    },
    saveTerm: () => {
      const t = root.querySelector('#k-tt').value, d = D.m[curMid()], it = itemFor(d, 'termination');
      const b = { management_type: t, company_name: '', representative_name: '', reasons: t === 'none' ? '' : root.querySelector('#k-trs').value.trim(), people: [] };
      if (t === 'professional') { b.company_name = root.querySelector('#k-tco').value.trim(); b.representative_name = root.querySelector('#k-trep').value.trim(); if (!b.company_name) return toast('Въведи фирмата', true); }
      if (t === 'manager') { const n = root.querySelector('#k-tname').value.trim(); if (!n) return toast('Въведи името', true); b.people = [{ person_name: n, property_no: root.querySelector('#k-tprop').value.replace(/\D/g, '') }]; }
      return withMid('Записвам…', () => post(`/api/agenda/${it.id}/termination-details`, b));
    },
    revMode: el => {
      el.parentNode.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === el));
      root.querySelector('#k-rm').value = el.dataset.v; root.querySelector('[data-rm]').hidden = el.dataset.v !== 'commission';
    },
    saveRev: () => {
      const mode = root.querySelector('#k-rm').value, d = D.m[curMid()], it = itemFor(d, 'revision');
      const ps = mode === 'commission' ? picked('rev') : [];
      if (mode === 'commission' && !ps.length) return toast('Избери поне един член на комисията', true);
      return withMid('Записвам…', () => post(`/api/agenda/${it.id}/revision-details`, { revision_mode: mode, extra_text: '', people: ps.map(p => ({ source_type: 'unit', unit_id: p.unit_id, person_name: p.person_name, property_no: p.property_no, person_quality: 'owner' })) }));
    },
    feeSeg: el => {
      el.parentNode.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === el));
      const g = el.dataset.g; root.querySelector('#k-' + g).value = el.dataset.v;
      if (g === 'om') root.querySelectorAll('[data-om]').forEach(x => { x.hidden = x.dataset.om !== el.dataset.v; });
    },
    feeAdd: () => {
      const key = 'custom_' + Date.now();
      root.querySelector('#k-fees').insertAdjacentHTML('beforeend', `<div class="vrow k-fee" data-key="${key}" data-std="0">
        <label class="row" style="gap:10px"><input type="checkbox" class="k-fact" checked style="width:26px;height:26px;min-height:0;flex:none"><input class="k-fn grow" placeholder="Име на таксата"></label>
        <div class="grid2" style="margin-top:6px"><div><input class="k-fa" inputmode="decimal" placeholder="€"></div>
        <div><select class="k-fb">${BASIS.filter(b => b[0] !== 'floor').map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div></div></div>`);
      const n = root.querySelectorAll('#k-fees .k-fn'); n[n.length - 1].focus();
    },
    saveFee: () => {
      const mid = curMid(), d = D.m[mid], it = itemFor(d, 'fee'), F = D.fees[mid] || { rules: {} }, x = F.details || {};
      const n = v => Number(String(v == null || v === '' ? '0' : v).replace(',', '.'));
      const q = id => root.querySelector(id).value;
      const mode = q('#k-om');
      const det = { manager_fee_amount: n(q('#k-f1')), cashier_fee_amount: n(q('#k-f3')), repair_fund_amount: n(q('#k-f2')), repair_fund_mode: q('#k-rf'),
        operating_mode: mode, operating_common_amount: mode === 'separate' ? 0 : n(q('#k-f4')), operating_common_basis: q('#k-cb'), extra_text: x.extra_text || '' };
      if ([det.manager_fee_amount, det.cashier_fee_amount, det.repair_fund_amount, det.operating_common_amount].some(v => !isFinite(v) || v < 0)) return toast('Сумите трябва да са числа (напр. 2.56)', true);
      const items = [], rules = {};
      if (mode === 'separate') {
        for (const r of root.querySelectorAll('#k-fees .k-fee')) {
          const name = r.querySelector('.k-fn').value.trim(), amount = n(r.querySelector('.k-fa').value), basis = r.querySelector('.k-fb').value, active = r.querySelector('.k-fact').checked;
          if (!name) { if (!active || !amount) continue; return toast('Има такса без име', true); }
          if (!isFinite(amount) || amount < 0) return toast(`„${name}“: сумата трябва да е число`, true);
          items.push({ fee_key: r.dataset.key, fee_name: name, is_standard: +r.dataset.std, amount, basis, is_active: active ? 1 : 0 });
          if (basis === 'floor') {
            const ps = [...r.querySelectorAll('.k-fp')].map(i => ({ rule_type: 'floor', floor_no: +i.dataset.fl, percent: n(i.value) }));
            if (ps.some(p => !isFinite(p.percent) || p.percent < 0)) return toast(`„${name}“: процентите по етажи трябва да са числа`, true);
            rules[r.dataset.key] = { default_percent: 100, items: ps.filter(p => p.percent !== 100) };
          }
        }
        if (!items.some(i => i.is_active)) return toast('Отметни поне една такса', true);
      }
      return withMid('Записвам таксите…', async () => { await saveFees(it.id, { details: det, items, rules, common: mode === 'common' ? F.common : null }); delete D.fees[mid]; toast('Таксите са записани'); });
    },
    chMode: el => {
      root.querySelector('#k-chmode').value = el.dataset.v;
      el.parentNode.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === el));
      if (el.dataset.v === 'absent_manager' && root.querySelector('#k-chsrc').value === 'professional') A.chSrc(root.querySelector('[data-act=chSrc][data-v=unit]'));
      root.querySelector('[data-act=chSrc][data-v=professional]').disabled = el.dataset.v === 'absent_manager';
      root.querySelector('[data-act=chSrc][data-v=professional]').style.opacity = el.dataset.v === 'absent_manager' ? '.35' : '';
    },
    chSrc: el => {
      root.querySelector('#k-chsrc').value = el.dataset.v;
      el.parentNode.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === el));
      ['#k-chco', '#k-chunit', '#k-chname'].forEach((s, i) => { root.querySelector(s).parentNode.hidden = ['professional', 'unit', 'manual'][i] !== el.dataset.v; });
    },
    saveChair: async () => {
      const mid = curMid(); let p; try { p = chairPayload(); } catch (e) { toast(e.message, true); return; }
      const ok = await run('Записвам…', async () => {
        await post(`/api/meetings/${mid}/chair-details`, p);
        LS.set('chair', { mode: p.chair_mode, src: p.source_type, company: p.company_name || COMPANY, rep: p.representative_name });
        await Promise.all([loadChair(mid, true), loadMeeting(mid, true)]); return true;
      });
      if (ok) { toast('Председателят е записан'); render(true); }
    },
    chairAll: async el => { const mid = curMid(); await run('Гласувам…', async () => { await post(`/api/meetings/${mid}/chair-vote-all`, { vote: el.dataset.v }); await loadChair(mid, true); }); render(true); },
    chairVote: async el => { const mid = curMid(); await run('', async () => { await post(`/api/meetings/${mid}/chair-votes`, { attendance_id: +el.dataset.a, vote: el.dataset.v }); await loadChair(mid, true); }); render(true); },
    secMe: async () => {
      const mid = curMid(); const me = (D.user && D.user.display_name) || '';
      if (!me) { toast('Няма име на потребителя – използвай „Друг кандидат“', true); return; }
      await run('Добавям протоколчика…', async () => {
        const r = await post(`/api/meetings/${mid}/secretary-candidates`, { source_type: 'professional', unit_id: null, candidate_name: me, candidate_org: COMPANY, property_no: '', person_quality: 'owner' });
        let id = r && (r.id || (r.candidate && r.candidate.id));
        if (!id) { const s = await loadSec(mid, true); const c = (s.candidates || []).slice(-1)[0]; id = c && c.id; }
        if (id) {
          if ((D.m[mid].attendance || []).length) await post(`/api/secretary-candidates/${id}/vote-all`, { vote: 'ЗА' });
          await patch(`/api/secretary-candidates/${id}/select`);
        }
        await Promise.all([loadSec(mid, true), loadMeeting(mid, true)]);
      });
      render(true);
    },
    scSrc: el => {
      root.querySelector('#k-scsrc').value = el.dataset.v;
      el.parentNode.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === el));
      root.querySelectorAll('[data-sc]').forEach(b => { b.hidden = b.dataset.sc !== el.dataset.v; });
    },
    secAdd: async () => {
      const mid = curMid(), d = D.m[mid], src = root.querySelector('#k-scsrc').value;
      const b = { source_type: src, unit_id: null, candidate_name: '', candidate_org: '', property_no: '', person_quality: 'owner' };
      if (src === 'professional') { b.candidate_name = root.querySelector('#k-scname').value.trim(); b.candidate_org = root.querySelector('#k-scorg').value.trim(); if (!b.candidate_name || !b.candidate_org) return toast('Въведи име и фирма', true); }
      else if (src === 'unit') {
        const uid = +root.querySelector('#k-scunit').value; if (!uid) return toast('Избери от присъстващите', true);
        const a = d.attendance.find(x => num(x.unit_id) === uid) || {};
        Object.assign(b, { unit_id: uid, candidate_name: a.person_name || a.owner_name || '', property_no: String(a.unit_no || '') });
        if (!b.candidate_name) return toast('Този присъстващ няма име', true);
      } else {
        b.candidate_name = root.querySelector('#k-scmname').value.trim(); b.property_no = root.querySelector('#k-scprop').value.replace(/\D/g, '');
        if (!b.candidate_name || !b.property_no) return toast('Въведи три имена и номер на апартамента', true);
      }
      await run('Добавям…', async () => { await post(`/api/meetings/${mid}/secretary-candidates`, b); await loadSec(mid, true); });
      render(true);
    },
    secAll: async el => { const mid = curMid(); await run('Гласувам…', async () => { await post(`/api/secretary-candidates/${el.dataset.c}/vote-all`, { vote: 'ЗА' }); await loadSec(mid, true); }); render(true); },
    secSel: async el => { const mid = curMid(); await run('Записвам…', async () => { await patch(`/api/secretary-candidates/${el.dataset.c}/select`); await Promise.all([loadSec(mid, true), loadMeeting(mid, true)]); }); render(true); },
    secOpen: el => { const b = root.querySelector(`.k-secv[data-c="${el.dataset.c}"]`); if (b) b.hidden = !b.hidden; },
    secVote: async el => { const mid = curMid(); await run('', async () => { await post('/api/secretary-votes', { candidate_id: +el.dataset.c, attendance_id: +el.dataset.a, vote: el.dataset.v }); await loadSec(mid, true); }); render(true); },
    allFor: async () => {
      const mid = curMid(), d = D.m[mid];
      if (!confirm(`Всички ${d.attendance.length} присъстващи гласуват „ЗА“ за председател, протоколчик и всички ${d.agenda.length} точки, и точките се приключват. Продължи?`)) return;
      await run('Гласувам по всички точки…', async () => {
        const ch = await loadChair(mid, true);
        if (ch && ch.details && ch.details.chair_mode === 'absent_manager') await post(`/api/meetings/${mid}/chair-vote-all`, { vote: 'ЗА' }).catch(() => {});
        const s = await loadSec(mid, true);
        for (const c of s.candidates || []) if (num(c.is_selected) || (s.candidates || []).length === 1) await post(`/api/secretary-candidates/${c.id}/vote-all`, { vote: 'ЗА' }).catch(() => {});
        for (const a of d.agenda || []) { busyText(`Точка ${a.item_no}…`); await post(`/api/agenda/${a.id}/vote-all`, { vote: 'ЗА' }); if (num(a.is_completed) !== 1) await patch(`/api/agenda/${a.id}/completed`, { is_completed: 1 }); }
        await Promise.all([loadMeeting(mid, true), loadChair(mid, true), loadSec(mid, true)]);
      });
      toast('Готово – всички ЗА, точките са приключени'); render(true);
    },
    fill: async () => {
      const mid = curMid();
      const r = await run('Попълвам от предишните събрания…', () => autoSetupTextsOnly(mid));
      if (r === 0) toast('Няма какво да попълня – точките вече имат текст');
      else if (r) toast(`Попълних ${r} точки – прегледай имената и сумите`);
      await loadMeeting(mid, true); render(true);
    },
    doneAll: async () => {
      const mid = curMid(), d = D.m[mid];
      if (!confirm('Да маркирам ли всички точки като приключени?')) return;
      await run('Записвам…', async () => { for (const a of d.agenda || []) if (num(a.is_completed) !== 1) await patch(`/api/agenda/${a.id}/completed`, { is_completed: 1 }); await loadMeeting(mid, true); });
      render(true);
    },
    addPoint: async () => {
      const mid = curMid(); const title = await askText('➕ Нова точка', 'Заглавие на точката', 'напр. Смяна на входната врата'); if (!title || !title.trim()) return;
      const r = await run('Добавям…', async () => { const x = await post(`/api/meetings/${mid}/agenda-items`, { title: title.trim() }); await loadMeeting(mid, true); return x; });
      if (r && r.id) go(`#/m/${mid}/p/${r.id}`); else render(true);
    },
    ptAll: async el => {
      const mid = curMid(), aid = curAid(); if (agT) await saveAg();
      await run('Гласувам…', async () => { await post(`/api/agenda/${aid}/vote-all`, { vote: el.dataset.v }); await loadMeeting(mid, true); });
      render(true);
    },
    ptAllMenu: () => {
      const m = sheet(`<h2>Всички присъстващи…</h2>
        <button class="btn bad" data-act="ptAll" data-v="ПРОТИВ">❌ Всички ПРОТИВ</button>
        <button class="btn" style="background:#7a5b00" data-act="ptAll" data-v="ВЪЗДЪРЖАЛ СЕ">✋ Всички ВЪЗДЪРЖАЛИ СЕ</button>
        <button class="btn lite" data-act="closeMenu">Отказ</button>`);
      m.addEventListener('click', e => { if (e.target.closest('[data-act=ptAll]')) setTimeout(() => m.remove(), 0); });
    },
    vote: async el => {
      const mid = curMid(), aid = curAid(); if (agT) await saveAg();
      el.parentNode.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === el));
      await run('', async () => { await post('/api/votes', { meeting_id: mid, agenda_item_id: aid, attendance_id: +el.dataset.a, vote: el.dataset.v }); await loadMeeting(mid, true); });
      render(true);
    },
    done: async el => {
      const mid = curMid(), aid = curAid(), v = +el.dataset.v; if (agT) await saveAg();
      const d = D.m[mid], ag = d.agenda || [], i = ag.findIndex(x => num(x.id) === aid);
      if (v) {
        const missing = (d.attendance || []).filter(p => !(d.votes || []).some(x => num(x.agenda_item_id) === aid && num(x.attendance_id) === num(p.id))).length;
        if (missing && !confirm(`${missing} присъстващи още не са гласували по тази точка. Да я приключа ли все пак?`)) return;
      }
      const ok = await run('Записвам…', async () => { await patch(`/api/agenda/${aid}/completed`, { is_completed: v }); await loadMeeting(mid, true); return true; });
      if (!ok) return;
      if (v) success(`Точка ${ag[i] ? ag[i].item_no : ''} е приключена`);
      if (v && ag[i + 1]) go(`#/m/${mid}/p/${ag[i + 1].id}`); else if (v) go(`#/m/${mid}/end`); else render(true);
    },
    quorum: async el => { const mid = curMid(); await run('Записвам…', async () => { await patch(`/api/meetings/${mid}/quorum`, { quorum_mode: el.dataset.v }); await loadMeeting(mid, true); }); render(true); },
    ctNow: () => { root.querySelector('#k-ct').value = nowHm(); },
    close: async () => {
      const mid = curMid(); const t = (root.querySelector('#k-ct').value || '').slice(0, 5);
      if (!/^\d{1,2}:\d{2}$/.test(t)) return toast('Въведи час като 19:30', true);
      const d = D.m[mid], left = issuesOf(d, D.sec[mid], null, D.det[mid]).out.filter(x => !/не е закрито/.test(x[0]));
      if (!confirm(left.length ? `Още липсват ${left.length} неща, напр.:\n• ${left.slice(0, 4).map(x => x[0]).join('\n• ')}\n\nСлед закриване тези неща се оправят само в пълната версия. Да закрия ли все пак в ${t} ч.?` : `Да закрия ли събранието в ${t} ч.?`)) return;
      await run('Закривам…', async () => { await post(`/api/meetings/${mid}/close`, { closed_time: t, closed_at: new Date().toISOString() }); await loadMeeting(mid, true); delete D.b[D.m[mid].meeting.building_id]; D.all = null; });
      toast('Събранието е закрито'); render(true);
    },
    fix: el => {
      const w = el.dataset.w, mid = curMid();
      if (w === 'full') return A.full({ dataset: { m: String(mid) } });
      if (w === 'sign') { const s = root.querySelector('#k-sign'); if (s) s.scrollIntoView({ behavior: 'smooth' }); return; }
      if (w[0] === 'p') return go(`#/m/${mid}/p/${w.slice(1)}`);
      go(`#/m/${mid}/${w}`);
    },
    signRole: el => signRole(el.dataset.k, el.dataset.r, el.dataset.n),
    pdf: el => makePdf(el.dataset.doc),
    sdoc: el => serverDoc(el.dataset.k),
    posting: el => postingSheet(el.dataset.kind),
    doc: el => openDoc(el.dataset.u),
    dl: el => download(el.dataset.u, el.dataset.n),
    print: () => { if (window.KIPrint) window.KIPrint.open(); else toast('Печатът работи в приложението „Протоколи КИ“', true); },
  };

  // Само текстовете (за вече създадено събрание)
  async function autoSetupTextsOnly(mid) {
    const cur = await api('/api/meetings/' + mid);
    const all = (await allMeetings()).filter(m => m.id !== mid);
    const tm = all.filter(m => m.meeting_type === cur.meeting.meeting_type && isClosed(m)).sort((a, b) => (b.building_id === cur.meeting.building_id) - (a.building_id === cur.meeting.building_id) || ts(b) - ts(a))[0];
    if (!tm) return 0;
    const tpl = await api('/api/meetings/' + tm.id);
    let n = 0;
    for (const a of cur.agenda || []) {
      const s = (tpl.agenda || []).find(x => num(x.item_no) === num(a.item_no));
      if (!s) continue;
      const discussion = String(a.discussion || '').trim() ? a.discussion : (s.discussion || '');
      const proposal = String(a.proposal || '').trim() ? a.proposal : (s.proposal || '');
      if (discussion === (a.discussion || '') && proposal === (a.proposal || '')) continue;
      await patch('/api/agenda/' + a.id, { title: a.title, discussion, proposal, required_majority: a.required_majority, majority_base: a.majority_base });
      n++;
    }
    return n;
  }

  root.addEventListener('click', e => {
    if (e.target.closest('.menu') && !e.target.closest('[data-act],[data-go]')) return;
    const g = e.target.closest('[data-go]');
    if (g && !g.disabled) { e.preventDefault(); const m = g.closest('.menu'); if (m) m.remove(); go(g.dataset.go); return; }
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled || !A[el.dataset.act]) return;
    e.preventDefault();
    Promise.resolve(A[el.dataset.act](el)).catch(err => toast(err.message || String(err), true));
  });
  root.addEventListener('input', e => {
    const t = e.target;
    if (t.id === 'k-q') { SS.set('q', t.value); const l = root.querySelector('#k-bl'); if (l && D.buildings) l.innerHTML = bList(D.buildings.filter(b => !b.status || b.status === 'Активна'), t.value); }
    else if (t.id === 'k-aq') { SS.set('aq', t.value); filterUnits(t.value); }
    else if (t.classList.contains('k-ag')) agInput(t);
  });
  root.addEventListener('change', e => {
    if (e.target.classList && e.target.classList.contains('k-fb')) { const b = e.target.closest('.k-fee').querySelector('.k-ffl'); if (b) b.hidden = e.target.value !== 'floor'; else if (e.target.value === 'floor') toast('По етажи – запиши и отвори отново, за да зададеш процентите'); }
  });
  root.addEventListener('focusout', e => { if (e.target.classList && e.target.classList.contains('k-ag') && agT) saveAg(); });

  window.addEventListener('beforeunload', () => { if (agT) saveAg(); });

  render();
})();
