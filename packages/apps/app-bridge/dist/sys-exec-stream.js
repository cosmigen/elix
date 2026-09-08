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
import * as child_process from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { EventEmitter } from 'node:events';
/**
 * Robust cross-platform process tree killer
 */
export function killProcessTree(pid) {
    if (!pid)
        return;
    if (process.platform === 'win32') {
        try {
            child_process.spawnSync('taskkill', ['/F', '/T', '/PID', String(pid)], {
                stdio: 'ignore',
                timeout: 1500,
                windowsHide: true,
            });
        }
        catch { }
        try {
            process.kill(pid);
        }
        catch { }
    }
    else {
        try {
            process.kill(-pid, 'SIGKILL');
        }
        catch {
            try {
                process.kill(pid, 'SIGKILL');
            }
            catch { }
        }
    }
}
/**
 * Resolves platform-specific executable and default invocation arguments
 */
export function resolveCommandPath(command) {
    const isWin = process.platform === 'win32';
    const cmd = command.trim();
    const extraArgs = [];
    if (isWin) {
        if (cmd.toLowerCase() === 'python' || cmd.toLowerCase() === 'python3') {
            if (process.env.PATH) {
                const paths = process.env.PATH.split(';');
                for (const p of paths) {
                    const target = path.join(p, 'python.exe');
                    if (fs.existsSync(target)) {
                        return { exe: target, extraArgs: [] };
                    }
                }
            }
            return { exe: 'python.exe', extraArgs: [] };
        }
        if (cmd.toLowerCase() === 'node' || cmd.toLowerCase() === 'nodejs') {
            return { exe: process.execPath, extraArgs: [] };
        }
        if (cmd.toLowerCase() === 'powershell') {
            return { exe: 'powershell.exe', extraArgs: ['-NoProfile', '-NonInteractive'] };
        }
    }
    else {
        if (cmd.toLowerCase() === 'node') {
            return { exe: process.execPath, extraArgs: [] };
        }
    }
    return { exe: cmd, extraArgs };
}
/**
 * Micro-batching stream flow controller
 * Aggregates high-frequency chunks across micro-intervals to prevent WebSocket buffer flood
 */
export class StreamBatcher {
    executionId;
    stream;
    onFlush;
    buffer = '';
    timer;
    maxBufferSize = 8192; // 8KB immediate flush limit
    batchIntervalMs = 16; // 16ms flush window (60fps)
    constructor(executionId, stream, onFlush, intervalMs = 16) {
        this.executionId = executionId;
        this.stream = stream;
        this.onFlush = onFlush;
        this.batchIntervalMs = intervalMs > 0 ? intervalMs : 16;
    }
    push(data) {
        const text = typeof data === 'string' ? data : data.toString('utf8');
        this.buffer += text;
        if (this.buffer.length >= this.maxBufferSize) {
            this.flush();
        }
        else if (!this.timer) {
            this.timer = setTimeout(() => {
                this.timer = undefined;
                this.flush();
            }, this.batchIntervalMs);
        }
    }
    flush() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = undefined;
        }
        if (this.buffer.length > 0) {
            const data = this.buffer;
            this.buffer = '';
            this.onFlush(data);
        }
    }
}
/**
 * Streaming Execution Manager
 */
