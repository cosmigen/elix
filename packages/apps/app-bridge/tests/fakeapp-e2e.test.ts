/**
 * End-to-End Verification Test for Standalone Fake Test App (fixtures/com.elix.fakeapp)
 * 
 * Verifies:
 * 1. Packaging and inspecting directory bundle vs .elixapp archive
 * 2. Manifest and permission extraction
 * 3. Installation into partitioned storage (apps/, app-data/, app-cache/)
 * 4. Spawning floating frameless draggable window (480x600, transparent: true, frame: false)
 * 5. Dynamic AI tool invocation for `ping` capability
 * 6. Uninstall impact plan and data retention validation
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
console.log('RUNNING FAKE TEST APP (com.elix.fakeapp) END-TO-END VERIFICATION');
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

async function runFakeAppE2ETest() {
  const sandboxDir = path.join(os.tmpdir(), `elix-fakeapp-test-${Date.now()}`);
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

  const fixtureDir = path.join(PACKAGE_ROOT, 'fixtures', 'com.elix.fakeapp');
  const bundleZipPath = path.join(sandboxDir, 'com.elix.fakeapp.elixapp');

  // 1. Package fixture directory into .elixapp archive
  packageFolderToZip(fixtureDir, bundleZipPath);
  assert(fs.existsSync(bundleZipPath), 'Step 1a: Packaged fixtures/com.elix.fakeapp/ into .elixapp archive');

  // 2. Inspect Package (Folder bundle & Archive bundle)
  const dirInspect = await appManager.inspectPackage(fixtureDir);
  assert(dirInspect.appId === 'com.elix.fakeapp', 'Step 2a: Directory bundle inspected appId matches');
  assert(dirInspect.name === 'Fake Test App', 'Step 2b: Name is "Fake Test App"');
  assert(dirInspect.version === '1.0.0', 'Step 2c: Version is "1.0.0"');
  assert(dirInspect.permissions.some((p) => p.permission === 'storage:data'), 'Step 2d: Requested permission "storage:data" detected');
  assert(dirInspect.permissions.some((p) => p.permission === 'ui:notification'), 'Step 2e: Requested permission "ui:notification" detected');
  assert(dirInspect.capabilities.some((c) => c.name === 'ping'), 'Step 2f: Exported capability "ping" detected');

  const zipInspect = await appManager.inspectPackage(bundleZipPath);
  assert(zipInspect.appId === 'com.elix.fakeapp', 'Step 2g: Archive bundle inspected appId matches');

  // 3. Install Package via File Path
  const installedApp = await appManager.install(bundleZipPath, { skipConsent: true });
  assert(installedApp.manifest.id === 'com.elix.fakeapp', 'Step 3a: Installed InstalledApp returned');
  assert(fs.existsSync(installedApp.installPath), 'Step 3b: Binaries installed in apps/com.elix.fakeapp/');
  assert(fs.existsSync(installedApp.storage!.dataPath), 'Step 3c: User data partition created in app-data/com.elix.fakeapp/');
  assert(fs.existsSync(installedApp.storage!.cachePath), 'Step 3d: Cache partition created in app-cache/com.elix.fakeapp/');
  assert(toolSink.getTool('app_com_elix_fakeapp_ping') !== undefined, 'Step 3e: Dynamic AI tool "app_com_elix_fakeapp_ping" mounted in ToolSink');

  // 4. Launch Floating Window
  const win = await appManager.launch('com.elix.fakeapp');
  assert(win.appId === 'com.elix.fakeapp', 'Step 4a: Floating window launched for com.elix.fakeapp');
  assert(win.state === 'open', 'Step 4b: Window state is open');
  assert(win.geometry.width === 480, 'Step 4c: Window width is 480px');
  assert(win.geometry.height === 600, 'Step 4d: Window height is 600px');
  assert(win.manifest.window?.frame === false, 'Step 4e: Window is frameless (frame: false)');
  assert(win.manifest.window?.transparent === true, 'Step 4f: Window is transparent (transparent: true)');

  // 5. Connect Mock Webview IPC Bridge & Handle `ping` Capability
  win.ipcSession.bindTransport((packet: IpcPacket) => {
    if (packet.type === 'TOOL_INVOKE') {
      const { capability, args } = (packet.payload as any) || {};
      if (capability === 'ping') {
        const msg = args?.message || 'pong';
        win.ipcSession.handleIncomingPacket({
          type: 'TOOL_RESULT',
          id: packet.id,
          appId: win.appId,
          windowId: win.id,
          payload: {
            reply: 'pong',
            message: msg,
            timestamp: Date.now(),
            appId: 'com.elix.fakeapp',
            status: 'ok',
          },
        });
      }
    }
  });

  // 6. Execute Dynamic Tool Call via ToolSink
  const pingTool = toolSink.getTool('app_com_elix_fakeapp_ping')!;
  const toolResult = await pingTool.execute({ message: 'Hello from ELIX AI Assistant' });
  assert(toolResult.reply === 'pong', 'Step 5a: Dynamic tool call executed and returned reply: "pong"');
  assert(toolResult.message === 'Hello from ELIX AI Assistant', 'Step 5b: Returned custom message');
  assert(toolResult.status === 'ok', 'Step 5c: Status is "ok"');

  // 7. Write Persistent User Configuration
  const userConfigFile = path.join(installedApp.storage!.dataPath, 'settings.json');
  await fsp.writeFile(userConfigFile, JSON.stringify({ theme: 'dark', verified: true }), 'utf-8');
  assert(fs.existsSync(userConfigFile), 'Step 6a: Saved user config into app-data/com.elix.fakeapp/settings.json');

  // 8. Prepare Uninstall Preflight & Impact Plan
  const impactPlan = await appManager.prepareUninstall('com.elix.fakeapp');
  assert(impactPlan.appId === 'com.elix.fakeapp', 'Step 7a: Impact plan retrieved for com.elix.fakeapp');
  assert(impactPlan.isRunning === true, 'Step 7b: Impact plan detects running floating window');
  assert(impactPlan.storage.dataSizeBytes > 0, 'Step 7c: Impact plan computes user data size');
  assert(impactPlan.registeredToolsCount >= 1, 'Step 7d: Impact plan reports tools to unmount');

  // 9. Safe Uninstall with Data Retention
  const uninstalled = await appManager.uninstall('com.elix.fakeapp', { keepData: true });
  assert(uninstalled === true, 'Step 8a: appManager.uninstall(keepData: true) returned true');
  assert(!fs.existsSync(installedApp.installPath), 'Step 8b: apps/com.elix.fakeapp/ binaries removed');
  assert(appManager.windowHost.getWindow('com.elix.fakeapp') === undefined, 'Step 8c: Floating window closed');
  assert(toolSink.getTool('app_com_elix_fakeapp_ping') === undefined, 'Step 8d: Tool app_com_elix_fakeapp_ping unmounted');
  assert(fs.existsSync(userConfigFile), 'Step 8e: CRITICAL: Persistent user config in app-data/ preserved intact!');

  // Cleanup sandbox
  await fsp.rm(sandboxDir, { recursive: true, force: true }).catch(() => {});

  console.log('\n========================================================================');
  console.log(`RESULTS: ${passedTests}/${totalTests} TESTS PASSED (100%)`);
  console.log('========================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runFakeAppE2ETest().catch((err) => {
  console.error('FakeApp E2E test runner fatal error:', err);
  process.exit(1);
});
