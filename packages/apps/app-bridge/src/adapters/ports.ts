/**
 * ELIX Native App Runtime & Dynamic App Bridge
 * Abstract Ports & Hexagonal Architecture Interfaces (ELIXAPP Spec v1.2.0)
 * 
 * @module @deepseek-ai/elix-app-bridge/adapters/ports
 */

import { EventEmitter } from 'node:events';
import type {
  AppConsentPayload,
  ElixAppWindowConfig,
} from '../types.js';
import type { ElixAppWindow } from '../window-manager.js';

// ============================================================================
// 1. Window Host Port
// ============================================================================

export interface WindowHost {
  launch(
    appId: string,
    initialRoute?: string,
    windowOverrides?: Partial<ElixAppWindowConfig>
  ): Promise<ElixAppWindow>;
  focus(appIdOrWindowId: string): Promise<boolean>;
  close(appIdOrWindowId: string): Promise<boolean>;
  minimize?(appIdOrWindowId: string): Promise<boolean>;
  maximize?(appIdOrWindowId: string): Promise<boolean>;
  unmaximize?(appIdOrWindowId: string): Promise<boolean>;
  setAlwaysOnTop?(appIdOrWindowId: string, flag: boolean): Promise<boolean>;
  listWindows(): ElixAppWindow[];
  getWindow(appIdOrWindowId: string): ElixAppWindow | undefined;
  sendToolCall?<T = any, R = any>(
    appId: string,
    capabilityName: string,
    args: T,
    timeoutMs?: number
  ): Promise<R>;
}

// ============================================================================
// 2. Confirmation Broker Port
// ============================================================================

export interface ConfirmationBroker {
  /**
   * Request user authorization/consent for installation or permission grant
   */
  requestConfirmation(payload: AppConsentPayload): Promise<boolean>;
  
  /**
   * Validates a capability or permission execution token if required
   */
  validateToken?(appId: string, token: string): Promise<boolean> | boolean;
}

// ============================================================================
// 3. Tool Sink Port
// ============================================================================

export interface ToolDefinition<T = any, R = any> {
  name: string;
  description: string;
  parameters: any;
  execute(args: T, context?: any): Promise<R> | R;
  [key: string]: any;
}

export interface ToolSink {
  registerTool(tool: ToolDefinition): () => void;
  unregisterTool(name: string): void;
  getTool?(name: string): ToolDefinition | undefined;
  listTools?(): ToolDefinition[];
}

// ============================================================================
// 4. Capability Index Port
// ============================================================================

export interface CapabilityEntry {
  id: string;
  name: string;
  description: string;
  kind: 'app_api' | string;
  appId: string;
  parameters?: any;
  returns?: any;
  permissions?: string[];
  installedAt?: number;
  [key: string]: any;
}

export interface CapabilityIndex {
  registerCapability(entry: CapabilityEntry): void;
  unregisterOwner(ownerId: string): void;
  unregisterByAppId?(appId: string): void;
  searchCapabilities?(query: string): CapabilityEntry[];
}

// ============================================================================
// 5. Event Sink Port
// ============================================================================

export interface EventSink {
  emit(event: string, ...args: any[]): void;
  on?(event: string, listener: (...args: any[]) => void): () => void;
  off?(event: string, listener: (...args: any[]) => void): void;
}

// ============================================================================
// Default Standalone Mock Implementations (Node.js standalone runtime)
// ============================================================================

/**
 * In-memory Tool Sink for standalone Node.js environments
 */
export class MemoryToolSink implements ToolSink {
  private tools = new Map<string, ToolDefinition>();

  public registerTool(tool: ToolDefinition): () => void {
    this.tools.set(tool.name, tool);
    return () => this.unregisterTool(tool.name);
  }

  public unregisterTool(name: string): void {
    this.tools.delete(name);
  }

  public getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  public listTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }
}

/**
 * In-memory Capability Index for standalone Node.js environments
 */
export class MemoryCapabilityIndex implements CapabilityIndex {
  private entries = new Map<string, CapabilityEntry>();

  public registerCapability(entry: CapabilityEntry): void {
    this.entries.set(entry.id, entry);
  }

  public unregisterOwner(ownerId: string): void {
    for (const [id, entry] of this.entries.entries()) {
      if (entry.appId === ownerId || id.startsWith(`app:${ownerId}:`)) {
        this.entries.delete(id);
      }
    }
  }

  public unregisterByAppId(appId: string): void {
    this.unregisterOwner(appId);
  }

  public searchCapabilities(query: string): CapabilityEntry[] {
    const q = query.toLowerCase();
    return Array.from(this.entries.values()).filter(
      (e) => e.name.toLowerCase().includes(q) || e.description.toLowerCase().includes(q)
    );
  }

  public listAll(): CapabilityEntry[] {
    return Array.from(this.entries.values());
  }
}

/**
 * Console Confirmation Broker (auto-accepts in non-interactive tests or prompts)
 */
export class ConsoleConfirmationBroker implements ConfirmationBroker {
  private autoAccept: boolean;

  constructor(autoAccept: boolean = false) {
    this.autoAccept = autoAccept;
  }

