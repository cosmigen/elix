/**
 * Comprehensive Test Suite for Dynamic Tool Registry, Universal Management Tools, and Capability Stub
 */

import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { ElixAppInstaller } from '../src/installer.js';
import { ElixWindowManager } from '../src/window-manager.js';
import { ElixZip } from '../src/utils/zip.js';
import {
  getAppToolName,
  registerAppTools,
  unregisterAppTools,
  getRegisteredAppTools,
} from '../src/tool-registry.js';
import { createManagementTools, registerManagementTools } from '../src/management-tools.js';
import { notifyCapabilitySearch, removeCapabilitySearch } from '../src/capability-stub.js';
import type { ElixAppManifest, IpcPacket } from '../src/types.js';

console.log('=== RUNNING TOOL REGISTRY & MANAGEMENT TOOLS TEST SUITE ===\n');

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

// Mock Cordis Context with Tool Service and Capability Search
function createMockContext() {
  const registeredTools = new Map<string, any>();
  const capabilitySearchEntries: any[] = [];

  const ctx: any = {
    tools: {
      register: (tool: any) => {
        registeredTools.set(tool.name, tool);
        return () => {
          registeredTools.delete(tool.name);
        };
      },
      unregister: (name: string) => {
        registeredTools.delete(name);
      },
      get: (name: string) => registeredTools.get(name),
      list: () => Array.from(registeredTools.values()),
    },
    capability_search: {
      registerCapability: (entry: any) => {
        capabilitySearchEntries.push(entry);
      },
      unregisterByAppId: (appId: string) => {
        const idx = capabilitySearchEntries.findIndex((e) => e.appId === appId);
        if (idx !== -1) capabilitySearchEntries.splice(idx, 1);
      },
      getEntries: () => capabilitySearchEntries,
    },
  };

  return { ctx, registeredTools, capabilitySearchEntries };
}

