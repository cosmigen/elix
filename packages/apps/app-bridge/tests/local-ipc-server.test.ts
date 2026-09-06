/**
 * Test Suite for Native Zero-Dependency WebSocket RFC-6455 IPC Server
 */

import { LocalIpcServer } from '../src/local-ipc-server.js';
import * as net from 'node:net';
import * as crypto from 'node:crypto';

console.log('=== RUNNING LOCAL WEBSOCKET IPC BRIDGE TEST SUITE ===\n');

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
  } else {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(payload.length, 2);
  }

  return Buffer.concat([header, mask, maskedPayload]);
}

function decodeServerWsFrame(buf: Buffer): string {
  if (buf.length < 2) return '';
  const len = buf[1] & 0x7f;
  let offset = 2;
  if (len === 126) offset = 4;
  else if (len === 127) offset = 10;
  return buf.subarray(offset).toString('utf8');
}

async function runLocalIpcTests() {
  const testPort = 7393;
  const server = new LocalIpcServer({ port: testPort });
  await server.start();
  assert(true, 'Test 1: LocalIpcServer started on port ' + testPort);

  // 2. Connect client TCP socket and do WebSocket upgrade handshake
  const socket = net.createConnection({ port: testPort, host: '127.0.0.1' });
  const secKey = crypto.randomBytes(16).toString('base64');
  let receivedClose = false;

  await new Promise<void>((resolve, reject) => {
    socket.on('connect', () => {
      const handshake = [
        `GET /?appId=com.elix.testapp HTTP/1.1`,
        `Host: 127.0.0.1:${testPort}`,
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
        // Send registration
        socket.write(encodeClientWsFrame(JSON.stringify({ type: 'REGISTER', appId: 'com.elix.testapp' })));
        resolve();
      } else {
        const decoded = decodeServerWsFrame(data);
        if (decoded) {
          try {
            const parsed = JSON.parse(decoded);
            if (parsed.type === 'TOOL_INVOKE') {
              // Respond with tool execution result
              const resPacket = {
                type: 'TOOL_RESULT',
                id: parsed.id,
                appId: 'com.elix.testapp',
                payload: {
                  success: true,
                  result: {
                    status: 'ok',
                    appId: 'com.elix.testapp',
                    echo: parsed.payload?.args,
                  },
                },
              };
              socket.write(encodeClientWsFrame(JSON.stringify(resPacket)));
            } else if (parsed.action === 'CLOSE' || parsed.type === 'WINDOW_CLOSE') {
              receivedClose = true;
            }
          } catch {}
        }
      }
    });

    socket.on('error', reject);
  });

  await new Promise((r) => setTimeout(r, 100));
  assert(server.hasClient('com.elix.testapp'), 'Test 2: Server registered client connection');

  // 3. Dispatch tool call over WebSocket
  const start = Date.now();
  const toolRes: any = await server.sendToolCall('com.elix.testapp', 'ping', { test: true });
  const elapsed = Date.now() - start;

  assert(toolRes.success === true, 'Test 3a: Tool execution resolved over WebSocket');
  assert(toolRes.result.echo.test === true, 'Test 3b: Echoed argument values');
  assert(elapsed < 250, `Test 3c: Fast roundtrip in ${elapsed}ms`);

  // 4. Send close
  server.sendClose('com.elix.testapp');
  await new Promise((r) => setTimeout(r, 100));
  assert(receivedClose === true, 'Test 4: Client received window CLOSE action');

  socket.end();
  await server.stop();

  console.log(`\n=== RESULTS: ${passedTests}/${totalTests} TESTS PASSED ===\n`);
  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runLocalIpcTests().catch((err) => {
  console.error('LocalIpcServer test suite fatal error:', err);
  process.exit(1);
});
