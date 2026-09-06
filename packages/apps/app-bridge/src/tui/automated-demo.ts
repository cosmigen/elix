/**
 * Dedicated Automated E2E Demo Script for ELIX App Runtime
 * Executes the 5-step automated workflow programmatically.
 */

import * as path from 'node:path';
import * as os from 'node:os';
import * as fsp from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ElixAppManager } from '../app-manager.js';
import { MemoryToolSink, MemoryCapabilityIndex, ConsoleConfirmationBroker, MockWindowHost } from '../adapters/ports.js';
import { packageFolderToZip } from '../utils/zip.js';
import * as p from '../utils/prompt-driver.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PACKAGE_ROOT = path.resolve(__dirname, '..', '..');

export async function runAutomatedDemo(): Promise<void> {
  p.intro('\x1b[35m⚡ ELIX OS Native App Runtime — Automated E2E Demo Runner\x1b[0m');

  const sandboxDir = path.join(os.tmpdir(), `elix-e2e-demo-${Date.now()}`);
  await fsp.mkdir(sandboxDir, { recursive: true });

  const toolSink = new MemoryToolSink();
  const capabilityIndex = new MemoryCapabilityIndex();
  const confirmationBroker = new ConsoleConfirmationBroker(true);
  const mockWindowHost = new MockWindowHost();

  const appManager = new ElixAppManager({
    baseDir: sandboxDir,
    toolSink,
    capabilityIndex,
    confirmationBroker,
    windowHost: mockWindowHost,
  });

  // Step 1: Install fixtures/com.elix.fakeapp
  const fixtureDir = path.join(PACKAGE_ROOT, 'fixtures', 'com.elix.fakeapp');
  const fakeZip = path.join(sandboxDir, 'com.elix.fakeapp.elixapp');
  packageFolderToZip(fixtureDir, fakeZip);

  const installed = await appManager.install(fakeZip, { skipConsent: true, force: true });
  p.log.success(`[Step 1/5] Installed package '${installed.manifest.name}' (${installed.manifest.id})`);

  // Step 2: Open window for com.elix.fakeapp
  const win = await appManager.openApp('com.elix.fakeapp');
  p.log.success(`[Step 2/5] Opened floating window for '${win.appId}' (State: ${win.state}, URL: ${win.url})`);

  // Step 3: Execute dynamic tool call app_com_elix_fakeapp_ping with {}
  const pingTool = toolSink.getTool('app_com_elix_fakeapp_ping');
  if (!pingTool) {
    throw new Error('Tool "app_com_elix_fakeapp_ping" not found in active ToolSink registry!');
  }
  const toolResult = await pingTool.execute({});
  p.log.success(`[Step 3/5] Executed dynamic tool 'app_com_elix_fakeapp_ping':\n${JSON.stringify(toolResult, null, 2)}`);

  // Step 4: Close window
  await appManager.close('com.elix.fakeapp');
  p.log.success(`[Step 4/5] Closed window for 'com.elix.fakeapp'`);

  // Step 5: Clean exit
  p.log.success(`[Step 5/5] All 5 steps completed successfully with zero errors!`);
  p.outro('Automated demo execution finished successfully.');

  await fsp.rm(sandboxDir, { recursive: true, force: true }).catch(() => {});
}

// Auto-run if executed directly
if (process.argv[1] && (process.argv[1].endsWith('automated-demo.ts') || process.argv[1].endsWith('automated-demo.js'))) {
  runAutomatedDemo().catch((err) => {
    console.error('Automated demo fatal error:', err);
    process.exit(1);
  });
}
