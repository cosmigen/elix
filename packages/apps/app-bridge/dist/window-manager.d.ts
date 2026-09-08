/**
 * ELIX Native App Runtime & Dynamic App Bridge
 * Floating Frameless Window Host and Lifecycle Manager
 *
 * @module @deepseek-ai/elix-app-bridge/window-manager
 */
import { EventEmitter } from 'node:events';
import { ElixWindowIpcSession } from './ipc-channel.js';
import type { ElixAppInstaller } from './installer.js';
import type { ElixAppManifest, ElixAppWindowConfig, InstalledApp, WindowGeometry, WindowManagerEvents, WindowState } from './types.js';
export interface WindowManagerOptions {
    /** Screen width bounds for positioning (default: 1920) */
    screenWidth?: number;
    /** Screen height bounds for positioning (default: 1080) */
    screenHeight?: number;
    /** Custom base preload injection script */
    customPreloadScript?: string;
}
/**
 * Representation of a Floating Frameless ELIX Application Window
 */
export declare class ElixAppWindow extends EventEmitter {
    readonly id: string;
    readonly appId: string;
    readonly manifest: ElixAppManifest;
    readonly config: Required<Omit<ElixAppWindowConfig, 'maxWidth' | 'maxHeight' | 'backgroundColor'>> & {
        maxWidth?: number;
        maxHeight?: number;
        backgroundColor: string;
    };
    state: WindowState;
    geometry: WindowGeometry;
    savedGeometry?: WindowGeometry;
    alwaysOnTop: boolean;
    isMaximized: boolean;
    isMinimized: boolean;
    isFocused: boolean;
    readonly url: string;
    readonly ipcSession: ElixWindowIpcSession;
    readonly launchedAt: number;
    title: string;
    /** OS process ID of the spawned Electron/native host, if known */
    pid?: number;
    constructor(id: string, app: InstalledApp, url: string, initialGeometry: WindowGeometry, windowOverrides?: Partial<ElixAppWindowConfig>);
    /**
     * Focus the window
     */
    focus(): Promise<void>;
    /**
     * Minimize the window
     */
    minimize(): Promise<void>;
    /**
     * Maximize the window
     */
    maximize(screenWidth?: number, screenHeight?: number): Promise<void>;
    /**
     * Restore window from maximized state
     */
    unmaximize(): Promise<void>;
    /**
     * Toggle maximize / restore
     */
    toggleMaximize(screenWidth?: number, screenHeight?: number): Promise<void>;
    /**
     * Close the window
     */
    close(): Promise<void>;
    /**
     * Destroy the window handle (alias of close for native host teardown).
     */
    destroy(): void;
    /**
     * Set always on top behavior
     */
    setAlwaysOnTop(flag: boolean): Promise<void>;
    /**
     * Set window title
     */
    setTitle(title: string): Promise<void>;
    /**
     * Update window position
     */
    setPosition(x: number, y: number): Promise<void>;
    /**
     * Update window size with min/max constraint enforcement
     */
    setSize(width: number, height: number): Promise<void>;
    /**
     * Bidirectional Tool Dispatch:
     * Sends a tool call to the window's guest DOM and awaits execution from `window.elix.handle()`
     */
    sendToolCall<T = any, R = any>(capability: string, args: T, timeoutMs?: number): Promise<R>;
    /**
     * Generate preload script for this window instance
     */
    getPreloadScript(): string;
}
/**
 * ELIX Floating Window Host & Lifecycle Manager
 */
export declare class ElixWindowManager extends EventEmitter {
    private activeWindows;
    private installer?;
    private screenWidth;
    private screenHeight;
    private cascadeIndex;
    constructor(installer?: ElixAppInstaller, options?: WindowManagerOptions);
    /**
     * Typed event listener support
     */
    on<K extends keyof WindowManagerEvents>(event: K, listener: WindowManagerEvents[K]): this;
    emit<K extends keyof WindowManagerEvents>(event: K, ...args: Parameters<WindowManagerEvents[K]>): boolean;
    /**
     * Launch an installed ELIX application window.
     *
     * @param appId Unique application ID
     * @param initialRoute Optional initial URL hash or route (e.g. "/settings")
     * @param windowOverrides Optional window configuration overrides
     * @returns The active ElixAppWindow instance
     */
    launch(appId: string, initialRoute?: string, windowOverrides?: Partial<ElixAppWindowConfig>): Promise<ElixAppWindow>;
    /**
     * Focus a window by window ID or App ID
     */
    focus(appIdOrWindowId: string): Promise<boolean>;
    /**
     * Minimize a window by window ID or App ID
     */
    minimize(appIdOrWindowId: string): Promise<boolean>;
    /**
     * Maximize a window by window ID or App ID
     */
    maximize(appIdOrWindowId: string): Promise<boolean>;
    /**
     * Restore a window by window ID or App ID
     */
    unmaximize(appIdOrWindowId: string): Promise<boolean>;
    /**
     * Close a window by window ID or App ID
     */
    close(appIdOrWindowId: string): Promise<boolean>;
    /**
     * Set always on top for a window
     */
    setAlwaysOnTop(appIdOrWindowId: string, flag: boolean): Promise<boolean>;
    /**
     * Send a capability tool call to the active window of an application.
     * Awaits execution result from the client application's `window.elix.handle(capability, ...)`.
     *
     * @param appId Application ID
     * @param capabilityName Name of the capability tool
     * @param args Arguments to pass to the tool
     * @param timeoutMs Timeout in milliseconds
     * @returns Result returned by the client application
     */
    sendToolCall<T = any, R = any>(appId: string, capabilityName: string, args: T, timeoutMs?: number): Promise<R>;
    /**
     * Get an active window by window ID or App ID
     */
    getWindow(appIdOrWindowId: string): ElixAppWindow | undefined;
    /**
     * Get an active window by its App ID
     */
    getWindowByAppId(appId: string): ElixAppWindow | undefined;
    /**
     * List all currently active application windows
     */
    listWindows(): ElixAppWindow[];
    /**
     * Close all active windows
     */
    closeAll(): Promise<void>;
}
//# sourceMappingURL=window-manager.d.ts.map