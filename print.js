/* Протоколи КИ – печат на термопринтер (C80 и други 58/80 мм)
   Документът се подрежда за ширината на ролката, превръща се в картинка
   (кирилицата излиза правилно на всеки принтер) и се праща към принтера.
   Телефон: Bluetooth или мрежов (Wi-Fi/LAN). Компютър: принтер от Windows или мрежов. */
(function () {
  'use strict';
  if (window.KIPrint) return;

  const NAVY = '#0b2a5b', NAVY2 = '#123a7a', GOLD = '#f2b632';
  const ENV = window.KIAndroid ? 'android' : window.KIDesktop ? 'desktop' : 'web';
  const LS = {
    get(k, d) { try { return JSON.parse(localStorage.getItem('ki_' + k)) ?? d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('ki_' + k, JSON.stringify(v)); } catch (e) {} },
  };
  const DEF = {
    doc: 'protocol', printer: '', paper: '80', font: 22, line: 1.35,
    left: 2, right: 2, top: 4, bottom: 8, feed: 3, sheet: 0,
    cut: true, pause: true, copies: 1, dark: 150, net: [],
  };
  let cfg = Object.assign({}, DEF, LS.get('print', {}));
  const save = () => LS.set('print', cfg);

  const DOCS = [['protocol', 'Протокол', 'protocol-html'], ['invitation', 'Покана', 'invitation-html'], ['attendance', 'Присъствен списък', 'attendance-html']];
  const PAPERS = [['80', '80 мм', 576], ['58', '58 мм', 384], ['80s', '80 мм (стар, 512 точки)', 512]];
  const paperDots = () => (PAPERS.find(p => p[0] === cfg.paper) || PAPERS[0])[2];
  const paperMm = () => (cfg.paper === '58' ? 58 : 80);
  const D = mm => Math.round(mm * 8); // 203 dpi ≈ 8 точки на мм

  /* ---------- Стилове ---------- */
  const css = `
  #kip { position:fixed; inset:0; z-index:2147483600; background:rgba(4,14,34,.72); display:flex; align-items:stretch; justify-content:center; }
  #kip * { box-sizing:border-box; font-family:"Segoe UI",Arial,sans-serif !important; line-height:1.35 !important; }
  #kip .kp-win { background:#f4f6fb; width:min(1400px,100vw); height:100vh; display:flex; flex-direction:column; }
  #kip .kp-head { background:linear-gradient(90deg,${NAVY},${NAVY2}); color:#fff; padding:14px 22px; display:flex; align-items:center; gap:16px; }
  #kip .kp-head h2 { margin:0; flex:1; font-size:32px !important; color:#fff; }
  #kip .kp-head h2 span { color:${GOLD}; }
  #kip .kp-x { background:transparent !important; color:#fff !important; border:2px solid rgba(255,255,255,.5) !important; font-size:26px !important; min-height:56px !important; }
  #kip .kp-body { flex:1; display:flex; min-height:0; }
  #kip .kp-set { width:560px; max-width:100%; overflow:auto; padding:18px 22px 120px; }
  #kip .kp-prev { flex:1; overflow:auto; background:#d9dfea; padding:26px; display:flex; flex-direction:column; align-items:center; gap:0; }
  #kip .kp-card { background:#fff; border-radius:18px; padding:16px 18px; margin-bottom:14px; box-shadow:0 2px 8px rgba(11,42,91,.08); }
  #kip .kp-card h3 { margin:0 0 10px; font-size:24px !important; color:${NAVY}; }
  #kip .kp-seg { display:flex; flex-wrap:wrap; gap:8px; }
  #kip .kp-seg button { flex:1 1 auto; background:#e8edf6 !important; color:${NAVY} !important; border:2px solid transparent !important; font-size:22px !important; min-height:58px !important; margin:0 !important; border-radius:14px !important; padding:8px 14px !important; }
  #kip .kp-seg button.on { background:${NAVY} !important; color:#fff !important; border-color:${GOLD} !important; }
  #kip .kp-row { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:8px 0; border-top:1px solid #eef1f6; }
  #kip .kp-row:first-of-type { border-top:none; }
  #kip .kp-row label { font-size:22px !important; font-weight:600; color:#1b2740; }
  #kip .kp-step { display:flex; align-items:center; gap:6px; }
  #kip .kp-step button { width:60px; min-height:56px !important; margin:0 !important; padding:0 !important; font-size:30px !important; background:#e8edf6 !important; color:${NAVY} !important; border:none !important; border-radius:14px !important; }
  #kip .kp-step output { min-width:96px; text-align:center; font-size:24px !important; font-weight:700; color:${NAVY}; }
  #kip .kp-tog { width:96px; min-height:52px !important; border-radius:30px !important; border:none !important; margin:0 !important; font-size:20px !important; font-weight:700 !important; background:#cfd6e3 !important; color:#4a5670 !important; }
  #kip .kp-tog.on { background:#1f9d55 !important; color:#fff !important; }
  #kip select, #kip input[type=text] { width:100%; font-size:22px !important; min-height:58px !important; border:2px solid #9fb0cf !important; border-radius:12px !important; padding:8px 12px !important; background:#fff !important; }
  #kip .kp-pr { display:flex; gap:8px; }
  #kip .kp-pr button { margin:0 !important; min-height:58px !important; font-size:22px !important; background:#e8edf6 !important; color:${NAVY} !important; border:none !important; border-radius:12px !important; white-space:nowrap; }
  #kip .kp-hint { font-size:18px !important; color:#5b6780; margin-top:8px; }
  #kip .kp-foot { position:sticky; bottom:0; display:flex; gap:12px; padding:14px 22px; background:#fff; border-top:1px solid #dde3ee; }
  #kip .kp-go { flex:2; background:${NAVY} !important; color:#fff !important; border:none !important; font-size:30px !important; min-height:76px !important; border-radius:18px !important; margin:0 !important; }
  #kip .kp-go:hover { background:${NAVY2} !important; }
  #kip .kp-test { flex:1; background:#fff3d6 !important; color:#7a5200 !important; border:2px solid ${GOLD} !important; font-size:22px !important; min-height:76px !important; border-radius:18px !important; margin:0 !important; }
  #kip .kp-status { font-size:22px !important; color:${NAVY}; font-weight:600; padding:0 22px 10px; min-height:30px; background:#fff; }
  #kip .kp-sheet { background:#fff; box-shadow:0 6px 22px rgba(0,0,0,.18); position:relative; }
  #kip .kp-sheet canvas { display:block; width:100%; height:auto; }
  #kip .kp-cut { width:100%; max-width:var(--w); text-align:center; color:#6a7690; font-size:18px !important; padding:10px 0; border-top:2px dashed #8a96ad; margin-top:14px; margin-bottom:14px; }
  #kip .kp-info { color:#334; font-size:20px !important; margin-bottom:14px; font-weight:600; }
  #kip .kp-empty { color:#5b6780; font-size:24px !important; margin-top:80px; text-align:center; }
  #kip-ask { position:fixed; inset:0; z-index:2147483646; background:rgba(4,14,34,.6); display:flex; align-items:center; justify-content:center; }
  #kip-ask .b { background:#fff; border-radius:24px; padding:30px; width:min(620px,94vw); text-align:center; border-top:10px solid ${GOLD}; font-family:"Segoe UI",Arial,sans-serif; }
  #kip-ask h2 { margin:0 0 8px; color:${NAVY}; font-size:34px !important; }
  #kip-ask p { font-size:24px !important; color:#334; margin:0 0 22px; }
  #kip-ask .r { display:flex; gap:12px; }
  #kip-ask button { flex:1; min-height:76px !important; font-size:26px !important; border-radius:18px !important; border:none !important; margin:0 !important; }
  #kip-ask .y { background:${NAVY} !important; color:#fff !important; flex:2; }
  #kip-ask .n { background:#e8edf6 !important; color:${NAVY} !important; }
  @media (max-width:900px) {
    #kip .kp-body { flex-direction:column; overflow:auto; }
    #kip .kp-set { width:100%; padding-bottom:20px; overflow:visible; }
    #kip .kp-prev { overflow:visible; min-height:400px; }
  }`;
  const st = document.createElement('style'); st.id = 'kip-style'; st.textContent = css; document.head.appendChild(st);

  /* ---------- Принтери ---------- */
  async function listPrinters() {
    const out = [];
    if (ENV === 'android') {
      let r; try { r = JSON.parse(window.KIAndroid.btList()); } catch (e) { r = []; }
      if (r && r.perm) out.push({ id: '', name: '⚠ Разрешете Bluetooth и натиснете „Обнови“', dis: true });
      else if (r && r.off) out.push({ id: '', name: '⚠ Включете Bluetooth на телефона', dis: true });
      else (r || []).forEach(d => out.push({ id: 'bt:' + d.address, name: '🔵 ' + d.name }));
    }
    if (ENV === 'desktop') {
      try { (await window.KIDesktop.printers()).forEach(p => out.push({ id: 'win:' + p.name, name: '🖨️ ' + (p.displayName || p.name) + (p.isDefault ? ' (основен)' : '') })); } catch (e) {}
    }
    (cfg.net || []).forEach(ip => out.push({ id: 'tcp:' + ip, name: '🌐 Мрежов ' + ip }));
    if (ENV !== 'android') out.push({ id: 'sys', name: '🗔 Системен прозорец за печат' });
    return out;
  }

  /* ---------- Подреждане на документа ---------- */
  async function renderDoc() {
    const id = (typeof state !== 'undefined' && state.meetingId) || null;
    if (!id) throw new Error('Отворете събрание, за да печатате негов документ.');
    const path = DOCS.find(d => d[0] === cfg.doc)[2];
    const r = await fetch(`/api/meetings/${id}/${path}`, { credentials: 'same-origin' });
    if (!r.ok) throw new Error('Документът още не е готов: ' + (await r.text()).slice(0, 160));
    return htmlToCanvas(await r.text());
  }

  async function htmlToCanvas(html) {
    if (!window.html2canvas) throw new Error('Липсва модулът за печат. Рестартирайте приложението.');
    const W = paperDots(), inner = W - D(cfg.left) - D(cfg.right);
    const ifr = document.createElement('iframe');
    ifr.style.cssText = `position:fixed;left:-20000px;top:0;width:${W}px;height:200px;border:0;`;
    document.body.appendChild(ifr);
    try {
      const doc = ifr.contentDocument; doc.open(); doc.write(html); doc.close();
      const s = doc.createElement('style');
      const f = cfg.font;
      s.textContent = `
        html,body{width:${W}px!important;min-width:0!important;max-width:none!important;margin:0!important;background:#fff!important;height:auto!important;min-height:0!important}
        body{padding:0 ${D(cfg.right)}px 0 ${D(cfg.left)}px!important;font-family:Arial,sans-serif!important;color:#000!important}
        body *{font-size:${f}px!important;line-height:${cfg.line}!important;color:#000!important;max-width:${inner}px!important;overflow-wrap:anywhere;word-break:break-word;
               position:static!important;float:none!important;background:transparent!important;box-shadow:none!important;text-shadow:none!important;page-break-before:auto!important;page-break-after:auto!important}
        h1,h1 *{font-size:${Math.round(f * 1.35)}px!important} h2,h2 *,h3,h3 *{font-size:${Math.round(f * 1.18)}px!important}
        p{margin:0 0 ${Math.round(f * 0.5)}px!important}
        table{width:100%!important;table-layout:fixed!important;border-collapse:collapse!important}
        td,th{padding:2px 3px!important;border:1px solid #000!important;vertical-align:top!important}
        img{max-width:100%!important;height:auto!important}`;
      doc.head.appendChild(s);
      await new Promise(res => setTimeout(res, 120));
      const H = Math.max(40, doc.documentElement.scrollHeight, doc.body.scrollHeight);
      ifr.style.height = H + 'px';
      await new Promise(res => setTimeout(res, 60));
      return await window.html2canvas(doc.body, { backgroundColor: '#ffffff', scale: 1, width: W, height: H, windowWidth: W, windowHeight: H, logging: false });
    } finally { ifr.remove(); }
  }

  // Разделя на листове (по дължина), реже на празен ред, добавя празно отгоре/отдолу
  function toSheets(c) {
    const ctx = c.getContext('2d');
    const max = cfg.sheet > 0 ? D(cfg.sheet * 10) : c.height;
    const sheets = [];
    let y = 0;
    while (y < c.height - 2) {
      let end = Math.min(c.height, y + max);
      if (end < c.height) {
        const look = Math.min(160, end - y - 40);
        if (look > 0) {
          const d = ctx.getImageData(0, end - look, c.width, look).data;
          for (let r = look - 1; r >= 0; r--) {
            let blank = true;
            for (let x = 0; x < c.width; x += 2) { if (d[(r * c.width + x) * 4] < 200) { blank = false; break; } }
            if (blank) { end = end - look + r; break; }
          }
        }
      }
      const t = D(cfg.top), b = D(cfg.bottom);
      const s = document.createElement('canvas'); s.width = c.width; s.height = t + (end - y) + b;
      const sx = s.getContext('2d'); sx.fillStyle = '#fff'; sx.fillRect(0, 0, s.width, s.height);
      sx.drawImage(c, 0, y, c.width, end - y, 0, t, c.width, end - y);
      sheets.push(s); y = end;
    }
    return sheets;
  }

  function testCanvas() {
    const W = paperDots(), c = document.createElement('canvas');
    c.width = W; c.height = D(cfg.top) + 300 + D(cfg.bottom);
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, W, c.height); x.fillStyle = '#000';
    const t = D(cfg.top), L = D(cfg.left), R = W - D(cfg.right);
    x.fillRect(L, t, R - L, 4); x.fillRect(L, t, 4, 280); x.fillRect(R - 4, t, 4, 280);
    for (let mm = 0; mm * 8 <= W; mm += 5) x.fillRect(mm * 8, t + 8, 2, mm % 10 ? 12 : 24);
    x.textAlign = 'center';
    x.font = `bold ${Math.round(cfg.font * 1.3)}px Arial`; x.fillText('ПРОБА – Капитал Инвест', W / 2, t + 90);
    x.font = `${cfg.font}px Arial`;
    x.fillText(`Хартия ${paperMm()} мм · ${W} точки`, W / 2, t + 90 + cfg.font * 1.7);
    x.fillText(`Полета ${cfg.left} / ${cfg.right} мм · Букви ${cfg.font}`, W / 2, t + 90 + cfg.font * 3.2);
    x.fillText('Рамката трябва да се вижда цялата', W / 2, t + 90 + cfg.font * 4.7);
    x.fillRect(L, t + 276, R - L, 4);
    return c;
  }

  /* ---------- ESC/POS ---------- */
  function escpos(c) {
    const W = c.width, H = c.height, bw = W >> 3, d = c.getContext('2d').getImageData(0, 0, W, H).data, thr = cfg.dark;
    const BAND = 128, bands = Math.ceil(H / BAND);
    const out = new Uint8Array(2 + bands * 8 + bw * H + 3 + 4);
    let p = 0; out[p++] = 0x1B; out[p++] = 0x40;
    for (let y0 = 0; y0 < H; y0 += BAND) {
      const h = Math.min(BAND, H - y0);
      out.set([0x1D, 0x76, 0x30, 0x00, bw & 255, bw >> 8, h & 255, h >> 8], p); p += 8;
      for (let y = y0; y < y0 + h; y++) for (let bx = 0; bx < bw; bx++) {
        let b = 0;
        for (let k = 0; k < 8; k++) { const i = (y * W + bx * 8 + k) * 4; if (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11 < thr) b |= (0x80 >> k); }
        out[p++] = b;
      }
    }
    out[p++] = 0x1B; out[p++] = 0x64; out[p++] = Math.max(0, Math.min(15, cfg.feed));
    if (cfg.cut) { out[p++] = 0x1D; out[p++] = 0x56; out[p++] = 0x42; out[p++] = 0x00; }
    return out.subarray(0, p);
  }
  function b64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }

  function androidSend(target, data) {
    return new Promise((res, rej) => {
      const id = 'p' + Date.now() + Math.floor(Math.random() * 1e6);
      window.__kiPrintCb = window.__kiPrintCb || {};
      window.__kiPrintCb[id] = (ok, msg) => { delete window.__kiPrintCb[id]; ok ? res() : rej(new Error(msg || 'Принтерът не отговаря')); };
      window.KIAndroid.print(id, target, data);
    });
  }

  async function sendSheet(s) {
    const p = cfg.printer;
    if (!p) throw new Error('Изберете принтер.');
    if (p.startsWith('bt:') || p.startsWith('tcp:')) {
      const data = b64(escpos(s));
      if (ENV === 'android') return androidSend(p, data);
      if (ENV === 'desktop' && p.startsWith('tcp:')) return window.KIDesktop.raw(p.slice(4), data);
      throw new Error('Този принтер не се поддържа тук.');
    }
    if (p.startsWith('win:')) {
      return window.KIDesktop.printImage(s.toDataURL('image/png'), { deviceName: p.slice(4), paperMm: paperMm(), widthMm: s.width / 8, heightMm: s.height / 8, cut: cfg.cut });
    }
    return systemPrint([s]);
  }

  function systemPrint(sheets) {
    return new Promise(res => {
      const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;left:-20000px;width:10px;height:10px;border:0';
      document.body.appendChild(f);
      const d = f.contentDocument;
      d.open(); d.write(`<html><head><style>@page{size:${paperMm()}mm auto;margin:0}body{margin:0}img{display:block;width:${paperDots() / 8}mm;margin:0 auto;page-break-after:always}</style></head><body>${sheets.map(s => `<img src="${s.toDataURL('image/png')}">`).join('')}</body></html>`); d.close();
      setTimeout(() => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) {} setTimeout(() => { f.remove(); res(); }, 1500); }, 400);
    });
  }

  function askNext(n, total) {
    return new Promise(res => {
      const a = document.createElement('div'); a.id = 'kip-ask';
      a.innerHTML = `<div class="b"><h2>✓ Лист ${n} от ${total}</h2><p>Откъснете листа и натиснете<br><b>„Следващ лист“</b>, когато сте готови.</p>
        <div class="r"><button class="n">■ Спри</button><button class="y">Следващ лист ›</button></div></div>`;
      a.querySelector('.y').onclick = () => { a.remove(); res(true); };
      a.querySelector('.n').onclick = () => { a.remove(); res(false); };
      document.body.appendChild(a);
      a.querySelector('.y').focus();
    });
  }

  /* ---------- Прозорец с настройки ---------- */
  let sheets = [], busy = false, timer = null;
  const $ = s => document.querySelector('#kip ' + s);
  const setStatus = m => { const e = $('.kp-status'); if (e) e.textContent = m || ''; };

  function seg(key, items, num) {
    return `<div class="kp-seg" data-k="${key}">${items.map(([v, l]) => `<button data-v="${v}" class="${String(cfg[key]) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  }
  function step(key, label, min, max, stp, unit) {
    return `<div class="kp-row"><label>${label}</label><div class="kp-step" data-k="${key}" data-min="${min}" data-max="${max}" data-s="${stp}" data-u="${unit}">
      <button data-d="-1">−</button><output>${cfg[key]}${unit}</output><button data-d="1">+</button></div></div>`;
  }
  function tog(key, label) {
    return `<div class="kp-row"><label>${label}</label><button class="kp-tog ${cfg[key] ? 'on' : ''}" data-k="${key}">${cfg[key] ? 'ДА' : 'НЕ'}</button></div>`;
  }

  async function open() {
    if (document.getElementById('kip')) return;
    const m = document.createElement('div'); m.id = 'kip';
    m.innerHTML = `<div class="kp-win">
      <div class="kp-head"><h2>🖨️ Печат <span>на термопринтер</span></h2><button class="kp-x">✕ Затвори</button></div>
      <div class="kp-body">
        <div class="kp-set">
          <div class="kp-card"><h3>Какво да печатам</h3>${seg('doc', DOCS.map(d => [d[0], d[1]]))}</div>
          <div class="kp-card"><h3>Принтер</h3>
            <div class="kp-pr"><select id="kp-printer"></select><button id="kp-refresh">↻ Обнови</button></div>
            <div class="kp-pr" style="margin-top:8px"><input type="text" id="kp-ip" placeholder="Мрежов принтер: IP, напр. 192.168.1.100"><button id="kp-addip">＋ Добави</button></div>
            <div class="kp-hint">${ENV === 'android' ? 'Bluetooth принтерът (C80 и др.) трябва първо да е сдвоен в Настройки → Bluetooth на телефона (ПИН обикновено 0000 или 1234).' : ENV === 'desktop' ? 'Принтерите с драйвер в Windows (USB, Bluetooth, мрежа) излизат тук сами. Мрежов принтер без драйвер – въведете IP.' : 'В приложението „Протоколи КИ“ има повече възможности за печат.'}</div>
          </div>
          <div class="kp-card"><h3>Хартия и букви</h3>
            ${seg('paper', PAPERS.map(p => [p[0], p[1]]))}
            <div style="height:10px"></div>
            ${seg('font', [[18, 'Малки'], [22, 'Нормални'], [28, 'Големи'], [34, 'Много големи']])}
            <div style="height:10px"></div>
            ${seg('line', [[1.15, 'Сбито'], [1.35, 'Нормално'], [1.6, 'Нарядко']])}
            <div class="kp-hint">Последният ред е разстоянието между редовете.</div>
          </div>
          <div class="kp-card"><h3>Разстояния на листа</h3>
            ${step('top', 'Празно отгоре', 0, 60, 1, ' мм')}
            ${step('bottom', 'Празно отдолу', 0, 80, 1, ' мм')}
            ${step('left', 'Поле отляво', 0, 15, 1, ' мм')}
            ${step('right', 'Поле отдясно', 0, 15, 1, ' мм')}
            ${step('feed', 'Подаване преди рязане', 0, 15, 1, ' реда')}
          </div>
          <div class="kp-card"><h3>Листове</h3>
            ${seg('sheet', [[0, 'Цял документ'], [15, 'По 15 см'], [20, 'По 20 см'], [30, 'По 30 см']])}
            ${tog('cut', 'Рязане след всеки лист')}
            ${tog('pause', 'Спирай след всеки лист за потвърждение')}
            ${step('copies', 'Брой копия', 1, 10, 1, '')}
          </div>
          <div class="kp-card"><h3>Тъмнина на печата</h3>${seg('dark', [[110, 'Светло'], [150, 'Нормално'], [190, 'Тъмно']])}</div>
        </div>
        <div class="kp-prev"><div class="kp-empty">Подготвям прегледа…</div></div>
      </div>
      <div class="kp-status"></div>
      <div class="kp-foot"><button class="kp-test">Пробен лист</button><button class="kp-go">🖨️ Печатай</button></div>
    </div>`;
    document.body.appendChild(m);

    m.querySelector('.kp-x').onclick = () => { if (!busy) m.remove(); };
    m.addEventListener('click', e => {
      const sb = e.target.closest('.kp-seg button');
      if (sb) {
        const k = sb.parentElement.dataset.k, v = sb.dataset.v;
        cfg[k] = (k === 'paper' || k === 'doc') ? v : Number(v);
        sb.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === sb));
        save(); schedule(); return;
      }
      const stb = e.target.closest('.kp-step button');
      if (stb) {
        const w = stb.parentElement, k = w.dataset.k;
        cfg[k] = Math.max(+w.dataset.min, Math.min(+w.dataset.max, Number(cfg[k]) + Number(stb.dataset.d) * Number(w.dataset.s)));
        w.querySelector('output').textContent = cfg[k] + w.dataset.u;
        save(); if (k !== 'copies' && k !== 'feed') schedule(); return;
      }
      const tb = e.target.closest('.kp-tog');
      if (tb) { const k = tb.dataset.k; cfg[k] = !cfg[k]; tb.classList.toggle('on', cfg[k]); tb.textContent = cfg[k] ? 'ДА' : 'НЕ'; save(); }
    });
    $('#kp-printer').onchange = e => { cfg.printer = e.target.value; save(); };
    $('#kp-refresh').onclick = fillPrinters;
    $('#kp-addip').onclick = () => {
      let ip = $('#kp-ip').value.trim().replace(/\s/g, '');
      if (!/^[\w.-]+(:\d+)?$/.test(ip)) { alert('Въведете IP адрес, напр. 192.168.1.100'); return; }
      if (!ip.includes(':')) ip += ':9100';
      cfg.net = [...new Set([...(cfg.net || []), ip])]; cfg.printer = 'tcp:' + ip; save(); $('#kp-ip').value = ''; fillPrinters();
    };
    m.querySelector('.kp-go').onclick = () => run(false);
    m.querySelector('.kp-test').onclick = () => run(true);
    await fillPrinters();
    preview();
  }

  async function fillPrinters() {
    const list = await listPrinters();
    const sel = $('#kp-printer'); if (!sel) return;
    if (!list.some(p => p.id === cfg.printer)) { const first = list.find(p => p.id && !p.dis); cfg.printer = first ? first.id : ''; save(); }
    sel.innerHTML = (list.length ? '' : '<option value="">Няма намерени принтери</option>') +
      list.map(p => `<option value="${p.id}" ${p.dis ? 'disabled' : ''} ${p.id === cfg.printer ? 'selected' : ''}>${p.name}</option>`).join('');
  }

  function schedule() { clearTimeout(timer); timer = setTimeout(preview, 250); }

  async function preview() {
    const box = $('.kp-prev'); if (!box) return;
    try {
      setStatus('Подготвям прегледа…');
      sheets = toSheets(await renderDoc());
      const w = Math.min(paperDots(), 520);
      const totalMm = Math.round(sheets.reduce((a, s) => a + s.height, 0) / 8);
      box.innerHTML = `<div class="kp-info">${sheets.length} ${sheets.length === 1 ? 'лист' : 'листа'} · около ${(totalMm / 10).toFixed(1)} см хартия</div>`;
      sheets.forEach((s, i) => {
        const d = document.createElement('div'); d.className = 'kp-sheet'; d.style.width = w + 'px';
        d.appendChild(s); box.appendChild(d);
        if (i < sheets.length - 1 || cfg.cut) {
          const c = document.createElement('div'); c.className = 'kp-cut'; c.style.setProperty('--w', w + 'px');
          c.textContent = cfg.cut ? `✂ рязане${cfg.pause && i < sheets.length - 1 ? ' · пауза' : ''}` : '— нов лист —';
          box.appendChild(c);
        }
      });
      setStatus('');
    } catch (e) {
      box.innerHTML = `<div class="kp-empty">${e.message || e}</div>`; sheets = []; setStatus('');
    }
  }

  async function run(test) {
    if (busy) return;
    const list = test ? [testCanvas()] : sheets;
    if (!list.length) { alert('Няма какво да печатам.'); return; }
    if (!cfg.printer) { alert('Изберете принтер.'); return; }
    busy = true;
    const go = document.querySelector('#kip .kp-go'); go.disabled = true;
    try {
      if (cfg.printer === 'sys') { setStatus('Отварям прозореца за печат…'); await systemPrint(list); setStatus('Готово'); return; }
      const copies = test ? 1 : cfg.copies, total = list.length * copies;
      let n = 0;
      for (let k = 0; k < copies; k++) for (const s of list) {
        n++;
        setStatus(`Печатам лист ${n} от ${total}…`);
        await sendSheet(s);
        if (cfg.pause && n < total && !(await askNext(n, total))) { setStatus(`Спряно след лист ${n} от ${total}`); return; }
      }
      setStatus(test ? '✓ Пробният лист е изпратен' : `✓ Отпечатани ${total} ${total === 1 ? 'лист' : 'листа'}`);
    } catch (e) {
      setStatus(''); alert('Печатът не успя:\n' + (e.message || e));
    } finally { busy = false; go.disabled = false; }
  }

  window.KIPrint = { open };
})();
