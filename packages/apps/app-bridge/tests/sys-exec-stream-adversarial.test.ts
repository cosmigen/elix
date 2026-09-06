/**
 * ELIX OS — Adversarial Verification Test Suite for `sys_exec_code` Streaming Pipeline
 * 
 * Tests:
 * 1. Stream Multiplexing (3 concurrent execution streams)
 * 2. Timeout Enforcement & Windows Process Tree Termination (taskkill /F /T /PID)
 * 3. Abrupt Client Disconnection & Process Teardown
 * 4. High-Volume Stream Flood & Micro-Batching Integrity
 * 5. Error Handling & Non-Zero Exit Codes
 * 6. Live WebSocket RFC-6455 JSON-RPC `tools/call` Integration
 */

import { SysExecManager, killProcessTree, resolveCommandPath, StreamBatcher } from '../src/sys-exec-stream.js';
import { LocalIpcServer } from '../src/local-ipc-server.js';
import * as net from 'node:net';
import * as crypto from 'node:crypto';

console.log('===========================================================================');
console.log('🧪 ELIX OS — SYS_EXEC_CODE STREAMING PIPELINE ADVERSARIAL TEST SUITE');
console.log('===========================================================================\n');

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`[FAIL] ${testName}`);
    if (detail) console.error(`       Detail: ${detail}`);
  }
}

function encodeClientWsFrame(text: string): Buffer {
  const payload = Buffer.from(text, 'utf8');
  const mask = crypto.randomBytes(4);
  const maskedPayload = Buffer.alloc(payload.length);
  for (let i = 0; i < payload.length; i++) {
    maskedPayload[i] = payload[i] ^ mask[i % 4];
  }

  let header: Buffer;
  if (payload.length <= 125) {
    header = Buffer.from([0x81, 0x80 | payload.length]);
  } else if (payload.length <= 65535) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(payload.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(payload.length), 2);
  }

  return Buffer.concat([header, mask, maskedPayload]);
}

function decodeServerWsFrames(buf: Buffer): { frames: string[]; remaining: Buffer } {
  const frames: string[] = [];
  let offset = 0;
  while (offset + 2 <= buf.length) {
    const lenByte = buf[offset + 1] & 0x7f;
    let headerLen = 2;
    let payloadLen = lenByte;
    if (lenByte === 126) {
      if (offset + 4 > buf.length) break;
      payloadLen = buf.readUInt16BE(offset + 2);
      headerLen = 4;
    } else if (lenByte === 127) {
      if (offset + 10 > buf.length) break;
      payloadLen = Number(buf.readBigUInt64BE(offset + 2));
      headerLen = 10;
    }

    if (offset + headerLen + payloadLen > buf.length) break;
    const chunk = buf.subarray(offset + headerLen, offset + headerLen + payloadLen).toString('utf8');
    frames.push(chunk);
    offset += headerLen + payloadLen;
  }
  return { frames, remaining: buf.subarray(offset) };
}

