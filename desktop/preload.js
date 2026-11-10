// Дава на страницата достъп до принтерите и до папка Документи\Протоколи (само за нашите файлове).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('KIDesktop', {
  printers: () => ipcRenderer.invoke('ki-printers'),
  printImage: (dataUrl, opts) => ipcRenderer.invoke('ki-print-image', dataUrl, opts),
  raw: (target, base64) => ipcRenderer.invoke('ki-raw', target, base64),
  // същите имена като в приложението за телефон
  saveFile: (name, b64, mime) => ipcRenderer.invoke('ki-save', name, b64, mime),
  openFile: (file) => ipcRenderer.invoke('ki-open', file),
  shareFile: (file) => ipcRenderer.invoke('ki-show', file),
  shareTo: (file, mime, target, bcc, subject, text) => ipcRenderer.invoke('ki-share', file, mime, target, bcc, subject, text),
  asset: (name) => ipcRenderer.invoke('ki-asset', name),
  appVersion: () => ipcRenderer.invoke('ki-version'),
  update: (url, name) => ipcRenderer.invoke('ki-update', url, name),
  onUpdate: (cb) => ipcRenderer.on('ki-upd', (e, p, m) => cb(p, m)),
});
