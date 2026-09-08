/**
 * ELIX Native Window Host
 * Spawns real visual standalone app windows using Electron / native-shell.js with space-safe paths.
 *
 * @module @deepseek-ai/elix-app-bridge/native-window-host
 */
import type { WindowHost } from './adapters/ports.js';
import type { ElixAppWindowConfig } from './types.js';
import type { ElixAppWindow } from './window-manager.js';
import type { ElixAppInstaller } from './installer.js';
import { LocalIpcServer } from './local-ipc-server.js';
/** Electron BrowserWindow webPreferences used by native-shell.cjs */
export declare const NATIVE_WINDOW_WEB_PREFERENCES: {
    readonly nodeIntegration: true;
    readonly contextIsolation: false;
    readonly webSecurity: false;
};
export interface NativeWindowHostOptions {
    installer?: ElixAppInstaller;
    defaultTimeoutMs?: number;
    headless?: boolean;
}
export declare class NativeWindowHost implements WindowHost {
    private windows;
    private processes;
    private simulatedHandlers;
    private installer?;
    private defaultTimeoutMs;
    private options;
    readonly localServer: LocalIpcServer;
    constructor(options?: NativeWindowHostOptions);
    setInstaller(installer: ElixAppInstaller): void;
    registerCapabilityHandler(appId: string, capability: string, handler: (params: any) => Promise<any> | any): void;
    launch(appId: string, initialRoute?: string, windowOverrides?: Partial<ElixAppWindowConfig>): Promise<ElixAppWindow>;
    openWindow(appId: string, url?: string, options?: Partial<ElixAppWindowConfig>): Promise<ElixAppWindow>;
    private resolveElectronLaunchCommand;
    private spawnNativeDesktopWindow;
    private killProcessTree;
    focus(appIdOrWindowId: string): Promise<boolean>;
    close(appIdOrWindowId: string): Promise<boolean>;
    closeWindow(appIdOrWindowId: string): Promise<boolean>;
    closeApp(appId: string): Promise<boolean>;
    listWindows(): ElixAppWindow[];
    getWindow(appIdOrWindowId: string): ElixAppWindow | undefined;
    sendToolCall<T = any, R = any>(appId: string, capabilityName: string, args: T, timeoutMs?: number): Promise<R>;
    callAppCapability(appId: string, capability: string, params: any): Promise<any>;
}
declare global {
    var __ELIX_WSS__: LocalIpcServer | undefined;
}
/**
 * Ensure IPC WebSocket Server is active on local port (default: 7391)
 */
export declare function ensureIpcServer(port?: number): LocalIpcServer;
/**
 * Initialize IPC WebSocket Server on local port
 */
export declare function initIpcServer(port?: number): LocalIpcServer;
/**
 * Broadcast event payload to all active connected windows
 */
export declare function broadcastToWindows(event: object): void;
/**
 * Universal broadcast helper for tool execution and UI events
 */
export declare function broadcastEvent(eventData: Record<string, any>): void;
/**
 * Standalone helper to launch a native Electron window
 */
export declare function launchNativeWindow(targetUrl: string, width?: number, height?: number, appId?: string): void;
//# sourceMappingURL=native-window-host.d.ts.map