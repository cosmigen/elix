/**
 * ELIX Native App Runtime & Dynamic App Bridge
 * Floating Frameless Window Host and Lifecycle Manager
 * 
 * @module @deepseek-ai/elix-app-bridge/window-manager
 */

import { EventEmitter } from 'node:events';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { ElixWindowIpcSession, generatePreloadScript } from './ipc-channel.js';
import type { ElixAppInstaller } from './installer.js';
import type {
  ElixAppManifest,
  ElixAppWindowConfig,
  InstalledApp,
  WindowGeometry,
  WindowManagerEvents,
  WindowState,
} from './types.js';

function randomWindowId(appId: string): string {
  return `win_${appId.replace(/[^a-zA-Z0-9_-]/g, '_')}_${crypto.randomBytes(4).toString('hex')}`;
}

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
export class ElixAppWindow extends EventEmitter {
  public readonly id: string;
  public readonly appId: string;
  public readonly manifest: ElixAppManifest;
  public readonly config: Required<
    Omit<ElixAppWindowConfig, 'maxWidth' | 'maxHeight' | 'backgroundColor'>
  > & {
    maxWidth?: number;
    maxHeight?: number;
    backgroundColor: string;
  };

  public state: WindowState = 'launching';
  public geometry: WindowGeometry;
  public savedGeometry?: WindowGeometry;
  public alwaysOnTop: boolean = false;
  public isMaximized: boolean = false;
  public isMinimized: boolean = false;
  public isFocused: boolean = false;
  public readonly url: string;
  public readonly ipcSession: ElixWindowIpcSession;
  public readonly launchedAt: number;
  public title: string;
  /** OS process ID of the spawned Electron/native host, if known */
  public pid?: number;

  constructor(
    id: string,
    app: InstalledApp,
    url: string,
    initialGeometry: WindowGeometry,
    windowOverrides?: Partial<ElixAppWindowConfig>
  ) {
    super();
    this.id = id;
    this.appId = app.manifest.id;
    this.manifest = app.manifest;
    this.url = url;
    this.geometry = { ...initialGeometry };
    this.launchedAt = Date.now();
    this.title = windowOverrides?.title || app.manifest.window?.title || app.manifest.name;

    // Resolve window configuration with standard floating frameless defaults
    const rawWin = app.manifest.window || {};
    this.config = {
      width: windowOverrides?.width ?? rawWin.width ?? initialGeometry.width,
      height: windowOverrides?.height ?? rawWin.height ?? initialGeometry.height,
      minWidth: windowOverrides?.minWidth ?? rawWin.minWidth ?? 320,
      minHeight: windowOverrides?.minHeight ?? rawWin.minHeight ?? 240,
      maxWidth: windowOverrides?.maxWidth ?? rawWin.maxWidth,
      maxHeight: windowOverrides?.maxHeight ?? rawWin.maxHeight,
      resizable: windowOverrides?.resizable ?? rawWin.resizable ?? true,
      alwaysOnTop: windowOverrides?.alwaysOnTop ?? rawWin.alwaysOnTop ?? false,
      frame: windowOverrides?.frame ?? rawWin.frame ?? false, // Defaults to frameless for native floating feel
      transparent: windowOverrides?.transparent ?? rawWin.transparent ?? true, // Defaults to transparent for rounded corners
      title: this.title,
      center: windowOverrides?.center ?? rawWin.center ?? true,
      fullscreen: windowOverrides?.fullscreen ?? rawWin.fullscreen ?? false,
      backgroundColor: windowOverrides?.backgroundColor ?? rawWin.backgroundColor ?? 'transparent',
    };

    this.alwaysOnTop = this.config.alwaysOnTop;

    // Initialize Host IPC Session
    this.ipcSession = new ElixWindowIpcSession(this.appId, this.id);

    // Bind window actions sent from client DOM
    this.ipcSession.setWindowActionHandler((action, params) => {
      switch (action) {
        case 'minimize':
          this.minimize();
          break;
        case 'maximize':
          this.maximize();
          break;
        case 'unmaximize':
          this.unmaximize();
          break;
        case 'toggleMaximize':
          this.toggleMaximize();
          break;
        case 'close':
          this.close();
          break;
        case 'setAlwaysOnTop':
          this.setAlwaysOnTop(!!params?.flag);
          break;
        case 'setTitle':
          if (params?.title) this.setTitle(params.title);
          break;
        case 'setSize':
          if (params?.width && params?.height) this.setSize(params.width, params.height);
          break;
        case 'setPosition':
          if (params?.x !== undefined && params?.y !== undefined) this.setPosition(params.x, params.y);
          break;
      }
    });
  }

