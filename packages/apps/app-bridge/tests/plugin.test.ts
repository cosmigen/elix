/**
 * Test Suite for Cordis Microkernel Plugin Integration
 * Verifies plugin apply lifecycle, universal management tools, and event-driven dynamic tool registration.
 */

import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';
import { Context } from '@deepseek-ai/cordis';
import { apply, ElixAppBridgePlugin, name } from '../src/plugin.js';
import { packageFolderToZip } from '../src/utils/zip.js';

console.log('=== RUNNING CORDIS PLUGIN INTEGRATION TEST SUITE ===\n');

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

async function runCordisPluginTests() {
  const sandboxDir = path.join(os.tmpdir(), `elix-cordis-sandbox-${Date.now()}`);
  await fsp.mkdir(sandboxDir, { recursive: true });

  // 1. Mock Cordis Context with tools registry and events
  const registeredTools = new Map<string, any>();
  const ctx: any = {
    tools: {
      register: (toolDef: any) => {
        registeredTools.set(toolDef.name, toolDef);
        return () => {
          registeredTools.delete(toolDef.name);
        };
      },
      unregister: (toolName: string) => {
        registeredTools.delete(toolName);
      },
      get: (toolName: string) => registeredTools.get(toolName),
      has: (toolName: string) => registeredTools.has(toolName),
      list: () => Array.from(registeredTools.values()),
    },
  };

  assert(name === 'elix-app-bridge', 'Test 1: Plugin exports name "elix-app-bridge"');

  // 2. Initialize Plugin via apply(ctx, config)
  const plugin = apply(ctx as Context, {
    baseDir: sandboxDir,
  });

  assert(plugin instanceof ElixAppBridgePlugin, 'Test 2a: apply() returns ElixAppBridgePlugin instance');
  assert(plugin.manager !== undefined, 'Test 2b: Connected to ElixAppManager instance');

  // 3. Verify Universal Management Tools registered on ctx.tools
  assert(registeredTools.has('get_app_list'), 'Test 3a: Universal management tool "get_app_list" registered on ctx.tools');
  assert(registeredTools.has('open_app'), 'Test 3b: Universal management tool "open_app" registered on ctx.tools');
  assert(registeredTools.has('close_app'), 'Test 3c: Universal management tool "close_app" registered on ctx.tools');
  assert(registeredTools.has('install_elix_app'), 'Test 3d: Universal management tool "install_elix_app" registered on ctx.tools');
  assert(registeredTools.has('uninstall_elix_app'), 'Test 3e: Universal management tool "uninstall_elix_app" registered on ctx.tools');

  // 4. Test get_app_list through ctx.tools
  const getAppListTool = registeredTools.get('get_app_list');
  const emptyList = await getAppListTool.execute({ filter: 'all' });
  assert(emptyList.count === 0, 'Test 4: get_app_list reports 0 apps initially');

  // 5. Test install_elix_app through ctx.tools (Installs Notes demo)
  const demoNotesDir = path.join(PACKAGE_ROOT, 'demo-apps', 'com.elix.notes');
  const stagingZipDir = path.join(sandboxDir, 'staging');
  await fsp.mkdir(stagingZipDir, { recursive: true });
  const notesZipPath = path.join(stagingZipDir, 'notes.elixapp');
  packageFolderToZip(demoNotesDir, notesZipPath);

  const installTool = registeredTools.get('install_elix_app');
  const installResult = await installTool.execute({ packagePath: notesZipPath, force: true });
  assert(installResult.success === true, 'Test 5a: install_elix_app via ctx.tools succeeded');
  assert(installResult.appId === 'com.elix.notes', 'Test 5b: Returns installed appId "com.elix.notes"');

  // 6. Verify Dynamic Tool Registration onto ctx.tools
  assert(
    registeredTools.has('app_com_elix_notes_create_note'),
    'Test 6a: Dynamic capability "app_com_elix_notes_create_note" mounted on ctx.tools'
  );
  assert(
    registeredTools.has('app_com_elix_notes_search_notes'),
    'Test 6b: Dynamic capability "app_com_elix_notes_search_notes" mounted on ctx.tools'
  );

  // 7. Test open_app through ctx.tools
  const openTool = registeredTools.get('open_app');
  const openResult = await openTool.execute({ appId: 'com.elix.notes', initialRoute: '#editor' });
  assert(openResult.success === true, 'Test 7a: open_app launched window');
  assert(openResult.url.includes('#editor'), 'Test 7b: Window launched with route #editor');

  // 8. Test close_app through ctx.tools
  const closeTool = registeredTools.get('close_app');
  const closeResult = await closeTool.execute({ appId: 'com.elix.notes' });
  assert(closeResult.success === true, 'Test 8: close_app closed active window');

  // 9. Test uninstall_elix_app through ctx.tools
  const uninstallTool = registeredTools.get('uninstall_elix_app');
  const uninstallResult = await uninstallTool.execute({ appId: 'com.elix.notes', keepData: true });
  assert(uninstallResult.success === true, 'Test 9a: uninstall_elix_app uninstalled app');
  assert(
    !registeredTools.has('app_com_elix_notes_create_note'),
    'Test 9b: Dynamic capability tool auto-unmounted from ctx.tools upon uninstall event'
  );

  // Cleanup
  await fsp.rm(sandboxDir, { recursive: true, force: true }).catch(() => {});

  console.log(`\n=== RESULTS: ${passedTests}/${totalTests} TESTS PASSED ===\n`);
  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runCordisPluginTests().catch((err) => {
  console.error('Cordis plugin test runner fatal error:', err);
  process.exit(1);
});
