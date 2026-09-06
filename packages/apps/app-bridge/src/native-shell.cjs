const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const { pathToFileURL } = require('url');

let mainWindow = null;

app.whenReady().then(() => {
  const args = process.argv.slice(2);
  const rawTarget = args[0] || '';
  const width = parseInt(args[1], 10) || 680;
  const height = parseInt(args[2], 10) || 600;

  mainWindow = new BrowserWindow({
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

  let cleanPath = rawTarget.replace(/^file:\/\/\//, '').replace(/^file:\/\//, '');
  cleanPath = decodeURIComponent(cleanPath);

  if (fs.existsSync(cleanPath)) {
    mainWindow.loadURL(pathToFileURL(cleanPath).href);
  } else {
    mainWindow.loadURL(rawTarget);
  }

  ipcMain.on('window-minimize', () => mainWindow?.minimize());
  ipcMain.on('app-window-minimize', () => mainWindow?.minimize());
  ipcMain.on('elix:window:minimize', () => mainWindow?.minimize());
  ipcMain.on('WINDOW_MINIMIZE', () => mainWindow?.minimize());

  ipcMain.on('window-maximize', () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize());
  ipcMain.on('app-window-maximize', () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize());
  ipcMain.on('elix:window:maximize', () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize());
  ipcMain.on('WINDOW_MAXIMIZE', () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize());

  ipcMain.on('window-close', () => mainWindow?.close());
  ipcMain.on('app-window-close', () => mainWindow?.close());
  ipcMain.on('elix:window:close', () => mainWindow?.close());
  ipcMain.on('WINDOW_CLOSE', () => mainWindow?.close());
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});