  /**
   * Focus the window
   */
  public async focus(): Promise<void> {
    if (this.state === 'closed') return;
    this.isFocused = true;
    this.isMinimized = false;
    this.state = 'focused';
    this.emit('focus');
    this.emit('state-change', this.state);
  }

  /**
   * Minimize the window
   */
  public async minimize(): Promise<void> {
    if (this.state === 'closed') return;
    this.isMinimized = true;
    this.isFocused = false;
    this.state = 'minimized';
    this.emit('minimize');
    this.emit('state-change', this.state);
  }

  /**
   * Maximize the window
   */
  public async maximize(screenWidth: number = 1920, screenHeight: number = 1080): Promise<void> {
    if (this.state === 'closed' || this.isMaximized) return;

    // Save previous geometry
    this.savedGeometry = { ...this.geometry };
    this.geometry = {
      x: 0,
      y: 0,
      width: screenWidth,
      height: screenHeight,
    };
    this.isMaximized = true;
    this.isMinimized = false;
    this.state = 'maximized';
    this.emit('maximize');
    this.emit('state-change', this.state);
  }

  /**
   * Restore window from maximized state
   */
  public async unmaximize(): Promise<void> {
    if (this.state === 'closed' || !this.isMaximized) return;

    if (this.savedGeometry) {
      this.geometry = { ...this.savedGeometry };
      this.savedGeometry = undefined;
    }
    this.isMaximized = false;
    this.state = 'open';
    this.emit('restore');
    this.emit('state-change', this.state);
  }

  /**
   * Toggle maximize / restore
   */
  public async toggleMaximize(screenWidth?: number, screenHeight?: number): Promise<void> {
    if (this.isMaximized) {
      await this.unmaximize();
    } else {
      await this.maximize(screenWidth, screenHeight);
    }
  }

  /**
   * Close the window
   */
  public async close(): Promise<void> {
    if (this.state === 'closed') return;
    this.state = 'closed';
    this.isFocused = false;
    this.ipcSession.close();
    this.emit('close');
    this.emit('state-change', this.state);
    this.removeAllListeners();
  }

  /**
   * Destroy the window handle (alias of close for native host teardown).
   */
  public destroy(): void {
    void this.close();
  }

  /**
   * Set always on top behavior
   */
  public async setAlwaysOnTop(flag: boolean): Promise<void> {
    this.alwaysOnTop = flag;
    this.emit('update', { alwaysOnTop: flag });
  }

  /**
   * Set window title
   */
  public async setTitle(title: string): Promise<void> {
    this.title = title;
    this.emit('update', { title });
  }

  /**
   * Update window position
   */
  public async setPosition(x: number, y: number): Promise<void> {
    this.geometry.x = x;
    this.geometry.y = y;
    this.emit('move', { x, y });
  }

  /**
   * Update window size with min/max constraint enforcement
   */
  public async setSize(width: number, height: number): Promise<void> {
    let clampedWidth = Math.max(width, this.config.minWidth);
    let clampedHeight = Math.max(height, this.config.minHeight);

    if (this.config.maxWidth) {
      clampedWidth = Math.min(clampedWidth, this.config.maxWidth);
    }
    if (this.config.maxHeight) {
      clampedHeight = Math.min(clampedHeight, this.config.maxHeight);
    }

    this.geometry.width = clampedWidth;
    this.geometry.height = clampedHeight;
    this.emit('resize', { width: clampedWidth, height: clampedHeight });
  }

