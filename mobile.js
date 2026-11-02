/* Протоколи КИ – мобилен изглед.
   Работи върху същата Програма за протокол (същите данни и API), само изгледът е направен за телефон:
   входове → вход → събрание (присъствие · председател и протоколчик · точки · край и документи). */
(function () {
  'use strict';
  if (window.KIM) return;

  const ANDROID = !!window.KIAndroid;
  const store = (s, p) => ({
    get(k, d) { try { const v = s.getItem(p + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { s.setItem(p + k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { s.removeItem(p + k); } catch (e) {} },
  });
  const LS = store(window.localStorage, 'kim_');
  const SS = store(window.sessionStorage, 'kim_');

  const isRoot = location.pathname === '/' || location.pathname === '';
  const phone = ANDROID || Math.min(window.innerWidth, (window.screen && window.screen.width) || 9999) < 760;
  const on = isRoot && !SS.get('full', false) && (phone || LS.get('force', false));

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
  const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const nowHm = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const bgDate = iso => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}.${m[2]}.${m[1]}` : (iso || ''); };
  const num = v => Number(v || 0);
  const pct = v => (Math.round(num(v) * 100) / 100).toFixed(2).replace('.', ',') + '%';
  const COMPANY = 'Капитал Инвест България ООД';
  const VOTES = [['ЗА', 'ЗА', 'za'], ['ПРОТИВ', 'ПРОТИВ', 'pr'], ['ВЪЗДЪРЖАЛ СЕ', 'ВЪЗД.', 'vz']];
  const TYPES = [
    ['manager_change', 'Смяна на управител', 'Избор на нов управител (Капитал Инвест)'],
    ['renewal', 'Преподписване', 'Продължаване с настоящия управител'],
    ['regular', 'Редовно събрание', 'Свободен дневен ред'],
  ];
  const typeLabel = t => (TYPES.find(x => x[0] === t) || [, t || ''])[1];
  const fixedLimit = t => (t === 'renewal' ? 7 : t === 'manager_change' ? 8 : 0);
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
  #kim .tabs button { flex:1; padding:8px 2px 10px; display:flex; flex-direction:column; align-items:center; gap:2px; color:var(--mut); font-size:.72em; font-weight:600; border-top:3px solid transparent; }
  #kim .tabs button b { font-size:1.6em; line-height:1.1; font-weight:400; }
  #kim .tabs button.on { color:var(--navy); border-top-color:var(--gold); background:#f6f8fc; }
  #kim .card { background:var(--card); border-radius:16px; padding:14px; margin-bottom:12px; box-shadow:0 1px 3px rgba(11,42,91,.12); }
  #kim h2 { font-size:1.12em; margin:0 0 10px; color:var(--navy); }
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
  #kim .unit { background:#fff; border-radius:14px; margin-bottom:10px; box-shadow:0 1px 3px rgba(11,42,91,.12); border:2px solid transparent; }
  #kim .unit.on { border-color:var(--ok); background:#f6fcf8; }
  #kim .unit .uh { display:flex; align-items:center; gap:12px; width:100%; text-align:left; padding:12px; min-height:64px; }
  #kim .tick { width:40px; height:40px; border-radius:50%; border:3px solid #b9c6dc; flex:none; display:flex; align-items:center; justify-content:center; font-size:1.3em; color:#fff; font-weight:800; }
  #kim .unit.on .tick { background:var(--ok); border-color:var(--ok); }
  #kim .unit .ub { padding:0 12px 12px 64px; }
  #kim .unit .ub > * + * { margin-top:8px; }
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
  #kim .note { background:var(--warnbg); color:#5c4300; border-radius:12px; padding:10px 12px; font-size:.88em; margin-top:10px; }
  #kim .okbox { background:var(--okbg); color:#0b5a31; border-radius:12px; padding:12px; font-weight:600; }
  #kim .toast { position:fixed; left:12px; right:12px; top:calc(env(safe-area-inset-top) + 72px); z-index:5; background:#0d1626; color:#fff; padding:14px 16px;
    border-radius:14px; font-weight:600; box-shadow:0 6px 20px rgba(0,0,0,.35); transition:opacity .25s, transform .25s; }
  #kim .toast.err { background:var(--bad); }
  #kim .toast.hide { opacity:0; transform:translateY(-20px); pointer-events:none; }
  #kim .btn.col { flex-direction:column; gap:2px; }
  #kim .busy { position:fixed; inset:0; z-index:6; background:rgba(11,42,91,.25); display:flex; align-items:center; justify-content:center; }
  #kim .busy div { background:#fff; border-radius:16px; padding:18px 22px; font-weight:700; color:var(--navy); box-shadow:0 6px 20px rgba(0,0,0,.3); display:flex; gap:12px; align-items:center; }
  #kim .spin { width:26px; height:26px; border:4px solid #d6dfee; border-top-color:var(--navy); border-radius:50%; animation:kimspin .8s linear infinite; }
  @keyframes kimspin { to { transform:rotate(360deg); } }
  #kim .menu { position:fixed; inset:0; z-index:7; background:rgba(5,15,35,.5); display:flex; flex-direction:column; justify-content:flex-end; }
  #kim .menu .sheet { background:#fff; border-radius:20px 20px 0 0; padding:14px 14px calc(14px + env(safe-area-inset-bottom)); max-height:88vh; overflow:auto; }
  #kim .login { max-width:460px; margin:8vh auto 0; }
  #kim .logo { text-align:center; color:var(--navy); margin-bottom:18px; }
  #kim .logo b { display:block; font-size:1.6em; } #kim .logo span { color:var(--mut); }
  #kim .empty { text-align:center; color:var(--mut); padding:30px 10px; }
  #kim .stick { position:sticky; bottom:-28px; background:linear-gradient(transparent, var(--bg) 30%); padding:14px 0 6px; margin:0 -2px; }
  `;
  const st = document.createElement('style'); st.id = 'kim-css'; st.textContent = css; document.head.appendChild(st);
  document.documentElement.classList.add('kim-on');

  const root = document.createElement('div'); root.id = 'kim';
  root.innerHTML = `<div class="top"></div><div class="main"></div><div class="tabs" hidden></div><div class="toast hide"></div>`;
  document.body.appendChild(root);
  const $top = root.querySelector('.top'), $main = root.querySelector('.main'), $tabs = root.querySelector('.tabs'), $toast = root.querySelector('.toast');
  const setFs = v => { v = Math.max(15, Math.min(26, v)); LS.set('fs', v); root.style.setProperty('--fs', v + 'px'); return v; };
  setFs(LS.get('fs', 18));

  let toastT;
  function toast(msg, err) {
    $toast.textContent = msg; $toast.classList.toggle('err', !!err); $toast.classList.remove('hide');
    clearTimeout(toastT); toastT = setTimeout(() => $toast.classList.add('hide'), err ? 5000 : 2200);
  }
  function busy(on, msg) {
    let b = root.querySelector('.busy');
    if (!on) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('div'); b.className = 'busy'; root.appendChild(b); }
    b.innerHTML = `<div><span class="spin"></span>${esc(msg || 'Момент…')}</div>`;
  }
  // Изпълнява действие с индикатор и показва грешката разбираемо
  async function run(msg, fn) {
    busy(true, msg);
    try { return await fn(); }
    catch (e) { if (e instanceof AuthErr) { go('#/login'); } else toast(e.message || String(e), true); return undefined; }
    finally { busy(false); }
  }

  /* ---------- Данни ---------- */
  const D = { user: null, buildings: null, b: {}, m: {}, chair: {}, sec: {} };
  async function loadBuildings(force) { if (!D.buildings || force) { const r = await api('/api/buildings'); D.buildings = r.buildings || r; } return D.buildings; }
  async function loadBuilding(id, force) { if (!D.b[id] || force) D.b[id] = await api('/api/buildings/' + id); return D.b[id]; }
  async function loadMeeting(id, force) {
    if (!D.m[id] || force) D.m[id] = await api('/api/meetings/' + id);
    syncState(D.m[id].meeting.building_id, id);
    return D.m[id];
  }
  async function loadChair(id, force) { if (!D.chair[id] || force) D.chair[id] = await api(`/api/meetings/${id}/chair-details`).catch(() => ({ details: null, votes: [] })); return D.chair[id]; }
  async function loadSec(id, force) { if (!D.sec[id] || force) D.sec[id] = await api(`/api/meetings/${id}/secretary-candidates`).catch(() => ({ candidates: [], votes: [] })); return D.sec[id]; }

  const scopeUnits = d => {
    const m = d.meeting || {};
    let u = d.units || [];
    if (m.scope_type === 'entrance' && m.scope_entrance) u = u.filter(x => String(x.entrance || '') === String(m.scope_entrance));
    return [...u].sort((a, b) => (num(a.floor) - num(b.floor)) || (parseInt(a.unit_no, 10) || 0) - (parseInt(b.unit_no, 10) || 0) || String(a.unit_no).localeCompare(String(b.unit_no)));
  };
  const quorumOf = d => (d.attendance || []).reduce((s, a) => s + num(a.ideal_parts), 0);
  const unitLabel = u => `${u.type && u.type !== 'апартамент' ? u.type : 'Ап.'} ${u.unit_no}${u.entrance ? ' · вх. ' + u.entrance : ''}`;

  function issuesOf(d, sec) {
    const out = [], m = d.meeting, agenda = d.agenda || [], att = d.attendance || [], votes = d.votes || [];
    const q = quorumOf(d), mode = m.quorum_mode || 'initial';
    const hasQ = mode === 'next_day' ? q > 0 : mode === 'one_hour' ? q >= 26 : q >= 51;
    if (!String(m.meeting_date || '').trim()) out.push(['Няма дата на събранието', 'end']);
    if (!String(m.meeting_time || '').trim()) out.push(['Няма час на събранието', 'full']);
    if (!String(m.place || '').trim()) out.push(['Няма място на събранието', 'full']);
    if (!att.length) out.push(['Няма отбелязани присъстващи', 'att']);
    att.forEach(a => { if (!String(a.person_name || '').trim()) out.push([`Липсва име на присъстващ за ${a.represents || 'обект'}`, 'att']); });
    if (!hasQ) out.push([`Кворумът е ${pct(q)} – не стига за избрания режим`, 'end']);
    if (!agenda.length) out.push(['Няма точки в дневния ред', 'pts']);
    agenda.forEach(a => {
      const generic = m.meeting_type === 'regular' || num(a.item_no) > fixedLimit(m.meeting_type) || (m.meeting_type === 'renewal' && num(a.item_no) === 1);
      if (generic && !String(a.proposal || '').trim()) out.push([`Точка ${a.item_no}: няма предложение/решение`, 'p' + a.id]);
      const miss = att.filter(p => !votes.some(v => num(v.agenda_item_id) === num(a.id) && num(v.attendance_id) === num(p.id) && String(v.vote || '').trim())).length;
      if (miss) out.push([`Точка ${a.item_no}: не са гласували ${miss}`, 'p' + a.id]);
      if (num(a.is_completed) !== 1) out.push([`Точка ${a.item_no}: не е приключена`, 'p' + a.id]);
    });
    if (!(sec && (sec.candidates || []).some(c => num(c.is_selected) === 1))) out.push(['Няма избран протоколчик', 'chair']);
    if (!isClosed(m)) out.push(['Събранието не е закрито (час на закриване)', 'end']);
    return out;
  }

  /* ---------- Рамка: горна лента, табове, маршрути ---------- */
  function top(title, sub, back, extra) {
    $top.innerHTML = `${back ? `<button class="ib" data-go="${esc(back)}" aria-label="Назад">←</button>` : '<span style="width:8px"></span>'}
      <div class="tt"><div class="t1">${esc(title)}</div>${sub ? `<div class="t2">${esc(sub)}</div>` : ''}</div>
      ${extra || ''}<button class="ib" data-act="menu" aria-label="Меню">⋮</button>`;
  }
  function tabs(mid, cur) {
    if (!mid) { $tabs.hidden = true; $tabs.innerHTML = ''; return; }
    const T = [['att', '👥', 'Присъстващи'], ['chair', '🧑‍⚖️', 'Председател'], ['pts', '🗳️', 'Точки'], ['end', '📄', 'Документи']];
    $tabs.hidden = false;
    $tabs.innerHTML = T.map(([k, i, l]) => `<button class="${cur === k ? 'on' : ''}" data-go="#/m/${mid}/${k}"><b>${i}</b>${l}</button>`).join('');
  }
  const html = (h, keepScroll) => { const y = $main.scrollTop; $main.innerHTML = h; $main.scrollTop = keepScroll ? y : 0; };

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

  /* ---------- Вход в програмата ---------- */
  function scrLogin() {
    $top.innerHTML = `<div class="tt" style="padding-left:10px"><div class="t1">Протоколи КИ</div><div class="t2">Капитал Инвест България</div></div>`;
    tabs();
    html(`<div class="login"><div class="logo"><b>🏢 Протоколи КИ</b><span>Общи събрания на етажната собственост</span></div>
      <div class="card"><label class="l">Потребител</label><input id="k-u" autocomplete="username" autocapitalize="none" value="${esc(LS.get('user', ''))}">
      <label class="l">Парола</label><input id="k-p" type="password" autocomplete="current-password">
      <button class="btn big" data-act="login">Вход</button><p class="mut" id="k-le" style="color:var(--bad)"></p></div></div>`);
    setTimeout(() => (root.querySelector('#k-u').value ? root.querySelector('#k-p') : root.querySelector('#k-u')).focus(), 50);
  }
  async function doLogin() {
    const u = root.querySelector('#k-u').value.trim(), pw = root.querySelector('#k-p').value;
    const er = root.querySelector('#k-le'); er.textContent = '';
    busy(true, 'Влизам…');
    try {
      const r = await post('/api/auth/login', { username: u, password: pw });
      LS.set('user', u); D.user = r.user || { display_name: u };
      try { if (typeof state !== 'undefined') state.currentUser = r.user; } catch (e) {}
      go('#/', true);
    } catch (e) { er.textContent = e.message || 'Грешно име или парола'; }
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
    html(`<div class="search"><input id="k-q" type="search" placeholder="🔎 Търси вход или адрес…" value="${esc(q)}"></div>
      ${rec.length && !q ? `<h3>Последно отваряни</h3>${rec.map(bItem).join('')}<h3>Всички входове (${list.length})</h3>` : ''}
      <div id="k-bl">${bList(list, q)}</div>`, keep);
  }
  const norm = s => String(s || '').toLowerCase().replace(/[„“"'.,№\-]/g, ' ').replace(/\s+/g, ' ').trim();
  const bItem = b => `<button class="item" data-go="#/b/${b.id}"><div class="grow"><div class="ttl">${esc(b.name)}</div><div class="mut">${esc(b.address || '')}</div></div><span class="arr">›</span></button>`;
  function bList(list, q) {
    const nq = norm(q);
    const f = nq ? list.filter(b => nq.split(' ').every(w => norm(b.name + ' ' + b.address).includes(w))) : list;
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
      <button class="btn out" style="width:auto;margin:0" data-act="full" data-b="${id}">Редакция ›</button></div></div>`, keep);
  }

  /* ---------- Ново събрание ---------- */
  async function scrNew(bid) {
    const d = await loadBuilding(bid);
    const last = LS.get('last', { type: 'manager_change', time: '18:30', place: 'пред входа на етажната собственост' });
    top('Ново събрание', d.building.name, '#/b/' + bid);
    tabs();
    html(`<div class="card"><h2>Вид на събранието</h2>
      ${TYPES.map(([v, l, s]) => `<button class="item k-type" data-act="pickType" data-v="${v}" style="box-shadow:none;border:2px solid ${v === last.type ? 'var(--navy)' : 'var(--line)'};${v === last.type ? 'background:#eef3fc' : ''}">
        <div class="tick" style="${v === last.type ? 'background:var(--navy);border-color:var(--navy)' : ''}">${v === last.type ? '✓' : ''}</div>
        <div class="grow"><div class="ttl">${l}</div><div class="mut">${s}</div></div></button>`).join('')}
      <input type="hidden" id="k-type" value="${esc(last.type)}">
      <div class="grid2"><div><label class="l">Дата</label><input id="k-date" type="date" value="${todayIso()}"></div>
      <div><label class="l">Час</label><input id="k-time" type="time" value="${esc(last.time || '18:30')}"></div></div>
      <label class="l">Място</label><input id="k-place" value="${esc(last.place || '')}">
      <label class="row" style="margin-top:14px;gap:12px;font-weight:600"><input id="k-fill" type="checkbox" checked style="width:28px;height:28px;min-height:0;flex:none"> Попълни готовите текстове от последното такова събрание</label>
      </div><button class="btn big" data-act="createMeeting" data-b="${bid}">✓ Създай събранието</button>`);
  }
  async function createMeeting(bid) {
    const body = {
      meeting_type: root.querySelector('#k-type').value, meeting_date: root.querySelector('#k-date').value || todayIso(),
      meeting_time: root.querySelector('#k-time').value, place: root.querySelector('#k-place').value.trim() || 'пред входа на етажната собственост',
      scope_type: 'all', scope_entrance: '',
    };
    const fill = root.querySelector('#k-fill').checked;
    const r = await run('Създавам събранието…', async () => {
      LS.set('last', { type: body.meeting_type, time: body.meeting_time, place: body.place });
      const res = await post(`/api/buildings/${bid}/meetings`, body);
      delete D.b[bid];
      if (fill) { const n = await fillTexts(res.id).catch(() => 0); if (n) toast(`Попълних текстовете на ${n} точки`); }
      return res;
    });
    if (r && r.id) go(`#/m/${r.id}/att`, true);
  }

  /* ---------- Готови текстове от последното приключило събрание от същия вид ---------- */
  async function fillTexts(mid) {
    const cur = await api('/api/meetings/' + mid);
    const type = cur.meeting.meeting_type, bid = cur.meeting.building_id;
    const list = await loadBuildings();
    const order = [...list].sort((a, b) => (a.id == bid ? -1 : b.id == bid ? 1 : 0));
    let best = null;
    for (const b of order) {
      const d = await api('/api/buildings/' + b.id).catch(() => null);
      for (const mt of (d && d.meetings) || []) {
        if (mt.meeting_type !== type || mt.id == mid || !isClosed(mt)) continue;
        const score = (b.id == bid ? 1e13 : 0) + (Date.parse(mt.closed_at || mt.meeting_date) || 0);
        if (!best || score > best.score) best = { id: mt.id, score };
      }
      if (best && best.score > 1e13) break;
    }
    if (!best) return 0;
    const tpl = (await api('/api/meetings/' + best.id)).agenda || [];
    let n = 0;
    for (const a of cur.agenda || []) {
      const s = tpl.find(x => num(x.item_no) === num(a.item_no));
      if (!s) continue;
      const discussion = String(a.discussion || '').trim() ? a.discussion : (s.discussion || '');
      const proposal = String(a.proposal || '').trim() ? a.proposal : (s.proposal || '');
      if (discussion === (a.discussion || '') && proposal === (a.proposal || '')) continue;
      await patch('/api/agenda/' + a.id, { title: a.title, discussion, proposal, required_majority: a.required_majority, majority_base: a.majority_base });
      n++;
    }
    delete D.m[mid];
    return n;
  }

  /* ---------- Събрание ---------- */
  async function scrMeeting(mid, tab, keep) {
    const d = await loadMeeting(mid, !keep || !D.m[mid]);
    const m = d.meeting;
    top(d.building ? d.building.name : 'Събрание', `№${m.meeting_no || ''} · ${bgDate(m.meeting_date)} · ${typeLabel(m.meeting_type)}`, '#/b/' + m.building_id);
    tabs(mid, tab);
    if (tab === 'chair') return scrChair(mid, d, keep);
    if (tab === 'pts') return scrPoints(mid, d, keep);
    if (tab === 'end') return scrEnd(mid, d, keep);
    return scrAtt(mid, d, keep);
  }

  function quorumCard(d) {
    const q = quorumOf(d), mode = d.meeting.quorum_mode || 'initial';
    const need = (QUORUM.find(x => x[0] === mode) || QUORUM[0])[2];
    const ok = need ? q >= need : q > 0;
    return `<div class="card"><div class="q"><div class="big" style="color:${ok ? 'var(--ok)' : 'var(--bad)'}">${pct(q)}</div>
      <div class="grow"><div class="ttl">${ok ? '✓ Има кворум' : 'Няма кворум'}</div>
      <div class="mut">${(d.attendance || []).length} от ${scopeUnits(d).length} обекта · нужни ${need ? need + '%' : 'без минимум'}</div></div></div>
      <div class="bar"><i style="width:${Math.min(100, q)}%"></i>${need ? `<u style="left:${need}%"></u>` : ''}</div></div>`;
  }

  function scrAtt(mid, d, keep) {
    const att = d.attendance || [];
    const units = scopeUnits(d);
    const q = SS.get('aq', '');
    const closed = isClosed(d.meeting);
    html(`${quorumCard(d)}
      ${closed ? '<div class="note">Събранието е закрито – присъствието може да се променя само в пълната версия.</div>' : ''}
      <div class="search"><input id="k-aq" type="search" placeholder="🔎 Номер или име…" value="${esc(q)}"></div>
      <div id="k-ul">${units.map(u => unitCard(u, att.find(a => num(a.unit_id) === num(u.id)), closed)).join('') || '<div class="empty">В този вход няма въведени обекти</div>'}</div>`, keep);
    filterUnits(q);
  }
  function unitCard(u, a, closed) {
    const name = a ? a.person_name : u.owner_name;
    const proxy = a && a.status === 'Пълномощник';
    const pt = a && (a.proxy_auth_type === 'oral' || a.proxy_auth_type === 'устно упълномощен') ? 'oral' : 'written';
    return `<div class="unit ${a ? 'on' : ''}" data-u="${u.id}" data-s="${esc(norm(u.unit_no + ' ' + (u.owner_name || '') + ' ' + (a ? a.person_name : '')))}">
      <button class="uh" data-act="togAtt" data-u="${u.id}" ${closed ? 'disabled' : ''}><span class="tick">${a ? '✓' : ''}</span>
      <div class="grow"><div class="ttl">${esc(unitLabel(u))} <span class="mut">· ет. ${esc(u.floor)}</span></div>
      <div class="mut">${esc(u.owner_name || 'няма въведен собственик')} · ${pct(u.ideal_parts)}</div></div></button>
      ${a ? `<div class="ub">
        <input class="k-pn ${String(name || '').trim() ? '' : 'need'}" data-u="${u.id}" placeholder="Име на присъстващия (задължително)" value="${esc(name || '')}" ${closed ? 'disabled' : ''}>
        <div class="seg"><button class="${proxy ? '' : 'on'}" data-act="attSt" data-u="${u.id}" data-v="Собственик">Собственик</button>
        <button class="${proxy ? 'on' : ''}" data-act="attSt" data-u="${u.id}" data-v="Пълномощник">Пълномощник</button></div>
        ${proxy ? `<div class="seg"><button class="${pt === 'written' ? 'on' : ''}" data-act="attPx" data-u="${u.id}" data-v="written">Писмено пълномощно</button>
        <button class="${pt === 'oral' ? 'on' : ''}" data-act="attPx" data-u="${u.id}" data-v="oral">Устно</button></div>` : ''}
      </div>` : ''}</div>`;
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
    const voted = present && (d.votes || []).some(v => num(v.attendance_id) === num((d.attendance.find(x => num(x.unit_id) === unitId) || {}).id));
    if (voted && !confirm('Този обект вече е гласувал. Да го махна ли от присъстващите? Гласовете му ще отпаднат.')) return;
    await run(present ? 'Махам…' : 'Отбелязвам…', async () => {
      if (present) await del(`/api/meetings/${mid}/attendance/${unitId}`);
      else await saveAtt(mid, unitId, {});
      await loadMeeting(mid, true);
    });
    await render(true);
    if (!present) {
      const inp = root.querySelector(`.k-pn[data-u="${unitId}"]`);
      if (inp && !inp.value.trim()) { inp.focus(); toast('Въведи името на присъстващия'); }
    }
  }
  const nameTimers = {};
  function nameInput(el) {
    const mid = curMid(), unitId = +el.dataset.u, v = el.value;
    el.classList.toggle('need', !v.trim());
    clearTimeout(nameTimers[unitId]);
    nameTimers[unitId] = setTimeout(async () => {
      try {
        await saveAtt(mid, unitId, { person_name: v.trim() });
        const a = (D.m[mid].attendance || []).find(x => num(x.unit_id) === unitId); if (a) a.person_name = v.trim();
      } catch (e) { toast(e.message || 'Не записах името', true); }
    }, 700);
  }

  /* ---------- Председател и протоколчик ---------- */
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
  const resBox = (t, base) => { const f = v => pct(base ? v / base * 100 : 0); return `<div class="res"><div class="za"><b>${f(t['ЗА'])}</b>ЗА</div><div class="pr"><b>${f(t['ПРОТИВ'])}</b>ПРОТИВ</div><div class="vz"><b>${f(t['ВЪЗДЪРЖАЛ СЕ'])}</b>ВЪЗД.</div></div><div class="mut" style="margin-top:4px;text-align:center">от идеалните части на присъстващите</div>`; };

  async function scrChair(mid, d, keep) {
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
          <div class="mut" style="margin-top:6px">ЗА: ${pct(quorumOf(d) ? t['ЗА'] / quorumOf(d) * 100 : 0)} от присъстващите · гласували ${t.n} от ${att.length}</div>
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

  /* ---------- Точки от дневния ред ---------- */
  function scrPoints(mid, d, keep) {
    const att = d.attendance || [], ag = d.agenda || [], votes = d.votes || [];
    const closed = isClosed(d.meeting);
    html(`${!att.length ? '<div class="note">Първо отбележи присъстващите – после се гласува.</div>' : ''}
      ${ag.map(a => {
        const t = tally(att, votes, v => num(v.agenda_item_id) === num(a.id));
        const done = num(a.is_completed) === 1;
        const st = done ? '<span class="chip ok">✓ Приключена</span>' : t.n && !t.none ? '<span class="chip">Гласувана</span>' : t.n ? `<span class="chip warn">${t.n}/${att.length}</span>` : '<span class="chip bad">Не е гласувана</span>';
        return `<button class="item" data-go="#/m/${mid}/p/${a.id}"><div class="num ${done ? 'ok' : ''}">${a.item_no}</div>
          <div class="grow"><div class="ttl" style="font-weight:600">${esc(a.title)}</div><div style="margin-top:4px">${st}${t.n ? ` <span class="mut">ЗА ${pct(quorumOf(d) ? t['ЗА'] / quorumOf(d) * 100 : 0)}</span>` : ''}</div></div><span class="arr">›</span></button>`;
      }).join('') || '<div class="empty">Няма точки в дневния ред</div>'}
      ${closed ? '' : `<div class="card"><h2>⚡ Бързо</h2>
        <button class="btn ok big" data-act="allFor" ${att.length ? '' : 'disabled'}>✅ Всички присъстващи ЗА по всичко</button>
        <div class="mut" style="margin-top:6px">Председател, протоколчик и всички точки. После можеш да смениш отделни гласове.</div>
        <button class="btn lite" data-act="fill">✍️ Готови текстове от последното събрание</button>
        <button class="btn lite" data-act="doneAll" ${ag.length ? '' : 'disabled'}>☑️ Маркирай всички точки като приключени</button>
        ${d.meeting.meeting_type === 'regular' ? '<button class="btn out" data-act="addPoint">➕ Нова точка</button>' : ''}</div>`}`, keep);
  }

  async function scrPoint(mid, aid, keep) {
    const d = await loadMeeting(mid, !keep || !D.m[mid]);
    const m = d.meeting, ag = d.agenda || [], att = d.attendance || [];
    const i = ag.findIndex(x => num(x.id) === aid);
    const a = ag[i];
    if (!a) return go(`#/m/${mid}/pts`, true);
    const prev = ag[i - 1], next = ag[i + 1];
    top(`Точка ${a.item_no} от ${ag.length}`, d.building ? d.building.name : '', `#/m/${mid}/pts`);
    tabs(mid, 'pts');
    const votes = (d.votes || []).filter(v => num(v.agenda_item_id) === aid);
    const t = tally(att, votes);
    const base = a.majority_base === 'present' ? att.reduce((s, x) => s + num(x.ideal_parts), 0) : 100;
    const zaP = base ? t['ЗА'] / base * 100 : 0;
    const req = String(a.required_majority || '');
    const reqN = parseFloat(req) || 50;
    const pass = /\+/.test(req) ? zaP > reqN : zaP >= reqN;
    const fixed = m.meeting_type !== 'regular' && num(a.item_no) <= fixedLimit(m.meeting_type);
    const closed = isClosed(m), done = num(a.is_completed) === 1;
    html(`<div class="card"><div class="ttl" style="font-size:1.05em">${esc(a.title)}</div>
      <div class="mut" style="margin-top:6px">Нужно мнозинство: ${esc(req || '—')} от ${a.majority_base === 'present' ? 'присъстващите' : 'всички'}</div>
      ${fixed ? `<button class="btn out" data-act="full" data-m="${mid}" data-p="${aid}">⚙️ Имена, суми и подробности ›</button>
        <div class="mut" style="margin-top:4px">Отваря тази точка в пълната версия.</div>` : ''}</div>

      <div class="card"><h2>🗳️ Гласуване</h2>${resBox(t, quorumOf(d))}
      <div class="mut" style="margin-top:8px">${att.length ? `${pass ? '✅ Решението се приема' : '❌ Още не се приема'} · ЗА ${pct(zaP)} от ${a.majority_base === 'present' ? 'присъстващите' : 'всички'} · гласували ${t.n} от ${att.length}` : 'Няма присъстващи'}</div>
      ${closed ? '' : `<div class="grid2" style="margin-top:10px"><button class="btn ok big" data-act="ptAll" data-v="ЗА" ${att.length ? '' : 'disabled'}>✅ Всички ЗА</button>
        <button class="btn lite" data-act="ptAllMenu" ${att.length ? '' : 'disabled'}>Всички други…</button></div>`}
      <div style="margin-top:10px">${att.map(p => { const v = votes.find(x => num(x.attendance_id) === num(p.id)); return `<div class="vrow"><div class="who">${esc(p.represents)} · ${esc(p.person_name || '')} <span class="mut">${pct(p.ideal_parts)}</span></div>${closed ? `<b>${esc(v ? v.vote : '—')}</b>` : voteSeg(v && v.vote, 'vote', `data-a="${p.id}"`)}</div>`; }).join('')}</div></div>

      <div class="card"><h2>📝 Текст в протокола</h2>
      <label class="l">Разисквания</label><textarea class="k-ag" data-f="discussion" ${closed ? 'disabled' : ''}>${esc(a.discussion || '')}</textarea>
      <label class="l">Предложение / решение${fixed ? '' : ' (задължително)'}</label><textarea class="k-ag ${!fixed && !String(a.proposal || '').trim() ? 'need' : ''}" data-f="proposal" ${closed ? 'disabled' : ''}>${esc(a.proposal || '')}</textarea>
      <div class="mut" id="k-agst" style="margin-top:6px">Записва се само.</div></div>

      <div class="stick">${closed ? '' : `<button class="btn big ${done ? 'lite' : 'ok'}" data-act="done" data-v="${done ? 0 : 1}" style="margin-top:0">${done ? '↩️ Отвори точката отново' : '✓ Приключи точката' + (next ? ' и напред' : '')}</button>`}
      <div class="grid2" style="margin-top:10px"><button class="btn out" ${prev ? `data-go="#/m/${mid}/p/${prev.id}"` : 'disabled'}>‹ Предишна</button>
      <button class="btn out" ${next ? `data-go="#/m/${mid}/p/${next.id}"` : `data-go="#/m/${mid}/end"`}>${next ? 'Следваща ›' : 'Към документите ›'}</button></div></div>`, keep);
  }
  const curAid = () => { const m = (location.hash || '').match(/\/p\/(\d+)/); return m ? +m[1] : null; };
  let agT = null;
  function agInput(el) {
    const st = root.querySelector('#k-agst'); if (st) st.textContent = 'Пиша…';
    if (el.dataset.f === 'proposal') el.classList.toggle('need', false);
    clearTimeout(agT); agT = setTimeout(saveAg, 900);
  }
  async function saveAg() {
    clearTimeout(agT); agT = null;
    const mid = curMid(), aid = curAid(); if (!mid || !aid) return;
    const a = (D.m[mid].agenda || []).find(x => num(x.id) === aid); if (!a) return;
    const vals = {}; root.querySelectorAll('.k-ag').forEach(t => { vals[t.dataset.f] = t.value; });
    if (vals.discussion === (a.discussion || '') && vals.proposal === (a.proposal || '')) { const st = root.querySelector('#k-agst'); if (st) st.textContent = 'Записано ✓'; return; }
    try {
      await patch('/api/agenda/' + aid, { title: a.title, discussion: vals.discussion, proposal: vals.proposal, required_majority: a.required_majority, majority_base: a.majority_base });
      a.discussion = vals.discussion; a.proposal = vals.proposal;
      const st = root.querySelector('#k-agst'); if (st) st.textContent = 'Записано ✓';
    } catch (e) { toast('Текстът не се записа: ' + (e.message || e), true); }
  }

  /* ---------- Край и документи ---------- */
  async function scrEnd(mid, d, keep) {
    const sec = await loadSec(mid, !keep);
    const m = d.meeting, closed = isClosed(m);
    const iss = issuesOf(d, sec);
    const mode = m.quorum_mode || 'initial';
    const docBtn = (act, icon, label, sub, extra = '') => `<button class="item" data-act="${act}" ${extra}><span style="font-size:1.6em">${icon}</span><div class="grow"><div class="ttl">${label}</div>${sub ? `<div class="mut">${sub}</div>` : ''}</div><span class="arr">›</span></button>`;
    html(`<div class="card"><h2>${iss.length ? `⚠️ Липсват ${iss.length} неща` : '✅ Всичко е готово'}</h2>
      ${iss.length ? iss.slice(0, 30).map(([t, where]) => `<div class="iss" ${where ? `data-act="fix" data-w="${esc(where)}" style="cursor:pointer"` : ''}>• ${esc(t)} ${where ? '<span class="mut">›</span>' : ''}</div>`).join('')
        : '<div class="okbox">Протоколът може да се изготви.</div>'}</div>

      <div class="card"><h2>⏱️ Кворум и закриване</h2>
      <label class="l">Събранието се провежда</label>
      <div class="seg">${QUORUM.map(([v, l]) => `<button class="${mode === v ? 'on' : ''}" data-act="quorum" data-v="${v}" ${closed ? 'disabled' : ''}>${l}</button>`).join('')}</div>
      ${closed ? `<div class="okbox" style="margin-top:12px">🔒 Закрито в ${esc(m.closed_time || '')} ч.</div>`
        : `<label class="l">Час на закриване</label><div class="row"><input id="k-ct" type="time" value="${nowHm()}" class="grow"><button class="btn lite" style="width:auto;margin:0" data-act="ctNow">Сега</button></div>
        <button class="btn big" data-act="close">🔒 Закрий събранието</button>`}</div>

      <div class="card"><h2>📄 Документи</h2>
      ${docBtn('doc', '📄', 'Протокол', 'Преглед', 'data-u="protocol-html" data-chk="1"')}
      ${docBtn('dl', '⬇️', 'Протокол за Word', 'Сваля файла', `data-u="protocol-html?download=word" data-n="Протокол ${esc(m.meeting_no)} - ${esc((d.building || {}).name || '')}.doc"`)}
      ${docBtn('doc', '👥', 'Присъствен списък', '', 'data-u="attendance-html"')}
      ${m.meeting_type !== 'regular' ? docBtn('dl', '📝', 'Договор за управление', closed ? 'Сваля файла' : 'След закриване', `data-u="contract-docx" data-n="Договор - ${esc((d.building || {}).name || '')}.docx"`) : ''}
      ${m.meeting_type !== 'regular' ? docBtn('dl', '🏛️', 'Уведомление до общината', closed ? 'Сваля файла' : 'След закриване', `data-u="municipality-notice-docx" data-n="Уведомление община - ${esc((d.building || {}).name || '')}.docx"`) : ''}
      ${docBtn('doc', '✉️', 'Покана за събранието', '', 'data-u="invitation-html"')}
      ${docBtn('print', '🖨️', 'Печат на термопринтер', ANDROID ? 'C80 и други по Bluetooth' : 'В приложението')}
      </div>
      <button class="btn out" data-act="full" data-m="${mid}">Пълна версия на събранието ›</button>`, keep);
  }

  async function openDoc(path, check) {
    const mid = curMid(); if (!mid) return;
    if (check) {
      const d = await run('Проверявам…', async () => { const dd = await loadMeeting(mid, true); const s = await loadSec(mid, true); return issuesOf(dd, s); });
      if (d && d.length && !confirm(`Протоколът още не е пълен (${d.length} липси), напр.:\n• ${d.slice(0, 4).map(x => x[0]).join('\n• ')}\n\nДа го покажа ли все пак?`)) return;
    }
    const url = `/api/meetings/${mid}/${path}`;
    if (ANDROID) location.href = url; else window.open(url, '_blank');
  }
  async function download(path, name) {
    const mid = curMid(); const url = `/api/meetings/${mid}/${path}`;
    if (ANDROID && window.KIAndroid.download) { window.KIAndroid.download(new URL(url, location.href).href, name); toast('Свалям… Ще е в Изтегляния'); return; }
    await run('Свалям…', async () => {
      const r = await fetch(url, { credentials: 'same-origin' });
      if (!r.ok) throw new Error((await r.text()).replace(/<[^>]+>/g, ' ').trim().slice(0, 200) || 'Документът още не е готов');
      const cd = r.headers.get('Content-Disposition') || '';
      const mm = cd.match(/filename\*=UTF-8''([^;]+)/i) || cd.match(/filename="?([^";]+)"?/i);
      const blob = await r.blob();
      const el = document.createElement('a'); el.href = URL.createObjectURL(blob); el.download = mm ? decodeURIComponent(mm[1]) : name;
      document.body.appendChild(el); el.click(); setTimeout(() => { URL.revokeObjectURL(el.href); el.remove(); }, 3000);
    });
  }

  /* ---------- Меню ---------- */
  function menu() {
    const m = document.createElement('div'); m.className = 'menu';
    const mid = curMid();
    m.innerHTML = `<div class="sheet"><div class="row" style="margin-bottom:6px"><div class="grow"><div class="ttl">${esc((D.user && (D.user.display_name || D.user.username)) || 'Протоколи КИ')}</div><div class="mut">Протоколи КИ</div></div>
      <button class="btn lite" style="width:auto;margin:0" data-act="closeMenu">✕</button></div>
      <label class="l">Големина на буквите</label><div class="grid2"><button class="btn lite" data-act="fs" data-v="-1" style="margin:0">А−</button><button class="btn lite" data-act="fs" data-v="1" style="margin:0">А+</button></div>
      <button class="btn lite" data-act="refresh">🔄 Обнови данните</button>
      <button class="btn out" data-act="full" ${mid ? `data-m="${mid}"` : ''}>🖥️ Пълна версия на програмата</button>
      ${D.user ? '<button class="btn out" data-act="logout" style="color:var(--bad)">Изход</button>' : ''}</div>`;
    m.addEventListener('click', e => { if (e.target === m) m.remove(); });
    root.appendChild(m);
  }

  /* ---------- Действия ---------- */
  const A = {
    login: () => doLogin(),
    menu: () => menu(),
    closeMenu: el => el.closest('.menu').remove(),
    reload: () => render(),
    refresh: async el => { el.closest('.menu') && el.closest('.menu').remove(); D.buildings = null; D.b = {}; D.m = {}; D.chair = {}; D.sec = {}; await render(); toast('Обновено'); },
    fs: el => { setFs(LS.get('fs', 18) + num(el.dataset.v)); },
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
    attSt: async el => { const mid = curMid(); await run('Записвам…', async () => { await saveAtt(mid, +el.dataset.u, { status: el.dataset.v }); await loadMeeting(mid, true); }); render(true); },
    attPx: async el => { const mid = curMid(); await run('Записвам…', async () => { await saveAtt(mid, +el.dataset.u, { proxy_auth_type: el.dataset.v }); await loadMeeting(mid, true); }); render(true); },
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
      if (!confirm(`Всички ${d.attendance.length} присъстващи да гласуват „ЗА“ за председател, протоколчик и всички ${d.agenda.length} точки?`)) return;
      await run('Гласувам по всички точки…', async () => {
        const ch = await loadChair(mid, true);
        if (ch && ch.details && ch.details.chair_mode === 'absent_manager') await post(`/api/meetings/${mid}/chair-vote-all`, { vote: 'ЗА' }).catch(() => {});
        const s = await loadSec(mid, true);
        for (const c of s.candidates || []) if (num(c.is_selected) || (s.candidates || []).length === 1) await post(`/api/secretary-candidates/${c.id}/vote-all`, { vote: 'ЗА' }).catch(() => {});
        for (const a of d.agenda || []) await post(`/api/agenda/${a.id}/vote-all`, { vote: 'ЗА' });
        await Promise.all([loadMeeting(mid, true), loadChair(mid, true), loadSec(mid, true)]);
      });
      toast('Готово – всички гласуваха ЗА'); render(true);
    },
    fill: async () => {
      const mid = curMid();
      const n = await run('Търся текстове от последното събрание…', () => fillTexts(mid));
      if (n === 0) toast('Няма приключило събрание от този вид или точките вече са попълнени');
      else if (n) toast(`Попълних ${n} точки – прегледай имената и сумите`);
      await loadMeeting(mid, true); render(true);
    },
    doneAll: async () => {
      const mid = curMid(), d = D.m[mid];
      if (!confirm('Да маркирам ли всички точки като приключени?')) return;
      await run('Записвам…', async () => { for (const a of d.agenda || []) if (num(a.is_completed) !== 1) await patch(`/api/agenda/${a.id}/completed`, { is_completed: 1 }); await loadMeeting(mid, true); });
      render(true);
    },
    addPoint: async () => {
      const mid = curMid(); const title = prompt('Заглавие на новата точка:'); if (!title || !title.trim()) return;
      const r = await run('Добавям…', async () => { const x = await post(`/api/meetings/${mid}/agenda-items`, { title: title.trim() }); await loadMeeting(mid, true); return x; });
      if (r && r.id) go(`#/m/${mid}/p/${r.id}`); else render(true);
    },
    ptAll: async el => {
      const mid = curMid(), aid = curAid(); if (agT) await saveAg();
      await run('Гласувам…', async () => { await post(`/api/agenda/${aid}/vote-all`, { vote: el.dataset.v }); await loadMeeting(mid, true); });
      render(true);
    },
    ptAllMenu: () => {
      const m = document.createElement('div'); m.className = 'menu';
      m.innerHTML = `<div class="sheet"><h2 style="color:var(--navy)">Всички присъстващи…</h2>
        <button class="btn bad" data-act="ptAll" data-v="ПРОТИВ">❌ Всички ПРОТИВ</button>
        <button class="btn" style="background:#7a5b00" data-act="ptAll" data-v="ВЪЗДЪРЖАЛ СЕ">✋ Всички ВЪЗДЪРЖАЛИ СЕ</button>
        <button class="btn lite" data-act="closeMenu">Отказ</button></div>`;
      m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-act=ptAll]')) setTimeout(() => m.remove(), 0); });
      root.appendChild(m);
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
      if (v && ag[i + 1]) go(`#/m/${mid}/p/${ag[i + 1].id}`); else if (v) go(`#/m/${mid}/end`); else render(true);
    },
    quorum: async el => { const mid = curMid(); await run('Записвам…', async () => { await patch(`/api/meetings/${mid}/quorum`, { quorum_mode: el.dataset.v }); await loadMeeting(mid, true); }); render(true); },
    ctNow: () => { root.querySelector('#k-ct').value = nowHm(); },
    close: async () => {
      const mid = curMid(); const t = (root.querySelector('#k-ct').value || '').slice(0, 5);
      if (!/^\d{1,2}:\d{2}$/.test(t)) return toast('Въведи час като 19:30', true);
      if (!confirm(`Да закрия ли събранието в ${t} ч.?`)) return;
      await run('Закривам…', async () => { await post(`/api/meetings/${mid}/close`, { closed_time: t, closed_at: new Date().toISOString() }); await loadMeeting(mid, true); delete D.b[D.m[mid].meeting.building_id]; });
      toast('Събранието е закрито'); render(true);
    },
    fix: el => {
      const w = el.dataset.w, mid = curMid();
      if (w === 'full') return A.full({ dataset: { m: String(mid) } });
      if (w[0] === 'p') return go(`#/m/${mid}/p/${w.slice(1)}`);
      go(`#/m/${mid}/${w}`);
    },
    doc: el => openDoc(el.dataset.u, !!el.dataset.chk),
    dl: el => download(el.dataset.u, el.dataset.n),
    print: () => { if (window.KIPrint) window.KIPrint.open(); else toast('Печатът работи в приложението „Протоколи КИ“', true); },
  };

  root.addEventListener('click', e => {
    const g = e.target.closest('[data-go]');
    if (g && !g.disabled) { e.preventDefault(); go(g.dataset.go); return; }
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled || !A[el.dataset.act]) return;
    e.preventDefault();
    Promise.resolve(A[el.dataset.act](el)).catch(err => toast(err.message || String(err), true));
  });
  root.addEventListener('input', e => {
    const t = e.target;
    if (t.id === 'k-q') { SS.set('q', t.value); const l = root.querySelector('#k-bl'); if (l && D.buildings) l.innerHTML = bList(D.buildings.filter(b => !b.status || b.status === 'Активна'), t.value); }
    else if (t.id === 'k-aq') { SS.set('aq', t.value); filterUnits(t.value); }
    else if (t.classList.contains('k-pn')) nameInput(t);
    else if (t.classList.contains('k-ag')) agInput(t);
  });
  root.addEventListener('focusout', e => { if (e.target.classList && e.target.classList.contains('k-ag') && agT) saveAg(); });
  root.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.target.id === 'k-p' || e.target.id === 'k-u')) { e.preventDefault(); doLogin(); } });
  window.addEventListener('beforeunload', () => { if (agT) saveAg(); });

  // Програмата понякога сама показва екрана за вход – ние си имаме свой
  render();
})();
