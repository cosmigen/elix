/**
 * Comprehensive Test Suite for ELIX App Package Installer, Storage Partitioning, and File Association Listener
 */

import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { ElixAppInstaller } from '../src/installer.js';
import { ElixZip } from '../src/utils/zip.js';
import type { ElixAppManifest } from '../src/types.js';

console.log('=== RUNNING ELIX APP INSTALLER & STORAGE PARTITION TEST SUITE ===\n');

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
  const sandboxDir = path.join(os.tmpdir(), `elix-test-sandbox-${Date.now()}`);
  await fsp.mkdir(sandboxDir, { recursive: true });

  const installer = new ElixAppInstaller(sandboxDir);

  // Test 0: Storage Partition Layout
  assert(fs.existsSync(installer.storage.appsDir), 'Test 0a: apps/ partition directory created');
  assert(fs.existsSync(installer.storage.appDataDir), 'Test 0b: app-data/ partition directory created');
  assert(fs.existsSync(installer.storage.appCacheDir), 'Test 0c: app-cache/ partition directory created');
  assert(fs.existsSync(installer.storage.appStagingDir), 'Test 0d: app-staging/ partition directory created');
  assert(fs.existsSync(installer.storage.appRegistryDir), 'Test 0e: app-registry/ partition directory created');
  assert(fs.existsSync(installer.storage.appJournalDir), 'Test 0f: app-journal/ partition directory created');

  // Sample manifest with permissions & capabilities
  const manifest: ElixAppManifest = {
    id: 'com.elix.taskmaster',
    name: 'ELIX Task Master',
    version: '1.2.0',
    description: 'Autonomous Task Orchestrator for ELIX Agents',
    author: {
      name: 'DeepSeek AI / Core Team',
      email: 'core@deepseek.ai',
    },
    entry: 'dist/index.html',
    icon: 'assets/icon.png',
    window: {
      width: 900,
      height: 650,
      resizable: true,
      frame: false,
      transparent: true,
    },
    permissions: ['fs:read', 'fs:write', 'agent:memory', 'os:exec'],
    capabilities: {
      create_task: {
        name: 'create_task',
        description: 'Creates a new orchestrator task',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            priority: { type: 'string', enum: ['low', 'medium', 'high'] },
          },
          required: ['title'],
        },
      },
    },
  };

  // Helper to build a test zip package
  const zip = new ElixZip();
  zip.addFile('elix.app.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8'));
  zip.addFile('dist/index.html', Buffer.from('<!DOCTYPE html><html><body>TaskMaster</body></html>', 'utf-8'));
  zip.addFile('assets/icon.png', Buffer.from([0x89, 0x50, 0x4e, 0x47])); // PNG Magic bytes

  const validZipPath = path.join(sandboxDir, 'taskmaster.elixapp');
  zip.writeZip(validZipPath);

  // Test 1: inspectPackage
  const consent = await installer.inspectPackage(validZipPath);
  assert(consent.appId === 'com.elix.taskmaster', 'Test 1a: inspectPackage returns correct appId');
  assert(consent.name === 'ELIX Task Master', 'Test 1b: inspectPackage returns correct name');
  assert(consent.permissions.length === 4, 'Test 1c: inspectPackage maps all 4 requested permissions');
  assert(consent.permissions.find((p) => p.permission === 'os:exec')?.sensitive === true, 'Test 1d: os:exec marked as sensitive permission');
  assert(consent.capabilities.length === 1, 'Test 1e: inspectPackage maps capability summary');
  assert(consent.capabilities[0]?.name === 'create_task', 'Test 1f: Capability tool name matches');

  // Test 2: Event emission setup
  let eventInstalledFired = false;
  installer.once('app:installed', ({ app, isUpgrade }) => {
    if (app.manifest.id === 'com.elix.taskmaster') {
      eventInstalledFired = true;
      assert(isUpgrade === false, 'Test 2b: isUpgrade flag is false on initial installation');
    }
  });

  // Test 3: Install
  const installedApp = await installer.install(validZipPath, { skipConsent: true });
  assert(installedApp.manifest.id === 'com.elix.taskmaster', 'Test 3a: install() returns InstalledApp object');
  assert(fs.existsSync(installedApp.installPath), 'Test 3b: Target installation folder created in apps/ partition');
  assert(fs.existsSync(path.join(installedApp.installPath, 'dist/index.html')), 'Test 3c: Entry HTML unpacked at dist/index.html');
  assert(installedApp.registeredTools.length === 1, 'Test 3d: Registered Cordis tools list populated');
  assert(eventInstalledFired === true, 'Test 3e: app:installed event triggered');

  // Create persistent user data in app-data/com.elix.taskmaster/
  const appDataFile = path.join(installedApp.storage!.dataPath, 'user_tasks.json');
  await fsp.writeFile(appDataFile, JSON.stringify([{ id: 1, title: 'Preserve my data' }]), 'utf-8');

  // Test 4: prepareUninstall Impact Plan
  const impactPlan = await installer.prepareUninstall('com.elix.taskmaster');
  assert(impactPlan.appId === 'com.elix.taskmaster', 'Test 4a: prepareUninstall returns impact plan');
  assert(impactPlan.storage.dataSizeBytes > 0, 'Test 4b: prepareUninstall calculates user data storage size');
  assert(impactPlan.dataRetentionAvailable === true, 'Test 4c: dataRetentionAvailable is true');

  // Test 5: listInstalledApps and getApp
  const apps = installer.listInstalledApps();
  assert(apps.length === 1, 'Test 5a: listInstalledApps() returns 1 app');
  const fetched = installer.getApp('com.elix.taskmaster');
  assert(fetched !== undefined && fetched.manifest.id === 'com.elix.taskmaster', 'Test 5b: getApp() retrieves installed app by ID');

  // Test 6: Re-install duplicate guard
  let duplicateThrew = false;
  try {
    await installer.install(validZipPath, { skipConsent: true, force: false });
  } catch {
    duplicateThrew = true;
  }
  assert(duplicateThrew, 'Test 6: Re-installing without force throws already installed error');

  // Test 7: Ambient Background File Listener
  const triggerPromise = new Promise<boolean>((resolve) => {
    installer.on('app:file-trigger', ({ consentPayload }) => {
      if (consentPayload.appId === 'com.elix.taskmaster') {
        resolve(true);
      }
    });
  });

  installer.startFileListener({
    onConsentRequest: async () => true, // Auto-approve in test
    cleanupOnInstall: true,
  });

  const droppedFile = path.join(installer.getStagingDir(), 'dropped-app.elixapp');
  await fsp.copyFile(validZipPath, droppedFile);

  const fileTriggered = await Promise.race([
    triggerPromise,
    new Promise<boolean>((res) => setTimeout(() => res(false), 2000)),
  ]);
  assert(fileTriggered === true, 'Test 7: Background file listener intercepts dropped .elixapp file');
  installer.stopFileListener();
  await new Promise((r) => setTimeout(r, 150));

  // Test 8: Data Safety Uninstall (keepData: true)
  const uninstalled1 = await installer.uninstall('com.elix.taskmaster', { keepData: true });
  assert(uninstalled1 === true, 'Test 8a: uninstall(keepData: true) returns true');
  assert(!fs.existsSync(installedApp.installPath), 'Test 8b: Binaries directory in apps/ deleted');
  assert(fs.existsSync(appDataFile), 'Test 8c: User data in app-data/ preserved intact!');
  assert(installer.listInstalledApps().length === 0, 'Test 8d: App removed from internal registry');

  // Test 9: Complete Purge Uninstall (keepData: false)
  // Re-install to test full data purge
  await installer.install(validZipPath, { skipConsent: true });
  assert(fs.existsSync(appDataFile), 'Test 9a: User data still existed before second purge');
  await installer.uninstall('com.elix.taskmaster', { keepData: false });
  assert(!fs.existsSync(appDataFile), 'Test 9b: User data in app-data/ purged when keepData is false');

  // Cleanup sandbox
  await fsp.rm(sandboxDir, { recursive: true, force: true }).catch(() => {});

  console.log(`\n=== RESULTS: ${passedTests}/${totalTests} TESTS PASSED ===\n`);
  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runTests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('Test runner fatal error:', err);
    process.exit(1);
  });
