/**
 * ELIX Native App Runtime & Dynamic App Bridge
 * Package entry exports (Types, Schemas, Manifest Validators, Ports, AppManager, and Cordis Plugin)
 *
 * @module @deepseek-ai/elix-app-bridge
 */
export * from './types.js';
export * from './schema.js';
export * from './validator.js';
export * from './installer.js';
export * from './utils/zip.js';
export * from './utils/prompts.js';
export * from './utils/prompt-driver.js';
export * from './ipc-channel.js';
export * from './window-manager.js';
export * from './capability-stub.js';
export * from './tool-registry.js';
export * from './management-tools.js';
export * from './adapters/ports.js';
export * from './app-manager.js';
export * from './data/storage-partition.js';
export * from './local-ipc-server.js';
export * from './sys-exec-stream.js';
export * from './sys-primitives.js';
export * from './native-window-host.js';
export * from './plugin.js';
export * from './tui/test-harness.js';
export { apply as default } from './plugin.js';
//# sourceMappingURL=index.js.map