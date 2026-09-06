const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

process.on('uncaughtException', (err) => {
  console.error('[native-shell] FATAL ERROR:', err);
});

app.whenReady().then(() => {
  const args = process.argv.slice(2);
  let rawUrl = args[0] || '';
  const width = parseInt(args[1], 10) || 1180;
  const height = parseInt(args[2], 10) || 780;
  const appId = args[3] || 'com.elix.app';

  console.log(`[native-shell] Starting ${appId} (${width}x${height})`);

  const win = new BrowserWindow({
    width,
    height,
    frame: false,
    show: true,
    backgroundColor: '#0b0f19',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false
    }
  });

  let cleanPath = rawUrl;
  if (cleanPath.startsWith('file:///')) {
    cleanPath = decodeURIComponent(cleanPath.replace('file:///', ''));
  }

  if (fs.existsSync(cleanPath)) {
    const validUrl = pathToFileURL(cleanPath).href;
    console.log(`[native-shell] Loading valid URL: ${validUrl}`);
    win.loadURL(validUrl).catch(e => console.error('[native-shell] loadURL error:', e));
  } else {
    console.error(`[native-shell] ERROR: File does not exist at ${cleanPath}`);
    win.loadURL(rawUrl).catch(e => console.error('[native-shell] fallback error:', e));
  }

  win.webContents.on('did-fail-load', (e, code, desc) => {
    console.error(`[native-shell] WebContents failed to load: ${code} - ${desc}`);
  });

  ipcMain.on('window-minimize', (e) => BrowserWindow.fromWebContents(e.sender)?.minimize());
  ipcMain.on('window-maximize', (e) => {
    const w = BrowserWindow.fromWebContents(e.sender);
    if (w?.isMaximized()) w.unmaximize(); else w?.maximize();
  });
  ipcMain.on('window-close', (e) => BrowserWindow.fromWebContents(e.sender)?.close());
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
