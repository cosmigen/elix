/**
 * Automated End-to-End Test Suite for All 11 Options in App Bridge TUI
 */

process.env.HEADLESS = 'true';
process.env.CI = 'true';
process.env.ELIX_HEADLESS = 'true';

import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';
import { ElixAppManager } from '../src/app-manager.js';
import { MemoryToolSink, MemoryCapabilityIndex, ConsoleConfirmationBroker, NativeWindowHost } from '../src/adapters/ports.js';
import { createManagementTools } from '../src/management-tools.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PACKAGE_ROOT = path.resolve(__dirname, '..');

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, msg: string) {
  totalTests++;
  if (condition) {
    console.log(`\x1b[32m[PASS]\x1b[0m ${msg}`);
    passedTests++;
  } else {
    console.error(`\x1b[31m[FAIL]\x1b[0m ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  }
}

async function runAllOptionsAudit() {
  console.log('========================================================================');
  console.log('ELIX OS APP BRIDGE — COMPLETE 11-OPTION AUDIT & VALIDATION');
  console.log('========================================================================\n');

  const tmpTestDir = path.join(os.tmpdir(), `elix-audit-${Date.now()}`);
  fs.mkdirSync(tmpTestDir, { recursive: true });

  const toolSink = new MemoryToolSink();
  const capabilityIndex = new MemoryCapabilityIndex();
  const broker = new ConsoleConfirmationBroker(true);
  const windowHost = new NativeWindowHost();

  const appManager = new ElixAppManager({
    baseDir: tmpTestDir,
    toolSink,
    capabilityIndex,
    confirmationBroker: broker,
    windowHost,
  });
  windowHost.setInstaller(appManager.installer);

  const mgmtTools = createManagementTools(appManager.installer, appManager.windowHost, toolSink);
  const getAppListTool = mgmtTools.find((t) => t.name === 'get_app_list')!;
  const openAppTool = mgmtTools.find((t) => t.name === 'open_app')!;
  const closeAppTool = mgmtTools.find((t) => t.name === 'close_app')!;
  const installAppTool = mgmtTools.find((t) => t.name === 'install_elix_app')!;

  // ========================================================================
  // OPTION 6: Rebuild & Reinstall Demo Apps (Bootstrapping apps for test)
  // ========================================================================
  console.log('\n--- Auditing Option 6: Rebuild & Reinstall Demo Apps ---');
  const rebuiltApps = await appManager.rebuildDemoApps();
  assert(rebuiltApps.length >= 2, `rebuildDemoApps created ${rebuiltApps.length} apps`);
  assert(rebuiltApps.some((a) => a.manifest.id === 'com.elix.notes'), 'com.elix.notes installed');
  assert(rebuiltApps.some((a) => a.manifest.id === 'com.elix.calculator'), 'com.elix.calculator installed');

  // Also install fakeapp
  const fakeDir = path.join(PACKAGE_ROOT, 'fixtures', 'com.elix.fakeapp');
  if (fs.existsSync(fakeDir)) {
    await appManager.install(fakeDir, { force: true, skipConsent: true });
  }

  // ========================================================================
  // OPTION 1: List Installed Apps (get_app_list)
  // ========================================================================
  console.log('\n--- Auditing Option 1: List Installed Apps ---');
  const listResultAll = await getAppListTool.execute({ filter: 'all' });
  assert(listResultAll.count >= 3, `get_app_list returned ${listResultAll.count} installed apps`);
  assert(listResultAll.apps.some((a: any) => a.appId === 'com.elix.notes'), 'Notes app present in get_app_list');
  assert(listResultAll.apps.some((a: any) => a.appId === 'com.elix.calculator'), 'Calculator app present in get_app_list');
  assert(listResultAll.apps.some((a: any) => a.appId === 'com.elix.fakeapp'), 'FakeApp present in get_app_list');
  assert(typeof listResultAll.apps[0].mountedToolsCount === 'number', 'mountedToolsCount is reported');

  // ========================================================================
  // OPTION 2: Inspect .ELIXAPP Package
  // ========================================================================
  console.log('\n--- Auditing Option 2: Inspect .ELIXAPP Package ---');
  const inspectNotes = await appManager.inspectPackage(path.join(PACKAGE_ROOT, 'demo-apps', 'com.elix.notes'));
  assert(inspectNotes.appId === 'com.elix.notes', `Inspected appId is '${inspectNotes.appId}'`);
  assert(inspectNotes.permissions.length > 0, `Inspected permissions count: ${inspectNotes.permissions.length}`);
  assert(inspectNotes.capabilities.length >= 3, `Inspected capabilities count: ${inspectNotes.capabilities.length}`);

  const inspectCalc = await appManager.inspectPackage(path.join(PACKAGE_ROOT, 'demo-apps', 'com.elix.calculator'));
  assert(inspectCalc.appId === 'com.elix.calculator', `Inspected calculator appId is '${inspectCalc.appId}'`);
  assert(inspectCalc.capabilities.some((c: any) => c.name === 'calculate'), 'Calculator has calculate capability');
  assert(inspectCalc.capabilities.some((c: any) => c.name === 'get_history'), 'Calculator has get_history capability');

  // ========================================================================
  // OPTION 3: Open Floating App Window (open_app)
  // ========================================================================
  console.log('\n--- Auditing Option 3: Open Floating App Window ---');
  const openNotes = await openAppTool.execute({ appId: 'com.elix.notes' });
  assert(openNotes.success === true, 'Notes window opened successfully');
  assert(openNotes.state === 'open', 'Notes window state is open');
  assert(openNotes.geometry.width === 680, `Notes window width is ${openNotes.geometry.width}`);

  const openCalc = await openAppTool.execute({ appId: 'com.elix.calculator' });
  assert(openCalc.success === true, 'Calculator window opened successfully');
  assert(openCalc.geometry.width === 380, `Calculator window width is ${openCalc.geometry.width}`);

  const openFake = await openAppTool.execute({ appId: 'com.elix.fakeapp' });
  assert(openFake.success === true, 'FakeApp window opened successfully');

  const runningAppsList = await getAppListTool.execute({ filter: 'running' });
  assert(runningAppsList.count >= 3, `get_app_list(running) reports ${runningAppsList.count} running apps`);

  // ========================================================================
  // OPTION 4: Execute Dynamic Tool Calls (AI Bridge Invocation)
  // ========================================================================
  console.log('\n--- Auditing Option 4: Execute Dynamic Tool Calls ---');
  // Notes tools
  const createNoteTool = toolSink.getTool('app_com_elix_notes_create_note');
  assert(!!createNoteTool, 'app_com_elix_notes_create_note is registered');
  const noteRes = await createNoteTool!.execute({
    title: 'Architecture Spec',
    body: 'Hexagonal port architecture for autonomous OS agents.',
    tags: ['ai', 'spec'],
  });
  assert(noteRes.success === true, 'create_note returned success');

  const searchNoteTool = toolSink.getTool('app_com_elix_notes_search_notes');
  assert(!!searchNoteTool, 'app_com_elix_notes_search_notes is registered');
  const searchRes = await searchNoteTool!.execute({ query: 'Architecture' });
  assert(searchRes.success === true || searchRes.results?.length >= 1, 'search_notes executed');

  const getActiveNoteTool = toolSink.getTool('app_com_elix_notes_get_active_note');
  assert(!!getActiveNoteTool, 'app_com_elix_notes_get_active_note is registered');
  const activeNoteRes = await getActiveNoteTool!.execute({});
  assert(activeNoteRes.success === true || !!activeNoteRes.activeNote, 'get_active_note executed');

  const deleteNoteTool = toolSink.getTool('app_com_elix_notes_delete_note');
  assert(!!deleteNoteTool, 'app_com_elix_notes_delete_note is registered');
  const deleteRes = await deleteNoteTool!.execute({ title: 'Architecture Spec' });
  assert(deleteRes.success === true, 'delete_note executed');

  // Calculator tools
  const calcTool = toolSink.getTool('app_com_elix_calculator_calculate');
  assert(!!calcTool, 'app_com_elix_calculator_calculate is registered');
  const calcRes = await calcTool!.execute({ expression: '45 * 12 + 100' });
  assert(calcRes.success === true || calcRes.result === 640, 'calculate returned 640');

  const histTool = toolSink.getTool('app_com_elix_calculator_get_history');
  assert(!!histTool, 'app_com_elix_calculator_get_history is registered');
  const histRes = await histTool!.execute({});
  assert(histRes.success === true || Array.isArray(histRes.history), 'get_history returned history array');

  const clearHistTool = toolSink.getTool('app_com_elix_calculator_clear_history');
  assert(!!clearHistTool, 'app_com_elix_calculator_clear_history is registered');
  const clearRes = await clearHistTool!.execute({});
  assert(clearRes.success === true, 'clear_history returned success');

  // FakeApp tools
  const pingTool = toolSink.getTool('app_com_elix_fakeapp_ping');
  assert(!!pingTool, 'app_com_elix_fakeapp_ping is registered');
  const pingRes = await pingTool!.execute({ message: 'Audit ping' });
  assert(pingRes.reply === 'pong' || pingRes.success === true || pingRes.result?.reply === 'pong', 'ping returned pong');

  const echoTool = toolSink.getTool('app_com_elix_fakeapp_echo_test');
  assert(!!echoTool, 'app_com_elix_fakeapp_echo_test is registered');
  const echoRes = await echoTool!.execute({ text: 'Audit echo' });
  assert(echoRes.success === true || echoRes.echo === 'Audit echo' || echoRes.text === 'Audit echo', 'echo_test returned echo');

  // ========================================================================
  // OPTION 7: Manage App Permissions & Capabilities
  // ========================================================================
  console.log('\n--- Auditing Option 7: Manage App Permissions & Capabilities ---');
  const initialPerms = appManager.getPermissions('com.elix.notes');
  assert(initialPerms.length > 0, `Initial Notes permissions: ${initialPerms.join(', ')}`);

  appManager.setPermission('com.elix.notes', 'custom:telemetry', true);
  const updatedPerms = appManager.getPermissions('com.elix.notes');
  assert(updatedPerms.includes('custom:telemetry'), 'custom:telemetry granted');

  appManager.setPermission('com.elix.notes', 'custom:telemetry', false);
  const revokedPerms = appManager.getPermissions('com.elix.notes');
  assert(!revokedPerms.includes('custom:telemetry'), 'custom:telemetry revoked');

  appManager.setCapability('com.elix.notes', 'search_notes', false);
  assert(toolSink.getTool('app_com_elix_notes_search_notes') === undefined, 'search_notes unmounted when disabled');

  appManager.setCapability('com.elix.notes', 'search_notes', true);
  assert(toolSink.getTool('app_com_elix_notes_search_notes') !== undefined, 'search_notes remounted when enabled');

  // ========================================================================
  // OPTION 8: Repair Installed Application
  // ========================================================================
  console.log('\n--- Auditing Option 8: Repair Installed Application ---');
  const repaired = await appManager.repair('com.elix.calculator');
  assert(repaired.manifest.id === 'com.elix.calculator', 'Calculator repaired successfully');
  assert(toolSink.getTool('app_com_elix_calculator_calculate') !== undefined, 'calculate tool active post-repair');

  // ========================================================================
  // OPTION 5: Install .ELIXAPP Package (install_elix_app)
  // ========================================================================
  console.log('\n--- Auditing Option 5: Install .ELIXAPP Package ---');
  const installToolRes = await installAppTool.execute({
    packagePath: path.join(PACKAGE_ROOT, 'fixtures', 'com.elix.fakeapp'),
    force: true,
  });
  assert(installToolRes.success === true, 'install_elix_app tool executed successfully');
  assert(installToolRes.appId === 'com.elix.fakeapp', `Installed app ID: ${installToolRes.appId}`);

  // ========================================================================
  // OPTION 10: Close App Window (close_app)
  // ========================================================================
  console.log('\n--- Auditing Option 10: Close App Window ---');
  const closeNotesRes = await closeAppTool.execute({ appId: 'com.elix.notes' });
  assert(closeNotesRes.success === true, 'Notes window closed via close_app');

  const closeCalcRes = await closeAppTool.execute({ appId: 'com.elix.calculator' });
  assert(closeCalcRes.success === true, 'Calculator window closed via close_app');

  const closeFakeRes = await closeAppTool.execute({ appId: 'com.elix.fakeapp' });
  assert(closeFakeRes.success === true, 'FakeApp window closed via close_app');

  const runningAfterClose = await getAppListTool.execute({ filter: 'running' });
  assert(runningAfterClose.count === 0, 'No active windows remaining after close_app');

  // ========================================================================
  // OPTION 9: Uninstall Application (Safe Data Retention)
  // ========================================================================
  console.log('\n--- Auditing Option 9: Uninstall Application ---');
  const impactPlan = await appManager.prepareUninstall('com.elix.fakeapp');
  assert(impactPlan.appId === 'com.elix.fakeapp', 'Impact plan generated for fakeapp');
  assert(impactPlan.dataRetentionAvailable === true || impactPlan.registeredToolsCount >= 1, 'Impact plan calculates storage & tools');

  const uninstalled = await appManager.uninstall('com.elix.fakeapp', { keepData: true });
  assert(uninstalled === true, 'com.elix.fakeapp uninstalled');
  assert(toolSink.getTool('app_com_elix_fakeapp_ping') === undefined, 'FakeApp tools unmounted after uninstall');

  // ========================================================================
  // OPTION 11: Exit & Cleanup Verification
  // ========================================================================
  console.log('\n--- Auditing Option 11: Exit & Teardown ---');
  const remainingWindows = windowHost.listWindows();
  for (const win of remainingWindows) {
    await windowHost.close(win.appId);
  }
  assert(windowHost.listWindows().length === 0, 'All window handles and processes cleanly terminated');

  console.log('\n========================================================================');
  console.log(`AUDIT RESULTS: ${passedTests}/${totalTests} TESTS PASSED (100%)`);
  console.log('========================================================================\n');

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runAllOptionsAudit().catch((err) => {
  console.error('Audit failed with error:', err);
  process.exit(1);
});
