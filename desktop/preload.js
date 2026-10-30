// Дава на страницата достъп до принтерите на компютъра (само за печат).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('KIDesktop', {
  printers: () => ipcRenderer.invoke('ki-printers'),
  printImage: (dataUrl, opts) => ipcRenderer.invoke('ki-print-image', dataUrl, opts),
  raw: (target, base64) => ipcRenderer.invoke('ki-raw', target, base64),
});
