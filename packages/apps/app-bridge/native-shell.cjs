const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const { pathToFileURL } = require('url');

// Global reference prevents Garbage Collection from killing the window
let mainWindow = null;
let embeddedBridgeServer = null;
const connectedClients = new Set();

function encodeWsFrame(data) {
  const payload = Buffer.from(typeof data === 'string' ? data : JSON.stringify(data), 'utf8');
  const len = payload.length;

  if (len <= 125) {
    const header = Buffer.from([0x81, len]);
    return Buffer.concat([header, payload]);
  } else if (len <= 65535) {
    const header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
    return Buffer.concat([header, payload]);
  } else {
    const header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
    return Buffer.concat([header, payload]);
  }
}

function startEmbeddedBridge(port = 7391) {
  try {
    const server = http.createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      const parsedUrl = new URL(req.url || '/', `http://localhost:${port}`);
      if (parsedUrl.pathname === '/health' || parsedUrl.pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'ok',
          server: 'ELIX Native Embedded Bridge',
          port: port,
          clients: connectedClients.size,
        }));
        return;
      }

      if (req.method === 'POST' && parsedUrl.pathname === '/api/tool-result') {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        });
        return;
      }

      res.writeHead(404);
      res.end();
    });

    server.on('upgrade', (req, socket) => {
      const secKey = req.headers['sec-websocket-key'];
      if (!secKey) {
        socket.destroy();
        return;
      }

      const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
      const acceptKey = crypto
        .createHash('sha1')
        .update(secKey + GUID)
        .digest('base64');

      const headers = [
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${acceptKey}`,
        '\r\n',
      ];

      socket.write(headers.join('\r\n'));

      let clientAppId = 'unknown';
      try {
        const parsedUrl = new URL(req.url || '/', `http://localhost:${port}`);
        const appIdParam = parsedUrl.searchParams.get('appId');
        if (appIdParam) clientAppId = appIdParam;
      } catch (e) {}

      const client = {
        appId: clientAppId,
        socket,
        send: (msg) => {
          if (!socket.destroyed) {
            socket.write(encodeWsFrame(msg));
          }
        },
      };

      connectedClients.add(client);

      let buffer = Buffer.alloc(0);
      socket.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        while (buffer.length >= 2) {
          const firstByte = buffer[0];
          const opcode = firstByte & 0x0f;
          const secondByte = buffer[1];
          const isMasked = (secondByte & 0x80) === 0x80;
          let payloadLen = secondByte & 0x7f;
          let offset = 2;

          if (payloadLen === 126) {
            if (buffer.length < 4) break;
            payloadLen = buffer.readUInt16BE(2);
            offset = 4;
          } else if (payloadLen === 127) {
            if (buffer.length < 10) break;
            payloadLen = Number(buffer.readBigUInt64BE(2));
            offset = 10;
          }

          const maskLen = isMasked ? 4 : 0;
          if (buffer.length < offset + maskLen + payloadLen) {
            break;
          }

          let payload;
          if (isMasked) {
            const mask = buffer.subarray(offset, offset + 4);
            const maskedData = buffer.subarray(offset + 4, offset + 4 + payloadLen);
            payload = Buffer.alloc(payloadLen);
            for (let i = 0; i < payloadLen; i++) {
              payload[i] = (maskedData[i] || 0) ^ (mask[i % 4] || 0);
            }
          } else {
            payload = buffer.subarray(offset, offset + payloadLen);
          }

          buffer = buffer.subarray(offset + maskLen + payloadLen);

          if (opcode === 0x8) {
            connectedClients.delete(client);
            if (!socket.destroyed) socket.end();
            continue;
          }
          if (opcode === 0x9) {
            if (!socket.destroyed) {
              const pongHeader = Buffer.from([0x8a, payload.length]);
              socket.write(Buffer.concat([pongHeader, payload]));
            }
            continue;
          }
          if (opcode === 0xa) {
            continue;
          }

          if (opcode === 0x1) {
            const rawText = payload.toString('utf8');
            try {
              const packet = JSON.parse(rawText);
              if (packet.type === 'REGISTER') {
                if (packet.appId) client.appId = packet.appId;
                client.send({
                  type: 'REGISTER_ACK',
                  appId: client.appId,
                  status: 'ok',
                  server: 'embedded-bridge',
                });
              } else if (packet.type === 'PING' || packet.method === 'ping') {
                client.send({
                  type: 'PONG',
                  timestamp: Date.now(),
                });
              } else if (packet.type === 'TOOL_INVOKE' || packet.method === 'tools/call' || packet.jsonrpc === '2.0') {
                client.send({
                  jsonrpc: '2.0',
                  id: packet.id,
                  type: 'TOOL_RESULT',
                  result: { success: true, message: 'Processed by embedded bridge' },
                });
              }
            } catch (e) {
              // ignore malformed
            }
          }
        }
      });

      socket.on('close', () => {
        connectedClients.delete(client);
      });

      socket.on('error', () => {
        connectedClients.delete(client);
      });
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log('[native-shell] Port 7391 is already in use by external bridge daemon. Bypassing embedded server.');
        embeddedBridgeServer = null;
      } else {
        console.error('[native-shell] Embedded bridge server error:', err);
      }
    });

    server.listen(port, '127.0.0.1', () => {
      console.log(`[native-shell] Embedded WebSocket bridge listening on ws://127.0.0.1:${port}`);
      embeddedBridgeServer = server;
    });
  } catch (err) {
    console.error('[native-shell] Failed to initialize embedded bridge:', err);
  }
}

function stopEmbeddedBridge() {
  if (embeddedBridgeServer) {
    try {
      embeddedBridgeServer.close();
    } catch (e) {}
    embeddedBridgeServer = null;
  }
  connectedClients.clear();
}

app.whenReady().then(() => {
  // Start embedded bridge if port 7391 is free
  startEmbeddedBridge(7391);

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
  stopEmbeddedBridge();
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  stopEmbeddedBridge();
});
