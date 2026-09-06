/**
 * Test Suite for ELIX Notes Real-Time DOM & Rebuild Verification
 */

import { ElixAppManager } from '../src/app-manager.js';
import { MemoryToolSink, MemoryCapabilityIndex, ConsoleConfirmationBroker, NativeWindowHost } from '../src/adapters/ports.js';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';

console.log('=== RUNNING NOTES REAL-TIME DOM & REBUILD TEST SUITE ===\n');

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

async function runNotesRealtimeTests() {
  const sandboxDir = path.join(os.tmpdir(), `elix-notes-test-${Date.now()}`);
  await fsp.mkdir(sandboxDir, { recursive: true });

  const toolSink = new MemoryToolSink();
  const capabilityIndex = new MemoryCapabilityIndex();
  const confirmationBroker = new ConsoleConfirmationBroker(true);
  const nativeWindowHost = new NativeWindowHost();

  const appManager = new ElixAppManager({
    baseDir: sandboxDir,
    toolSink,
    capabilityIndex,
    confirmationBroker,
    windowHost: nativeWindowHost,
  });
  nativeWindowHost.setInstaller(appManager.installer);

  // 1. Rebuild and install demo apps
  const rebuilt = await appManager.rebuildDemoApps();
  assert(rebuilt.length >= 1, 'Test 1a: rebuildDemoApps installed demo applications');
  const notesApp = appManager.get('com.elix.notes');
  assert(notesApp !== undefined, 'Test 1b: com.elix.notes is installed');
  const notesIndex = path.join(notesApp!.installPath, 'index.html');
  assert(fs.existsSync(notesIndex), 'Test 1c: index.html exists in install directory');
  const indexContent = await fsp.readFile(notesIndex, 'utf8');
  assert(indexContent.includes('noteData') || indexContent.includes('create_note') || indexContent.includes('connectBridge'), 'Test 1d: index.html contains note receiver');
  assert(indexContent.includes('ws://127.0.0.1:7391') || indexContent.includes('ws://localhost:7391'), 'Test 1e: index.html contains WebSocket bridge endpoint');

  // 2. Launch Notes window
  const win = await appManager.launch('com.elix.notes');
  assert(win.state === 'open', 'Test 2a: Notes window launched and state is "open"');
  assert(win.url.includes('com.elix.notes'), 'Test 2b: Window URL points to notes app');

  // 3. Dynamic Tool Call: create_note
  const createNoteTool = toolSink.getTool('app_com_elix_notes_create_note');
  assert(createNoteTool !== undefined, 'Test 3a: app_com_elix_notes_create_note tool registered in ToolSink');

  const start = Date.now();
  const noteResult: any = await createNoteTool!.execute({
    title: 'Automated Real-Time AI Note',
    body: 'This note was created dynamically via AI tool calling.',
    tags: ['automated', 'live-test'],
  });
  const elapsed = Date.now() - start;

  assert(noteResult.success === true, 'Test 3b: create_note execution returned success: true');
  assert(noteResult.result.status === 'ok' || noteResult.result.title === 'Automated Real-Time AI Note', 'Test 3c: Result contains note metadata');
  assert(elapsed < 1000, `Test 3d: create_note executed in ${elapsed}ms`);

  // 4. Close Notes window
  const closed = await appManager.close('com.elix.notes');
  assert(closed === true, 'Test 4: Window closed successfully');

  await fsp.rm(sandboxDir, { recursive: true, force: true }).catch(() => {});

  console.log(`\n=== RESULTS: ${passedTests}/${totalTests} TESTS PASSED ===\n`);
  if (passedTests !== totalTests) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runNotesRealtimeTests().catch((err) => {
  console.error('Notes real-time test suite fatal error:', err);
  process.exit(1);
});
