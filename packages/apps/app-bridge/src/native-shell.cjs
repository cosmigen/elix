const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const Module = require('module');

// Register window action IPC handlers
ipcMain.on('window-minimize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  win?.minimize();
});
ipcMain.on('app-window-minimize', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize();
});
ipcMain.on('elix:window:minimize', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize();
});
ipcMain.on('WINDOW_MINIMIZE', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize();
});

ipcMain.on('window-maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win?.isMaximized()) {
    win.unmaximize();
  } else {
    win?.maximize();
  }
});
ipcMain.on('app-window-maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  win.isMaximized() ? win.unmaximize() : win.maximize();
});
ipcMain.on('elix:window:maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  win.isMaximized() ? win.unmaximize() : win.maximize();
});
ipcMain.on('WINDOW_MAXIMIZE', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  win.isMaximized() ? win.unmaximize() : win.maximize();
});

ipcMain.on('window-close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  win?.close();
});
ipcMain.on('app-window-close', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.destroy();
});
ipcMain.on('elix:window:close', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.destroy();
});
ipcMain.on('WINDOW_CLOSE', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.destroy();
});

// Disable problematic Chromium cache flags
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-http-cache');
app.commandLine.appendSwitch('no-sandbox');

const requireFromScript = Module.createRequire(__filename);

// Parse CLI arguments (supports both positional args and --key=val flags)
const args = process.argv.slice(2);
const getArg = (name, fallback = '') => {
  const arg = args.find(a => a.startsWith(`--${name}=`));
  return arg ? arg.split('=').slice(1).join('=').replace(/^["']|["']$/g, '') : fallback;
};

const positionalNonFlag = args.filter(a => !a.startsWith('--'));
const rawUrl = getArg('url', positionalNonFlag[0] || 'about:blank');
const width = parseInt(getArg('width', positionalNonFlag[1] || '1180'), 10) || 1180;
const height = parseInt(getArg('height', positionalNonFlag[2] || '780'), 10) || 780;
const minWidth = parseInt(getArg('minWidth', '400'), 10) || 400;
const minHeight = parseInt(getArg('minHeight', '300'), 10) || 300;
const title = getArg('title', 'ELIX Application');
const appId = getArg('appId', positionalNonFlag[3] || 'com.elix.app');

const WEB_PREFERENCES = {
  nodeIntegration: true,
  contextIsolation: false,
  webSecurity: false,
};

// Isolate user data directory to prevent access-denied cache locks
const isolatedUserData = path.join(os.tmpdir(), 'elix-runtime', appId);
try {
  fs.mkdirSync(isolatedUserData, { recursive: true });
  app.setPath('userData', isolatedUserData);
} catch (e) {
  // fallback to default if already accessible
}

try {
  fs.writeFileSync(path.join(isolatedUserData, 'electron.pid'), String(process.pid), 'utf8');
} catch (e) {}

let mainWindow = null;
let hostSocket = null;
let reconnectTimer = null;

function destroyWindowAndQuit() {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.destroy();
    }
  } catch (e) {}
  mainWindow = null;
  try {
    if (hostSocket) {
      hostSocket.close();
    }
  } catch (e) {}
  app.quit();
}

function forwardToRenderer(rawText) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const payload = JSON.stringify(String(rawText));
  mainWindow.webContents
    .executeJavaScript(
      `window.dispatchEvent(new CustomEvent('elix-ipc', { detail: ${payload} }));`
    )
    .catch(() => {});
}

function connectHostBridge() {
  let WSImpl = globalThis.WebSocket;
  try {
    WSImpl = requireFromScript('ws');
  } catch (e) {
    // use global WebSocket when available (Node 22+ / Electron)
  }
  if (!WSImpl) return;

  const url = `ws://127.0.0.1:7391/?appId=${encodeURIComponent(appId)}`;
  try {
    hostSocket = new WSImpl(url);
  } catch (e) {
    reconnectTimer = setTimeout(connectHostBridge, 1500);
    return;
  }

  const onOpen = () => {
    try {
      hostSocket.send(JSON.stringify({ type: 'REGISTER', appId }));
    } catch (e) {}
  };

  const onMessage = (data) => {
    const raw = typeof data === 'string' ? data : (data && data.data != null ? String(data.data) : data.toString());
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (e) {
      return;
    }
    if (msg.action === 'CLOSE' || msg.action === 'window-close' || msg.type === 'WINDOW_CLOSE' || msg.type === 'elix:window:close') {
      destroyWindowAndQuit();
      return;
    }
    if (msg.action === 'MINIMIZE' || msg.action === 'window-minimize' || msg.type === 'WINDOW_MINIMIZE' || msg.type === 'elix:window:minimize') {
      mainWindow?.minimize();
      return;
    }
    if (msg.action === 'MAXIMIZE' || msg.action === 'window-maximize' || msg.type === 'WINDOW_MAXIMIZE' || msg.type === 'elix:window:maximize') {
      if (mainWindow) {
        mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
      }
      return;
    }
    forwardToRenderer(raw);
  };

  const scheduleReconnect = () => {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connectHostBridge();
    }, 1500);
  };

  if (typeof hostSocket.on === 'function') {
    hostSocket.on('open', onOpen);
    hostSocket.on('message', (buf) => onMessage(buf));
    hostSocket.on('close', scheduleReconnect);
    hostSocket.on('error', () => {});
  } else {
    hostSocket.onopen = onOpen;
    hostSocket.onmessage = (ev) => onMessage(ev.data);
    hostSocket.onclose = scheduleReconnect;
    hostSocket.onerror = () => {};
  }
}

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width,
    height,
    minWidth,
    minHeight,
    frame: false,
    transparent: false,
    backgroundColor: '#0b0f19',
    title,
    webPreferences: WEB_PREFERENCES,
  });
  mainWindow = win;

  win.setMenuBarVisibility(false);

  // Clean duplicate file:/// protocol prefixes if present
  let safeUrl = rawUrl;
  if (!safeUrl.startsWith('http://') && !safeUrl.startsWith('https://') && !safeUrl.startsWith('about:')) {
    const cleanPath = safeUrl.replace(/^file:\/\/\/?/i, '').replace(/\\/g, '/');
    safeUrl = `file:///${cleanPath}`;
  }

  win.loadURL(safeUrl).catch((err) => {
    console.error('Failed to load URL:', safeUrl, err);
  });

  connectHostBridge();

  win.on('closed', () => {
    mainWindow = null;
    app.quit();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

process.on('SIGTERM', () => destroyWindowAndQuit());
process.on('SIGINT', () => destroyWindowAndQuit());
