/**
 * ELIX OS — sys_exec_code Streaming Execution Pipeline
 *
 * High-performance, streaming code execution engine designed for ELIX OS and AI tools.
 *
 * Features:
 * 1. Process tree kill safety on Windows (taskkill /F /T /PID) and POSIX (-pid SIGKILL)
 * 2. Socket state validation (guards against write after end / unready sockets)
 * 3. Double-reply and race condition prevention (atomic isResolved latch)
 * 4. Micro-batching stream flow control for high-throughput output
 * 5. Automatic process termination upon client disconnect
 *
 * @module @deepseek-ai/elix-app-bridge/sys-exec-stream
 */
import { EventEmitter } from 'node:events';
export interface SysExecParams {
    executionId: string;
    command?: string;
    args?: string[];
    code?: string;
    language?: 'javascript' | 'typescript' | 'python' | 'shell' | 'bash' | 'powershell' | string;
    timeoutMs?: number;
    cwd?: string;
    env?: Record<string, string>;
    batchIntervalMs?: number;
}
export interface SysExecResult {
    executionId: string;
    status: 'completed' | 'timeout' | 'error' | 'aborted';
    exitCode: number | null;
    signal?: string | null;
    durationMs: number;
    timedOut: boolean;
    error?: string | null;
}
export interface StreamChunkPayload {
    executionId: string;
    stream: 'stdout' | 'stderr';
    chunk: string;
    timestamp: number;
}
/**
 * Robust cross-platform process tree killer
 */
export declare function killProcessTree(pid: number): void;
/**
 * Resolves platform-specific executable and default invocation arguments
 */
export declare function resolveCommandPath(command: string): {
    exe: string;
    extraArgs: string[];
};
/**
 * Micro-batching stream flow controller
 * Aggregates high-frequency chunks across micro-intervals to prevent WebSocket buffer flood
 */
export declare class StreamBatcher {
    readonly executionId: string;
    readonly stream: 'stdout' | 'stderr';
    private onFlush;
    private buffer;
    private timer?;
    private maxBufferSize;
    private batchIntervalMs;
    constructor(executionId: string, stream: 'stdout' | 'stderr', onFlush: (chunk: string) => void, intervalMs?: number);
    push(data: string | Buffer): void;
    flush(): void;
}
/**
 * Streaming Execution Manager
 */
export declare class SysExecManager extends EventEmitter {
    private activeExecutions;
    private clientToExecutions;
    /**
     * Execute code or command with streaming output over WebSocket
     */
    execute(params: SysExecParams, clientSend: (msg: any) => boolean, onFinish: (response: any) => void, clientContext?: any): {
        cancel: () => void;
        executionId: string;
    };
    /**
     * Abort all active executions for a specific client socket
     */
    handleClientDisconnect(clientContext: any): void;
    abortExecution(executionId: string): boolean;
    abortAll(): void;
    getActiveCount(): number;
}
export declare const globalSysExecManager: SysExecManager;
//# sourceMappingURL=sys-exec-stream.d.ts.map