async function runAdversarialTests() {
  const manager = new SysExecManager();

  // --------------------------------------------------------------------------
  // TEST 1: Stream Multiplexing across 3 concurrent execution streams
  // --------------------------------------------------------------------------
  console.log('--- Test Suite 1: Concurrent Stream Multiplexing ---');
  {
    const streamsData: Record<string, string[]> = {
      'exec-alpha': [],
      'exec-beta': [],
      'exec-gamma': [],
    };

    const runPromise = (id: string, count: number, label: string) => {
      return new Promise<any>((resolve) => {
        const code = `
          let i = 0;
          const iv = setInterval(() => {
            console.log("${label}:" + (++i));
            if (i >= ${count}) {
              clearInterval(iv);
            }
          }, 30);
        `;

        manager.execute(
          {
            executionId: id,
            command: 'node',
            code,
            timeoutMs: 5000,
          },
          (msg) => {
            if (msg.params?.executionId === id) {
              streamsData[id].push(msg.params.chunk);
            }
            return true;
          },
          (res) => {
            resolve(res);
          }
        );
      });
    };

    const [resAlpha, resBeta, resGamma] = await Promise.all([
      runPromise('exec-alpha', 5, 'ALPHA'),
      runPromise('exec-beta', 4, 'BETA'),
      runPromise('exec-gamma', 3, 'GAMMA'),
    ]);

    const alphaOutput = streamsData['exec-alpha'].join('');
    const betaOutput = streamsData['exec-beta'].join('');
    const gammaOutput = streamsData['exec-gamma'].join('');

    assert(resAlpha.result?.status === 'completed', 'Test 1a: Alpha completed successfully');
    assert(resBeta.result?.status === 'completed', 'Test 1b: Beta completed successfully');
    assert(resGamma.result?.status === 'completed', 'Test 1c: Gamma completed successfully');

    assert(alphaOutput.includes('ALPHA:1') && alphaOutput.includes('ALPHA:5'), 'Test 1d: Alpha received correct sequential output');
    assert(betaOutput.includes('BETA:1') && betaOutput.includes('BETA:4'), 'Test 1e: Beta received correct sequential output');
    assert(gammaOutput.includes('GAMMA:1') && gammaOutput.includes('GAMMA:3'), 'Test 1f: Gamma received correct sequential output');

    assert(!alphaOutput.includes('BETA') && !alphaOutput.includes('GAMMA'), 'Test 1g: Alpha stream is isolated without contamination');
    assert(!betaOutput.includes('ALPHA') && !betaOutput.includes('GAMMA'), 'Test 1h: Beta stream is isolated without contamination');
    assert(!gammaOutput.includes('ALPHA') && !gammaOutput.includes('BETA'), 'Test 1i: Gamma stream is isolated without contamination');
  }

  // --------------------------------------------------------------------------
  // TEST 2: Timeout Enforcement & Windows Process Tree Kill
  // --------------------------------------------------------------------------
  console.log('\n--- Test Suite 2: Timeout Enforcement & Process Teardown ---');
  {
    const start = Date.now();
    const timeoutRes: any = await new Promise((resolve) => {
      // Infinite loop script
      const code = `
        setInterval(() => {
          console.log("tick");
        }, 100);
      `;

      manager.execute(
        {
          executionId: 'exec-timeout-test',
          command: 'node',
          code,
          timeoutMs: 1200,
        },
        () => true,
        (res) => resolve(res)
      );
    });

    const elapsed = Date.now() - start;
    assert(timeoutRes.result?.status === 'timeout', 'Test 2a: Infinite loop detected and marked as timeout');
    assert(timeoutRes.result?.timedOut === true, 'Test 2b: timedOut flag is true');
    assert(elapsed >= 1150 && elapsed <= 2500, `Test 2c: Timed out within expected interval (${elapsed}ms)`);
    assert(manager.getActiveCount() === 0, 'Test 2d: Active execution map cleared after timeout');
  }

  // --------------------------------------------------------------------------
  // TEST 3: Abrupt Disconnection & Child Teardown
  // --------------------------------------------------------------------------
  console.log('\n--- Test Suite 3: Abrupt Socket Disconnection ---');
  {
    const dummyClientContext = { clientId: 'client_temp_123' };

    const disconnectPromise = new Promise<any>((resolve) => {
      const code = `
        setInterval(() => {
          console.log("streaming...");
        }, 50);
      `;

      manager.execute(
        {
          executionId: 'exec-disconnect-test',
          command: 'node',
          code,
          timeoutMs: 10000,
        },
        () => true,
        (res) => resolve(res),
        dummyClientContext
      );
    });

    await new Promise((r) => setTimeout(r, 200));
    assert(manager.getActiveCount() === 1, 'Test 3a: Stream actively running before disconnect');

    // Simulate abrupt disconnect
    manager.handleClientDisconnect(dummyClientContext);

    const abortRes = await disconnectPromise;
    assert(abortRes.result?.status === 'aborted', 'Test 3b: Status set to aborted upon client disconnect');
    assert(manager.getActiveCount() === 0, 'Test 3c: All associated execution records cleared');
  }

  // --------------------------------------------------------------------------
  // TEST 4: High-Volume Stream Flood & Micro-Batching
  // --------------------------------------------------------------------------
  console.log('\n--- Test Suite 4: High-Volume Flood & Micro-Batching ---');
  {
    let totalChunksSent = 0;
    let accumulatedOutput = '';

    const floodResult: any = await new Promise((resolve) => {
      // Generate 5000 lines rapidly
      const code = `
        for (let i = 1; i <= 5000; i++) {
          console.log("LINE_" + i);
        }
      `;

      manager.execute(
        {
          executionId: 'exec-flood-test',
          command: 'node',
          code,
          timeoutMs: 8000,
          batchIntervalMs: 16,
        },
        (msg) => {
          totalChunksSent++;
          accumulatedOutput += msg.params.chunk;
          return true;
        },
        (res) => resolve(res)
      );
    });

    assert(floodResult.result?.status === 'completed', 'Test 4a: High-volume output completed with code 0');
    assert(accumulatedOutput.includes('LINE_1\n') || accumulatedOutput.includes('LINE_1\r\n'), 'Test 4b: First line captured intact');
    assert(accumulatedOutput.includes('LINE_5000'), 'Test 4c: 5000th line captured intact');
    assert(totalChunksSent > 0 && totalChunksSent < 5000, `Test 4d: Micro-batching compressed 5000 outputs into ${totalChunksSent} WebSocket frames`);
  }

  // --------------------------------------------------------------------------
  // TEST 5: Error Handling & Non-Zero Exit Code
  // --------------------------------------------------------------------------
  console.log('\n--- Test Suite 5: Error Handling & Syntax/Process Errors ---');
  {
    let stderrCaptured = '';
    const errResult: any = await new Promise((resolve) => {
      const code = `
        console.error("CRITICAL_SYNTAX_ERROR");
        process.exit(42);
      `;

      manager.execute(
        {
          executionId: 'exec-err-test',
          command: 'node',
          code,
          timeoutMs: 5000,
        },
        (msg) => {
          if (msg.params?.stream === 'stderr') {
            stderrCaptured += msg.params.chunk;
          }
          return true;
        },
        (res) => resolve(res)
      );
    });

    assert(errResult.result?.status === 'error', 'Test 5a: Non-zero exit code marked as error');
    assert(errResult.result?.exitCode === 42, 'Test 5b: Exit code 42 correctly reported');
    assert(stderrCaptured.includes('CRITICAL_SYNTAX_ERROR'), 'Test 5c: Stderr correctly captured and streamed');
  }

  // --------------------------------------------------------------------------
  // TEST 6: Live WebSocket JSON-RPC 2.0 Integration
  // --------------------------------------------------------------------------
  console.log('\n--- Test Suite 6: Live WebSocket Port 7394 JSON-RPC Execution ---');
  {
    const wsPort = 7394;
    const server = new LocalIpcServer({ port: wsPort });
    await server.start();

    const socket = net.createConnection({ port: wsPort, host: '127.0.0.1' });
    const secKey = crypto.randomBytes(16).toString('base64');

    let streamMessages: any[] = [];
    let rpcResponse: any = null;

    let resolveRpc: (val: any) => void;
    const rpcPromise = new Promise((r) => { resolveRpc = r; });

    let rawBuffer = Buffer.alloc(0);

    await new Promise<void>((resolve, reject) => {
      socket.on('connect', () => {
        const handshake = [
          `GET /?appId=com.elix.testrunner HTTP/1.1`,
          `Host: 127.0.0.1:${wsPort}`,
          `Upgrade: websocket`,
          `Connection: Upgrade`,
          `Sec-WebSocket-Key: ${secKey}`,
          `Sec-WebSocket-Version: 13`,
          `\r\n`,
        ].join('\r\n');
        socket.write(handshake);
      });

      socket.on('data', (data) => {
        const text = data.toString('utf8');
        if (text.includes('101 Switching Protocols')) {
          // Register
          socket.write(encodeClientWsFrame(JSON.stringify({ type: 'REGISTER', appId: 'com.elix.testrunner' })));
          resolve();
        } else {
          rawBuffer = Buffer.concat([rawBuffer, data]);
          const decoded = decodeServerWsFrames(rawBuffer);
          rawBuffer = decoded.remaining;
          for (const f of decoded.frames) {
            try {
              const parsed = JSON.parse(f);
              if (parsed.method === 'elix:exec:stream') {
                streamMessages.push(parsed);
              } else if (parsed.id === 'rpc_call_sys_exec') {
                rpcResponse = parsed;
                resolveRpc(parsed);
              }
            } catch {}
          }
        }
      });

      socket.on('error', reject);
    });

    // Send JSON-RPC tools/call for sys_exec_code
    const rpcRequest = {
      jsonrpc: '2.0',
      id: 'rpc_call_sys_exec',
      method: 'tools/call',
      params: {
        name: 'sys_exec_code',
        arguments: {
          executionId: 'exec_ws_integration_001',
          command: 'node',
          code: 'console.log("WS_STREAM_OK_1"); console.log("WS_STREAM_OK_2");',
          timeoutMs: 4000,
        },
      },
    };

    socket.write(encodeClientWsFrame(JSON.stringify(rpcRequest)));

    await rpcPromise;

    assert(rpcResponse !== null, 'Test 6a: Received final JSON-RPC response');
    assert(rpcResponse.id === 'rpc_call_sys_exec', 'Test 6b: Response ID matches request ID');
    assert(rpcResponse.result?.status === 'completed', 'Test 6c: Execution status completed');
    assert(rpcResponse.result?.exitCode === 0, 'Test 6d: Exit code is 0');

    const totalStreamedText = streamMessages.map((m) => m.params.chunk).join('');
    assert(totalStreamedText.includes('WS_STREAM_OK_1'), 'Test 6e: Received streamed chunk 1 over WebSocket');
    assert(totalStreamedText.includes('WS_STREAM_OK_2'), 'Test 6f: Received streamed chunk 2 over WebSocket');

    socket.destroy();
    await server.stop();
  }

  console.log(`\n===========================================================================`);
  console.log(`TOTAL ADVERSARIAL TESTS: ${passedTests}/${totalTests} PASSED`);
  console.log(`===========================================================================\n`);

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runAdversarialTests().catch((err) => {
  console.error('Adversarial test suite fatal error:', err);
  process.exit(1);
});