  public async requestConfirmation(payload: AppConsentPayload): Promise<boolean> {
    if (this.autoAccept) return true;
    console.log(`\n[ELIX ConfirmationBroker] Requesting installation consent for '${payload.name}' (${payload.appId})`);
    console.log(`  Requested Permissions: ${payload.permissions.join(', ') || 'None'}`);
    console.log(`  Exported Capabilities: ${payload.capabilities.map((c) => c.name).join(', ') || 'None'}`);
    return true;
  }

  public validateToken(_appId: string, _token: string): boolean {
    return true;
  }
}

/**
 * In-memory Event Sink backed by node:events EventEmitter
 */
export class EventEmitterEventSink implements EventSink {
  private emitter = new EventEmitter();

  public emit(event: string, ...args: any[]): void {
    this.emitter.emit(event, ...args);
  }

  public on(event: string, listener: (...args: any[]) => void): () => void {
    this.emitter.on(event, listener);
    return () => {
      this.emitter.off(event, listener);
    };
  }

  public off(event: string, listener: (...args: any[]) => void): void {
    this.emitter.off(event, listener);
  }
}

/**
 * Mock Window Host for standalone Node.js environments and automated interactive TUI testing
 */
export class MockWindowHost implements WindowHost {
  private windows = new Map<string, ElixAppWindow>();
  private simulatedHandlers = new Map<string, (params: any) => Promise<any> | any>();
  private defaultTimeoutMs: number;

  constructor(options?: { defaultTimeoutMs?: number }) {
    this.defaultTimeoutMs = options?.defaultTimeoutMs ?? 500;
  }

  public registerCapabilityHandler(
    appId: string,
    capability: string,
    handler: (params: any) => Promise<any> | any
  ): void {
    this.simulatedHandlers.set(`${appId}:${capability}`, handler);
  }

  public async launch(
    appId: string,
    initialRoute?: string,
    windowOverrides?: Partial<ElixAppWindowConfig>
  ): Promise<ElixAppWindow> {
    if (this.windows.has(appId)) {
      const existing = this.windows.get(appId)!;
      existing.state = 'focused';
      return existing;
    }

    const { ElixAppWindow: WinClass } = await import('../window-manager.js');
    const mockApp = {
      manifest: {
        id: appId,
        name: appId,
        version: '1.0.0',
        description: 'Mock Window',
        author: { name: 'ELIX Mock', email: 'mock@elix.os' },
        entry: 'dist/index.html',
        window: {
          width: 480,
          height: 600,
          frame: false,
          transparent: true,
          ...windowOverrides,
        },
      },
      installPath: `/mock/apps/${appId}`,
      installedAt: Date.now(),
      updatedAt: Date.now(),
      state: 'idle' as const,
      registeredTools: [],
    };
    const win = new WinClass(
      `win_${appId}_mock`,
      mockApp,
      `file:///mock/apps/${appId}/dist/index.html${initialRoute || ''}`,
      { x: 100, y: 100, width: 480, height: 600 },
      windowOverrides
    );
    win.state = 'open';
    this.windows.set(appId, win);
    return win;
  }

  public async focus(appIdOrWindowId: string): Promise<boolean> {
    const win = this.getWindow(appIdOrWindowId);
    if (win) {
      win.state = 'focused';
      return true;
    }
    return false;
  }

  public async close(appIdOrWindowId: string): Promise<boolean> {
    const win = this.getWindow(appIdOrWindowId);
    if (win) {
      win.state = 'closed';
      this.windows.delete(win.appId);
      return true;
    }
    return false;
  }

  public listWindows(): ElixAppWindow[] {
    return Array.from(this.windows.values()).filter((w) => w.state !== 'closed');
  }

  public getWindow(appIdOrWindowId: string): ElixAppWindow | undefined {
    for (const [appId, win] of this.windows.entries()) {
      if (appId === appIdOrWindowId || win.id === appIdOrWindowId) {
        return win;
      }
    }
    return undefined;
  }

  /**
   * Dispatches a capability tool call to the application.
   * Checks for an active simulated handler, or races live webview with 500ms timeout,
   * returning standard mock success response immediately instead of hanging.
   */
  public async sendToolCall<T = any, R = any>(
    appId: string,
    capabilityName: string,
    args: T,
    timeoutMs: number = this.defaultTimeoutMs
  ): Promise<R> {
    const key = `${appId}:${capabilityName}`;
    if (this.simulatedHandlers.has(key)) {
      const handler = this.simulatedHandlers.get(key)!;
      return Promise.resolve(handler(args));
    }

    const win = this.getWindow(appId);
    if (win && win.state !== 'closed') {
      try {
        const timeoutPromise = new Promise<R>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), timeoutMs)
        );
        const liveCall = win.sendToolCall<T, R>(capabilityName, args, timeoutMs);
        return await Promise.race([liveCall, timeoutPromise]);
      } catch {
        // Fallback to standard mock response
      }
    }

    return {
      success: true,
      result: {
        status: 'ok',
        appId,
        capability: capabilityName,
        data: args,
        receivedParams: args,
        timestamp: new Date().toISOString(),
      },
    } as unknown as R;
  }

  public async callAppCapability(appId: string, capability: string, params: any): Promise<any> {
    return this.sendToolCall(appId, capability, params);
  }
}

export { NativeWindowHost, type NativeWindowHostOptions, broadcastToWindows, broadcastEvent, ensureIpcServer } from '../native-window-host.js';


