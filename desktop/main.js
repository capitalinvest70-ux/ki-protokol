// Протоколи КИ – версия за компютър.
// Отваря Програма за протокол в собствен прозорец и слага скина на Капитал Инвест.
const { app, BrowserWindow, shell, Menu, session, ipcMain, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');
const https = require('https');

const SITE = 'https://protocol-app-production-cc1d.up.railway.app/';
// html2canvas (за печат) + модул за печат + мобилният изглед (същият като на телефона) + скин за пълната версия
const SKIN = ['html2canvas.min.js', 'print.js', 'brand.js', 'mobile.js', 'skin.js']
  .map(f => fs.readFileSync(path.join(__dirname, f), 'utf8')).join('\n;\n');
const DOWNLOAD_RE = /(-docx|download=word)/;

if (!app.requestSingleInstanceLock()) app.quit();

/* ---------- 🚀 Обновяване: сваля новия инсталатор от GitHub и го пуска ---------- */
const UPD_PREFIX = 'https://github.com/capitalinvest70-ux/ki-protokol/releases/download/';
function fetchTo(url, file, onProgress, hops = 0) {
  return new Promise((res, rej) => {
    https.get(url, { headers: { 'User-Agent': 'Protokoli-KI' } }, r => {
      if ([301, 302, 303, 307, 308].includes(r.statusCode) && r.headers.location && hops < 6) {
        r.resume(); return fetchTo(new URL(r.headers.location, url).href, file, onProgress, hops + 1).then(res, rej);
      }
      if (r.statusCode !== 200) { r.resume(); return rej(new Error('сървърът отговори ' + r.statusCode)); }
      const total = +r.headers['content-length'] || 0; let got = 0, last = -1;
      const out = fs.createWriteStream(file);
      r.on('data', c => { got += c.length; const p = total ? Math.min(99, Math.floor(got * 100 / total)) : 0; if (p !== last) { last = p; onProgress(p); } });
      r.on('error', rej); out.on('error', rej);
      out.on('finish', () => out.close(() => res(file)));
      r.pipe(out);
    }).on('error', rej);
  });
}
ipcMain.handle('ki-version', () => {
  let build = 0;
  try { build = JSON.parse(fs.readFileSync(path.join(__dirname, 'build.json'), 'utf8')).build || 0; } catch (e) {}
  return { name: app.getVersion(), build };
});
// Проверката за нова версия минава оттук – страницата на програмата не позволява връзки към други сайтове
ipcMain.handle('ki-latest', () => new Promise(res => {
  https.get('https://api.github.com/repos/capitalinvest70-ux/ki-protokol/releases/latest',
    { headers: { 'User-Agent': 'Protokoli-KI', Accept: 'application/vnd.github+json' } }, r => {
      let body = ''; r.setEncoding('utf8');
      r.on('data', c => { body += c; });
      r.on('end', () => res(r.statusCode === 200 ? body : 'ERR ' + r.statusCode));
    }).on('error', err => res('ERR ' + err.message));
}));
ipcMain.handle('ki-update', async (e, url, name) => {
  if (typeof url !== 'string' || !url.startsWith(UPD_PREFIX)) return 'ERR Непознат адрес за обновяване';
  const file = path.join(os.tmpdir(), String(name || 'Protokoli-KI-Setup.exe').replace(/[^\w.-]/g, '_'));
  const send = (p, m) => { try { e.sender.send('ki-upd', p, m); } catch (x) {} };
  try {
    await fetchTo(url, file, p => send(p));
    send(100);
    // Първо затваряме приложението, после тръгва инсталаторът – иначе той казва, че нещо му пречи
    setTimeout(() => {
      try {
        require('child_process').spawn('cmd.exe', ['/d', '/s', '/c', `"ping -n 4 127.0.0.1 >nul & start "" "${file}""`],
          { detached: true, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: true }).unref();
      } catch (x) { shell.openPath(file); }
      BrowserWindow.getAllWindows().forEach(w => { try { w.destroy(); } catch (x) {} });
      app.exit(0);
    }, 900);
    return 'OK';
  } catch (err) { send(-1, 'Свалянето спря: ' + err.message); return 'ERR ' + err.message; }
});

/* ---------- 📣 Покани: връзка към SMSAPI / Brevo и отваряне на пощата ---------- */
const HTTP_OK = ['https://api.smsapi.bg/', 'https://api2.smsapi.bg/', 'https://api.smsapi.com/', 'https://api2.smsapi.com/', 'https://api.brevo.com/'];
ipcMain.handle('ki-http', (e, method, url, headers, body) => new Promise(res => {
  if (typeof url !== 'string' || !HTTP_OK.some(p => url.startsWith(p))) return res({ status: 0, body: 'ERR Непознат адрес' });
  let h = {}; try { h = JSON.parse(headers || '{}'); } catch (x) {}
  const data = body ? Buffer.from(String(body), 'utf8') : null;
  if (data) h['Content-Length'] = data.length;
  h['User-Agent'] = 'Protokoli-KI';
  const rq = https.request(url, { method: method || 'GET', headers: h, timeout: 60000 }, r => {
    let out = ''; r.setEncoding('utf8');
    r.on('data', c => { out += c; });
    r.on('end', () => res({ status: r.statusCode, body: out }));
  });
  rq.on('timeout', () => rq.destroy(new Error('няма отговор')));
  rq.on('error', err => res({ status: 0, body: 'ERR ' + err.message }));
  if (data) rq.write(data);
  rq.end();
}));
ipcMain.handle('ki-viber', (e, number, text) => {
  try { clipboard.writeText(String(text || '')); } catch (x) {}
  return shell.openExternal(`viber://chat?number=${encodeURIComponent(number || '')}&draft=${encodeURIComponent(text || '')}`).then(() => true, () => false);
});
ipcMain.handle('ki-mailto', (e, bcc, subject, text) => {
  const u = `mailto:?bcc=${encodeURIComponent(bcc || '')}&subject=${encodeURIComponent(subject || '')}&body=${encodeURIComponent(text || '')}`;
  return shell.openExternal(u).then(() => true, () => false);
});

let win;

function inject(wc) {
  wc.executeJavaScript(SKIN).catch(() => {});
}

function setupDownloads() {
  // Всички Word файлове отиват в Документи\Протоколи и се отварят сами
  session.defaultSession.on('will-download', (e, item) => {
    const dir = path.join(app.getPath('documents'), 'Протоколи');
    fs.mkdirSync(dir, { recursive: true });
    let file = path.join(dir, item.getFilename());
    const ext = path.extname(file), base = file.slice(0, -ext.length || undefined);
    for (let i = 2; fs.existsSync(file); i++) file = `${base} (${i})${ext}`;
    item.setSavePath(file);
    item.once('done', (ev, state) => { if (state === 'completed') shell.openPath(file); });
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1400, height: 950, show: false,
    title: 'Протоколи КИ',
    icon: path.join(__dirname, 'icon.png'),
    backgroundColor: '#0b2a5b',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, spellcheck: true, preload: path.join(__dirname, 'preload.js') },
  });
  win.maximize();
  win.show();
  win.loadURL(SITE);

  win.webContents.on('did-finish-load', () => inject(win.webContents));
  win.on('page-title-updated', (e) => { e.preventDefault(); win.setTitle('Протоколи КИ'); });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (DOWNLOAD_RE.test(url)) { win.webContents.downloadURL(url); return { action: 'deny' }; }
    if (url.startsWith(SITE)) {
      return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, width: 1100, height: 900, icon: path.join(__dirname, 'icon.png') } };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Ctrl + колелце / Ctrl + +/- за още по-големи или по-малки букви
  win.webContents.on('zoom-changed', (e, dir) => {
    const z = win.webContents.getZoomLevel();
    win.webContents.setZoomLevel(dir === 'in' ? Math.min(z + 0.5, 4) : Math.max(z - 0.5, -3));
  });
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    const wc = win.webContents, z = wc.getZoomLevel();
    if (input.control && (input.key === '+' || input.key === '=')) { wc.setZoomLevel(Math.min(z + 0.5, 4)); e.preventDefault(); }
    if (input.control && input.key === '-') { wc.setZoomLevel(Math.max(z - 0.5, -3)); e.preventDefault(); }
    if (input.control && input.key === '0') { wc.setZoomLevel(0); e.preventDefault(); }
    if (input.key === 'F5') { wc.reload(); e.preventDefault(); }
  });
}

