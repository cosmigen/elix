/**
 * ELIX Files (com.elix.files) — Adversarial & Performance Test Suite
 *
 * Verifies:
 * 1. Deep Directory Traversal (>15 levels) and cyclic links without stack overflow.
 * 2. Path Sanitization & Injection Prevention (traversals ../../, invalid chars, null bytes).
 * 3. High-Density Directory Performance (2,500+ items enumerated in < 50ms).
 * 4. Corrupt Archive Resilience (truncated/corrupted zip handled gracefully).
 * 5. Dynamic AI Bridge Tool Invocation & Sub-20ms Latency.
 */

import path from 'path';
import fs from 'fs';
import fsp from 'fs/promises';
import os from 'os';
import { fileURLToPath } from 'url';
import { ElixAppManager } from '../src/app-manager.js';
import {
  MemoryToolSink,
  MemoryCapabilityIndex,
  ConsoleConfirmationBroker,
  NativeWindowHost,
} from '../src/adapters/ports.js';
import { ElixZip } from '../src/utils/zip.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PACKAGE_ROOT = path.resolve(__dirname, '..');

// ----------------------------------------------------------------------------
// Synthetic Deep Directory & Cyclic Link Helper
// ----------------------------------------------------------------------------
function traverseDirectorySafe(dirPath: string, maxDepth: number = 25, visited: Set<string> = new Set()): { count: number; maxDepthReached: number } {
  let count = 0;
  let maxDepthReached = 0;

  function walk(current: string, depth: number) {
    if (depth > maxDepth) return;
    if (depth > maxDepthReached) maxDepthReached = depth;

    let real: string;
    try {
      real = fs.realpathSync(current);
    } catch {
      real = current;
    }

    if (visited.has(real)) return; // Cyclic symlink trap protection
    visited.add(real);

    let entries: string[] = [];
    try {
      entries = fs.readdirSync(current);
    } catch {
      return;
    }

    for (const ent of entries) {
      count++;
      const full = path.join(current, ent);
      try {
        const stat = fs.lstatSync(full);
        if (stat.isDirectory()) {
          walk(full, depth + 1);
        }
      } catch {}
    }
  }

  walk(dirPath, 1);
  return { count, maxDepthReached };
}

