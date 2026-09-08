/**
 * ELIX Native App Runtime & Dynamic App Bridge
 * Interactive Terminal UI (TUI) Test Harness (ELIXAPP Spec v1.2.0 Standalone)
 *
 * Directly orchestrates the standalone ElixAppManager instance and mock adapter ports.
 *
 * @module @deepseek-ai/elix-app-bridge/tui/test-harness
 */
/**
 * Initialize test harness WebSocket Server
 */
export declare function initTestHarnessWss(port?: number): import("../local-ipc-server.js").LocalIpcServer;
/**
 * Broadcast tool execution result to all connected client windows
 */
export declare function broadcastToolResult(payload: any): void;
/**
 * Package a demo directory into a .elixapp archive
 */
export declare function packageDemoApp(demoDir: string, outputZipPath: string): void;
/**
 * Main Interactive TUI Loop
 */
export declare function runTui(): Promise<void>;
//# sourceMappingURL=test-harness.d.ts.map