/**
 * ELIX Local WebSocket & HTTP IPC Server
 * Zero-dependency RFC-6455 WebSocket and HTTP Bridge built on native node:http & node:crypto.
 * Enables live bidirectional communication between host runtime and physical browser windows.
 *
 * @module @deepseek-ai/elix-app-bridge/local-ipc-server
 */
import { EventEmitter } from 'node:events';
export interface LocalIpcServerOptions {
    port?: number;
}
export interface IpcClientConnection {
    appId: string;
    send: (data: string) => void;
    close: () => void;
}
export declare class LocalIpcServer extends EventEmitter {
    private server?;
    private clients;
    private allClients;
    private pendingCalls;
    readonly port: number;
    private isRunning;
    private portReclaimAttempted;
    constructor(options?: LocalIpcServerOptions);
    start(): Promise<void>;
    private reclaimPort;
    private encodeWsFrame;
    private handleIncomingPacket;
    getClientCount(): number;
    private registerClient;
    private unregisterClient;
    hasClient(appId: string): boolean;
    sendToolCall<T = any, R = any>(appId: string, capability: string, args: T, timeoutMs?: number): Promise<R>;
    sendClose(appId: string): void;
    broadcast(event: object): void;
    stop(): Promise<void>;
    close(): Promise<void>;
}
declare global {
    var __ELIX_IPC_SERVER__: LocalIpcServer | undefined;
}
export declare function getLocalIpcServer(port?: number): LocalIpcServer;
//# sourceMappingURL=local-ipc-server.d.ts.map