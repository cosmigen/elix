/**
 * Test Suite for NativeWindowHost (Physical desktop window spawner)
 */

import { NativeWindowHost } from '../src/adapters/ports.js';
import { ElixAppManager } from '../src/app-manager.js';
import { MemoryToolSink, MemoryCapabilityIndex, ConsoleConfirmationBroker } from '../src/adapters/ports.js';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fsp from 'node:fs/promises';

console.log('=== RUNNING NATIVE WINDOW HOST TEST SUITE ===\n');

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

async function runNativeWindowHostTests() {
  const nativeHost = new NativeWindowHost({ defaultTimeoutMs: 100 });

  // 1. Launch / openWindow creates an active window
  const win = await nativeHost.launch('com.elix.testapp', '#/main', { width: 500, height: 700 });
  assert(win !== undefined, 'Test 1a: launch returned ElixAppWindow');
  assert(win.appId === 'com.elix.testapp', 'Test 1b: Window appId matches');
  assert(win.state === 'open', 'Test 1c: Window state is "open"');
  assert(win.geometry.width === 500, 'Test 1d: Window width override applied');
  assert(win.geometry.height === 700, 'Test 1e: Window height override applied');

  // 2. OpenWindow alias
  const winAlias = await nativeHost.openWindow('com.elix.testapp');
  assert(winAlias.id === win.id, 'Test 2: openWindow returns existing active window instance');

  // 3. Capability execution
  const start = Date.now();
  const capRes = await nativeHost.callAppCapability('com.elix.testapp', 'ping', { test: true });
  const elapsed = Date.now() - start;

  assert(capRes.success === true, 'Test 3a: callAppCapability returns success: true');
  assert(capRes.result.status === 'ok', 'Test 3b: Capability result status is "ok"');
  assert(capRes.result.data.test === true, 'Test 3c: Received params in data');
  assert(elapsed < 250, `Test 3d: Instant resolution in <250ms (took ${elapsed}ms)`);

  // 4. Close window
  const closed = await nativeHost.close('com.elix.testapp');
  assert(closed === true, 'Test 4a: close returned true');
  assert(win.state === 'closed', 'Test 4b: Window state updated to "closed"');
  assert(nativeHost.listWindows().length === 0, 'Test 4c: No active windows remaining');

  // 5. Integration with AppManager
  const sandboxDir = path.join(os.tmpdir(), `elix-nativehost-${Date.now()}`);
  await fsp.mkdir(sandboxDir, { recursive: true });

  const toolSink = new MemoryToolSink();
  const capabilityIndex = new MemoryCapabilityIndex();
  const confirmationBroker = new ConsoleConfirmationBroker(true);

  const appManager = new ElixAppManager({
    baseDir: sandboxDir,
    toolSink,
    capabilityIndex,
    confirmationBroker,
    windowHost: nativeHost,
  });
  nativeHost.setInstaller(appManager.installer);

  const mgrWin = await appManager.launch('com.elix.sample');
  assert(mgrWin.state === 'open', 'Test 5a: appManager.launch with NativeWindowHost succeeds');
  await appManager.close('com.elix.sample');
  assert(mgrWin.state === 'closed', 'Test 5b: appManager.close with NativeWindowHost closes window');

  try {
    await fsp.rm(sandboxDir, { recursive: true, force: true });
  } catch {}

  console.log(`\n=== RESULTS: ${passedTests}/${totalTests} TESTS PASSED ===\n`);
  if (passedTests !== totalTests) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runNativeWindowHostTests().catch((err) => {
  console.error('NativeWindowHost test suite fatal error:', err);
  process.exit(1);
});