/* ---------- Печат ---------- */
ipcMain.handle('ki-printers', async () => {
  const list = await win.webContents.getPrintersAsync();
  return list.map(p => ({ name: p.name, displayName: p.displayName, isDefault: !!p.isDefault }));
});

// Печат на един лист (картинка) към принтер от Windows, без прозорец
ipcMain.handle('ki-print-image', async (e, dataUrl, o) => {
  const file = path.join(os.tmpdir(), `ki-print-${Date.now()}.html`);
  fs.writeFileSync(file, `<!doctype html><html><head><meta charset="utf-8"><style>
    @page{size:${o.a4 ? 'A4' : `${o.paperMm}mm ${Math.ceil(o.heightMm) + 1}mm`};margin:0}
    html,body{margin:0;padding:0;background:#fff}
    img{display:block;width:${o.widthMm}mm;margin:0 auto}
  </style></head><body><img src="${dataUrl}"></body></html>`);
  const pw = new BrowserWindow({ show: false, webPreferences: { offscreen: false } });
  try {
    await pw.loadFile(file);
    await Promise.race([new Promise((res, rej) => pw.webContents.print({
      silent: true, deviceName: o.deviceName, printBackground: true, color: false,
      margins: { marginType: 'none' },
      pageSize: o.a4 ? 'A4' : { width: Math.round(o.paperMm * 1000), height: Math.round((Math.ceil(o.heightMm) + 1) * 1000) },
    }, (ok, why) => ok ? res() : rej(new Error(why || 'Принтерът отказа')))),
      new Promise((_, rej) => setTimeout(() => rej(new Error('Принтерът не отговаря – проверете драйвера му в Windows')), 25000))]);
  } finally {
    pw.destroy();
    fs.unlink(file, () => {});
  }
  return true;
});