  /**
   * Bidirectional Tool Dispatch:
   * Sends a tool call to the window's guest DOM and awaits execution from `window.elix.handle()`
   */
  public async sendToolCall<T = any, R = any>(
    capability: string,
    args: T,
    timeoutMs?: number
  ): Promise<R> {
    return this.ipcSession.sendToolCall<T, R>(capability, args, timeoutMs);
  }

  /**
   * Generate preload script for this window instance
   */
  public getPreloadScript(): string {
    return generatePreloadScript(this.appId, this.id, {
      manifest: this.manifest,
    });
  }
}

/**
 * ELIX Floating Window Host & Lifecycle Manager
 */
export class ElixWindowManager extends EventEmitter {
  private activeWindows: Map<string, ElixAppWindow> = new Map();
  private installer?: ElixAppInstaller;
  private screenWidth: number;
  private screenHeight: number;
  private cascadeIndex: number = 0;

  constructor(installer?: ElixAppInstaller, options?: WindowManagerOptions) {
    super();
    this.installer = installer;
    this.screenWidth = options?.screenWidth || 1920;
    this.screenHeight = options?.screenHeight || 1080;
  }

  /**
   * Typed event listener support
   */
  public override on<K extends keyof WindowManagerEvents>(
    event: K,
    listener: WindowManagerEvents[K]
  ): this {
    return super.on(event, listener as (...args: any[]) => void);
  }

  public override emit<K extends keyof WindowManagerEvents>(
    event: K,
    ...args: Parameters<WindowManagerEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }

  /**
   * Launch an installed ELIX application window.
   * 
   * @param appId Unique application ID
   * @param initialRoute Optional initial URL hash or route (e.g. "/settings")
   * @param windowOverrides Optional window configuration overrides
   * @returns The active ElixAppWindow instance
   */
  public async launch(
    appId: string,
    initialRoute?: string,
    windowOverrides?: Partial<ElixAppWindowConfig>
  ): Promise<ElixAppWindow> {
    // If window already open, focus and return existing instance
    const existing = this.getWindowByAppId(appId);
    if (existing && existing.state !== 'closed') {
      await existing.focus();
      return existing;
    }

    let installedApp: InstalledApp | undefined;
    if (this.installer) {
      installedApp = this.installer.getApp(appId);
    }

    if (!installedApp) {
      throw new Error(`Cannot launch '${appId}': Application is not installed`);
    }

    const windowId = randomWindowId(appId);
    const manifest = installedApp.manifest;
    const winConfig = manifest.window || {};

    const width = windowOverrides?.width || winConfig.width || 800;
    const height = windowOverrides?.height || winConfig.height || 600;

    // Calculate initial floating position (centered with cascading offset)
    const offset = (this.cascadeIndex % 8) * 28;
    this.cascadeIndex++;

    const initialX = Math.max(20, Math.floor((this.screenWidth - width) / 2) + offset);
    const initialY = Math.max(20, Math.floor((this.screenHeight - height) / 2) + offset);

    const initialGeometry: WindowGeometry = {
      x: initialX,
      y: initialY,
      width,
      height,
    };

    // Resolve entry URL
    const entryRelative = manifest.entry;
    const entryFile = path.resolve(installedApp.installPath, entryRelative);
    const routeSuffix = initialRoute ? (initialRoute.startsWith('#') ? initialRoute : `#${initialRoute}`) : '';
    const entryUrl = `file:///${entryFile.replace(/\\/g, '/')}${routeSuffix}`;

    const windowInstance = new ElixAppWindow(
      windowId,
      installedApp,
      entryUrl,
      initialGeometry,
      windowOverrides
    );

    windowInstance.state = 'open';

    // Pipe window events to WindowManager
    windowInstance.on('focus', () => this.emit('window:focused', windowInstance));
    windowInstance.on('minimize', () => this.emit('window:minimized', windowInstance));
    windowInstance.on('maximize', () => this.emit('window:maximized', windowInstance));
    windowInstance.on('restore', () => this.emit('window:restored', windowInstance));
    windowInstance.on('state-change', (state) => this.emit('window:state-change', windowInstance, state));

    windowInstance.on('close', () => {
      this.activeWindows.delete(windowId);
      this.emit('window:closed', windowId, appId);
    });

    // Pipe tool events from IPC session
    windowInstance.ipcSession.on('tool:result', (data) => this.emit('tool:result', data));
    windowInstance.ipcSession.on('tool:error', (data) => this.emit('tool:error', data));

    this.activeWindows.set(windowId, windowInstance);
    this.emit('window:launched', windowInstance);

    return windowInstance;
  }

