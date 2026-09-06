/**
 * ELIX Native App Runtime & Dynamic App Bridge
 * Preload IPC Protocol and Host-Webview Communication Channel
 *
 * @module @deepseek-ai/elix-app-bridge/ipc-channel
 */
import { EventEmitter } from 'node:events';
import type { ElixAppManifest, IpcPacket } from './types.js';
/**
 * Preload Script Injection Options
 */
export interface PreloadScriptOptions {
    /** Manifest object to embed */
    manifest?: Partial<ElixAppManifest>;
    /** Custom IPC WebSocket or HTTP port */
    ipcPort?: number;
    /** Host endpoint URL override */
    endpoint?: string;
    /** Inject default frameless window drag styles */
    injectFramelessStyles?: boolean;
}
/**
 * Generates the client-side `window.elix` JavaScript bridge for webviews / browser windows.
 *
 * @param appId Unique application ID
 * @param windowId Unique window instance ID
 * @param options Script injection options
 * @returns Self-contained JavaScript string injected as preload script
 */
export declare function generatePreloadScript(appId: string, windowId: string, options?: PreloadScriptOptions): string;
/**
 * Host IPC Window Session managing bidirectional dispatch to a specific window instance.
 */
export declare class ElixWindowIpcSession extends EventEmitter {
    readonly windowId: string;
    readonly appId: string;
    private pendingCalls;
    private serviceHandlers;
    private windowActionHandler?;
    private storageData;
    private outboundTransport?;
    private isClosed;
    constructor(appId: string, windowId: string);
    /**
     * Bind outbound transport function to communicate with the client window
     */
    bindTransport(transport: (packet: IpcPacket) => void): void;
    /**
     * Bidirectional Tool Dispatch:
     * Dispatches a capability tool call to the active window and awaits execution results
     * from the client's `window.elix.handle(capability, ...)` implementation.
     *
     * @param capability Capability name registered in the app manifest
     * @param args Arguments to pass to the client capability handler
     * @param timeoutMs Execution timeout in milliseconds (default: 30000)
     * @returns Result returned by the client capability handler
     */
    sendToolCall<T = any, R = any>(capability: string, args: T, timeoutMs?: number): Promise<R>;
    /**
     * Emit an event to the client window
     */
    sendEvent(eventName: string, payload: any): void;
    /**
     * Register a host service handler
     */
    registerService(serviceName: string, handler: (action: string, payload: any) => Promise<any> | any): void;
    /**
     * Set window action handler
     */
    setWindowActionHandler(handler: (action: string, params: any) => void): void;
    /**
     * Process an incoming raw IPC packet received from the client window
     */
    handleIncomingPacket(packet: IpcPacket): Promise<void>;
    /**
     * Sends packet via bound transport
     */
    private sendPacket;
    /**
     * Close the session and cancel all pending tool calls
     */
    close(): void;
}
//# sourceMappingURL=ipc-channel.d.ts.map