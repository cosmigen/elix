/**
 * Verification Test Suite for Reference Demo Applications (Notes & Calculator)
 * Tests packaging, installation, launching, dynamic tool invocation, and data retention.
 */

import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';
import { ElixAppManager } from '../src/app-manager.js';
import { MemoryToolSink, MemoryCapabilityIndex, ConsoleConfirmationBroker } from '../src/adapters/ports.js';
import { packageFolderToZip } from '../src/utils/zip.js';
import type { IpcPacket } from '../src/ipc-channel.js';

console.log('=== RUNNING REFERENCE DEMO APPS TEST SUITE ===\n');

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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PACKAGE_ROOT = path.resolve(__dirname, '..');

async function runDemoTests() {
  const sandboxDir = path.join(os.tmpdir(), `elix-demo-sandbox-${Date.now()}`);
  await fsp.mkdir(sandboxDir, { recursive: true });

  const toolSink = new MemoryToolSink();
  const capabilityIndex = new MemoryCapabilityIndex();
  const confirmationBroker = new ConsoleConfirmationBroker(true);

  const appManager = new ElixAppManager({
    baseDir: sandboxDir,
    toolSink,
    capabilityIndex,
    confirmationBroker,
  });

  const demoNotesDir = path.join(PACKAGE_ROOT, 'demo-apps', 'com.elix.notes');
  const demoCalcDir = path.join(PACKAGE_ROOT, 'demo-apps', 'com.elix.calculator');
  const stagingZipDir = path.join(sandboxDir, 'staging-zips');
  await fsp.mkdir(stagingZipDir, { recursive: true });

  // 1. Package Demo Notes
  const notesZipPath = path.join(stagingZipDir, 'com.elix.notes.elixapp');
  packageFolderToZip(demoNotesDir, notesZipPath);
  assert(fs.existsSync(notesZipPath), 'Test 1a: Demo Notes app packaged into .elixapp archive');

  // 2. Package Demo Calculator
  const calcZipPath = path.join(stagingZipDir, 'com.elix.calculator.elixapp');
  packageFolderToZip(demoCalcDir, calcZipPath);
  assert(fs.existsSync(calcZipPath), 'Test 1b: Demo Calculator app packaged into .elixapp archive');

  // 3. Inspect Demo Notes
  const notesInspect = await appManager.inspectPackage(notesZipPath);
  assert(notesInspect.appId === 'com.elix.notes', 'Test 2a: Notes appId inspected');
  assert(notesInspect.capabilities.some((c) => c.name === 'create_note'), 'Test 2b: Notes exports create_note capability');
  assert(notesInspect.capabilities.some((c) => c.name === 'search_notes'), 'Test 2c: Notes exports search_notes capability');

  // 4. Install Demo Notes
  const installedNotes = await appManager.install(notesZipPath, { skipConsent: true });
  assert(installedNotes.manifest.id === 'com.elix.notes', 'Test 3a: Notes installed successfully');
  assert(toolSink.getTool('app_com_elix_notes_create_note') !== undefined, 'Test 3b: app_com_elix_notes_create_note mounted in ToolSink');
  assert(toolSink.getTool('app_com_elix_notes_search_notes') !== undefined, 'Test 3c: app_com_elix_notes_search_notes mounted in ToolSink');

  // 5. Install Demo Calculator
  const installedCalc = await appManager.install(calcZipPath, { skipConsent: true });
  assert(installedCalc.manifest.id === 'com.elix.calculator', 'Test 3d: Calculator installed successfully');
  assert(toolSink.getTool('app_com_elix_calculator_calculate') !== undefined, 'Test 3e: app_com_elix_calculator_calculate mounted in ToolSink');
  assert(toolSink.getTool('app_com_elix_calculator_get_last_result') !== undefined, 'Test 3f: app_com_elix_calculator_get_last_result mounted in ToolSink');

  // 6. Launch Notes Window
  const notesWin = await appManager.launch('com.elix.notes', '#editor');
  assert(notesWin.appId === 'com.elix.notes', 'Test 4a: Notes window launched');
  assert(notesWin.url.includes('#editor'), 'Test 4b: Notes launched with #editor route');

  // Mock client tool handler for Notes
  notesWin.ipcSession.bindTransport((packet: IpcPacket) => {
    if (packet.type === 'TOOL_INVOKE') {
      const { capability, args } = (packet.payload as any) || {};
      if (capability === 'create_note') {
        notesWin.ipcSession.handleIncomingPacket({
          type: 'TOOL_RESULT',
          id: packet.id,
          appId: notesWin.appId,
          windowId: notesWin.id,
          payload: { success: true, noteId: 'note_001', title: args.title },
        });
      }
    }
  });

  // 7. Execute dynamic tool call on Notes
  const createNoteResult = await toolSink.getTool('app_com_elix_notes_create_note')!.execute({
    title: 'Architecture Blueprint',
    body: 'Decoupled Hexagonal Core',
  });
  assert(createNoteResult.success === true, 'Test 5a: create_note tool call succeeded');
  assert(createNoteResult.noteId === 'note_001', 'Test 5b: Returned noteId: note_001');

  // 8. Launch Calculator Window
  const calcWin = await appManager.launch('com.elix.calculator', '#keypad');
  assert(calcWin.appId === 'com.elix.calculator', 'Test 6a: Calculator window launched');

  calcWin.ipcSession.bindTransport((packet: IpcPacket) => {
    if (packet.type === 'TOOL_INVOKE') {
      const { capability, args } = (packet.payload as any) || {};
      if (capability === 'calculate') {
        calcWin.ipcSession.handleIncomingPacket({
          type: 'TOOL_RESULT',
          id: packet.id,
          appId: calcWin.appId,
          windowId: calcWin.id,
          payload: { expression: args.expression, result: 42 },
        });
      }
    }
  });

  const calcResult = await toolSink.getTool('app_com_elix_calculator_calculate')!.execute({
    expression: '6 * 7',
  });
  assert(calcResult.result === 42, 'Test 6b: calculate tool call returned 42');

  // 9. Write persistent user data into app-data/com.elix.notes/
  const notesDataDir = appManager.installer.storage.getAppStoragePaths('com.elix.notes').dataPath;
  const userNotebook = path.join(notesDataDir, 'notebook.json');
  await fsp.writeFile(userNotebook, JSON.stringify([{ id: 'note_001', content: 'Important user note' }]), 'utf-8');

  // 10. Prepare Uninstall Impact Plan
  const impactPlan = await appManager.prepareUninstall('com.elix.notes');
  assert(impactPlan.appId === 'com.elix.notes', 'Test 7a: prepareUninstall impact plan generated');
  assert(impactPlan.isRunning === true, 'Test 7b: Impact plan detects running window');
  assert(impactPlan.storage.dataSizeBytes > 0, 'Test 7c: Impact plan includes user notebook size');

  // 11. Safe Uninstall with Data Retention
  const uninstalledNotes = await appManager.uninstall('com.elix.notes', { keepData: true });
  assert(uninstalledNotes === true, 'Test 8a: Notes uninstalled');
  assert(toolSink.getTool('app_com_elix_notes_create_note') === undefined, 'Test 8b: Notes tools unmounted');
  assert(fs.existsSync(userNotebook), 'Test 8c: Persistent user data retained on disk!');

  // Cleanup sandbox
  await appManager.close('com.elix.calculator').catch(() => {});
  await fsp.rm(sandboxDir, { recursive: true, force: true }).catch(() => {});

  console.log(`\n=== RESULTS: ${passedTests}/${totalTests} TESTS PASSED ===\n`);
  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runDemoTests().catch((err) => {
  console.error('Demo apps test runner fatal error:', err);
  process.exit(1);
});
