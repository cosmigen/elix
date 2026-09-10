/**
 * ELIX OS Desktop Entry Supervisor
 * Standalone Electron entry point for the ELIX OS desktop environment.
 * 
 * - Ensures local IPC bridge is active on port 7391 (starts background host service if needed)
 * - Seeds default applications from demo-apps/ to ~/.elix/apps if com.elix.appcenter is not present
 * - Creates primary frameless desktop window (1180x780, min 800x600, 'ELIX OS Desktop')
 * - Connects to local IPC bridge at ws://127.0.0.1:7391/?appId=com.elix.appcenter
 * 
 * @module @deepseek-ai/elix-app-bridge/desktop-entry
 */

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const net = require('net');
const child_process = require('child_process');
const { pathToFileURL } = require('url');

const APP_ID = 'com.elix.appcenter';
const IPC_PORT = 7391;

let mainWindow = null;
let hostSocket = null;
let reconnectTimer = null;

app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-http-cache');
app.commandLine.appendSwitch('no-sandbox');

const isolatedUserData = path.join(os.tmpdir(), 'elix-runtime', APP_ID);
try {
  fs.mkdirSync(isolatedUserData, { recursive: true });
  app.setPath('userData', isolatedUserData);
} catch (e) {}

try {
  fs.writeFileSync(path.join(isolatedUserData, 'electron.pid'), String(process.pid), 'utf8');
} catch (e) {}

ipcMain.on('app-window-minimize', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize();
});
ipcMain.on('elix:window:minimize', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize();
});
ipcMain.on('WINDOW_MINIMIZE', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize();
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

ipcMain.on('app-window-close', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.destroy();
});
ipcMain.on('elix:window:close', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.destroy();
});
ipcMain.on('WINDOW_CLOSE', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.destroy();
});

function launchAppWindow(appId) {
  if (!appId) return null;
  console.log('[ELIX Desktop] Request to launch application:', appId);

  const homedirAppIndex = path.join(os.homedir(), '.elix', 'apps', appId, 'index.html');
  const candidateAppPaths = [
    homedirAppIndex,
    path.resolve(__dirname, 'demo-apps/' + appId + '/index.html'),
    path.resolve(__dirname, '../demo-apps/' + appId + '/index.html'),
    path.resolve(__dirname, '../../demo-apps/' + appId + '/index.html'),
    path.resolve(process.cwd(), 'demo-apps/' + appId + '/index.html'),
    path.resolve(process.cwd(), 'packages/apps/app-bridge/demo-apps/' + appId + '/index.html'),
  ];

  let targetPath = candidateAppPaths.find((p) => fs.existsSync(p));
  if (!targetPath) {
    console.warn('[ELIX Desktop] Target index.html not found for appId:', appId);
    return null;
  }

  let width = 960;
  let height = 640;
  let title = appId;
  const manifestPath = path.join(path.dirname(targetPath), 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    try {
      const mf = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (mf.window?.width) width = mf.window.width;
      if (mf.window?.height) height = mf.window.height;
      if (mf.name) title = mf.name;
    } catch (e) {}
  }

  const appWin = new BrowserWindow({
    width,
    height,
    minWidth: 400,
    minHeight: 300,
    frame: false,
    titleBarStyle: 'hidden',
    title: title,
    backgroundColor: '#0b0f19',
    show: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
    },
  });

  appWin.setMenuBarVisibility(false);
  const targetUrl = pathToFileURL(targetPath).href;
  console.log('[ELIX Desktop] Loading child app URL:', targetUrl);
  appWin.loadURL(targetUrl).catch((err) => {
    console.error('[ELIX Desktop] Failed to load app URL:', targetUrl, err);
  });

  return appWin;
}

ipcMain.on('launch-app', (event, appId) => {
  launchAppWindow(appId);
});
ipcMain.on('LAUNCH_APP', (event, appId) => {
  launchAppWindow(appId);
});

function isPortActive(port, timeoutMs = 600) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host: '127.0.0.1' });
    let completed = false;
    socket.setTimeout(timeoutMs);

    socket.on('connect', () => {
      completed = true;
      socket.end();
      resolve(true);
    });

    socket.on('error', () => {
      if (!completed) {
        completed = true;
        resolve(false);
      }
    });

    socket.on('timeout', () => {
      if (!completed) {
        completed = true;
        socket.destroy();
        resolve(false);
      }
    });
  });
}

