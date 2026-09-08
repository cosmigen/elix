/**
 * ELIX Native App Runtime & Dynamic App Bridge
 * Abstract Ports & Hexagonal Architecture Interfaces (ELIXAPP Spec v1.2.0)
 *
 * @module @deepseek-ai/elix-app-bridge/adapters/ports
 */
import type { AppConsentPayload, ElixAppWindowConfig } from '../types.js';
import type { ElixAppWindow } from '../window-manager.js';
export interface WindowHost {
    launch(appId: string, initialRoute?: string, windowOverrides?: Partial<ElixAppWindowConfig>): Promise<ElixAppWindow>;
    focus(appIdOrWindowId: string): Promise<boolean>;
    close(appIdOrWindowId: string): Promise<boolean>;
    minimize?(appIdOrWindowId: string): Promise<boolean>;
    maximize?(appIdOrWindowId: string): Promise<boolean>;
    unmaximize?(appIdOrWindowId: string): Promise<boolean>;
    setAlwaysOnTop?(appIdOrWindowId: string, flag: boolean): Promise<boolean>;
    listWindows(): ElixAppWindow[];
    getWindow(appIdOrWindowId: string): ElixAppWindow | undefined;
    sendToolCall?<T = any, R = any>(appId: string, capabilityName: string, args: T, timeoutMs?: number): Promise<R>;
}
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
export interface EventSink {
    emit(event: string, ...args: any[]): void;
    on?(event: string, listener: (...args: any[]) => void): () => void;
    off?(event: string, listener: (...args: any[]) => void): void;
}
/**
 * In-memory Tool Sink for standalone Node.js environments
 */
export declare class MemoryToolSink implements ToolSink {
    private tools;
    registerTool(tool: ToolDefinition): () => void;
    unregisterTool(name: string): void;
    getTool(name: string): ToolDefinition | undefined;
    listTools(): ToolDefinition[];
}
/**
 * In-memory Capability Index for standalone Node.js environments
 */
export declare class MemoryCapabilityIndex implements CapabilityIndex {
    private entries;
    registerCapability(entry: CapabilityEntry): void;
    unregisterOwner(ownerId: string): void;
    unregisterByAppId(appId: string): void;
    searchCapabilities(query: string): CapabilityEntry[];
    listAll(): CapabilityEntry[];
}
/**
 * Console Confirmation Broker (auto-accepts in non-interactive tests or prompts)
 */
export declare class ConsoleConfirmationBroker implements ConfirmationBroker {
    private autoAccept;
    constructor(autoAccept?: boolean);
    requestConfirmation(payload: AppConsentPayload): Promise<boolean>;
    validateToken(_appId: string, _token: string): boolean;
}
/**
 * In-memory Event Sink backed by node:events EventEmitter
 */
export declare class EventEmitterEventSink implements EventSink {
    private emitter;
    emit(event: string, ...args: any[]): void;
    on(event: string, listener: (...args: any[]) => void): () => void;
    off(event: string, listener: (...args: any[]) => void): void;
}
/**
 * Mock Window Host for standalone Node.js environments and automated interactive TUI testing
 */
export declare class MockWindowHost implements WindowHost {
    private windows;
    private simulatedHandlers;
    private defaultTimeoutMs;
    constructor(options?: {
        defaultTimeoutMs?: number;
    });
    registerCapabilityHandler(appId: string, capability: string, handler: (params: any) => Promise<any> | any): void;
    launch(appId: string, initialRoute?: string, windowOverrides?: Partial<ElixAppWindowConfig>): Promise<ElixAppWindow>;
    focus(appIdOrWindowId: string): Promise<boolean>;
    close(appIdOrWindowId: string): Promise<boolean>;
    listWindows(): ElixAppWindow[];
    getWindow(appIdOrWindowId: string): ElixAppWindow | undefined;
    /**
     * Dispatches a capability tool call to the application.
     * Checks for an active simulated handler, or races live webview with 500ms timeout,
     * returning standard mock success response immediately instead of hanging.
     */
    sendToolCall<T = any, R = any>(appId: string, capabilityName: string, args: T, timeoutMs?: number): Promise<R>;
    callAppCapability(appId: string, capability: string, params: any): Promise<any>;
}
export { NativeWindowHost, type NativeWindowHostOptions, broadcastToWindows, broadcastEvent, ensureIpcServer, launchNativeWindow } from '../native-window-host.js';
//# sourceMappingURL=ports.d.ts.map