// Направо към мрежов термопринтер (порт 9100), без драйвер
ipcMain.handle('ki-raw', (e, target, base64) => new Promise((res, rej) => {
  const [host, port] = String(target).split(':');
  const sock = net.createConnection({ host, port: Number(port) || 9100, timeout: 8000 }, () => {
    sock.end(Buffer.from(base64, 'base64'), () => res(true));
  });
  sock.on('timeout', () => { sock.destroy(); rej(new Error('Принтерът ' + host + ' не отговаря')); });
  sock.on('error', err => rej(new Error('Няма връзка с ' + host + ': ' + err.message)));
}));

/* ---------- Файлове: PDF с подписи, договори – в Документи\Протоколи ---------- */
function docsDir() { const d = path.join(app.getPath('documents'), 'Протоколи'); fs.mkdirSync(d, { recursive: true }); return d; }
function uniqueFile(dir, name) {
  name = String(name || 'документ').replace(/[\\/:*?"<>|]+/g, ' ').trim();
  let file = path.join(dir, name);
  const ext = path.extname(file), base = file.slice(0, -ext.length || undefined);
  for (let i = 2; fs.existsSync(file); i++) file = `${base} (${i})${ext}`;
  return file;
}
const isOurFile = f => typeof f === 'string' && path.resolve(f).startsWith(docsDir());
ipcMain.handle('ki-save', (e, name, b64) => {
  try { const file = uniqueFile(docsDir(), name); fs.writeFileSync(file, Buffer.from(b64, 'base64')); return file; }
  catch (err) { return 'ERR ' + err.message; }
});
ipcMain.handle('ki-open', (e, file) => isOurFile(file) ? shell.openPath(file) : '');
ipcMain.handle('ki-show', (e, file) => { if (isOurFile(file)) shell.showItemInFolder(file); });
// Имейл / Viber: копира файла (за Ctrl+V), маркира го в папката и отваря пощата или Viber
function copyFileToClipboard(file) {
  try { if (process.platform === 'win32') clipboard.writeBuffer('FileNameW', Buffer.from(file + '\0', 'ucs2')); } catch (e) {}
}
ipcMain.handle('ki-share', async (e, file, mime, target, bcc, subject, text) => {
  if (!isOurFile(file)) return false;
  copyFileToClipboard(file);
  shell.showItemInFolder(file);
  const enc = encodeURIComponent;
  if (target === 'email') {
    const q = [bcc ? 'bcc=' + enc(bcc) : '', 'subject=' + enc(subject || ''), 'body=' + enc((text || '') + '\n\n')].filter(Boolean).join('&');
    await shell.openExternal('mailto:?' + q).catch(() => {});
  } else if (target === 'viber') {
    await shell.openExternal('viber://chats').catch(() => shell.openExternal('viber://').catch(() => {}));
  }
  return true;
});
// Вграден модул (Word → печат)
ipcMain.handle('ki-asset', (e, name) => /^[a-z0-9.-]+\.js$/.test(name) && fs.existsSync(path.join(__dirname, name)) ? fs.readFileSync(path.join(__dirname, name), 'utf8') : '');

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(() => { Menu.setApplicationMenu(null); setupDownloads(); createWindow(); });
app.on('window-all-closed', () => app.quit());
// Скрит прозорец за печат не бива да държи програмата отворена след затваряне
app.on('browser-window-created', (e, w) => { w.on('closed', () => { if (win && win.isDestroyed()) app.exit(0); }); });