async function ensureHostService() {
  const active = await isPortActive(IPC_PORT);
  if (active) {
    console.log('[ELIX Desktop] IPC server is already active on port ' + IPC_PORT + '.');
    return;
  }

  console.log('[ELIX Desktop] IPC server on port ' + IPC_PORT + ' is not active. Launching host service...');

  const candidateHostPaths = [
    path.resolve(__dirname, 'host-service.js'),
    path.resolve(__dirname, '../dist/host-service.js'),
    path.resolve(__dirname, 'dist/host-service.js'),
    path.resolve(__dirname, '../src/host-service.ts'),
    path.resolve(__dirname, 'host-service.ts'),
    path.resolve(process.cwd(), 'dist/host-service.js'),
    path.resolve(process.cwd(), 'packages/apps/app-bridge/dist/host-service.js'),
    path.resolve(process.cwd(), 'src/host-service.ts'),
    path.resolve(process.cwd(), 'packages/apps/app-bridge/src/host-service.ts'),
  ];

  const hostFile = candidateHostPaths.find((p) => fs.existsSync(p));

  if (hostFile && hostFile.endsWith('.js')) {
    try {
      const child = child_process.fork(hostFile, [], {
        detached: true,
        stdio: 'ignore',
        env: Object.assign({}, process.env, { ELIX_IPC_PORT: String(IPC_PORT) }),
      });
      if (child.unref) child.unref();
      console.log('[ELIX Desktop] Forked background host service (PID: ' + child.pid + ') from: ' + hostFile);
    } catch (forkErr) {
      console.warn('[ELIX Desktop] Fork failed, attempting dynamic import:', forkErr.message);
      try {
        await import(pathToFileURL(hostFile).href);
      } catch (impErr) {
        console.error('[ELIX Desktop] Dynamic import failed:', impErr);
      }
    }
  } else if (hostFile && hostFile.endsWith('.ts')) {
    try {
      const tsxCandidatePaths = [
        path.resolve(process.cwd(), 'node_modules/tsx/dist/cli.mjs'),
        path.resolve(__dirname, '../node_modules/tsx/dist/cli.mjs'),
        path.resolve(__dirname, '../../../node_modules/tsx/dist/cli.mjs'),
        'C:/Users/S.LAKSHMI NARAYANA/.gemini/antigravity/scratch/elix-memory/node_modules/tsx/dist/cli.mjs',
      ];
      const tsxCli = tsxCandidatePaths.find((p) => fs.existsSync(p));
      if (tsxCli) {
        const child = child_process.spawn(process.execPath, [tsxCli, hostFile], {
          detached: true,
          stdio: 'ignore',
          env: Object.assign({}, process.env, { ELIX_IPC_PORT: String(IPC_PORT) }),
        });
        if (child.unref) child.unref();
        console.log('[ELIX Desktop] Spawned host service via tsx (PID: ' + child.pid + ')');
      }
    } catch (err) {
      console.error('[ELIX Desktop] Failed to spawn TS host service:', err);
    }
  } else {
    const candidatePorts = [
      path.resolve(__dirname, '../dist/adapters/ports.js'),
      path.resolve(__dirname, 'adapters/ports.js'),
      path.resolve(process.cwd(), 'dist/adapters/ports.js'),
      path.resolve(process.cwd(), 'packages/apps/app-bridge/dist/adapters/ports.js'),
    ];
    const portsFile = candidatePorts.find((p) => fs.existsSync(p));
    if (portsFile) {
      try {
        const mod = await import(pathToFileURL(portsFile).href);
        if (typeof mod.ensureIpcServer === 'function') {
          mod.ensureIpcServer(IPC_PORT);
        }
      } catch (e) {
        console.error('[ELIX Desktop] Failed to invoke ensureIpcServer:', e);
      }
    }
  }

  for (let i = 0; i < 15; i++) {
    if (await isPortActive(IPC_PORT, 200)) {
      console.log('[ELIX Desktop] Host service is now listening on ws://127.0.0.1:' + IPC_PORT);
      break;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
}

function seedDefaultApps() {
  const elixAppsDir = path.join(os.homedir(), '.elix', 'apps');
  const appCenterTarget = path.join(elixAppsDir, APP_ID);

  if (!fs.existsSync(appCenterTarget)) {
    const candidateDemoDirs = [
      path.resolve(__dirname, 'demo-apps'),
      path.resolve(__dirname, '../demo-apps'),
      path.resolve(__dirname, '../../demo-apps'),
      path.resolve(process.cwd(), 'demo-apps'),
      path.resolve(process.cwd(), 'packages/apps/app-bridge/demo-apps'),
    ];

    const demoDir = candidateDemoDirs.find((d) => fs.existsSync(d));
    if (demoDir) {
      try {
        fs.mkdirSync(elixAppsDir, { recursive: true });

        const copyDirRecursive = (src, dest) => {
          if (!fs.existsSync(src)) return;
          fs.mkdirSync(dest, { recursive: true });
          for (const item of fs.readdirSync(src, { withFileTypes: true })) {
            const sPath = path.join(src, item.name);
            const dPath = path.join(dest, item.name);
            if (item.isDirectory()) {
              copyDirRecursive(sPath, dPath);
            } else {
              fs.copyFileSync(sPath, dPath);
            }
          }
        };

        for (const item of fs.readdirSync(demoDir)) {
          const srcItem = path.join(demoDir, item);
          const destItem = path.join(elixAppsDir, item);
          if (fs.statSync(srcItem).isDirectory()) {
            copyDirRecursive(srcItem, destItem);
          }
        }
        console.log('[ELIX Desktop] Successfully seeded default applications to: ' + elixAppsDir);
      } catch (err) {
        console.error('[ELIX Desktop] Failed to seed default applications:', err);
      }
    }
  }
}

function connectHostBridge() {
  let WSImpl = globalThis.WebSocket;
  try {
    WSImpl = require('ws');
  } catch (e) {}

  if (!WSImpl) return;

  const url = 'ws://127.0.0.1:' + IPC_PORT + '/?appId=' + encodeURIComponent(APP_ID);

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connectHostBridge();
    }, 1500);
  }

  try {
    hostSocket = new WSImpl(url);
  } catch (e) {
    scheduleReconnect();
    return;
  }

  const onOpen = () => {
    try {
      hostSocket.send(JSON.stringify({ type: 'REGISTER', appId: APP_ID }));
      console.log('[ELIX Desktop] Connected to local IPC bridge at ' + url);
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

    if (msg.action === 'CLOSE' || msg.type === 'WINDOW_CLOSE' || msg.type === 'elix:window:close') {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.destroy();
      }
      app.quit();
      return;
    }

    if (msg.action === 'MINIMIZE' || msg.type === 'WINDOW_MINIMIZE' || msg.type === 'elix:window:minimize') {
      mainWindow?.minimize();
      return;
    }

    if (msg.action === 'MAXIMIZE' || msg.type === 'WINDOW_MAXIMIZE' || msg.type === 'elix:window:maximize') {
      if (mainWindow) {
        mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
      }
      return;
    }

    if ((msg.type === 'LAUNCH_APP' || msg.action === 'LAUNCH_APP') && msg.appId) {
      launchAppWindow(msg.appId);
      return;
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      const payload = JSON.stringify(String(raw));
      mainWindow.webContents
        .executeJavaScript('window.dispatchEvent(new CustomEvent(\x27elix-ipc\x27, { detail: ' + payload + ' }));')
        .catch(() => {});
    }
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

app.whenReady().then(async () => {
  await ensureHostService();
  seedDefaultApps();

  const installedAppCenter = path.join(os.homedir(), '.elix', 'apps', APP_ID, 'index.html');
  const candidateDemoAppCenter = [
    path.resolve(__dirname, 'demo-apps/' + APP_ID + '/index.html'),
    path.resolve(__dirname, '../demo-apps/' + APP_ID + '/index.html'),
    path.resolve(__dirname, '../../demo-apps/' + APP_ID + '/index.html'),
    path.resolve(process.cwd(), 'demo-apps/' + APP_ID + '/index.html'),
    path.resolve(process.cwd(), 'packages/apps/app-bridge/demo-apps/' + APP_ID + '/index.html'),
  ];

  let targetHtmlPath = '';
  if (fs.existsSync(installedAppCenter)) {
    targetHtmlPath = installedAppCenter;
  } else {
    const fallback = candidateDemoAppCenter.find((p) => fs.existsSync(p));
    if (fallback) {
      targetHtmlPath = fallback;
    }
  }

  const targetUrl = targetHtmlPath
    ? pathToFileURL(targetHtmlPath).href
    : pathToFileURL(installedAppCenter).href;

  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    title: 'ELIX OS Desktop',
    backgroundColor: '#0b0f19',
    show: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);

  console.log('[ELIX Desktop] Loading primary window URL: ' + targetUrl);
  mainWindow.loadURL(targetUrl).catch((err) => {
    console.error('[ELIX Desktop] Failed to load URL:', targetUrl, err);
  });

  connectHostBridge();

  mainWindow.on('closed', () => {
    mainWindow = null;
    app.quit();
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
});

process.on('SIGINT', () => {
  if (hostSocket) try { hostSocket.close(); } catch(e) {}
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
  app.quit();
});

process.on('SIGTERM', () => {
  if (hostSocket) try { hostSocket.close(); } catch(e) {}
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
  app.quit();
});
