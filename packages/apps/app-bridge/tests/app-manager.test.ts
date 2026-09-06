/**
 * Comprehensive Test Suite for ElixAppManager (ELIXAPP Spec v1.2.0 Standalone-First Architecture)
 */

import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { ElixAppManager } from '../src/app-manager.js';
import { ElixZip } from '../src/utils/zip.js';
import {
  MemoryToolSink,
  MemoryCapabilityIndex,
  ConsoleConfirmationBroker,
  EventEmitterEventSink,
} from '../src/adapters/ports.js';
import type { ElixAppManifest, IpcPacket } from '../src/types.js';

console.log('=== RUNNING ELIX APP MANAGER (v1.2.0 STANDALONE) TEST SUITE ===\n');

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

async function runTests() {
  const sandboxDir = path.join(os.tmpdir(), `elix-appman-test-${Date.now()}`);
  await fsp.mkdir(sandboxDir, { recursive: true });

  const toolSink = new MemoryToolSink();
  const capabilityIndex = new MemoryCapabilityIndex();
  const confirmationBroker = new ConsoleConfirmationBroker(true); // Auto-accept
  const eventSink = new EventEmitterEventSink();

  const appManager = new ElixAppManager({
    baseDir: sandboxDir,
    toolSink,
    capabilityIndex,
    confirmationBroker,
    eventSink,
  });

  // Package a sample app
  const manifestV1: ElixAppManifest = {
    id: 'com.elix.todo',
    name: 'ELIX Tasks',
    version: '1.0.0',
    description: 'Standalone Task Manager',
    author: 'DeepSeek AI',
    entry: 'index.html',
    permissions: ['fs:read', 'fs:write'],
    capabilities: {
      add_task: {
        name: 'add_task',
        description: 'Add a new task',
        parameters: {
          type: 'object',
          properties: { title: { type: 'string' } },
          required: ['title'],
        },
      },
      list_tasks: {
        name: 'list_tasks',
        description: 'List all tasks',
        parameters: { type: 'object', properties: {} },
      },
    },
  };

  const zip1 = new ElixZip();
  zip1.addFile('elix.app.json', Buffer.from(JSON.stringify(manifestV1, null, 2), 'utf-8'));
  zip1.addFile('index.html', Buffer.from('<!DOCTYPE html><html><body>Tasks</body></html>', 'utf-8'));
  const pkgV1 = path.join(sandboxDir, 'tasks-v1.elixapp');
  zip1.writeZip(pkgV1);

  // 1. Metadata Operations: inspectPackage & verifyPackage
  const inspected = await appManager.inspectPackage(pkgV1);
  assert(inspected.appId === 'com.elix.todo', 'Test 1a: inspectPackage retrieves appId');
  assert(inspected.capabilities.length === 2, 'Test 1b: inspectPackage lists 2 capabilities');

  const verified = await appManager.verifyPackage(pkgV1);
  assert(verified.valid === true, 'Test 1c: verifyPackage returns valid: true');

  // 2. Lifecycle: install
  let eventInstalledFired = false;
  const unsubscribeInstalled = appManager.subscribe('app:installed', (data: any) => {
    if (data.app?.manifest.id === 'com.elix.todo' || data.appId === 'com.elix.todo') {
      eventInstalledFired = true;
    }
  });

  const installedApp = await appManager.install(pkgV1);
  assert(installedApp.manifest.id === 'com.elix.todo', 'Test 2a: install returns InstalledApp');
  assert(eventInstalledFired === true, 'Test 2b: app:installed event triggered on EventSink');
  unsubscribeInstalled();

  // Verify tools mounted in MemoryToolSink
  assert(toolSink.getTool('app_com_elix_todo_add_task') !== undefined, 'Test 2c: add_task mounted in ToolSink');
  assert(toolSink.getTool('app_com_elix_todo_list_tasks') !== undefined, 'Test 2d: list_tasks mounted in ToolSink');

  // Verify indexed in MemoryCapabilityIndex
  assert(capabilityIndex.searchCapabilities('task').length === 2, 'Test 2e: Capabilities indexed in CapabilityIndex');

  // 3. Metadata: list() & get()
  const listAll = appManager.list('all');
  assert(listAll.length === 1, 'Test 3a: list("all") returns 1 app');
  assert(listAll[0]?.status === 'installed', 'Test 3b: Status is initially installed (idle)');

  const getApp = appManager.get('com.elix.todo');
  assert(getApp !== undefined && getApp.manifest.name === 'ELIX Tasks', 'Test 3c: get() retrieves app');

  // 4. Lifecycle: launch & close
  const win = await appManager.launch('com.elix.todo', 'today');
  assert(win.appId === 'com.elix.todo', 'Test 4a: launch() opens window');
  assert(win.url.includes('#today'), 'Test 4b: Route attached to URL');

  const listRunning = appManager.list('running');
  assert(listRunning.length === 1, 'Test 4c: list("running") now returns 1 running app');

  // Tool dispatch via window mock
  win.ipcSession.bindTransport((packet: IpcPacket) => {
    if (packet.type === 'TOOL_INVOKE') {
      const { capability, args } = (packet.payload as any) || {};
      if (capability === 'add_task') {
        win.ipcSession.handleIncomingPacket({
          type: 'TOOL_RESULT',
          id: packet.id,
          appId: win.appId,
          windowId: win.id,
          payload: { taskId: 't_1', title: args.title, done: false },
        });
      }
    }
  });

  const toolRes = await appManager.sendToolCall('com.elix.todo', 'add_task', { title: 'Write Spec' });
  assert(toolRes.taskId === 't_1', 'Test 4d: sendToolCall dispatches and returns tool result');

  const closed = await appManager.close('com.elix.todo');
  assert(closed === true, 'Test 4e: close() closes running window');
  assert(appManager.list('running').length === 0, 'Test 4f: 0 running apps after close');

  // 5. Policy & Permissions
  const permissions = appManager.getPermissions('com.elix.todo');
  assert(permissions.includes('fs:read') && permissions.includes('fs:write'), 'Test 5a: Initial permissions active');

  appManager.setPermission('com.elix.todo', 'fs:write', false);
  const updatedPerms = appManager.getPermissions('com.elix.todo');
  assert(!updatedPerms.includes('fs:write'), 'Test 5b: Revoked fs:write permission');

  // 6. Capability Toggle Policy
  const initialCaps = appManager.getCapabilities('com.elix.todo');
  assert(initialCaps.length === 2, 'Test 6a: 2 initial capabilities');

  appManager.setCapability('com.elix.todo', 'list_tasks', false);
  assert(toolSink.getTool('app_com_elix_todo_list_tasks') === undefined, 'Test 6b: Disabled capability unmounted from ToolSink');
  assert(toolSink.getTool('app_com_elix_todo_add_task') !== undefined, 'Test 6c: Other capabilities remain mounted');

  appManager.setCapability('com.elix.todo', 'list_tasks', true);
  assert(toolSink.getTool('app_com_elix_todo_list_tasks') !== undefined, 'Test 6d: Re-enabled capability re-mounted to ToolSink');

  // 7. Lifecycle: update & repair
  const manifestV2: ElixAppManifest = {
    ...manifestV1,
    version: '1.1.0',
    description: 'Updated Task Manager with tags',
  };
  const zip2 = new ElixZip();
  zip2.addFile('elix.app.json', Buffer.from(JSON.stringify(manifestV2, null, 2), 'utf-8'));
  zip2.addFile('index.html', Buffer.from('<!DOCTYPE html><html><body>Tasks v2</body></html>', 'utf-8'));
  const pkgV2 = path.join(sandboxDir, 'tasks-v2.elixapp');
  zip2.writeZip(pkgV2);

  const updatedApp = await appManager.update('com.elix.todo', pkgV2, { skipConsent: true });
  assert(updatedApp.manifest.version === '1.1.0', 'Test 7a: update() successfully upgrades app to v1.1.0');

  const repairedApp = await appManager.repair('com.elix.todo');
  assert(repairedApp.manifest.id === 'com.elix.todo', 'Test 7b: repair() refreshes app');

  // 8. Lifecycle: prepareUninstall & uninstall
  const preflight = await appManager.prepareUninstall('com.elix.todo');
  assert(preflight.appId === 'com.elix.todo', 'Test 8a: prepareUninstall returns preflight report');
  assert(preflight.registeredToolsCount === 2, 'Test 8b: preflight reports correct tool count');

  const uninstalled = await appManager.uninstall('com.elix.todo');
  assert(uninstalled === true, 'Test 8c: uninstall() returns true');
  assert(appManager.list('all').length === 0, 'Test 8d: list() is empty after uninstall');
  assert(toolSink.listTools().length === 0, 'Test 8e: All tools removed from ToolSink');

  // Cleanup
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
