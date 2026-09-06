const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const { pathToFileURL } = require('url');

// Global reference prevents Garbage Collection from killing the window
let mainWindow = null;

app.whenReady().then(() => {
  const args = process.argv.slice(2);
  const rawTarget = args[0] || '';
  const width = parseInt(args[1], 10) || 680;
  const height = parseInt(args[2], 10) || 600;
  const appId = args[3] || 'com.elix.notes';

  mainWindow = new BrowserWindow({
    width: width,
    height: height,
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

  ipcMain.on('window-minimize', () => { if (mainWindow) mainWindow.minimize(); });
  ipcMain.on('app-window-minimize', () => { if (mainWindow) mainWindow.minimize(); });
  ipcMain.on('elix:window:minimize', () => { if (mainWindow) mainWindow.minimize(); });
  ipcMain.on('WINDOW_MINIMIZE', () => { if (mainWindow) mainWindow.minimize(); });

  ipcMain.on('window-maximize', () => {
    if (!mainWindow) return;
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  });
  ipcMain.on('app-window-maximize', () => {
    if (!mainWindow) return;
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  });
  ipcMain.on('elix:window:maximize', () => {
    if (!mainWindow) return;
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  });
  ipcMain.on('WINDOW_MAXIMIZE', () => {
    if (!mainWindow) return;
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  });

  ipcMain.on('window-close', () => { if (mainWindow) mainWindow.close(); });
  ipcMain.on('app-window-close', () => { if (mainWindow) mainWindow.close(); });
  ipcMain.on('elix:window:close', () => { if (mainWindow) mainWindow.close(); });
  ipcMain.on('WINDOW_CLOSE', () => { if (mainWindow) mainWindow.close(); });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