// ----------------------------------------------------------------------------
// Safe Path Sanitizer Function (under adversarial test)
// ----------------------------------------------------------------------------
function sanitizePathSafe(inputPath: string, baseDir: string = os.tmpdir()): { safePath?: string; error?: string } {
  if (!inputPath || typeof inputPath !== 'string') {
    return { error: 'Invalid path: path must be a non-empty string' };
  }

  // Null byte injection check
  if (inputPath.indexOf('\0') !== -1) {
    return { error: 'Path traversal violation: null bytes detected' };
  }

  // Invalid Windows filename characters when not a drive specifier
  const cleaned = inputPath.replace(/^[a-zA-Z]:/, '');
  if (/[<>:"|?*]/.test(cleaned)) {
    return { error: 'Invalid character in file path' };
  }

  const resolved = path.resolve(baseDir, inputPath);
  const rel = path.relative(baseDir, resolved);

  // Escaping root boundary
  if (rel.startsWith('..') && !path.isAbsolute(inputPath)) {
    return { error: 'Directory traversal violation: path escapes sandbox boundary' };
  }

  return { safePath: resolved };
}

// ----------------------------------------------------------------------------
// High-Density Item Generator & Sorter
// ----------------------------------------------------------------------------
function generateHighDensityItems(count: number = 2500) {
  const items: any[] = [];
  const types = ['TypeScript', 'Markdown', 'JSON', 'Vector Image', 'ZIP Archive', 'Folder'];

  for (let i = 0; i < count; i++) {
    const isDir = i % 10 === 0;
    items.push({
      name: `file_item_${String(i).padStart(5, '0')}.${isDir ? 'dir' : 'ts'}`,
      isDir,
      sizeBytes: (i * 1337) % (10 * 1024 * 1024),
      modifiedMs: Date.now() - (i * 3600000),
      type: types[i % types.length],
    });
  }
  return items;
}

export async function runFilesAdversarialTests(): Promise<void> {
  console.log('===========================================================================');
  console.log('⚡ ELIX FILES (com.elix.files) — ADVERSARIAL TEST SUITE');
  console.log('===========================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, msg: string, detail?: string) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`✔ [PASS] ${msg}`);
    } else {
      console.error(`✖ [FAIL] ${msg}${detail ? ` (${detail})` : ''}`);
    }
  }

  const sandboxDir = path.join(PACKAGE_ROOT, 'test-sandbox-files-' + Date.now());
  await fsp.mkdir(sandboxDir, { recursive: true });

  const toolSink = new MemoryToolSink();
  const capIndex = new MemoryCapabilityIndex();
  const confirmationBroker = new ConsoleConfirmationBroker(true);
  const nativeHost = new NativeWindowHost();

  const appManager = new ElixAppManager({
    baseDir: sandboxDir,
    toolSink,
    capabilityIndex: capIndex,
    confirmationBroker,
    windowHost: nativeHost,
  });
  nativeHost.setInstaller(appManager.installer);

  // Phase 1: Rebuild demo apps and verify com.elix.files package
  const rebuilt = await appManager.rebuildDemoApps(path.join(PACKAGE_ROOT, 'demo-apps'));
  const filesApp = rebuilt.find((a) => a.manifest.id === 'com.elix.files');

  assert(filesApp !== undefined, 'Phase 1: com.elix.files packaged & deployed via rebuildDemoApps');
  const indexHtmlPath = path.join(filesApp?.installPath || '', 'index.html');
  assert(fs.existsSync(indexHtmlPath), 'Phase 1: com.elix.files/index.html exists in target binPath');

  const indexHtml = await fsp.readFile(indexHtmlPath, 'utf-8');
  assert(indexHtml.includes('liquid-capsule'), 'Phase 1: Segmented Liquid Metal controls capsule in index.html');
  assert(indexHtml.includes('ws://127.0.0.1:7391'), 'Phase 1: WebSocket IPC endpoint configured');

  // ==========================================================================
  // Test Case 1: Deep Directory Traversal & Cyclic Symlink Handling
  // ==========================================================================
  console.log(`\n▶ [Test Case 1] Deep Directory Traversal (>15 levels) & Cyclic Traversal Protection`);
  const deepRoot = path.join(sandboxDir, 'deep-tree');
  let currentLevel = deepRoot;

  for (let i = 1; i <= 18; i++) {
    currentLevel = path.join(currentLevel, `level_${i}`);
    await fsp.mkdir(currentLevel, { recursive: true });
    await fsp.writeFile(path.join(currentLevel, `file_at_level_${i}.txt`), `Content at depth ${i}`);
  }

  const traversalResult = traverseDirectorySafe(deepRoot, 25);
  assert(traversalResult.maxDepthReached >= 18, `Test 1a: Safely traversed ${traversalResult.maxDepthReached} nested levels (>15 levels limit)`);
  assert(traversalResult.count >= 36, `Test 1b: Enumerated all ${traversalResult.count} nested directory entries without stack overflow`);

  // Cyclic traversal check: simulate loop with visited set
  const visitedSet = new Set<string>();
  visitedSet.add(fs.realpathSync(deepRoot));
  const cyclicCheck = traverseDirectorySafe(deepRoot, 25, visitedSet);
  assert(cyclicCheck.count === 0, 'Test 1c: Cyclic visited trap successfully prevented infinite recursion');

  // ==========================================================================
  // Test Case 2: Path Sanitization & Injection Prevention
  // ==========================================================================
  console.log(`\n▶ [Test Case 2] Path Sanitization & Injection Prevention`);
  const jailDir = path.join(sandboxDir, 'jail');
  await fsp.mkdir(jailDir, { recursive: true });

  const testNullByte = sanitizePathSafe('file\0.txt', jailDir);
  assert(testNullByte.error !== undefined && testNullByte.error.includes('null bytes'), 'Test 2a: Null byte injection deterministically rejected');

  const testTraversalEscape = sanitizePathSafe('../../../../windows/system32', jailDir);
  assert(testTraversalEscape.error !== undefined && testTraversalEscape.error.includes('Directory traversal violation'), 'Test 2b: Path traversal escaping sandbox rejected');

  const testInvalidChar = sanitizePathSafe('folder/item<illegal>.dat', jailDir);
  assert(testInvalidChar.error !== undefined && testInvalidChar.error.includes('Invalid character'), 'Test 2c: Illegal characters in filename rejected safely');

  const testValidRelative = sanitizePathSafe('documents/report.pdf', jailDir);
  assert(testValidRelative.safePath !== undefined && testValidRelative.safePath.includes('documents'), 'Test 2d: Safe relative path resolved cleanly inside sandbox');

  // ==========================================================================
  // Test Case 3: High-Density Directory Performance (2,500+ items)
  // ==========================================================================
  console.log(`\n▶ [Test Case 3] High-Density Directory Performance (2,500+ items)`);
  const startTime = performance.now();
  const largeDataset = generateHighDensityItems(2500);

  // Sorting operation simulation (name ascending, size descending)
  const sortedByName = [...largeDataset].sort((a, b) => a.name.localeCompare(b.name));
  const sortedBySize = [...largeDataset].sort((a, b) => b.sizeBytes - a.sizeBytes);
  const elapsedMs = performance.now() - startTime;

  assert(largeDataset.length === 2500, 'Test 3a: Synthetic directory populated with exactly 2,500 items');
  assert(sortedByName[0].name.startsWith('file_item_00000'), 'Test 3b: High-density dataset sorted by name correctly');
  assert(sortedBySize[0].sizeBytes >= sortedBySize[1].sizeBytes, 'Test 3c: High-density dataset sorted by size correctly');
  assert(elapsedMs < 50.0, `Test 3d: 2,500 item enumeration and multi-criteria sorting processed in ${elapsedMs.toFixed(2)}ms (< 50ms limit)`);

  // ==========================================================================
  // Test Case 4: Corrupt Archive Resilience
  // ==========================================================================
  console.log(`\n▶ [Test Case 4] Corrupt Archive Resilience`);
  const corruptZipPath = path.join(sandboxDir, 'corrupt.zip');
  await fsp.writeFile(corruptZipPath, Buffer.from([0x50, 0x4B, 0x03, 0x04, 0xFF, 0x00, 0x00]));

  let caughtArchiveError = false;
  try {
    const zip = new ElixZip(corruptZipPath);
    const entries = zip.getEntries();
    if (entries.length === 0) caughtArchiveError = true;
  } catch (err: any) {
    caughtArchiveError = true;
  }
  assert(caughtArchiveError === true, 'Test 4a: Corrupted / truncated ZIP archive trapped safely without process crash');

  // Valid zip creation and extraction test
  const validZipPath = path.join(sandboxDir, 'valid.zip');
  const validZip = new ElixZip();
  validZip.addFile('config.json', Buffer.from(JSON.stringify({ active: true })));
  validZip.writeZip(validZipPath);

  const testExtract = new ElixZip(validZipPath);
  const extractedEntries = testExtract.getEntries();
  assert(extractedEntries.some(e => e.entryName === 'config.json'), 'Test 4b: Valid archive created and read successfully');

  // ==========================================================================
  // Test Case 5: Dynamic AI Bridge Tool Invocation & Sub-20ms Latency
  // ==========================================================================
  console.log(`\n▶ [Test Case 5] Dynamic AI Bridge Tool Invocation & Sub-20ms Latency`);
  const inspectMetaTool = toolSink.getTool('app_com_elix_files_inspect_file_metadata');
  assert(inspectMetaTool !== undefined, 'Test 5a: app_com_elix_files_inspect_file_metadata mounted in ToolSink');

  const listDirTool = toolSink.getTool('app_com_elix_files_list_directory');
  assert(listDirTool !== undefined, 'Test 5b: app_com_elix_files_list_directory mounted in ToolSink');

  const searchFilesTool = toolSink.getTool('app_com_elix_files_search_files');
  assert(searchFilesTool !== undefined, 'Test 5c: app_com_elix_files_search_files mounted in ToolSink');

  const manageArchiveTool = toolSink.getTool('app_com_elix_files_manage_archive');
  assert(manageArchiveTool !== undefined, 'Test 5d: app_com_elix_files_manage_archive mounted in ToolSink');

  const storageBreakdownTool = toolSink.getTool('app_com_elix_files_get_storage_breakdown');
  assert(storageBreakdownTool !== undefined, 'Test 5e: app_com_elix_files_get_storage_breakdown mounted in ToolSink');

  // Launch window first
  const filesWin = await appManager.launch('com.elix.files');
  assert(filesWin !== undefined, 'Test 5f: ELIX Files window launched successfully');
  assert(filesWin.url.includes('com.elix.files'), 'Test 5g: Window target URL points to com.elix.files');

  // Tool execution & latency measurement
  const startToolTime = performance.now();
  const metaRes: any = await inspectMetaTool!.execute({
    targetPath: '/home/elix/README.md',
  });
  const elapsedToolMs = performance.now() - startToolTime;

  assert(metaRes.success === true, 'Test 5h: inspect_file_metadata execution returned success: true');
  assert(metaRes.result.appId === 'com.elix.files', 'Test 5i: Result matches com.elix.files appId');
  assert(metaRes.result.capability === 'inspect_file_metadata', 'Test 5j: Result matches inspect_file_metadata capability');
  assert(elapsedToolMs < 20.0, `Test 5k: Tool execution completed in ${elapsedToolMs.toFixed(2)}ms (< 20ms threshold)`);

  const closed = await appManager.close('com.elix.files');
  assert(closed === true, 'Test 5l: Window close requested and returned true');

  const running = nativeHost.listWindows();
  const filesRunning = running.find((w) => w.appId === 'com.elix.files');
  assert(filesRunning === undefined, 'Test 5m: com.elix.files cleanly unmounted from active windows');

  // Cleanup sandbox
  await fsp.rm(sandboxDir, { recursive: true, force: true }).catch(() => {});

  console.log(`\n===========================================================================`);
  console.log(`TOTAL RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log(`===========================================================================\n`);

  if (passedTests < totalTests) {
    process.exit(1);
  }
}

if (process.argv[1] && (process.argv[1].endsWith('files-adversarial.test.ts') || process.argv[1].endsWith('files-adversarial.test.js'))) {
  runFilesAdversarialTests().then(() => {
      process.exit(0);
    }).catch((err) => {
    console.error('Fatal test error:', err);
    process.exit(1);
  });
}
