/**
 * Test Suite for MockWindowHost & Standalone Capability Dispatch
 * Verifies instant mock responses and timeout resolution in standalone mode.
 */

import { MockWindowHost } from '../src/adapters/ports.js';
import { ElixAppManager } from '../src/app-manager.js';
import { MemoryToolSink, MemoryCapabilityIndex, ConsoleConfirmationBroker } from '../src/adapters/ports.js';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fsp from 'node:fs/promises';

console.log('=== RUNNING MOCK WINDOW HOST CAPABILITY DISPATCH TEST SUITE ===\n');

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

async function runMockWindowHostTests() {
  const mockHost = new MockWindowHost({ defaultTimeoutMs: 100 });

  // 1. Direct callAppCapability with no live webview
  const start1 = Date.now();
  const res1 = await mockHost.callAppCapability('com.elix.fakeapp', 'ping', { message: 'test' });
  const elapsed1 = Date.now() - start1;

  assert(res1.success === true, 'Test 1a: callAppCapability returns success: true immediately');
  assert(res1.result.status === 'ok', 'Test 1b: Result status is "ok"');
  assert(res1.result.appId === 'com.elix.fakeapp', 'Test 1c: Result appId is "com.elix.fakeapp"');
  assert(res1.result.capability === 'ping', 'Test 1d: Result capability is "ping"');
  assert(res1.result.receivedParams.message === 'test', 'Test 1e: Received params match');
  assert(typeof res1.result.timestamp === 'string', 'Test 1f: Timestamp is ISO string');
  assert(elapsed1 < 200, `Test 1g: Instant return (<200ms) instead of 30s timeout (took ${elapsed1}ms)`);

  // 2. Custom simulated capability handler
  mockHost.registerCapabilityHandler('com.elix.calculator', 'calculate', (params: any) => {
    return { calculated: true, result: 42, expr: params.expression };
  });

  const res2 = await mockHost.sendToolCall('com.elix.calculator', 'calculate', { expression: '6 * 7' });
  assert(res2.calculated === true, 'Test 2a: Custom simulated handler executed');
  assert(res2.result === 42, 'Test 2b: Calculated result is 42');

  // 3. Verify tool execution through AppManager with MockWindowHost
  const sandboxDir = path.join(os.tmpdir(), `elix-mockhost-${Date.now()}`);
  await fsp.mkdir(sandboxDir, { recursive: true });

  const toolSink = new MemoryToolSink();
  const capabilityIndex = new MemoryCapabilityIndex();
  const confirmationBroker = new ConsoleConfirmationBroker(true);

  const appManager = new ElixAppManager({
    baseDir: sandboxDir,
    toolSink,
    capabilityIndex,
    confirmationBroker,
    windowHost: mockHost,
  });

  const pingToolRes = await appManager.sendToolCall('com.elix.fakeapp', 'ping', { message: 'hello from test' });
  assert(pingToolRes.success === true, 'Test 3a: appManager.sendToolCall returns mock response');
  assert(pingToolRes.result.receivedParams.message === 'hello from test', 'Test 3b: Returned receivedParams');

  await fsp.rm(sandboxDir, { recursive: true, force: true }).catch(() => {});

  console.log(`\n=== RESULTS: ${passedTests}/${totalTests} TESTS PASSED ===\n`);
  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runMockWindowHostTests().catch((err) => {
  console.error('MockWindowHost test runner fatal error:', err);
  process.exit(1);
});
