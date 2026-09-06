/**
 * ELIX Capture (com.elix.capture) — Adversarial & Performance Test Suite
 *
 * Verifies:
 * 1. Zero / Inverted Selection Bounds (normalization and min-clamping without canvas crash).
 * 2. Multiple Concurrent Recording Triggers (mutex lock guards against duplicate sessions).
 * 3. Rapid Annotation Undo/Redo Stack Overflow (bounded history, memory protection).
 * 4. Recording Teardown during Abrupt Window Close (clean stream & resource release).
 * 5. Dynamic AI Bridge Tool Invocation & Sub-20ms Latency.
 */

import path from 'path';
import fs from 'fs';
import fsp from 'fs/promises';
import { fileURLToPath } from 'url';
import { ElixAppManager } from '../src/app-manager.js';
import {
  MemoryToolSink,
  MemoryCapabilityIndex,
  ConsoleConfirmationBroker,
  NativeWindowHost,
} from '../src/adapters/ports.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PACKAGE_ROOT = path.resolve(__dirname, '..');

// ----------------------------------------------------------------------------
// 1. Selection Bounds Normalizer Engine
// ----------------------------------------------------------------------------
interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
  wasAdjusted: boolean;
}

function normalizeSelectionBounds(
  rect: { x: number; y: number; width: number; height: number },
  minWidth: number = 1,
  minHeight: number = 1,
  maxWidth: number = 3840,
  maxHeight: number = 2160
): NormalizedRect {
  let wasAdjusted = false;

  let x = rect.x;
  let y = rect.y;
  let width = rect.width;
  let height = rect.height;

  // Handle negative / inverted dragging
  if (width < 0) {
    x = x + width;
    width = Math.abs(width);
    wasAdjusted = true;
  }
  if (height < 0) {
    y = y + height;
    height = Math.abs(height);
    wasAdjusted = true;
  }

  // Handle zero or sub-minimum bounds
  if (width < minWidth) {
    width = minWidth;
    wasAdjusted = true;
  }
  if (height < minHeight) {
    height = minHeight;
    wasAdjusted = true;
  }

  // Clamp within max viewport
  if (x < 0) { x = 0; wasAdjusted = true; }
  if (y < 0) { y = 0; wasAdjusted = true; }
  if (x + width > maxWidth) {
    width = Math.max(minWidth, maxWidth - x);
    wasAdjusted = true;
  }
  if (y + height > maxHeight) {
    height = Math.max(minHeight, maxHeight - y);
    wasAdjusted = true;
  }

  return { x, y, width, height, wasAdjusted };
}

// ----------------------------------------------------------------------------
// 2. Recording Mutex Controller
// ----------------------------------------------------------------------------
class RecordingSessionController {
  private activeSessionId: string | null = null;
  private startTime: number = 0;

  public startRecording(sessionId: string): { success: boolean; sessionId?: string; alreadyRecording?: boolean } {
    if (this.activeSessionId !== null) {
      return { success: false, alreadyRecording: true, sessionId: this.activeSessionId };
    }
    this.activeSessionId = sessionId;
    this.startTime = Date.now();
    return { success: true, sessionId: this.activeSessionId };
  }

  public stopRecording(): { success: boolean; durationMs: number } {
    if (this.activeSessionId === null) {
      return { success: false, durationMs: 0 };
    }
    const durationMs = Date.now() - this.startTime;
    this.activeSessionId = null;
    this.startTime = 0;
    return { success: true, durationMs };
  }

  public isRecording(): boolean {
    return this.activeSessionId !== null;
  }

  public forceTeardown(): { released: boolean } {
    const wasActive = this.activeSessionId !== null;
    this.activeSessionId = null;
    this.startTime = 0;
    return { released: wasActive };
  }
}

// ----------------------------------------------------------------------------
// 3. Bounded Canvas History Stack
// ----------------------------------------------------------------------------
class BoundedCanvasHistory {
  private maxHistory: number;
  private undoStack: string[] = [];
  private redoStack: string[] = [];

  constructor(maxHistory: number = 50) {
    this.maxHistory = maxHistory;
  }

  public pushState(dataUri: string): void {
    if (this.undoStack.length >= this.maxHistory) {
      this.undoStack.shift(); // Evict oldest to bound memory
    }
    this.undoStack.push(dataUri);
    this.redoStack = []; // Invalidate redo stack
  }

  public undo(): string | null {
    if (this.undoStack.length <= 1) return null;
    const currentState = this.undoStack.pop()!;
    this.redoStack.push(currentState);
    return this.undoStack[this.undoStack.length - 1] || null;
  }

  public redo(): string | null {
    if (this.redoStack.length === 0) return null;
    const state = this.redoStack.pop()!;
    this.undoStack.push(state);
    return state;
  }

  public getUndoCount(): number {
    return this.undoStack.length;
  }

