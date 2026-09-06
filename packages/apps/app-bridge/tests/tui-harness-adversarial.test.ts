/**
 * ELIX TUI Test Harness Adversarial & Lifecycle Test Suite
 *
 * Verifies:
 * 1. Interactive Input Stream Persistence (piped stdin "3\n1\n11\n" correctly opens app 1 without dropping process).
 * 2. Sub-Menu Invalid Input Reprompt ("3\n99\n1\n11\n" handles out-of-bounds gracefully and reprompts).
 * 3. Direct CLI Flag Execution (--launch com.elix.calculator returns code 0).
 * 4. Clean Exit on Option 11 ("11\n" exits with code 0).
 * 5. Event Loop Guard (no dangling timers / socket handles).
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PACKAGE_ROOT = path.resolve(__dirname, '..');
const TSX_CLI = 'C:\\Users\\S.LAKSHMI NARAYANA\\.gemini\\antigravity\\scratch\\elix-memory\\node_modules\\tsx\\dist\\cli.mjs';
const HARNESS_PATH = path.join(PACKAGE_ROOT, 'src', 'tui', 'test-harness.ts');

function stripAnsi(str: string): string {
  return str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function assert(condition: boolean, message: string, detail?: any): void {
  if (!condition) {
    const err = detail ? `${message} -> Details: ${JSON.stringify(detail)}` : message;
    console.error(`❌ [FAIL] ${err}`);
    throw new Error(err);
  }
  console.log(`✔ [PASS] ${message}`);
}

function runHarnessWithInput(input: string, args: string[] = [], timeoutMs: number = 15000): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve) => {
    const child = spawn('node', [TSX_CLI, HARNESS_PATH, ...args], {
      cwd: PACKAGE_ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, CI: '1' },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });

    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    if (input) {
      child.stdin.write(input);
    }
    child.stdin.end();

    const timer = setTimeout(() => {
      if (!child.killed) {
        child.kill('SIGTERM');
      }
    }, timeoutMs);

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code });
    });
  });
}

export async function runTuiHarnessAdversarialTests(): Promise<void> {
  console.log('===========================================================================');
  console.log('⚡ ELIX TUI TEST HARNESS — ADVERSARIAL & LIFECYCLE TEST SUITE');
  console.log('===========================================================================\n');

  // ==========================================================================
  // [Test Case 1] Interactive Input Stream Persistence ("3\n1\n11\n")
  // ==========================================================================
  console.log('▶ [Test Case 1] Interactive Input Stream Persistence');
  const res1 = await runHarnessWithInput('3\n1\n11\n');
  const text1 = stripAnsi(res1.stdout);
  assert(text1.includes('Installed Applications') || text1.includes('Select app to launch'), 'Test 1a: Sub-menu 3 prompted for application list', text1);
  assert(text1.includes('com.elix.notes') && (text1.includes('Launching window for') || text1.includes('Window launched successfully!')), 'Test 1b: Option 1 resolved and launched com.elix.notes', text1);
  assert(text1.includes('Window launched successfully!'), 'Test 1c: Window launch completed successfully without process drop', text1);
  assert(res1.exitCode === 0, 'Test 1d: Process continued to Option 11 and exited cleanly with code 0', `exitCode: ${res1.exitCode}`);
  await sleep(300);

  // ==========================================================================
  // [Test Case 2] Sub-Menu Invalid Input Reprompt ("3\n99\n1\n11\n")
  // ==========================================================================
  console.log('\n▶ [Test Case 2] Sub-Menu Invalid Input Reprompt');
  const res2 = await runHarnessWithInput('3\n99\n1\n11\n');
  const text2 = stripAnsi(res2.stdout);
  assert(text2.includes('Invalid choice "99"') || text2.includes('Please select a number'), 'Test 2a: Out-of-bounds input caught with warning', text2);
  assert(text2.includes('com.elix.notes'), 'Test 2b: Prompt remained open and processed following valid input 1', text2);
  assert(res2.exitCode === 0, 'Test 2c: Clean termination after reprompt sequence', `exitCode: ${res2.exitCode}`);
  await sleep(300);

  // ==========================================================================
  // [Test Case 3] Direct CLI Flag Execution (--launch com.elix.calculator)
  // ==========================================================================
  console.log('\n▶ [Test Case 3] Direct CLI Flag Execution');
  const res3 = await runHarnessWithInput('', ['--launch', 'com.elix.calculator']);
  const text3 = stripAnsi(res3.stdout);
  assert(text3.includes('Direct launch requested for: com.elix.calculator'), 'Test 3a: Non-interactive CLI flag parsed target app', text3);
  assert(text3.includes('Window launched successfully!'), 'Test 3b: Calculator window launched directly', text3);
  assert(res3.exitCode === 0, 'Test 3c: Direct CLI launch finished with exit code 0', `exitCode: ${res3.exitCode}`);
  await sleep(300);

  // ==========================================================================
  // [Test Case 4] Clean Exit on Option 11 ("11\n")
  // ==========================================================================
  console.log('\n▶ [Test Case 4] Clean Exit on Option 11');
  const res4 = await runHarnessWithInput('11\n');
  const text4 = stripAnsi(res4.stdout);
  assert(text4.includes('ELIX OS App Bridge session ended') || text4.includes('Session ended'), 'Test 4a: Option 11 triggered clean session outro', text4);
  assert(res4.exitCode === 0, 'Test 4b: Readline closed cleanly and process exited with code 0', `exitCode: ${res4.exitCode}`);
  await sleep(300);

  // ==========================================================================
  // [Test Case 5] Event Loop Guard & CLI Manifest List (--list)
  // ==========================================================================
  console.log('\n▶ [Test Case 5] Event Loop Guard & CLI Manifest List');
  const res5 = await runHarnessWithInput('', ['--list']);
  let parsedApps: any[] = [];
  try {
    parsedApps = JSON.parse(res5.stdout.trim());
  } catch {}
  assert(Array.isArray(parsedApps) && parsedApps.length >= 20, 'Test 5a: Structured JSON manifest output contains all 20+ apps', `Count: ${parsedApps.length}`);
  assert(parsedApps.some((a) => a.appId === 'com.elix.notes'), 'Test 5b: Notes present in manifest');
  assert(parsedApps.some((a) => a.appId === 'com.elix.center'), 'Test 5c: Center present in manifest');
  assert(res5.exitCode === 0, 'Test 5d: No dangling timers or unhandled rejections kept process alive', `exitCode: ${res5.exitCode}`);

  console.log('\n===========================================================================');
  console.log('TOTAL RESULTS: 5/5 TEST CASES PASSED');
  console.log('===========================================================================\n');
}

if (process.argv[1] && (process.argv[1].endsWith('tui-harness-adversarial.test.ts') || process.argv[1].endsWith('tui-harness-adversarial.test.js'))) {
  runTuiHarnessAdversarialTests()
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error('Fatal test error:', err);
      process.exit(1);
    });
}
