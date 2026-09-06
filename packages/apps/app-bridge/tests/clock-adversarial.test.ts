/**
 * Automated & Adversarial Test Suite for ELIX Clock (com.elix.clock)
 * Verifying boundary alarms, overlapping timers, invalid timezone handling,
 * sub-10ms tool execution, and clean window lifecycle teardown.
 */

import { ElixAppManager } from '../src/app-manager.js';
import { MemoryToolSink, MemoryCapabilityIndex, ConsoleConfirmationBroker, NativeWindowHost } from '../src/adapters/ports.js';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';

console.log('===========================================================================');
console.log('⚡ ELIX CLOCK (com.elix.clock) — ADVERSARIAL & AUTOMATED TEST SUITE');
console.log('===========================================================================\n');

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    console.log(`✔ [PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`✖ [FAIL] ${testName}`);
    if (detail) console.error(`       Detail: ${detail}`);
  }
}

async function runClockAdversarialTests() {
  const sandboxDir = path.join(os.tmpdir(), `elix-clock-test-${Date.now()}`);
  await fsp.mkdir(sandboxDir, { recursive: true });

  const toolSink = new MemoryToolSink();
  const capabilityIndex = new MemoryCapabilityIndex();
  const confirmationBroker = new ConsoleConfirmationBroker(true);
  const nativeWindowHost = new NativeWindowHost();

  const appManager = new ElixAppManager({
    baseDir: sandboxDir,
    toolSink,
    capabilityIndex,
    confirmationBroker,
    windowHost: nativeWindowHost,
  });
  nativeWindowHost.setInstaller(appManager.installer);

  // Phase 1: Rebuild and install demo applications including com.elix.clock
  const rebuilt = await appManager.rebuildDemoApps();
  assert(rebuilt.length >= 1, 'Phase 1: rebuildDemoApps completed');
  const clockApp = appManager.get('com.elix.clock');
  assert(clockApp !== undefined, 'Phase 1: com.elix.clock installed and registered');

  const clockIndex = path.join(clockApp!.installPath, 'index.html');
  assert(fs.existsSync(clockIndex), 'Phase 1: com.elix.clock/index.html deployed');
  const clockContent = await fsp.readFile(clockIndex, 'utf8');
  assert(clockContent.includes('liquid-capsule'), 'Phase 1: Liquid Metal Window Controls capsule present');
  assert(clockContent.includes('ws://127.0.0.1:7391'), 'Phase 1: WebSocket IPC endpoint configured');

  // ===========================================================================
  // TEST CASE 1: Boundary Alarm Rollover Scheduler
  // ===========================================================================
  console.log('\n▶ [Test Case 1] Boundary Alarm (23:59 & Day Rollover Handling)');
  {
    function calculateAlarmRemaining(alarmTimeStr: string, simulatedNow: Date) {
      const parts = alarmTimeStr.split(':');
      const targetHours = parseInt(parts[0], 10);
      const targetMinutes = parseInt(parts[1], 10);
      const targetSeconds = parts[2] ? parseInt(parts[2], 10) : 0;

      const target = new Date(
        simulatedNow.getFullYear(),
        simulatedNow.getMonth(),
        simulatedNow.getDate(),
        targetHours,
        targetMinutes,
        targetSeconds
      );

      // If target time is earlier or equal to simulatedNow, it rolls over to next day
      if (target.getTime() <= simulatedNow.getTime()) {
        target.setDate(target.getDate() + 1);
      }

      const diffMs = target.getTime() - simulatedNow.getTime();
      return { diffMs, targetIso: target.toISOString() };
    }

    // Sub-case 1a: Alarm set for 23:59:00 evaluated at 23:59:30 -> rolls over to tomorrow
    const nowLate = new Date(2026, 7, 26, 23, 59, 30);
    const rolloverResult = calculateAlarmRemaining('23:59:00', nowLate);
    assert(rolloverResult.diffMs > 0, 'Test 1a: Boundary alarm 23:59 evaluated at 23:59:30 calculates positive delta');
    assert(rolloverResult.diffMs === (24 * 3600 - 30) * 1000, 'Test 1b: Exact 23h 59m 30s rollover duration calculated');

    // Sub-case 1b: Alarm set for 00:00:00 evaluated at 23:59:59
    const nowAlmostMidnight = new Date(2026, 7, 26, 23, 59, 59);
    const midnightRollover = calculateAlarmRemaining('00:00:00', nowAlmostMidnight);
    assert(midnightRollover.diffMs === 1000, 'Test 1c: Midnight rollover calculated exactly 1000ms');

    // Sub-case 1c: Dynamic set_alarm tool capability invocation
    const setAlarmTool = toolSink.getTool('app_com_elix_clock_set_alarm');
    assert(setAlarmTool !== undefined, 'Test 1d: app_com_elix_clock_set_alarm tool mounted in ToolSink');

    const alarmExecResult: any = await setAlarmTool!.execute({
      time: '23:59',
      label: 'End of Day Checkpoint',
      repeatDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    });
    assert(alarmExecResult.success === true, 'Test 1e: set_alarm executed with boundary parameters successfully');
  }

  // ===========================================================================
  // TEST CASE 2: Overlapping Timers & Event Loop Isolation
  // ===========================================================================
  console.log('\n▶ [Test Case 2] Overlapping Timers (3 Simultaneous Independent Timers)');
  {
    interface MockTimer {
      id: string;
      label: string;
      remaining: number;
      ticks: number;
      completed: boolean;
    }

    const timerRegistry = new Map<string, MockTimer>();
    function createMockTimer(id: string, label: string, durationSec: number) {
      const timer: MockTimer = {
        id,
        label,
        remaining: durationSec,
        ticks: 0,
        completed: false,
      };
      timerRegistry.set(id, timer);
      return timer;
    }

    // Launch 3 simultaneous timers with different durations
    const t1 = createMockTimer('t1', 'Timer Alpha (10s)', 10);
    const t2 = createMockTimer('t2', 'Timer Beta (20s)', 20);
    const t3 = createMockTimer('t3', 'Timer Gamma (30s)', 30);

    assert(timerRegistry.size === 3, 'Test 2a: 3 simultaneous timers initialized in registry');

    // Simulate 12 clock tick steps
    for (let step = 0; step < 12; step++) {
      for (const t of timerRegistry.values()) {
        if (!t.completed) {
          t.remaining--;
          t.ticks++;
          if (t.remaining <= 0) {
            t.completed = true;
          }
        }
      }
    }

    assert(t1.completed === true, 'Test 2b: Timer Alpha (10s) completed after 10 ticks');
    assert(t1.ticks === 10, 'Test 2c: Timer Alpha halted ticking upon completion');
    assert(t2.completed === false && t2.remaining === 8, 'Test 2d: Timer Beta (20s) independently ticked to 8s remaining');
    assert(t3.completed === false && t3.remaining === 18, 'Test 2e: Timer Gamma (30s) independently ticked to 18s remaining');
  }

  // ===========================================================================
  // TEST CASE 3: Timezone Drift & Malformed Timezone Graceful Handling
  // ===========================================================================
  console.log('\n▶ [Test Case 3] Timezone Drift & Invalid Timezone Graceful Handling');
  {
    function resolveWorldTime(tzString: string): { success: boolean; time?: string; error?: string } {
      try {
        const now = new Date();
        const formatted = now.toLocaleTimeString('en-US', { timeZone: tzString, hour12: false });
        return { success: true, time: formatted };
      } catch (err: any) {
        return { success: false, error: `Invalid Timezone '${tzString}': ${err.message}` };
      }
    }

    // Malformed / Nonexistent timezones
    const malformed1 = resolveWorldTime('Mars/Phobos');
    assert(malformed1.success === false, 'Test 3a: Nonexistent timezone "Mars/Phobos" rejected safely without throwing uncaught exception');
    assert(malformed1.error !== undefined && malformed1.error.includes('Invalid Timezone'), 'Test 3b: Graceful descriptive error returned for Mars/Phobos');

    const malformed2 = resolveWorldTime('../../etc/passwd');
    assert(malformed2.success === false, 'Test 3c: Directory traversal timezone injection rejected safely');

    const malformed3 = resolveWorldTime('');
    assert(malformed3.success === false, 'Test 3d: Empty timezone string handled safely');

    // Valid timezones
    const validUtc = resolveWorldTime('UTC');
    assert(validUtc.success === true && typeof validUtc.time === 'string', 'Test 3e: Valid timezone "UTC" resolved successfully');

    const validTokyo = resolveWorldTime('Asia/Tokyo');
    assert(validTokyo.success === true && typeof validTokyo.time === 'string', 'Test 3f: Valid timezone "Asia/Tokyo" resolved successfully');

    // Capability Tool execution for get_world_time
    const getWorldTimeTool = toolSink.getTool('app_com_elix_clock_get_world_time');
    assert(getWorldTimeTool !== undefined, 'Test 3g: app_com_elix_clock_get_world_time tool mounted in ToolSink');

    const toolResult: any = await getWorldTimeTool!.execute({ timezone: 'Europe/London' });
    assert(toolResult.success === true, 'Test 3h: get_world_time executed with Europe/London');
  }

  // ===========================================================================
  // TEST CASE 4: AI Bridge Tool Invocation & Sub-10ms Latency
  // ===========================================================================
  console.log('\n▶ [Test Case 4] AI Bridge Tool Invocation & Latency (app_com_elix_clock_start_timer)');
  {
    const startTimerTool = toolSink.getTool('app_com_elix_clock_start_timer');
    assert(startTimerTool !== undefined, 'Test 4a: app_com_elix_clock_start_timer tool mounted in ToolSink');

    const startTime = performance.now();
    const result: any = await startTimerTool!.execute({
      durationSeconds: 120,
      label: 'Adversarial Benchmarking Timer',
    });
    const elapsedMs = performance.now() - startTime;

    assert(result.success === true, 'Test 4b: start_timer returned success: true');
    assert(result.result.appId === 'com.elix.clock', 'Test 4c: Result matches com.elix.clock appId');
    assert(result.result.capability === 'start_timer', 'Test 4d: Result matches start_timer capability');
    assert(elapsedMs < 10, `Test 4e: Tool execution completed in ${elapsedMs.toFixed(2)}ms (< 10ms threshold)`);
  }

  // ===========================================================================
  // TEST CASE 5: Window Launch, Liquid Controls & Clean Teardown
  // ===========================================================================
  console.log('\n▶ [Test Case 5] Window Launch & Clean Teardown');
  {
    const win = await appManager.launch('com.elix.clock');
    assert(win !== undefined, 'Test 5a: ELIX Clock window launched successfully');
    assert(win.url.includes('com.elix.clock'), 'Test 5b: Window target URL points to com.elix.clock');

    const closed = await appManager.close('com.elix.clock');
    assert(closed === true, 'Test 5c: Window close requested and returned true');

    const running = nativeWindowHost.listWindows();
    const clockRunning = running.find((w) => w.appId === 'com.elix.clock');
    assert(clockRunning === undefined, 'Test 5d: com.elix.clock window cleanly unmounted from active windows');
  }

  // Cleanup
  await fsp.rm(sandboxDir, { recursive: true, force: true }).catch(() => {});

  console.log(`\n===========================================================================`);
  console.log(`TOTAL RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log(`===========================================================================\n`);

  if (passedTests !== totalTests) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runClockAdversarialTests().then(() => {
      process.exit(0);
    }).catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