async function runTests() {
  const sandboxDir = path.join(os.tmpdir(), `elix-tool-test-${Date.now()}`);
  await fsp.mkdir(sandboxDir, { recursive: true });

  const installer = new ElixAppInstaller(sandboxDir);
  const wm = new ElixWindowManager(installer);
  const { ctx, registeredTools, capabilitySearchEntries } = createMockContext();

  // Test 1: Tool Naming Sanitizer
  const toolName1 = getAppToolName('com.elix.notes', 'create_note');
  assert(toolName1 === 'app_com_elix_notes_create_note', 'Test 1a: Tool name formatting matches app_com_elix_notes_create_note');

  const toolName2 = getAppToolName('sys-calc.tool', 'add-numbers');
  assert(toolName2 === 'app_sys_calc_tool_add_numbers', 'Test 1b: Sanitizes hyphens and dots properly');

  // 2. Package and install a test app with capabilities
  const notesManifest: ElixAppManifest = {
    id: 'com.elix.notes',
    name: 'ELIX Smart Notes',
    version: '1.0.0',
    description: 'Dynamic note taking with AI agent tool capabilities',
    author: 'ELIX Team',
    entry: 'index.html',
    capabilities: {
      create_note: {
        name: 'create_note',
        description: 'Create and save a new note with a title and content body',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Title of the note' },
            body: { type: 'string', description: 'Body text of the note' },
          },
          required: ['title', 'body'],
        },
        permissions: ['fs:write'],
      },
    },
  };

  const notesZip = new ElixZip();
  notesZip.addFile('elix.app.json', Buffer.from(JSON.stringify(notesManifest, null, 2), 'utf-8'));
  notesZip.addFile('index.html', Buffer.from('<!DOCTYPE html><html><body>Notes App</body></html>', 'utf-8'));

  const notesPkgPath = path.join(sandboxDir, 'notes.elixapp');
  notesZip.writeZip(notesPkgPath);

  const installedNotes = await installer.install(notesPkgPath, { skipConsent: true });
  assert(installedNotes.manifest.id === 'com.elix.notes', 'Setup: Notes app installed');

  // Test 2: Dynamic Tool Registration & Capability Search Integration
  const regTools = registerAppTools(ctx, wm, installedNotes);
  assert(regTools.length === 1, 'Test 2a: registerAppTools registers 1 tool');
  assert(regTools[0]?.name === 'app_com_elix_notes_create_note', 'Test 2b: Tool registered with canonical name');
  assert(registeredTools.has('app_com_elix_notes_create_note'), 'Test 2c: Tool present on mock ctx.tools');

  // Verify Capability Search hook
  assert(capabilitySearchEntries.length === 1, 'Test 2d: notifyCapabilitySearch registered entry in capability_search');
  assert(
    capabilitySearchEntries[0]?.id === 'app:com.elix.notes:create_note',
    'Test 2e: Capability search ID format is app:<appId>:<capName>'
  );
  assert(capabilitySearchEntries[0]?.kind === 'app_api', 'Test 2f: Capability search kind is app_api');

  // Test Capability search fallback when absent
  const bareCtx: any = {};
  let fallbackThrew = false;
  try {
    notifyCapabilitySearch(bareCtx, installedNotes);
    removeCapabilitySearch(bareCtx, 'com.elix.notes');
  } catch {
    fallbackThrew = true;
  }
  assert(!fallbackThrew, 'Test 2g: notifyCapabilitySearch gracefully falls back without throwing when service is absent');

  // Test 3: Tool Execution (Auto-launch window and dispatch tool call)
  const registeredToolDef = registeredTools.get('app_com_elix_notes_create_note');
  assert(registeredToolDef !== undefined, 'Test 3a: Retrieved registered tool from context');

  // Set up mock client handler on newly launched window
  wm.on('window:launched', (win) => {
    win.ipcSession.bindTransport((packet: IpcPacket) => {
      if (packet.type === 'TOOL_INVOKE') {
        const { capability, args } = (packet.payload as any) || {};
        if (capability === 'create_note') {
          win.ipcSession.handleIncomingPacket({
            type: 'TOOL_RESULT',
            id: packet.id,
            appId: win.appId,
            windowId: win.id,
            payload: { noteId: 'note_123', status: 'saved', title: args.title },
          });
        }
      }
    });
  });

  // Verify window is not open initially
  assert(wm.getWindow('com.elix.notes') === undefined, 'Test 3b: Window not open before tool execution');

  // AI executes tool
  const execResult = await registeredToolDef.execute({
    title: 'Meeting Notes',
    body: 'Discuss microkernel architecture',
  });

  assert(execResult.noteId === 'note_123', 'Test 3c: Tool execution auto-launched window and returned noteId');
  assert(execResult.status === 'saved', 'Test 3d: Tool execution returned expected status');
  assert(wm.getWindow('com.elix.notes') !== undefined, 'Test 3e: Window is now running in WindowManager');

  // Test 4: Unregister App Tools
  unregisterAppTools(ctx, 'com.elix.notes');
  assert(!registeredTools.has('app_com_elix_notes_create_note'), 'Test 4a: unregisterAppTools removed tool from context');
  assert(getRegisteredAppTools('com.elix.notes').length === 0, 'Test 4b: Tool removed from internal tracking');
  assert(capabilitySearchEntries.length === 0, 'Test 4c: Capability removed from search indexer');

  // Test 5: Universal Management Tools
  const mgmtTools = createManagementTools(installer, wm, ctx);
  assert(mgmtTools.length === 5, 'Test 5a: Exactly 5 universal management tools created');

  const toolNames = mgmtTools.map((t) => t.name);
  assert(toolNames.includes('get_app_list'), "Test 5b: Includes 'get_app_list'");
  assert(toolNames.includes('open_app'), "Test 5c: Includes 'open_app'");
  assert(toolNames.includes('close_app'), "Test 5d: Includes 'close_app'");
  assert(toolNames.includes('install_elix_app'), "Test 5e: Includes 'install_elix_app'");
  assert(toolNames.includes('uninstall_elix_app'), "Test 5e2: Includes 'uninstall_elix_app'");

  // Test 5f: registerManagementTools helper
  const disposeMgmt = registerManagementTools(ctx, installer, wm);
  assert(registeredTools.has('get_app_list'), 'Test 5f: Management tools registered to Cordis context');
  assert(registeredTools.has('uninstall_elix_app'), 'Test 5f2: uninstall_elix_app registered to Cordis context');

  // Test get_app_list tool
  const getAppListTool = registeredTools.get('get_app_list');
  const allAppsResult = await getAppListTool.execute({ filter: 'all' });
  assert(allAppsResult.count >= 1, 'Test 5g: get_app_list returns installed apps');
  assert(allAppsResult.apps.some((a: any) => a.appId === 'com.elix.notes'), 'Test 5h: Notes app present in list');

  const runningAppsResult = await getAppListTool.execute({ filter: 'running' });
  assert(runningAppsResult.apps.some((a: any) => a.appId === 'com.elix.notes'), 'Test 5i: Notes app listed as running');

  // Test close_app tool
  const closeAppTool = registeredTools.get('close_app');
  const closeResult = await closeAppTool.execute({ appId: 'com.elix.notes' });
  assert(closeResult.success === true, 'Test 5j: close_app closed the running window');
  assert(wm.getWindow('com.elix.notes') === undefined, 'Test 5k: Window no longer active');

  // Test open_app tool
  const openAppTool = registeredTools.get('open_app');
  const openResult = await openAppTool.execute({ appId: 'com.elix.notes', initialRoute: 'editor' });
  assert(openResult.success === true, 'Test 5l: open_app launched the window');
  assert(openResult.url.includes('#editor'), 'Test 5m: Initial route editor attached to URL');

  // Test install_elix_app tool
  const secondAppManifest: ElixAppManifest = {
    id: 'com.elix.terminal',
    name: 'ELIX Terminal',
    version: '1.0.0',
    description: 'System Terminal emulator',
    author: 'DeepSeek',
    entry: 'index.html',
    capabilities: {
      exec: {
        name: 'exec',
        description: 'Execute command',
        parameters: {
          type: 'object',
          properties: { cmd: { type: 'string' } },
          required: ['cmd'],
        },
      },
    },
  };

  const termZip = new ElixZip();
  termZip.addFile('elix.app.json', Buffer.from(JSON.stringify(secondAppManifest), 'utf-8'));
  termZip.addFile('index.html', Buffer.from('<html>Terminal</html>', 'utf-8'));
  const termPkgPath = path.join(sandboxDir, 'terminal.elixapp');
  termZip.writeZip(termPkgPath);

  const installTool = registeredTools.get('install_elix_app');
  const installResult = await installTool.execute({ packagePath: termPkgPath });
  assert(installResult.success === true, 'Test 5n: install_elix_app tool installed new package');
  assert(installResult.appId === 'com.elix.terminal', 'Test 5o: Returns correct installed appId');
  assert(registeredTools.has('app_com_elix_terminal_exec'), 'Test 5p: New app capability auto-registered to Cordis');

  // Test uninstall_elix_app tool
  const uninstallTool = registeredTools.get('uninstall_elix_app');
  const uninstallResult = await uninstallTool.execute({ appId: 'com.elix.terminal', keepData: true });
  assert(uninstallResult.success === true, 'Test 5q: uninstall_elix_app tool uninstalled package');
  assert(!registeredTools.has('app_com_elix_terminal_exec'), 'Test 5r: Tool removed after uninstall');

  // Cleanup
  disposeMgmt();
  await wm.closeAll();
  await fsp.rm(sandboxDir, { recursive: true, force: true }).catch(() => {});

  console.log(`\n=== RESULTS: ${passedTests}/${totalTests} TESTS PASSED ===\n`);
  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
