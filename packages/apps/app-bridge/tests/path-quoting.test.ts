/**
 * Test Suite for Path Quoting and Windows Space Safety
 */

import { NativeWindowHost } from '../src/adapters/ports.js';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fsp from 'node:fs/promises';

console.log('=== RUNNING PATH QUOTING & SPACE SAFETY TEST SUITE ===\n');

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

async function runPathQuotingTests() {
  const host = new NativeWindowHost();

  // Create a temporary app directory with spaces in the folder path
  const spaceDir = path.join(os.tmpdir(), `elix space test ${Date.now()}`);
  const distDir = path.join(spaceDir, 'dist');
  await fsp.mkdir(distDir, { recursive: true });

  const htmlContent = `<!DOCTYPE html><html><body><h1>Space Test App</h1></body></html>`;
  await fsp.writeFile(path.join(distDir, 'index.html'), htmlContent, 'utf8');

  const fileUrl = `file:///${path.join(distDir, 'index.html').replace(/\\/g, '/')}`;

  // Launch window with path containing spaces
  const win = await host.launch('com.elix.spacetest', fileUrl, {
    width: 500,
    height: 600,
  });

  assert(win !== undefined, 'Test 1: launch returned window for space-containing path');
  assert(win.state === 'open', 'Test 2: Window state is open');
  assert(win.url.includes('elix%20space%20test') || win.url.includes('elix space test'), 'Test 3: Window URL preserves space path');

  // Capability dispatch
  const res: any = await host.callAppCapability('com.elix.spacetest', 'ping', { test: true });
  assert(res.success === true, 'Test 4: Capability dispatch succeeds on space-containing app');

  // Close window
  const closed = await host.close('com.elix.spacetest');
  assert(closed === true, 'Test 5: Window closed cleanly');

  await fsp.rm(spaceDir, { recursive: true, force: true }).catch(() => {});

  console.log(`\n=== RESULTS: ${passedTests}/${totalTests} TESTS PASSED ===\n`);
  if (passedTests !== totalTests) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runPathQuotingTests().catch((err) => {
  console.error('Path quoting test suite fatal error:', err);
  process.exit(1);
});
