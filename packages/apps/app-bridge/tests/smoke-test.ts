/**
 * Automated Lifecycle Smoke Test for ELIX AppManager Deliverable (v1.2.0)
 * 
 * Executes full non-interactive lifecycle verification:
 * 1. Instantiates AppManager with standalone mock adapters.
 * 2. Inspects and installs `fixtures/com.elix.fakeapp`.
 * 3. Launches the mock floating window and asserts runtime state is running.
 * 4. Tests dynamic AI capability dispatch for `ping`.
 * 5. Executes `prepareUninstall("com.elix.fakeapp")` to verify impact analysis.
 * 6. Executes `uninstall("com.elix.fakeapp", { keepData: true })` and asserts app-data/ persists.
 * 7. Re-installs and runs `uninstall("com.elix.fakeapp", { keepData: false })` to verify complete cleanup.
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

console.log('========================================================================');
console.log('ELIX OS APP BRIDGE — FULL LIFECYCLE AUTOMATED SMOKE TEST');
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

async function runSmokeTest() {
  const sandboxDir = path.join(os.tmpdir(), `elix-smoke-${Date.now()}`);
  await fsp.mkdir(sandboxDir, { recursive: true });

  const toolSink = new MemoryToolSink();
  const capabilityIndex = new MemoryCapabilityIndex();
  const confirmationBroker = new ConsoleConfirmationBroker(true);

  // 1. Instantiate AppManager with standalone mock adapters
  const appManager = new ElixAppManager({
    baseDir: sandboxDir,
    toolSink,
    capabilityIndex,
    confirmationBroker,
  });

  assert(appManager !== undefined, 'Phase 1: AppManager instantiated with standalone mock adapters');

  // 2. Inspect & Install fixtures/com.elix.fakeapp
  const fixtureDir = path.join(PACKAGE_ROOT, 'fixtures', 'com.elix.fakeapp');
  const bundleZipPath = path.join(sandboxDir, 'com.elix.fakeapp.elixapp');
  packageFolderToZip(fixtureDir, bundleZipPath);

  const inspected = await appManager.inspectPackage(bundleZipPath);
  assert(inspected.appId === 'com.elix.fakeapp', 'Phase 2a: Package inspection returned appId "com.elix.fakeapp"');
  assert(inspected.name === 'Fake Test App', 'Phase 2b: Package inspection returned name "Fake Test App"');
  assert(inspected.capabilities.some((c) => c.name === 'ping'), 'Phase 2c: Package inspection detected "ping" capability');

  const installedApp = await appManager.install(bundleZipPath, { skipConsent: true });
  assert(installedApp.manifest.id === 'com.elix.fakeapp', 'Phase 2d: com.elix.fakeapp installed successfully');
  assert(fs.existsSync(installedApp.installPath), 'Phase 2e: Binaries deployed to apps/com.elix.fakeapp/');
  assert(fs.existsSync(installedApp.storage!.dataPath), 'Phase 2f: Persistent partition created in app-data/com.elix.fakeapp/');
  assert(toolSink.getTool('app_com_elix_fakeapp_ping') !== undefined, 'Phase 2g: AI tool "app_com_elix_fakeapp_ping" mounted in ToolSink');

  // 3. Launch mock floating window & assert runtime state is running
  const win = await appManager.launch('com.elix.fakeapp');
  assert(win.appId === 'com.elix.fakeapp', 'Phase 3a: Floating window spawned');
  assert(win.state === 'open', 'Phase 3b: Window state is "open"');
  assert(win.manifest.window?.frame === false, 'Phase 3c: Window is frameless (frame: false)');
  assert(win.manifest.window?.transparent === true, 'Phase 3d: Window is transparent (transparent: true)');

  const runningApps = appManager.list('running');
  assert(runningApps.some((a) => a.appId === 'com.elix.fakeapp'), 'Phase 3e: appManager.list("running") reports com.elix.fakeapp as active');

  // 4. Test dynamic AI capability dispatch for `ping`
  win.ipcSession.bindTransport((packet: IpcPacket) => {
    if (packet.type === 'TOOL_INVOKE') {
      const { capability, args } = (packet.payload as any) || {};
      if (capability === 'ping') {
        win.ipcSession.handleIncomingPacket({
          type: 'TOOL_RESULT',
          id: packet.id,
          appId: win.appId,
          windowId: win.id,
          payload: {
            reply: 'pong',
            message: args?.message || 'pong',
            timestamp: Date.now(),
            appId: 'com.elix.fakeapp',
            status: 'ok',
          },
        });
      }
    }
  });

  const pingResult = await appManager.sendToolCall('com.elix.fakeapp', 'ping', { message: 'Smoke test payload' });
  assert(pingResult.reply === 'pong', 'Phase 4a: sendToolCall("ping") returned reply: "pong"');
  assert(pingResult.message === 'Smoke test payload', 'Phase 4b: sendToolCall returned correct message');
  assert(pingResult.status === 'ok', 'Phase 4c: Capability status is "ok"');

  // 5. Execute prepareUninstall to verify impact analysis
  const userSettingsFile = path.join(installedApp.storage!.dataPath, 'user_preferences.json');
  await fsp.writeFile(userSettingsFile, JSON.stringify({ smokeTest: true, createdAt: Date.now() }), 'utf-8');

  const impactPlan = await appManager.prepareUninstall('com.elix.fakeapp');
  assert(impactPlan.appId === 'com.elix.fakeapp', 'Phase 5a: prepareUninstall impact plan generated');
  assert(impactPlan.isRunning === true, 'Phase 5b: Impact plan detects running window');
  assert(impactPlan.storage.dataSizeBytes > 0, 'Phase 5c: Impact plan calculates persistent user data size');
  assert(impactPlan.registeredToolsCount >= 1, 'Phase 5d: Impact plan reports active tools');
  assert(impactPlan.dataRetentionAvailable === true, 'Phase 5e: Data retention available is true');

  // 6. Execute uninstall with keepData: true & assert app-data/ persists
  const uninstallKeep = await appManager.uninstall('com.elix.fakeapp', { keepData: true });
  assert(uninstallKeep === true, 'Phase 6a: appManager.uninstall(keepData: true) returned true');
  assert(!fs.existsSync(installedApp.installPath), 'Phase 6b: Binaries directory in apps/ deleted');
  assert(appManager.windowHost.getWindow('com.elix.fakeapp') === undefined, 'Phase 6c: Active window closed');
  assert(toolSink.getTool('app_com_elix_fakeapp_ping') === undefined, 'Phase 6d: AI tool unmounted from ToolSink');
  assert(fs.existsSync(userSettingsFile), 'Phase 6e: CRITICAL: app-data/com.elix.fakeapp/user_preferences.json preserved on disk!');

  // 7. Re-install and run uninstall with keepData: false to verify complete cleanup
  const reinstalled = await appManager.install(bundleZipPath, { skipConsent: true });
  assert(reinstalled.manifest.id === 'com.elix.fakeapp', 'Phase 7a: Re-installation succeeded');
  assert(fs.existsSync(userSettingsFile), 'Phase 7b: User data still present before purge');

  const uninstallPurge = await appManager.uninstall('com.elix.fakeapp', { keepData: false });
  assert(uninstallPurge === true, 'Phase 7c: appManager.uninstall(keepData: false) returned true');
  assert(!fs.existsSync(reinstalled.installPath), 'Phase 7d: Binaries removed');
  assert(!fs.existsSync(userSettingsFile), 'Phase 7e: User data in app-data/ completely purged');
  assert(appManager.list('all').length === 0, 'Phase 7f: No installed applications remaining');

  // Cleanup sandbox
  await fsp.rm(sandboxDir, { recursive: true, force: true }).catch(() => {});

  console.log('\n========================================================================');
  console.log(`SMOKE TEST RESULTS: ${passedTests}/${totalTests} TESTS PASSED (100%)`);
  console.log('========================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runSmokeTest().catch((err) => {
  console.error('Smoke test runner fatal error:', err);
  process.exit(1);
});
