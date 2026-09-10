/**
 * ELIX Local WebSocket & HTTP IPC Server
 * Zero-dependency RFC-6455 WebSocket and HTTP Bridge built on native node:http & node:crypto.
 * Enables live bidirectional communication between host runtime and physical browser windows.
 * 
 * @module @deepseek-ai/elix-app-bridge/local-ipc-server
 */

import * as http from 'node:http';
import * as crypto from 'node:crypto';
import * as net from 'node:net';
import * as child_process from 'node:child_process';
import { EventEmitter } from 'node:events';
import { globalSysExecManager, SysExecParams } from './sys-exec-stream.js';
import { sysFsList, sysFsReadWrite, sysHardwareScan, FsReadWriteParams } from './sys-primitives.js';

export interface LocalIpcServerOptions {
  port?: number;
}

export interface IpcClientConnection {
  appId: string;
  send: (data: string) => void;
  close: () => void;
}

export class LocalIpcServer extends EventEmitter {
  private server?: http.Server;
  private clients = new Map<string, Set<IpcClientConnection>>();
  private allClients = new Set<IpcClientConnection>();
  private pendingCalls = new Map<
    string,
    {
      resolve: (res: any) => void;
      reject: (err: any) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  public readonly port: number;
  private isRunning: boolean = false;
  private portReclaimAttempted: boolean = false;

  constructor(options?: LocalIpcServerOptions) {
    super();
    this.port = options?.port ?? 7391;
  }

  public async start(): Promise<void> {
    if (this.isRunning && this.server?.listening) return;

    return new Promise((resolve) => {
      const attachServer = () => {
      this.server = http.createServer((req, res) => {
        // CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        const parsedUrl = new URL(req.url || '/', `http://localhost:${this.port}`);

        if (parsedUrl.pathname === '/health' || parsedUrl.pathname === '/') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: 'ok',
            server: 'ELIX Native IPC Bridge',
            port: this.port,
            clients: this.getClientCount(),
          }));
          return;
        }

        // HTTP POST tool result fallback
        if (req.method === 'POST' && parsedUrl.pathname === '/api/tool-result') {
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', () => {
            try {
              const packet = JSON.parse(body);
              this.handleIncomingPacket(packet);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true }));
            } catch {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Invalid JSON' }));
            }
          });
          return;
        }

        res.writeHead(404);
        res.end();
      });

      // Handle WebSocket RFC-6455 Upgrade Handshake
      this.server.on('upgrade', (req: http.IncomingMessage, socket: net.Socket) => {
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
          const parsedUrl = new URL(req.url || '/', `http://localhost:${this.port}`);
          const appIdParam = parsedUrl.searchParams.get('appId');
          if (appIdParam) clientAppId = appIdParam;
        } catch {
          // ignore
        }

        const clientConn: IpcClientConnection = {
          appId: clientAppId,
          send: (data: string) => {
            if (!socket.destroyed) {
              const frame = this.encodeWsFrame(data);
              socket.write(frame);
            }
          },
          close: () => {
            if (!socket.destroyed) {
              socket.end();
            }
          },
        };

        this.registerClient(clientAppId, clientConn);

        let buffer = Buffer.alloc(0);

        socket.on('data', (chunk) => {
          buffer = Buffer.concat([buffer, chunk]);
          while (buffer.length >= 2) {
            const firstByte = buffer[0]!;
            const opcode = firstByte & 0x0f;
            const secondByte = buffer[1]!;
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

            let payload: Buffer;
            if (isMasked) {
              const mask = buffer.subarray(offset, offset + 4);
              const maskedData = buffer.subarray(offset + 4, offset + 4 + payloadLen);
              payload = Buffer.alloc(payloadLen);
              for (let i = 0; i < payloadLen; i++) {
                payload[i] = (maskedData[i] ?? 0) ^ (mask[i % 4] ?? 0);
              }
            } else {
              payload = buffer.subarray(offset, offset + payloadLen);
            }

            buffer = buffer.subarray(offset + maskLen + payloadLen);

            if (opcode === 0x8) {
              this.unregisterClient(clientConn.appId, clientConn);
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

            // Handle Text Frame
            const rawText = payload.toString('utf8');
            try {
              const packet = JSON.parse(rawText);
              if (packet.type === 'REGISTER' && packet.appId) {
                this.unregisterClient(clientAppId, clientConn);
                clientAppId = packet.appId;
                clientConn.appId = clientAppId;
                this.registerClient(clientAppId, clientConn);
                clientConn.send(JSON.stringify({ type: 'REGISTER_ACK', appId: clientAppId, status: 'ok' }));
              } else {
                this.handleIncomingPacket(packet, clientConn);
              }
            } catch {
              // ignore malformed
            }
          }
        });

        socket.on('close', () => {
          this.unregisterClient(clientConn.appId, clientConn);
        });

        socket.on('error', () => {
          this.unregisterClient(clientConn.appId, clientConn);
        });
      });

      this.server.listen(this.port, '127.0.0.1', () => {
        this.isRunning = true;
        resolve();
      });

      this.server.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE' && !this.portReclaimAttempted) {
          this.portReclaimAttempted = true;
          this.reclaimPort();
          try {
            this.server?.close();
          } catch {
            // ignore
          }
          this.isRunning = false;
          this.server = undefined;
          setTimeout(() => {
            void this.start().then(() => resolve());
          }, 250);
        } else {
          this.isRunning = Boolean(this.server?.listening);
          resolve();
        }
      });
      };

      attachServer();
    });
  }

  private reclaimPort(): void {
    try {
      if (process.platform === 'win32') {
        const out = child_process.execSync(`netstat -ano | findstr :${this.port}`, { encoding: 'utf8' });
        const pids = new Set<number>();
        for (const line of out.split(/\r?\n/)) {
          if (!/LISTENING/i.test(line)) continue;
          const parts = line.trim().split(/\s+/);
          const pid = parseInt(parts[parts.length - 1] || '', 10);
          if (!Number.isNaN(pid) && pid !== process.pid) pids.add(pid);
        }
        for (const pid of pids) {
          try {
            child_process.execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
          } catch {
            // ignore
          }
        }
      }
    } catch {
      // ignore
    }
  }

  private encodeWsFrame(data: string): Buffer {
    const payload = Buffer.from(data, 'utf8');
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

  private handleIncomingPacket(packet: any, clientConn?: IpcClientConnection): void {
    if (!packet || typeof packet !== 'object') return;

    if (packet.type === 'LAUNCH_APP' || packet.action === 'LAUNCH_APP') {
      this.broadcast(packet);
      this.emit('launch_app', packet.appId, packet);
    }

    // Check for JSON-RPC 2.0 tools/call or sys_exec_code execution request
    if (packet.jsonrpc === '2.0' || packet.method) {
      if (
        (packet.method === 'tools/call' && (packet.params?.name === 'sys_exec_code' || packet.params?.tool === 'sys_exec_code')) ||
        packet.method === 'sys_exec_code'
      ) {
        const p = packet.params?.arguments || packet.params || {};
        const execParams: SysExecParams = {
          executionId: p.executionId || `exec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          command: p.command || 'node',
          args: p.args || [],
          code: p.code,
          language: p.language,
          timeoutMs: p.timeoutMs,
          cwd: p.cwd,
          env: p.env,
          batchIntervalMs: p.batchIntervalMs,
        };

        const sender = (msg: any) => {
          if (clientConn) {
            try {
              clientConn.send(JSON.stringify(msg));
              return true;
            } catch {
              return false;
            }
          }
          return false;
        };

        globalSysExecManager.execute(
          execParams,
          sender,
          (res: any) => {
            if (clientConn) {
              try {
                clientConn.send(JSON.stringify({ id: packet.id, ...res }));
              } catch {}
            }
          },
          clientConn
        );
        return;
      }

      // sys_fs_list
      if (
        (packet.method === 'tools/call' && (packet.params?.name === 'sys_fs_list' || packet.params?.tool === 'sys_fs_list')) ||
        packet.method === 'sys_fs_list'
      ) {
        const p = packet.params?.arguments || packet.params || {};
        void sysFsList(p.dirPath, p.includeHidden)
          .then((res) => {
            if (clientConn) {
              clientConn.send(JSON.stringify({ jsonrpc: '2.0', id: packet.id, result: res }));
            }
          })
          .catch((err: any) => {
            if (clientConn) {
              clientConn.send(JSON.stringify({ jsonrpc: '2.0', id: packet.id, error: { code: -32603, message: err.message } }));
            }
          });
        return;
      }

      // sys_fs_read_write
      if (
        (packet.method === 'tools/call' && (packet.params?.name === 'sys_fs_read_write' || packet.params?.tool === 'sys_fs_read_write')) ||
        packet.method === 'sys_fs_read_write'
      ) {
        const p: FsReadWriteParams = packet.params?.arguments || packet.params || {};
        void sysFsReadWrite(p)
          .then((res) => {
            if (clientConn) {
              clientConn.send(JSON.stringify({ jsonrpc: '2.0', id: packet.id, result: res }));
            }
          })
          .catch((err: any) => {
            if (clientConn) {
              clientConn.send(JSON.stringify({ jsonrpc: '2.0', id: packet.id, error: { code: -32603, message: err.message } }));
            }
          });
        return;
      }

      // sys_hardware_scan
      if (
        (packet.method === 'tools/call' && (packet.params?.name === 'sys_hardware_scan' || packet.params?.tool === 'sys_hardware_scan')) ||
        packet.method === 'sys_hardware_scan'
      ) {
        void sysHardwareScan()
          .then((res) => {
            if (clientConn) {
              clientConn.send(JSON.stringify({ jsonrpc: '2.0', id: packet.id, result: res }));
            }
          })
          .catch((err: any) => {
            if (clientConn) {
              clientConn.send(JSON.stringify({ jsonrpc: '2.0', id: packet.id, error: { code: -32603, message: err.message } }));
            }
          });
        return;
      }
    }

    if (packet.type === 'TOOL_RESULT' || packet.type === 'TOOL_ERROR') {
      const callId = packet.id;
      if (callId && this.pendingCalls.has(callId)) {
        const pending = this.pendingCalls.get(callId)!;
        clearTimeout(pending.timer);
        this.pendingCalls.delete(callId);

        if (packet.type === 'TOOL_ERROR') {
          pending.reject(new Error(packet.error?.message || 'Tool execution failed in webview'));
        } else {
          pending.resolve(packet.payload ?? packet.result);
        }
      }
    }
  }

  public getClientCount(): number {
    return this.allClients.size;
  }

  private registerClient(appId: string, client: IpcClientConnection): void {
    this.allClients.add(client);
    if (!this.clients.has(appId)) {
      this.clients.set(appId, new Set());
    }
    this.clients.get(appId)!.add(client);
    console.log(`[IPC Bridge] UI window connected (${appId}). Total active clients: ${this.getClientCount()}`);
    this.emit('client:connected', { appId });
  }

  private unregisterClient(appId: string, client: IpcClientConnection): void {
    globalSysExecManager.handleClientDisconnect(client);
    this.allClients.delete(client);
    const set = this.clients.get(appId);
    if (set) {
      set.delete(client);
      if (set.size === 0) {
        this.clients.delete(appId);
        this.emit('client:disconnected', { appId });
      }
    }
    for (const [id, group] of this.clients.entries()) {
      if (group.has(client)) {
        group.delete(client);
        if (group.size === 0) this.clients.delete(id);
      }
    }
  }

  public hasClient(appId: string): boolean {
    const set = this.clients.get(appId);
    return set !== undefined && set.size > 0;
  }

  public async sendToolCall<T = any, R = any>(
    appId: string,
    capability: string,
    args: T,
    timeoutMs: number = 5000
  ): Promise<R> {
    const set = this.clients.get(appId);
    if (!set || set.size === 0) {
      throw new Error(`No active WebSocket client connected for app '${appId}'`);
    }

    const clientList = Array.from(set);
    const client = clientList[0];
    if (!client) {
      throw new Error(`No active WebSocket client connected for app '${appId}'`);
    }

    const callId = `ipc_call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    return new Promise<R>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingCalls.delete(callId);
        reject(new Error(`Tool call '${capability}' on app '${appId}' timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingCalls.set(callId, { resolve, reject, timer });

      client.send(
        JSON.stringify({
          type: 'TOOL_INVOKE',
          id: callId,
          appId,
          payload: {
            capability,
            args,
          },
        })
      );
    });
  }

  public sendClose(appId: string): void {
    const set = this.clients.get(appId);
    if (set) {
      for (const client of set) {
        try {
          client.send(JSON.stringify({ action: 'CLOSE', type: 'WINDOW_CLOSE', appId }));
          client.close();
        } catch {}
      }
      this.clients.delete(appId);
    }
  }

  public broadcast(event: object): void {
    const raw = JSON.stringify(event);
    const clientCount = this.getClientCount();
    console.log(`[IPC Bridge] Pushing update to ${clientCount} client(s)...`);
    for (const set of this.clients.values()) {
      for (const client of set) {
        try {
          client.send(raw);
        } catch {
          // ignore
        }
      }
    }
  }

  public async stop(): Promise<void> {
    if (this.server) {
      await new Promise((r) => this.server?.close(() => r(true)));
      this.server = undefined;
    }
    this.isRunning = false;
  }

  public async close(): Promise<void> {
    return this.stop();
  }
}

declare global {
  var __ELIX_IPC_SERVER__: LocalIpcServer | undefined;
}

export function getLocalIpcServer(port?: number): LocalIpcServer {
  if (!globalThis.__ELIX_IPC_SERVER__) {
    globalThis.__ELIX_IPC_SERVER__ = new LocalIpcServer({ port });
  }
  return globalThis.__ELIX_IPC_SERVER__;
}
