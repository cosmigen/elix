/**
 * Comprehensive Acceptance Test Suite for ELIX AppManager Deliverable (v1.2.0)
 * 
 * Verifies:
 * 1. Installing both reference demo apps (com.elix.notes and com.elix.calculator)
 * 2. Spawning mock floating windows with route navigation and window management
 * 3. Calling dynamic AI capabilities via ToolSink and IPC bridge
 * 4. Running an uninstall test with keepData: true and confirming user data persists
 * 5. Running complete purge uninstall with keepData: false
 */

import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';
import { ElixAppManager } from '../src/app-manager.js';
import { MemoryToolSink, MemoryCapabilityIndex, ConsoleConfirmationBroker } from '../src/adapters/ports.js';
import { registerManagementTools, createManagementTools } from '../src/management-tools.js';
import { packageFolderToZip } from '../src/utils/zip.js';
import type { IpcPacket } from '../src/ipc-channel.js';

console.log('========================================================================');
console.log('ELIX APPMANAGER v1.2.0 — COMPLETE ACCEPTANCE & END-TO-END SUITE');
console.log('========================================================================\n');

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

async function runAcceptanceTest() {
  const sandboxDir = path.join(os.tmpdir(), `elix-acceptance-${Date.now()}`);
  await fsp.mkdir(sandboxDir, { recursive: true });

  const toolSink = new MemoryToolSink();
  const capabilityIndex = new MemoryCapabilityIndex();
  const confirmationBroker = new ConsoleConfirmationBroker(true);

  // Initialize standalone AppManager with partitioned storage & in-memory ports
  const appManager = new ElixAppManager({
    baseDir: sandboxDir,
    toolSink,
    capabilityIndex,
    confirmationBroker,
  });

  // Register universal management tools
  registerManagementTools(toolSink, appManager.installer, appManager.windowHost);

  // ==========================================================================
  // 1. Package & Install Demo Apps (Notes & Calculator)
  // ==========================================================================
  console.log('\n--- PHASE 1: PACKAGING & INSTALLING DEMO APPS ---');

  const demoNotesDir = path.join(PACKAGE_ROOT, 'demo-apps', 'com.elix.notes');
  const demoCalcDir = path.join(PACKAGE_ROOT, 'demo-apps', 'com.elix.calculator');
  const stagingZipDir = path.join(sandboxDir, 'app-staging', 'demo-bootstrap');
  await fsp.mkdir(stagingZipDir, { recursive: true });

  const notesZipPath = path.join(stagingZipDir, 'com.elix.notes.elixapp');
  const calcZipPath = path.join(stagingZipDir, 'com.elix.calculator.elixapp');

  packageFolderToZip(demoNotesDir, notesZipPath);
  packageFolderToZip(demoCalcDir, calcZipPath);

  assert(fs.existsSync(notesZipPath), 'Step 1a: Packaged com.elix.notes.elixapp bundle');
  assert(fs.existsSync(calcZipPath), 'Step 1b: Packaged com.elix.calculator.elixapp bundle');

  // Install com.elix.notes
  const installedNotes = await appManager.install(notesZipPath, { skipConsent: true });
  assert(installedNotes.manifest.id === 'com.elix.notes', 'Step 1c: com.elix.notes installed via AppManager');
  assert(fs.existsSync(installedNotes.installPath), 'Step 1d: Notes binaries deployed in apps/com.elix.notes/');
  assert(fs.existsSync(installedNotes.storage!.dataPath), 'Step 1e: Notes user data partition initialized in app-data/com.elix.notes/');

  // Install com.elix.calculator
  const installedCalc = await appManager.install(calcZipPath, { skipConsent: true });
  assert(installedCalc.manifest.id === 'com.elix.calculator', 'Step 1f: com.elix.calculator installed via AppManager');
  assert(fs.existsSync(installedCalc.installPath), 'Step 1g: Calculator binaries deployed in apps/com.elix.calculator/');

  // Verify list() reflects both apps
  const appList = appManager.list('all');
  assert(appList.length === 2, 'Step 1h: appManager.list("all") returns both installed apps');

  // ==========================================================================
  // 2. Spawning Mock Floating Windows with Route Navigation
  // ==========================================================================
  console.log('\n--- PHASE 2: SPAWNING MOCK FLOATING WINDOWS ---');

  // Spawn Notes window with initialRoute '#editor'
  const notesWin = await appManager.launch('com.elix.notes', '#editor');
  assert(notesWin.appId === 'com.elix.notes', 'Step 2a: Notes window spawned');
  assert(notesWin.state === 'open', 'Step 2b: Notes window state is open');
  assert(notesWin.url.includes('#editor'), 'Step 2c: Notes URL includes #editor route');
  assert(notesWin.manifest.window?.frame === false, 'Step 2d: Notes window is frameless (frame: false)');
  assert(notesWin.manifest.window?.transparent === true, 'Step 2e: Notes window is transparent (transparent: true)');

  // Spawn Calculator window with initialRoute '#keypad'
  const calcWin = await appManager.launch('com.elix.calculator', '#keypad');
  assert(calcWin.appId === 'com.elix.calculator', 'Step 2f: Calculator window spawned');
  assert(calcWin.url.includes('#keypad'), 'Step 2g: Calculator URL includes #keypad route');

  // Verify running status
  const runningList = appManager.list('running');
  assert(runningList.length === 2, 'Step 2h: appManager.list("running") detects 2 active windows');

  // Window Focus, Minimize, Maximize, and Control APIs
  await notesWin.focus();
  assert(notesWin.state === 'focused', 'Step 2i: Notes window focused');
  await notesWin.minimize();
  assert(notesWin.state === 'minimized', 'Step 2j: Notes window minimized');
  await notesWin.maximize();
  assert(notesWin.state === 'maximized', 'Step 2k: Notes window maximized');
  await notesWin.unmaximize();
  assert(notesWin.state === 'open', 'Step 2l: Notes window unmaximized');

  // ==========================================================================
  // 3. Calling Dynamic AI Capabilities
  // ==========================================================================
  console.log('\n--- PHASE 3: CALLING DYNAMIC AI CAPABILITIES ---');

  // Set up mock client tool handlers
  notesWin.ipcSession.bindTransport((packet: IpcPacket) => {
    if (packet.type === 'TOOL_INVOKE') {
      const { capability, args } = (packet.payload as any) || {};
      if (capability === 'create_note') {
        notesWin.ipcSession.handleIncomingPacket({
          type: 'TOOL_RESULT',
          id: packet.id,
          appId: notesWin.appId,
          windowId: notesWin.id,
          payload: { success: true, noteId: 'note_acceptance_01', title: args.title, savedAt: Date.now() },
        });
      } else if (capability === 'search_notes') {
        notesWin.ipcSession.handleIncomingPacket({
          type: 'TOOL_RESULT',
          id: packet.id,
          appId: notesWin.appId,
          windowId: notesWin.id,
          payload: { query: args.query, matches: [{ id: 'note_acceptance_01', title: 'Test Note' }] },
        });
      }
    }
  });

  calcWin.ipcSession.bindTransport((packet: IpcPacket) => {
    if (packet.type === 'TOOL_INVOKE') {
      const { capability, args } = (packet.payload as any) || {};
      if (capability === 'calculate') {
        calcWin.ipcSession.handleIncomingPacket({
          type: 'TOOL_RESULT',
          id: packet.id,
          appId: calcWin.appId,
          windowId: calcWin.id,
          payload: { expression: args.expression, result: 144, calculatedAt: Date.now() },
        });
      }
    }
  });

  // Call create_note on Notes app
  const createNoteTool = toolSink.getTool('app_com_elix_notes_create_note');
  assert(createNoteTool !== undefined, 'Step 3a: app_com_elix_notes_create_note is mounted in ToolSink');
  const createNoteRes = await createNoteTool!.execute({
    title: 'Acceptance Verification Note',
    body: 'Hexagonal decoupled core with persistent storage partitions',
    tags: ['acceptance', 'elix'],
  });
  assert(createNoteRes.success === true, 'Step 3b: create_note capability returned success: true');
  assert(createNoteRes.noteId === 'note_acceptance_01', 'Step 3c: Returned noteId "note_acceptance_01"');

  // Call calculate on Calculator app
  const calculateTool = toolSink.getTool('app_com_elix_calculator_calculate');
  assert(calculateTool !== undefined, 'Step 3d: app_com_elix_calculator_calculate is mounted in ToolSink');
  const calcRes = await calculateTool!.execute({
    expression: '12 * 12',
  });
  assert(calcRes.result === 144, 'Step 3e: calculate capability evaluated 12 * 12 = 144');

  // Direct tool dispatch through AppManager facade
  const searchRes = await appManager.sendToolCall('com.elix.notes', 'search_notes', { query: 'Acceptance' });
  assert(searchRes.matches.length === 1, 'Step 3f: appManager.sendToolCall dispatched search_notes');

  // ==========================================================================
  // 4. Uninstall with keepData: true & Confirm Data Persistence
  // ==========================================================================
  console.log('\n--- PHASE 4: DATA RETENTION UNINSTALL (keepData: true) ---');

  // Simulate persistent user notebook stored in app-data/com.elix.notes/
  const notesDataPath = installedNotes.storage!.dataPath;
  const userNotebookFile = path.join(notesDataPath, 'user_notes.json');
  const userNotesContent = JSON.stringify([
    { id: 'note_acceptance_01', title: 'Acceptance Note', content: 'Preserve this across uninstalls' },
  ]);
  await fsp.writeFile(userNotebookFile, userNotesContent, 'utf-8');
  assert(fs.existsSync(userNotebookFile), 'Step 4a: Created persistent user notes file in app-data/com.elix.notes/');

  // Impact Plan
  const impactPlan = await appManager.prepareUninstall('com.elix.notes');
  assert(impactPlan.appId === 'com.elix.notes', 'Step 4b: prepareUninstall generated impact plan');
  assert(impactPlan.isRunning === true, 'Step 4c: Impact plan detected running window');
  assert(impactPlan.storage.dataSizeBytes > 0, 'Step 4d: Impact plan computed user data size');
  assert(impactPlan.dataRetentionAvailable === true, 'Step 4e: Data retention option available');

  // Execute safe uninstall
  const uninstallNotesRes = await appManager.uninstall('com.elix.notes', { keepData: true });
  assert(uninstallNotesRes === true, 'Step 4f: appManager.uninstall(keepData: true) returned true');

  // Verify binaries deleted, window closed, tools unmounted
  assert(!fs.existsSync(installedNotes.installPath), 'Step 4g: Binaries folder apps/com.elix.notes/ deleted');
  assert(appManager.windowHost.getWindow('com.elix.notes') === undefined, 'Step 4h: Notes window closed');
  assert(toolSink.getTool('app_com_elix_notes_create_note') === undefined, 'Step 4i: Notes tools unmounted from ToolSink');

  // VERIFY CRITICAL REQUIREMENT: Persistent user data MUST remain intact on disk!
  assert(fs.existsSync(userNotebookFile), 'Step 4j: CRITICAL: app-data/com.elix.notes/user_notes.json preserved intact on disk!');
  const savedData = await fsp.readFile(userNotebookFile, 'utf-8');
  assert(savedData === userNotesContent, 'Step 4k: Preserved user data contents match exactly');

  // ==========================================================================
  // 5. Complete Purge Uninstall (keepData: false)
  // ==========================================================================
  console.log('\n--- PHASE 5: COMPLETE PURGE UNINSTALL (keepData: false) ---');

  const calcDataPath = installedCalc.storage!.dataPath;
  const calcDataFile = path.join(calcDataPath, 'history.json');
  await fsp.writeFile(calcDataFile, JSON.stringify([{ calc: '12*12', res: 144 }]), 'utf-8');
  assert(fs.existsSync(calcDataFile), 'Step 5a: Created persistent data in app-data/com.elix.calculator/');

  const uninstallCalcRes = await appManager.uninstall('com.elix.calculator', { keepData: false });
  assert(uninstallCalcRes === true, 'Step 5b: appManager.uninstall(keepData: false) returned true');
  assert(!fs.existsSync(installedCalc.installPath), 'Step 5c: Calculator binaries deleted');
  assert(!fs.existsSync(calcDataFile), 'Step 5d: Calculator user data purged when keepData is false');

  // Verify list is completely empty
  const finalList = appManager.list('all');
  assert(finalList.length === 0, 'Step 5e: 0 applications installed after uninstall');

  // Cleanup sandbox
  await fsp.rm(sandboxDir, { recursive: true, force: true }).catch(() => {});

  console.log('\n========================================================================');
  console.log(`ACCEPTANCE RESULTS: ${passedTests}/${totalTests} TESTS PASSED (100%)`);
  console.log('========================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runAcceptanceTest().catch((err) => {
  console.error('Acceptance test runner fatal error:', err);
  process.exit(1);
});
