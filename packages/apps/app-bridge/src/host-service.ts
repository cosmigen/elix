/**
 * ELIX Local IPC Host Service Daemon
 * Zero-dependency WebSocket & HTTP Bridge listening on port 7391 for native Electron app windows.
 * 
 * @module @deepseek-ai/elix-app-bridge/host-service
 */

import * as path from 'node:path';
import * as os from 'node:os';
import { ElixAppManager } from './app-manager.js';
import {
  MemoryToolSink,
  MemoryCapabilityIndex,
  ConsoleConfirmationBroker,
  NativeWindowHost,
  ensureIpcServer,
} from './adapters/ports.js';
import { registerManagementTools } from './management-tools.js';

const PORT = parseInt(process.env.ELIX_IPC_PORT || '7391', 10);
const server = ensureIpcServer(PORT);

const elixDir = path.join(os.homedir(), '.elix');
const toolSink = new MemoryToolSink();
const capabilityIndex = new MemoryCapabilityIndex();
const confirmationBroker = new ConsoleConfirmationBroker(true);
const nativeWindowHost = new NativeWindowHost();

const appManager = new ElixAppManager({
  baseDir: elixDir,
  toolSink,
  capabilityIndex,
  confirmationBroker,
  windowHost: nativeWindowHost,
});
nativeWindowHost.setInstaller(appManager.installer);
registerManagementTools(toolSink, appManager.installer, appManager.windowHost);

console.log(`⚡ ELIX Host Service active on ws://127.0.0.1:${PORT} and http://127.0.0.1:${PORT}`);
console.log('Ready for incoming native window connections.');

const shutdown = async () => {
  console.log('Shutting down ELIX Host Service...');
  await server.close().catch(() => {});
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);