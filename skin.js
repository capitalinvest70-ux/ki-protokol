(function () {
  'use strict';
  if (document.getElementById('ki-skin')) return; // вече е заредено
  const ANDROID = !!window.KIAndroid;
  if (!document.querySelector('meta[name=viewport]')) {
    const vm = document.createElement('meta'); vm.name = 'viewport'; vm.content = 'width=device-width, initial-scale=1';
    document.head.appendChild(vm);
  }
  const PHONE = () => window.innerWidth < 760;
  const fsKey = () => (PHONE() ? 'fs_phone' : 'fs_pc');
  const applyFs = () => { let v = 18; try { v = Number(JSON.parse(localStorage.getItem('ki_' + fsKey()))) || (PHONE() ? 16 : 26); } catch (e) { v = PHONE() ? 16 : 26; } document.documentElement.style.setProperty('--ki-fs', v + 'px'); return v; };
  const changeFs = d => { const v = Math.max(12, Math.min(34, applyFs() + d)); try { localStorage.setItem('ki_' + fsKey(), JSON.stringify(v)); } catch (e) {} applyFs(); };
  applyFs(); window.addEventListener('resize', applyFs);

  /* ---------- 1. ВИД ---------- */
  const NAVY = '#0b2a5b', NAVY2 = '#123a7a', GOLD = '#f2b632', BG = '#eef2f8';
  const css = `
    html, body { background:${BG} !important; }
    body, body * { font-size:var(--ki-fs) !important; line-height:1.4 !important; font-family:"Segoe UI",Arial,sans-serif !important; }
    h1, h1 * { font-size:calc(var(--ki-fs) * 1.5) !important; } h2, h2 * { font-size:calc(var(--ki-fs) * 1.3) !important; } h3, h3 * { font-size:calc(var(--ki-fs) * 1.15) !important; }
    body { color:#0d1626 !important; }
    header, nav, .topbar, .header { background:linear-gradient(90deg,${NAVY},${NAVY2}) !important; color:#fff !important; }
    input, select, textarea {
      min-height:calc(var(--ki-fs) * 2.2) !important; padding:6px 10px !important; border:2px solid #8aa0c8 !important;
      border-radius:12px !important; background:#fff !important; color:#0d1626 !important;
    }
    textarea { min-height:calc(var(--ki-fs) * 5) !important; }
    input:focus, select:focus, textarea:focus { outline:3px solid ${GOLD} !important; border-color:${NAVY} !important; }
    button {
      min-height:calc(var(--ki-fs) * 2.2) !important; padding:6px 16px !important; margin:4px !important;
      border-radius:14px !important; font-weight:600 !important; cursor:pointer !important;
    }
    table { border-collapse:separate !important; border-spacing:0 8px !important; width:100% !important; }
    th { background:${NAVY} !important; color:#fff !important; padding:14px !important; }
    td { background:#fff !important; padding:16px !important; }
    tr:hover td { background:#fff6dd !important; }
    label { font-weight:600 !important; }

    /* Бърз панел */
    #ki-panel { position:fixed; right:18px; bottom:18px; z-index:2147483000; width:340px;
      background:linear-gradient(160deg,${NAVY},${NAVY2}); border-radius:20px; padding:16px;
      box-shadow:0 10px 30px rgba(0,0,0,.4); color:#fff; }
    #ki-panel .ki-t { font-size:24px !important; font-weight:700 !important; color:${GOLD}; text-align:center; margin-bottom:8px; cursor:pointer; }
    #ki-panel button { display:block; width:100%; margin:8px 0 !important; text-align:left;
      background:#fff !important; color:${NAVY} !important; border:none !important; font-size:22px !important; min-height:54px !important; }
    #ki-panel .ki-fs { display:flex; gap:8px; } #ki-panel .ki-fs button { text-align:center; }
    #ki-panel.ki-min .ki-fs { display:none; }
    #ki-panel button:disabled { opacity:.35; cursor:default !important; }
    #ki-panel.ki-min button { display:none; }
    #ki-status { font-size:20px !important; color:#dfe7f5; text-align:center; min-height:26px; }

    /* Прозорец */
    #ki-modal { position:fixed; inset:0; background:rgba(5,15,35,.6); z-index:2147483600; display:flex; align-items:center; justify-content:center; }
    #ki-modal .ki-box { background:#fff; width:min(720px,94vw); max-height:92vh; overflow:auto; border-radius:22px; padding:28px; border-top:10px solid ${NAVY}; }
    #ki-modal .ki-box h2 { margin:0 0 18px; color:${NAVY}; }
    #ki-modal .ki-row { margin-bottom:16px; }
    #ki-modal .ki-row label { display:block; margin-bottom:6px; }
    #ki-modal .ki-row input, #ki-modal .ki-row select { width:100%; box-sizing:border-box; }
    #ki-modal .ki-actions { display:flex; gap:12px; margin-top:20px; }
    #ki-modal .ki-go { flex:2; background:${NAVY} !important; color:#fff !important; border:none !important; font-size:28px !important; min-height:72px !important; }
    #ki-modal .ki-no { flex:1; background:#e3e8f1 !important; color:${NAVY} !important; border:none !important; }
    .auth-shell, .auth-card { max-width:100% !important; box-sizing:border-box !important; }
    .auth-card input, .auth-card button { width:100% !important; box-sizing:border-box !important; }
    #ki-panel.ki-hide { display:none !important; }
    #ki-panel.ki-min { width:auto; padding:10px 16px; border-radius:40px; }
    #ki-panel.ki-min .ki-t { margin:0; }
    #ki-panel.ki-min #ki-status { display:none; }
    @media (max-width:760px){
      td, th { padding:6px !important; }
      #ki-panel{ right:10px; bottom:10px; width:calc(100vw - 20px); max-height:80vh; overflow:auto; }
      #ki-panel.ki-min{ width:auto; }
    }
  `;
  const st = document.createElement('style'); st.id = 'ki-skin'; st.textContent = css; document.head.appendChild(st);

  /* ---------- 2. ПОМОЩНИ ---------- */
  const S = () => (typeof state !== 'undefined' ? state : {});
  const API = async (url, opt = {}) => {
    const r = await fetch(url, { credentials: 'same-origin', ...opt, headers: { 'Content-Type': 'application/json', ...(opt.headers || {}) } });
    const t = await r.text();
    if (!r.ok) throw new Error(t || ('Грешка ' + r.status));
    try { return t ? JSON.parse(t) : {}; } catch (e) { return t; }
  };
  const LS = { get(k, d) { try { return JSON.parse(localStorage.getItem('ki_' + k)) ?? d; } catch (e) { return d; } },
               set(k, v) { try { localStorage.setItem('ki_' + k, JSON.stringify(v)); } catch (e) {} } };
  const status = (m) => { const e = document.getElementById('ki-status'); if (e) e.textContent = m || ''; };
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const reopen = async () => { if (typeof openMeeting === 'function' && S().meetingId) await openMeeting(S().meetingId); };
  const inMeeting = () => !!(S().meetingId && S().data && S().data.meeting && document.body.innerText.includes('Дневен ред'));
  const inBuilding = () => !!S().buildingId;

  const TYPES = [
    ['manager_change', 'Смяна на домоуправител'],
    ['renewal', 'Преподписване с нас'],
    ['regular', 'Редовно общо събрание'],
  ];

  function modal(html, onOk) {
    const m = document.createElement('div'); m.id = 'ki-modal';
    m.innerHTML = `<div class="ki-box">${html}<div class="ki-actions"><button class="ki-no">Отказ</button><button class="ki-go">Създай ✓</button></div></div>`;
    m.querySelector('.ki-no').onclick = () => m.remove();
    m.querySelector('.ki-go').onclick = async () => { const b = m.querySelector('.ki-go'); b.disabled = true; b.textContent = 'Момент…'; try { await onOk(m); m.remove(); } catch (e) { alert(e.message || e); b.disabled = false; b.textContent = 'Създай ✓'; } };
    document.body.appendChild(m);
  }

  /* ---------- 3. НОВО СЪБРАНИЕ С 1 ЕКРАН ---------- */
  function quickMeeting() {
    const last = LS.get('last', { type: 'manager_change', time: '18:30', place: 'пред входа на етажната собственост' });
    modal(`
      <h2>Ново събрание</h2>
      <div class="ki-row"><label>Вид</label><select id="ki-type">${TYPES.map(([v, l]) => `<option value="${v}" ${v === last.type ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="ki-row"><label>Дата</label><input id="ki-date" type="date" value="${today()}"></div>
      <div class="ki-row"><label>Час</label><input id="ki-time" type="time" value="${last.time}"></div>
      <div class="ki-row"><label>Място</label><input id="ki-place" value="${last.place.replace(/"/g, '&quot;')}"></div>
      <div class="ki-row"><label><input id="ki-fill" type="checkbox" checked style="min-height:auto!important;width:28px;height:28px;vertical-align:middle"> Попълни готовите текстове по точките</label></div>
    `, async (m) => {
      const body = { meeting_type: m.querySelector('#ki-type').value, meeting_date: m.querySelector('#ki-date').value,
        meeting_time: m.querySelector('#ki-time').value, place: m.querySelector('#ki-place').value, scope_type: 'all', scope_entrance: '' };
      LS.set('last', { type: body.meeting_type, time: body.meeting_time, place: body.place });
      const res = await API(`/api/buildings/${S().buildingId}/meetings`, { method: 'POST', body: JSON.stringify(body) });
      const fill = m.querySelector('#ki-fill').checked;
      if (typeof openMeeting === 'function') await openMeeting(res.id);
      if (fill) await fillTexts(res.id, body.meeting_type);
    });
  }

  /* ---------- 4. ГОТОВИ ТЕКСТОВЕ ---------- */
  // Взима текстовете от последното приключило събрание от същия вид (първо в същия вход, после от всички входове)
  async function findTemplate(type, buildingId, excludeId) {
    status('Търся образец…');
    const all = await API('/api/buildings'); const list = all.buildings || all;
    const order = [...list].sort((a, b) => (a.id == buildingId ? -1 : b.id == buildingId ? 1 : 0));
    let best = null;
    for (const b of order) {
      const d = await API(`/api/buildings/${b.id}`).catch(() => null);
      for (const mt of (d && d.meetings) || []) {
        if (mt.meeting_type !== type || mt.id == excludeId || !(mt.closed_at || mt.closed_time)) continue;
        const score = (b.id == buildingId ? 1e13 : 0) + Date.parse(mt.closed_at || mt.meeting_date || 0);
        if (!best || score > best.score) best = { id: mt.id, score };
      }
      if (best && best.score > 1e13) break;
    }
    if (!best) return null;
    const full = await API(`/api/meetings/${best.id}`);
    return full.agenda || [];
  }

  async function fillTexts(meetingId, type) {
    meetingId = meetingId || S().meetingId;
    const cur = await API(`/api/meetings/${meetingId}`);
    type = type || cur.meeting.meeting_type;
    const tpl = await findTemplate(type, cur.meeting.building_id, meetingId);
    if (!tpl || !tpl.length) { status(''); alert('Няма приключило събрание от този вид, от което да взема текстове.'); return; }
    let n = 0;
    for (const a of cur.agenda || []) {
      const src = tpl.find(x => Number(x.item_no) === Number(a.item_no));
      if (!src) continue;
      const discussion = (a.discussion || '').trim() ? a.discussion : (src.discussion || '');
      const proposal = (a.proposal || '').trim() ? a.proposal : (src.proposal || '');
      if (discussion === a.discussion && proposal === a.proposal) continue;
      await API(`/api/agenda/${a.id}`, { method: 'PATCH', body: JSON.stringify({
        title: a.title, discussion, proposal, required_majority: a.required_majority, majority_base: a.majority_base }) });
      n++;
    }
    status(`Попълнени точки: ${n}`);
    await reopen();
    alert(`Попълних ${n} точки с текстове от последното събрание от този вид.\nПрегледайте ги – особено имена, суми и адреси.`);
  }

  /* ---------- 5. ВСИЧКИ ПРИСЪСТВАЩИ ЗА ---------- */
  async function allFor() {
    const id = S().meetingId; if (!id) return;
    const d = await API(`/api/meetings/${id}`);
    const present = (d.attendance || []).length;
    if (!present) { alert('Първо отбележете присъстващите.'); return; }
    if (!confirm(`Всички ${present} присъстващи да гласуват „ЗА“ по всички ${(d.agenda || []).length} точки, председател и протоколчик?`)) return;
    status('Гласувам…');
    await API(`/api/meetings/${id}/chair-vote-all`, { method: 'POST', body: JSON.stringify({ vote: 'ЗА' }) }).catch(() => {});
    const sc = await API(`/api/meetings/${id}/secretary-candidates`).catch(() => ({ candidates: [] }));
    for (const c of sc.candidates || []) await API(`/api/secretary-candidates/${c.id}/vote-all`, { method: 'POST', body: JSON.stringify({ vote: 'ЗА' }) }).catch(() => {});
    let n = 0;
    for (const a of d.agenda || []) { await API(`/api/agenda/${a.id}/vote-all`, { method: 'POST', body: JSON.stringify({ vote: 'ЗА' }) }); n++; }
    status(`Гласувани точки: ${n}`);
    await reopen();
  }

  /* ---------- 6. ДОКУМЕНТИ С 1 БУТОН ---------- */
  async function download(url, fallbackName) {
    if (ANDROID) { window.KIAndroid.download(new URL(url, location.href).href, fallbackName); return; }
    const r = await fetch(url, { credentials: 'same-origin' });
    if (!r.ok) throw new Error(fallbackName + ': ' + (await r.text()).slice(0, 200));
    const cd = r.headers.get('Content-Disposition') || '';
    const m = cd.match(/filename\*=UTF-8''([^;]+)/i) || cd.match(/filename="?([^";]+)"?/i);
    const name = m ? decodeURIComponent(m[1]) : fallbackName;
    const blob = await r.blob();
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }
  async function allDocs() {
    const id = S().meetingId; if (!id) return;
    const d = await API(`/api/meetings/${id}`);
    const closed = !!(d.meeting.closed_at || d.meeting.closed_time);
    const no = d.meeting.meeting_no, bname = (d.building && d.building.name || 'ЕС').replace(/[\\/:*?"<>|]/g, '');
    status('Свалям документите…');
    const errs = [];
    const jobs = [[`/api/meetings/${id}/protocol-html?download=word`, `Протокол ${no} - ${bname}.doc`]];
    if (closed) {
      jobs.push([`/api/meetings/${id}/contract-docx`, `Договор - ${bname}.docx`]);
      jobs.push([`/api/meetings/${id}/municipality-notice-docx`, `Уведомление община - ${bname}.docx`]);
    }
    for (const [u, n] of jobs) { try { await download(u, n); } catch (e) { errs.push(e.message); } }
    if (!ANDROID) window.open(`/api/meetings/${id}/attendance-html`, '_blank');
    status(errs.length ? 'Има грешки' : (ANDROID ? 'Файловете са в Изтегляния → Протоколи' : 'Готово'));
    if (!closed) alert('Свалих протокола. Договорът и уведомлението до общината излизат след като приключите събранието.');
    if (errs.length) alert('Не можах да сваля:\n' + errs.join('\n'));
  }

  /* ---------- 7. ПАНЕЛ ---------- */
  function panel() {
    let p = document.getElementById('ki-panel');
    if (!p) {
      p = document.createElement('div'); p.id = 'ki-panel';
      if (LS.get('min', PHONE())) p.classList.add('ki-min');
      p.innerHTML = `<div class="ki-t" title="Скрий/покажи">Капитал Инвест ▾</div>
        <button data-a="new">➕ Ново събрание</button>
        <button data-a="fill">✍️ Готови текстове</button>
        <button data-a="for">✅ Всички присъстващи ЗА</button>
        <button data-a="docs">📄 Всички документи</button>
        <button data-a="print">🖨️ Печат на термопринтер</button>
        <div class="ki-fs"><button data-a="fsm">А−</button><button data-a="fsp">А+</button></div>
        <div id="ki-status"></div>`;
      p.querySelector('.ki-t').onclick = () => { p.classList.toggle('ki-min'); LS.set('min', p.classList.contains('ki-min')); };
      p.addEventListener('click', async (e) => {
        const a = e.target.closest('button')?.dataset.a; if (!a) return;
        if (a === 'fsm' || a === 'fsp') { changeFs(a === 'fsp' ? 2 : -2); return; }
        if (PHONE()) { p.classList.add('ki-min'); }
        try {
          if (a === 'new') quickMeeting();
          if (a === 'fill') await fillTexts();
          if (a === 'for') await allFor();
          if (a === 'docs') await allDocs();
          if (a === 'print') { if (window.KIPrint) window.KIPrint.open(); else alert('Печатът работи в приложението „Протоколи КИ“.'); }
        } catch (err) { status(''); alert(err.message || err); }
      });
      document.body.appendChild(p);
    }
    const loggedOut = !!(document.querySelector('.auth-shell') || document.getElementById('auth_username'));
    p.classList.toggle('ki-hide', loggedOut);
    p.querySelector('.ki-t').textContent = p.classList.contains('ki-min') ? (PHONE() ? 'КИ ▴' : 'Капитал Инвест ▴') : 'Капитал Инвест ▾';
    const m = inMeeting(), b = inBuilding();
    p.querySelector('[data-a=new]').disabled = !b;
    p.querySelector('[data-a=fill]').disabled = !m;
    p.querySelector('[data-a=for]').disabled = !m;
    p.querySelector('[data-a=docs]').disabled = !m;
    p.querySelector('[data-a=print]').disabled = !m;
  }
  panel();
  setInterval(panel, 1000);
})();
