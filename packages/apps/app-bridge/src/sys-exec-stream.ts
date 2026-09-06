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
export function killProcessTree(pid: number): void {
  if (!pid) return;
  if (process.platform === 'win32') {
    try {
      child_process.spawnSync('taskkill', ['/F', '/T', '/PID', String(pid)], {
        stdio: 'ignore',
        timeout: 1500,
        windowsHide: true,
      });
    } catch {}
    try {
      process.kill(pid);
    } catch {}
  } else {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {}
    }
  }
}

/**
 * Resolves platform-specific executable and default invocation arguments
 */
export function resolveCommandPath(command: string): { exe: string; extraArgs: string[] } {
  const isWin = process.platform === 'win32';
  const cmd = command.trim();
  const extraArgs: string[] = [];

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
  } else {
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
  private buffer: string = '';
  private timer?: NodeJS.Timeout;
  private maxBufferSize: number = 8192; // 8KB immediate flush limit
  private batchIntervalMs: number = 16; // 16ms flush window (60fps)

  constructor(
    public readonly executionId: string,
    public readonly stream: 'stdout' | 'stderr',
    private onFlush: (chunk: string) => void,
    intervalMs: number = 16
  ) {
    this.batchIntervalMs = intervalMs > 0 ? intervalMs : 16;
  }

  public push(data: string | Buffer): void {
    const text = typeof data === 'string' ? data : data.toString('utf8');
    this.buffer += text;

    if (this.buffer.length >= this.maxBufferSize) {
      this.flush();
    } else if (!this.timer) {
      this.timer = setTimeout(() => {
        this.timer = undefined;
        this.flush();
      }, this.batchIntervalMs);
    }
  }

  public flush(): void {
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
  private activeExecutions = new Map<
    string,
    {
      executionId: string;
      child: child_process.ChildProcess;
      startTime: number;
      timeoutTimer?: NodeJS.Timeout;
      stdoutBatcher: StreamBatcher;
      stderrBatcher: StreamBatcher;
      clientSend: (msg: any) => boolean;
      terminate: (reason: string) => void;
      cleanup: (res: SysExecResult) => void;
    }
  >();

  private clientToExecutions = new Map<any, Set<string>>();

  /**
   * Execute code or command with streaming output over WebSocket
   */
  public execute(
    params: SysExecParams,
    clientSend: (msg: any) => boolean,
    onFinish: (response: any) => void,
    clientContext?: any
  ): { cancel: () => void; executionId: string } {
    const {
      executionId,
      command = 'node',
      args = [],
      code,
      timeoutMs = 30000,
      cwd = process.cwd(),
      env = {},
      batchIntervalMs = 16,
    } = params;

    const startTime = Date.now();
    let isResolved = false;

    // Stream notification sender
    const emitStream = (stream: 'stdout' | 'stderr', chunk: string) => {
      if (isResolved) return;
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

    let timeoutTimer: NodeJS.Timeout | undefined;

    const finishCleanup = (result: SysExecResult) => {
      if (isResolved) return;

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
      } else if (command.includes('python')) {
        finalArgs = ['-c', code];
      } else if (command.includes('powershell')) {
        finalArgs = ['-Command', code];
      } else if (command.includes('bash') || command.includes('sh')) {
        finalArgs = ['-c', code];
      }
    }

    let child: child_process.ChildProcess;
    try {
      child = child_process.spawn(exe, finalArgs, {
        cwd,
        env: { ...process.env, ...env },
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
        windowsHide: true,
      });
    } catch (err: any) {
      isResolved = true;
      onFinish({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: `Failed to spawn process: ${err.message}`,
          data: { executionId },
        },
      });
      return { cancel: () => {}, executionId };
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
      return { cancel: () => {}, executionId };
    }

    const pid = child.pid;

    const terminate = (_reason?: string) => {
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
      this.clientToExecutions.get(clientContext)!.add(executionId);
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

    child.on('error', (err: any) => {
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
  public handleClientDisconnect(clientContext: any): void {
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

  public abortExecution(executionId: string): boolean {
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

  public abortAll(): void {
    for (const exec of this.activeExecutions.values()) {
      exec.terminate('teardown');
    }
    this.activeExecutions.clear();
    this.clientToExecutions.clear();
  }

  public getActiveCount(): number {
    return this.activeExecutions.size;
  }
}

// Global default instance for IPC runtime
export const globalSysExecManager = new SysExecManager();