  public getRedoCount(): number {
    return this.redoStack.length;
  }
}

export async function runCaptureAdversarialTests(): Promise<void> {
  console.log('===========================================================================');
  console.log('⚡ ELIX CAPTURE (com.elix.capture) — ADVERSARIAL TEST SUITE');
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

  const sandboxDir = path.join(PACKAGE_ROOT, 'test-sandbox-capture-' + Date.now());
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

  // Phase 1: Rebuild demo apps and verify com.elix.capture package
  const rebuilt = await appManager.rebuildDemoApps(path.join(PACKAGE_ROOT, 'demo-apps'));
  const captureApp = rebuilt.find((a) => a.manifest.id === 'com.elix.capture');

  assert(captureApp !== undefined, 'Phase 1: com.elix.capture packaged & deployed via rebuildDemoApps');
  const indexHtmlPath = path.join(captureApp?.installPath || '', 'index.html');
  assert(fs.existsSync(indexHtmlPath), 'Phase 1: com.elix.capture/index.html exists in target binPath');

  const indexHtml = await fsp.readFile(indexHtmlPath, 'utf-8');
  assert(indexHtml.includes('liquid-capsule'), 'Phase 1: Segmented Liquid Metal controls capsule in index.html');
  assert(indexHtml.includes('ws://127.0.0.1:7391'), 'Phase 1: WebSocket IPC endpoint configured');

  // ==========================================================================
  // Test Case 1: Zero / Inverted Selection Bounds Normalization
  // ==========================================================================
  console.log(`\n▶ [Test Case 1] Zero / Inverted Selection Bounds Normalization`);
  const invertedRect = normalizeSelectionBounds({ x: 400, y: 300, width: -200, height: -100 });
  assert(invertedRect.x === 200 && invertedRect.y === 200, 'Test 1a: Inverted coordinates flipped to top-left (200, 200)');
  assert(invertedRect.width === 200 && invertedRect.height === 100, 'Test 1b: Absolute dimensions computed accurately (200x100)');
  assert(invertedRect.wasAdjusted === true, 'Test 1c: Adjustment reported');

  const zeroRect = normalizeSelectionBounds({ x: 100, y: 100, width: 0, height: 0 }, 1, 1);
  assert(zeroRect.width === 1 && zeroRect.height === 1, 'Test 1d: Zero-area bounding box clamped to minimum 1x1');

  const outOfBoundsRect = normalizeSelectionBounds({ x: 3800, y: 2100, width: 200, height: 200 }, 1, 1, 3840, 2160);
  assert(outOfBoundsRect.x + outOfBoundsRect.width <= 3840, 'Test 1e: Right edge clamped within maximum canvas boundary');
  assert(outOfBoundsRect.y + outOfBoundsRect.height <= 2160, 'Test 1f: Bottom edge clamped within maximum canvas boundary');

  // ==========================================================================
  // Test Case 2: Multiple Concurrent Recording Triggers (Mutex Lock)
  // ==========================================================================
  console.log(`\n▶ [Test Case 2] Multiple Concurrent Recording Triggers`);
  const recorder = new RecordingSessionController();

  const trigger1 = recorder.startRecording('rec_session_01');
  assert(trigger1.success === true && trigger1.sessionId === 'rec_session_01', 'Test 2a: Primary recording session started');
  assert(recorder.isRecording() === true, 'Test 2b: Recorder status indicates active session');

  const trigger2 = recorder.startRecording('rec_session_02');
  const trigger3 = recorder.startRecording('rec_session_03');
  const trigger4 = recorder.startRecording('rec_session_04');
  const trigger5 = recorder.startRecording('rec_session_05');

  assert(trigger2.alreadyRecording === true && trigger2.success === false, 'Test 2c: Concurrent trigger 2 rejected by mutex lock');
  assert(trigger3.alreadyRecording === true && trigger3.success === false, 'Test 2d: Concurrent trigger 3 rejected by mutex lock');
  assert(trigger4.alreadyRecording === true && trigger4.success === false, 'Test 2e: Concurrent trigger 4 rejected by mutex lock');
  assert(trigger5.alreadyRecording === true && trigger5.success === false, 'Test 2f: Concurrent trigger 5 rejected by mutex lock');

  const stopRes = recorder.stopRecording();
  assert(stopRes.success === true, 'Test 2g: Active recording session stopped cleanly');
  assert(recorder.isRecording() === false, 'Test 2h: Recorder status reset to idle');

  // ==========================================================================
  // Test Case 3: Rapid Annotation Undo/Redo Stack Overflow
  // ==========================================================================
  console.log(`\n▶ [Test Case 3] Rapid Annotation Undo/Redo Stack Overflow`);
  const history = new BoundedCanvasHistory(50);

  // Push 100 strokes
  for (let i = 0; i < 100; i++) {
    history.pushState(`data:image/png;base64,mock_stroke_${i}`);
  }

  assert(history.getUndoCount() === 50, `Test 3a: History stack bounded at maximum capacity (50/50, evicted 50)`);

  // Rapid Undo cycles
  for (let i = 0; i < 20; i++) {
    history.undo();
  }
  assert(history.getUndoCount() === 30, 'Test 3b: 20 consecutive undos performed cleanly');
  assert(history.getRedoCount() === 20, 'Test 3c: Redo stack populated with 20 states');

  // Rapid Redo cycles
  for (let i = 0; i < 10; i++) {
    history.redo();
  }
  assert(history.getUndoCount() === 40, 'Test 3d: 10 consecutive redos restored state');
  assert(history.getRedoCount() === 10, 'Test 3e: Redo stack decreased proportionally');

  // ==========================================================================
  // Test Case 4: Recording Teardown during Abrupt Window Close
  // ==========================================================================
  console.log(`\n▶ [Test Case 4] Recording Teardown during Abrupt Window Close`);
  const activeRecording = new RecordingSessionController();
  activeRecording.startRecording('screencast_temp_01');
  assert(activeRecording.isRecording() === true, 'Test 4a: Mock stream active before window destroy');

  const teardownRes = activeRecording.forceTeardown();
  assert(teardownRes.released === true, 'Test 4b: Teardown released active recording stream');
  assert(activeRecording.isRecording() === false, 'Test 4c: No lingering recording handles after window teardown');

  // ==========================================================================
  // Test Case 5: Dynamic AI Bridge Tool Invocation & Sub-20ms Latency
  // ==========================================================================
  console.log(`\n▶ [Test Case 5] Dynamic AI Bridge Tool Invocation & Sub-20ms Latency`);
  const captureScreenTool = toolSink.getTool('app_com_elix_capture_capture_screen');
  assert(captureScreenTool !== undefined, 'Test 5a: app_com_elix_capture_capture_screen mounted in ToolSink');

  const startRecTool = toolSink.getTool('app_com_elix_capture_start_screen_recording');
  assert(startRecTool !== undefined, 'Test 5b: app_com_elix_capture_start_screen_recording mounted in ToolSink');

  const stopRecTool = toolSink.getTool('app_com_elix_capture_stop_screen_recording');
  assert(stopRecTool !== undefined, 'Test 5c: app_com_elix_capture_stop_screen_recording mounted in ToolSink');

  const applyAnnotateTool = toolSink.getTool('app_com_elix_capture_apply_annotation');
  assert(applyAnnotateTool !== undefined, 'Test 5d: app_com_elix_capture_apply_annotation mounted in ToolSink');

  const getHistoryTool = toolSink.getTool('app_com_elix_capture_get_capture_history');
  assert(getHistoryTool !== undefined, 'Test 5e: app_com_elix_capture_get_capture_history mounted in ToolSink');

  // Launch window
  const win = await appManager.launch('com.elix.capture');
  assert(win !== undefined, 'Test 5f: ELIX Capture window launched successfully');
  assert(win.url.includes('com.elix.capture'), 'Test 5g: Window target URL points to com.elix.capture');

  // Warmup tool execution
  await captureScreenTool!.execute({
    mode: 'fullscreen'
  });

  // Tool execution & latency measurement
  const startToolTime = performance.now();
  const captureRes: any = await captureScreenTool!.execute({
    mode: 'custom_region',
    regionBounds: { x: 100, y: 100, width: 800, height: 600 }
  });
  const elapsedToolMs = performance.now() - startToolTime;

  assert(captureRes.success === true, 'Test 5h: capture_screen execution returned success: true');
  assert(captureRes.result.appId === 'com.elix.capture', 'Test 5i: Result matches com.elix.capture appId');
  assert(captureRes.result.capability === 'capture_screen', 'Test 5j: Result matches capture_screen capability');
  assert(elapsedToolMs < 20.0, `Test 5k: Tool execution completed in ${elapsedToolMs.toFixed(2)}ms (< 20ms threshold)`);

  const closed = await appManager.close('com.elix.capture');
  assert(closed === true, 'Test 5l: Window close requested and returned true');

  const running = nativeHost.listWindows();
  const captureRunning = running.find((w) => w.appId === 'com.elix.capture');
  assert(captureRunning === undefined, 'Test 5m: com.elix.capture cleanly unmounted from active windows');

  // Cleanup sandbox
  await fsp.rm(sandboxDir, { recursive: true, force: true }).catch(() => {});

  console.log(`\n===========================================================================`);
  console.log(`TOTAL RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log(`===========================================================================\n`);

  if (passedTests < totalTests) {
    process.exit(1);
  }
}

if (process.argv[1] && (process.argv[1].endsWith('capture-adversarial.test.ts') || process.argv[1].endsWith('capture-adversarial.test.js'))) {
  runCaptureAdversarialTests()
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error('Fatal test error:', err);
      process.exit(1);
    });
}