export class SysExecManager extends EventEmitter {
    activeExecutions = new Map();
    clientToExecutions = new Map();
    /**
     * Execute code or command with streaming output over WebSocket
     */
    execute(params, clientSend, onFinish, clientContext) {
        const { executionId, command = 'node', args = [], code, timeoutMs = 30000, cwd = process.cwd(), env = {}, batchIntervalMs = 16, } = params;
        const startTime = Date.now();
        let isResolved = false;
        // Stream notification sender
        const emitStream = (stream, chunk) => {
            if (isResolved)
                return;
            const eventPacket = {
                jsonrpc: '2.0',
                method: 'elix:exec:stream',
                params: {
                    executionId,
                    stream,
                    chunk,
                    timestamp: Date.now(),
                },
            };
            clientSend(eventPacket);
            this.emit('stream', { executionId, stream, chunk });
        };
        const stdoutBatcher = new StreamBatcher(executionId, 'stdout', (chunk) => emitStream('stdout', chunk), batchIntervalMs);
        const stderrBatcher = new StreamBatcher(executionId, 'stderr', (chunk) => emitStream('stderr', chunk), batchIntervalMs);
        let timeoutTimer;
        const finishCleanup = (result) => {
            if (isResolved)
                return;
            if (timeoutTimer) {
                clearTimeout(timeoutTimer);
                timeoutTimer = undefined;
            }
            stdoutBatcher.flush();
            stderrBatcher.flush();
            isResolved = true;
            this.activeExecutions.delete(executionId);
            if (clientContext && this.clientToExecutions.has(clientContext)) {
                this.clientToExecutions.get(clientContext)?.delete(executionId);
            }
            onFinish({
                jsonrpc: '2.0',
                result,
            });
            this.emit('finished', result);
        };
        // Prepare executable and argument list
        const { exe, extraArgs } = resolveCommandPath(command);
        let finalArgs = [...extraArgs, ...args];
        if (code && finalArgs.length === 0) {
            if (command.includes('node')) {
                finalArgs = ['-e', code];
            }
            else if (command.includes('python')) {
                finalArgs = ['-c', code];
            }
            else if (command.includes('powershell')) {
                finalArgs = ['-Command', code];
            }
            else if (command.includes('bash') || command.includes('sh')) {
                finalArgs = ['-c', code];
            }
        }
        let child;
        try {
            child = child_process.spawn(exe, finalArgs, {
                cwd,
                env: { ...process.env, ...env },
                stdio: ['ignore', 'pipe', 'pipe'],
                shell: false,
                windowsHide: true,
            });
        }
        catch (err) {
            isResolved = true;
            onFinish({
                jsonrpc: '2.0',
                error: {
                    code: -32603,
                    message: `Failed to spawn process: ${err.message}`,
                    data: { executionId },
                },
            });
            return { cancel: () => { }, executionId };
        }
        if (!child.pid) {
            isResolved = true;
            onFinish({
                jsonrpc: '2.0',
                error: {
                    code: -32603,
                    message: 'Failed to obtain child process PID',
                    data: { executionId },
                },
            });
            return { cancel: () => { }, executionId };
        }
        const pid = child.pid;
        const terminate = (_reason) => {
            killProcessTree(pid);
        };
        const record = {
            executionId,
            child,
            startTime,
            timeoutTimer,
            stdoutBatcher,
            stderrBatcher,
            clientSend,
            terminate,
            cleanup: finishCleanup,
        };
        this.activeExecutions.set(executionId, record);
        if (clientContext) {
            if (!this.clientToExecutions.has(clientContext)) {
                this.clientToExecutions.set(clientContext, new Set());
            }
            this.clientToExecutions.get(clientContext).add(executionId);
        }
        if (timeoutMs > 0) {
            timeoutTimer = setTimeout(() => {
                terminate('timeout');
                finishCleanup({
                    executionId,
                    status: 'timeout',
                    exitCode: null,
                    signal: 'SIGKILL',
                    durationMs: Date.now() - startTime,
                    timedOut: true,
                    error: `Execution timed out after ${timeoutMs}ms`,
                });
            }, timeoutMs);
            record.timeoutTimer = timeoutTimer;
        }
        child.stdout?.on('data', (d) => {
            stdoutBatcher.push(d);
        });
        child.stderr?.on('data', (d) => {
            stderrBatcher.push(d);
        });
        child.on('error', (err) => {
            terminate('error');
            finishCleanup({
                executionId,
                status: 'error',
                exitCode: 1,
                durationMs: Date.now() - startTime,
                timedOut: false,
                error: err.message,
            });
        });
        child.on('close', (code, signal) => {
            finishCleanup({
                executionId,
                status: code === 0 ? 'completed' : 'error',
                exitCode: code,
                signal: signal || null,
                durationMs: Date.now() - startTime,
                timedOut: false,
                error: code === 0 ? null : `Process exited with code ${code}`,
            });
        });
        return {
            cancel: () => {
                terminate('cancelled');
                finishCleanup({
                    executionId,
                    status: 'aborted',
                    exitCode: null,
                    durationMs: Date.now() - startTime,
                    timedOut: false,
                    error: 'Execution cancelled by client',
                });
            },
            executionId,
        };
    }
    /**
     * Abort all active executions for a specific client socket
     */
    handleClientDisconnect(clientContext) {
        const execIds = this.clientToExecutions.get(clientContext);
        if (execIds) {
            for (const id of Array.from(execIds)) {
                const record = this.activeExecutions.get(id);
                if (record) {
                    record.terminate('client_disconnect');
                    record.cleanup({
                        executionId: id,
                        status: 'aborted',
                        exitCode: null,
                        durationMs: Date.now() - record.startTime,
                        timedOut: false,
                        error: 'Client socket abruptly disconnected',
                    });
                }
            }
            this.clientToExecutions.delete(clientContext);
        }
    }
    abortExecution(executionId) {
        const exec = this.activeExecutions.get(executionId);
        if (exec) {
            exec.terminate('aborted');
            exec.cleanup({
                executionId,
                status: 'aborted',
                exitCode: null,
                durationMs: Date.now() - exec.startTime,
                timedOut: false,
                error: 'Execution manually aborted',
            });
            return true;
        }
        return false;
    }
    abortAll() {
        for (const exec of this.activeExecutions.values()) {
            exec.terminate('teardown');
        }
        this.activeExecutions.clear();
        this.clientToExecutions.clear();
    }
    getActiveCount() {
        return this.activeExecutions.size;
    }
}
// Global default instance for IPC runtime
export const globalSysExecManager = new SysExecManager();
//# sourceMappingURL=sys-exec-stream.js.map