  /**
   * Focus a window by window ID or App ID
   */
  public async focus(appIdOrWindowId: string): Promise<boolean> {
    const win = this.getWindow(appIdOrWindowId);
    if (win) {
      await win.focus();
      return true;
    }
    return false;
  }

  /**
   * Minimize a window by window ID or App ID
   */
  public async minimize(appIdOrWindowId: string): Promise<boolean> {
    const win = this.getWindow(appIdOrWindowId);
    if (win) {
      await win.minimize();
      return true;
    }
    return false;
  }

  /**
   * Maximize a window by window ID or App ID
   */
  public async maximize(appIdOrWindowId: string): Promise<boolean> {
    const win = this.getWindow(appIdOrWindowId);
    if (win) {
      await win.maximize(this.screenWidth, this.screenHeight);
      return true;
    }
    return false;
  }

  /**
   * Restore a window by window ID or App ID
   */
  public async unmaximize(appIdOrWindowId: string): Promise<boolean> {
    const win = this.getWindow(appIdOrWindowId);
    if (win) {
      await win.unmaximize();
      return true;
    }
    return false;
  }

  /**
   * Close a window by window ID or App ID
   */
  public async close(appIdOrWindowId: string): Promise<boolean> {
    const win = this.getWindow(appIdOrWindowId);
    if (win) {
      await win.close();
      return true;
    }
    return false;
  }

  /**
   * Set always on top for a window
   */
  public async setAlwaysOnTop(appIdOrWindowId: string, flag: boolean): Promise<boolean> {
    const win = this.getWindow(appIdOrWindowId);
    if (win) {
      await win.setAlwaysOnTop(flag);
      return true;
    }
    return false;
  }

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
  public async sendToolCall<T = any, R = any>(
    appId: string,
    capabilityName: string,
    args: T,
    timeoutMs?: number
  ): Promise<R> {
    const win = this.getWindowByAppId(appId);
    if (!win || win.state === 'closed') {
      throw new Error(`Cannot dispatch tool call '${capabilityName}': No active window open for app '${appId}'`);
    }

    this.emit('tool:dispatch', {
      windowId: win.id,
      appId,
      capability: capabilityName,
      args,
    });

    return win.sendToolCall<T, R>(capabilityName, args, timeoutMs);
  }

  /**
   * Get an active window by window ID or App ID
   */
  public getWindow(appIdOrWindowId: string): ElixAppWindow | undefined {
    if (this.activeWindows.has(appIdOrWindowId)) {
      return this.activeWindows.get(appIdOrWindowId);
    }
    return this.getWindowByAppId(appIdOrWindowId);
  }

  /**
   * Get an active window by its App ID
   */
  public getWindowByAppId(appId: string): ElixAppWindow | undefined {
    for (const win of this.activeWindows.values()) {
      if (win.appId === appId && win.state !== 'closed') {
        return win;
      }
    }
    return undefined;
  }

  /**
   * List all currently active application windows
   */
  public listWindows(): ElixAppWindow[] {
    return Array.from(this.activeWindows.values()).filter((w) => w.state !== 'closed');
  }

  /**
   * Close all active windows
   */
  public async closeAll(): Promise<void> {
    const windows = Array.from(this.activeWindows.values());
    for (const win of windows) {
      await win.close();
    }
    this.activeWindows.clear();
  }
}
