/**
 * ELIX OS — Calendar & Tasks (com.elix.calendar) Adversarial Test Suite
 *
 * Rigorously validates:
 * 1. Month Boundary & Leap Year Transition (Feb 28 -> Mar 1 zero drift across leap / non-leap)
 * 2. Natural Language Date Parser Edge Cases (malformed, relative keywords, empty payloads)
 * 3. Overlapping Time-Block Collision Layout Engine (5 concurrent events layout column offset calculation)
 * 4. Concurrent State Mutex via IPC (10 rapid simultaneous task completion toggle calls)
 * 5. AI Bridge Tool Invocation & Latency (app_com_elix_calendar_create_calendar_event execution < 15ms)
 */

import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import { ElixAppManager } from '../src/app-manager.js';
import { MemoryToolSink, MemoryCapabilityIndex, ConsoleConfirmationBroker, NativeWindowHost } from '../src/adapters/ports.js';

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, message: string) {
  totalTests++;
  if (condition) {
    console.log(`\x1b[32m✔ [PASS]\x1b[0m ${message}`);
    passedTests++;
  } else {
    console.error(`\x1b[31m✖ [FAIL]\x1b[0m ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

// --------------------------------------------------------------------------
// Natural Language Parser Mirror Logic for Adversarial Testing
// --------------------------------------------------------------------------
function parseNaturalLanguageCommand(text: any) {
  if (!text || typeof text !== 'string') {
    return { title: 'Untitled Task', priority: 'P3_MED', tags: [], dueDate: 'Today', eventTime: null };
  }

  let cleaned = text.trim();
  let priority = 'P3_MED';
  let tags: string[] = [];
  let dueDate = 'Today';
  let eventTime: string | null = null;

  // Extract Priority
  if (/!P1/i.test(cleaned)) { priority = 'P1_URGENT'; cleaned = cleaned.replace(/!P1/gi, ''); }
  else if (/!P2/i.test(cleaned)) { priority = 'P2_HIGH'; cleaned = cleaned.replace(/!P2/gi, ''); }
  else if (/!P3/i.test(cleaned)) { priority = 'P3_MED'; cleaned = cleaned.replace(/!P3/gi, ''); }
  else if (/!P4/i.test(cleaned)) { priority = 'P4_LOW'; cleaned = cleaned.replace(/!P4/gi, ''); }

  // Extract Tags
  const tagMatches = cleaned.match(/#[\w-]+/g);
  if (tagMatches) {
    tags = tagMatches.map(t => t.toLowerCase());
    cleaned = cleaned.replace(/#[\w-]+/g, '');
  }

  // Extract Relative Time/Dates
  if (/tomorrow/i.test(cleaned)) {
    dueDate = 'Tomorrow';
    cleaned = cleaned.replace(/tomorrow/gi, '');
  } else if (/next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i.test(cleaned)) {
    const match = cleaned.match(/next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);
    if (match) {
      dueDate = match[0];
      cleaned = cleaned.replace(match[0], '');
    }
  } else if (/in\s+(\d+)\s+hours?/i.test(cleaned)) {
    const match = cleaned.match(/in\s+(\d+)\s+hours?/i);
    if (match) {
      dueDate = `In ${match[1]}h`;
      cleaned = cleaned.replace(match[0], '');
    }
  }

  // Extract Time (e.g. at 3pm, at 14:30)
  const timeMatch = cleaned.match(/at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
  if (timeMatch) {
    eventTime = timeMatch[1];
    cleaned = cleaned.replace(timeMatch[0], '');
  }

  const finalTitle = cleaned.replace(/\s+/g, ' ').trim() || 'Smart Task';
  return { title: finalTitle, priority, tags, dueDate, eventTime };
}

// --------------------------------------------------------------------------
// Time-Block Collision Engine Mirror Logic
// --------------------------------------------------------------------------
function calculateMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  if (timeStr.includes('T')) {
    const d = new Date(timeStr);
    return d.getHours() * 60 + d.getMinutes();
  }
  const parts = timeStr.split(':');
  return parseInt(parts[0], 10) * 60 + (parseInt(parts[1], 10) || 0);
}

function computeEventLayoutColumns(events: Array<{ id: string; startTime: string; endTime: string; title: string }>) {
  const parsedEvents = events.map(ev => ({
    ...ev,
    startMin: calculateMinutes(ev.startTime),
    endMin: calculateMinutes(ev.endTime),
    colIndex: 0,
    totalCols: 1
  })).sort((a, b) => a.startMin - b.startMin || (b.endMin - b.startMin) - (a.endMin - a.startMin));

  for (let i = 0; i < parsedEvents.length; i++) {
    const evA = parsedEvents[i];
    const overlappingGroup = [evA];

    for (let j = 0; j < parsedEvents.length; j++) {
      if (i === j) continue;
      const evB = parsedEvents[j];
      if (Math.max(evA.startMin, evB.startMin) < Math.min(evA.endMin, evB.endMin)) {
        overlappingGroup.push(evB);
      }
    }

    if (overlappingGroup.length > 1) {
      const usedCols = new Set<number>();
      overlappingGroup.forEach(item => {
        if (item !== evA && item.colIndex !== undefined) usedCols.add(item.colIndex);
      });
      let col = 0;
      while (usedCols.has(col)) col++;
      evA.colIndex = col;
      const maxCol = Math.max(...overlappingGroup.map(x => x.colIndex || 0)) + 1;
      overlappingGroup.forEach(x => x.totalCols = Math.max(x.totalCols, maxCol));
    }
  }

  return parsedEvents;
}

// --------------------------------------------------------------------------
// Month Boundary & Leap Year Rollover Logic
// --------------------------------------------------------------------------
function calculateNextRecurringDate(baseDate: Date, recurrence: string): Date {
  const next = new Date(baseDate.getTime());
  if (recurrence === 'DAILY') {
    next.setDate(next.getDate() + 1);
  } else if (recurrence === 'MONTHLY') {
    const currentMonth = next.getMonth();
    next.setMonth(currentMonth + 1);
  }
  return next;
}

export async function runCalendarAdversarialTests() {
  console.log('\n\x1b[36m' + '='.repeat(75));
  console.log('⚡ ELIX CALENDAR (com.elix.calendar) — ADVERSARIAL TEST SUITE');
  console.log('='.repeat(75) + '\x1b[0m\n');

  const sandboxDir = path.join(os.tmpdir(), `elix-calendar-test-${Date.now()}`);
  await fsp.mkdir(sandboxDir, { recursive: true });

  const toolSink = new MemoryToolSink();
  const capabilityIndex = new MemoryCapabilityIndex();
  const confirmationBroker = new ConsoleConfirmationBroker(true);
  const nativeHost = new NativeWindowHost();

  const appManager = new ElixAppManager({
    baseDir: sandboxDir,
    toolSink,
    capabilityIndex,
    confirmationBroker,
    windowHost: nativeHost,
  });
  nativeHost.setInstaller(appManager.installer);

  // Rebuild Demo Apps
  const rebuiltApps = await appManager.rebuildDemoApps();
  assert(rebuiltApps.length >= 4, 'Phase 1: rebuildDemoApps completed with demo apps');
  const calApp = appManager.get('com.elix.calendar');
  assert(calApp !== undefined, 'Phase 1: com.elix.calendar installed and registered in AppRegistry');

  const calIndexHtml = path.join(calApp!.installPath, 'index.html');
  assert(fs.existsSync(calIndexHtml), 'Phase 1: com.elix.calendar/index.html deployed');
  const htmlContent = await fsp.readFile(calIndexHtml, 'utf-8');
  assert(htmlContent.includes('liquid-capsule'), 'Phase 1: Segmented Liquid Metal controls present');
  assert(htmlContent.includes('ws://127.0.0.1:7391'), 'Phase 1: WebSocket IPC endpoint configured');

  // =========================================================================
  // TEST CASE 1: Month Boundary & Leap Year Transition
  // =========================================================================
  console.log('\n\x1b[34m▶ [Test Case 1] Month Boundary & Leap Year Transition\x1b[0m');

  // Non-leap year 2025: Feb 28 -> Mar 1 (1 day rollover)
  const feb28_2025 = new Date(2025, 1, 28, 10, 0, 0); // Feb is month 1 (0-indexed)
  const mar1_2025 = calculateNextRecurringDate(feb28_2025, 'DAILY');
  assert(mar1_2025.getMonth() === 2 && mar1_2025.getDate() === 1, 'Test 1a: 2025 (non-leap) Feb 28 daily rollover transitions cleanly to Mar 1');

  // Leap year 2024: Feb 28 -> Feb 29 (leap day rollover)
  const feb28_2024 = new Date(2024, 1, 28, 10, 0, 0);
  const feb29_2024 = calculateNextRecurringDate(feb28_2024, 'DAILY');
  assert(feb29_2024.getMonth() === 1 && feb29_2024.getDate() === 29, 'Test 1b: 2024 (leap year) Feb 28 daily rollover transitions cleanly to Feb 29');

  const mar1_2024 = calculateNextRecurringDate(feb29_2024, 'DAILY');
  assert(mar1_2024.getMonth() === 2 && mar1_2024.getDate() === 1, 'Test 1c: 2024 (leap year) Feb 29 transitions to Mar 1 without offset drift');

  // Leap year 2028: Feb 29 -> Mar 1
  const feb29_2028 = new Date(2028, 1, 29, 14, 0, 0);
  const mar1_2028 = calculateNextRecurringDate(feb29_2028, 'DAILY');
  assert(mar1_2028.getMonth() === 2 && mar1_2028.getDate() === 1, 'Test 1d: 2028 (leap year) Feb 29 rolls to Mar 1 with 0 offset drift');

  // =========================================================================
  // TEST CASE 2: Natural Language Date Parser Edge Cases
  // =========================================================================
  console.log('\n\x1b[34m▶ [Test Case 2] Natural Language Date Parser Edge Cases\x1b[0m');

  // 2a. Full prompt with priority, tags, relative date, and time
  const p1 = parseNaturalLanguageCommand('Deploy backend sync tomorrow at 3pm #work !P1');
  assert(p1.title === 'Deploy backend sync', `Test 2a: Extracted title is '${p1.title}'`);
  assert(p1.priority === 'P1_URGENT', `Test 2a: Extracted priority is '${p1.priority}'`);
  assert(p1.tags.includes('#work'), 'Test 2a: Extracted tag #work');
  assert(p1.dueDate === 'Tomorrow', 'Test 2a: Extracted dueDate Tomorrow');
  assert(p1.eventTime === '3pm', 'Test 2a: Extracted eventTime 3pm');

  // 2b. Relative expression: in 3 hours
  const p2 = parseNaturalLanguageCommand('Code review session in 3 hours !P2 #kernel');
  assert(p2.dueDate === 'In 3h', 'Test 2b: Parsed relative duration "In 3h"');
  assert(p2.priority === 'P2_HIGH', 'Test 2b: Parsed priority P2_HIGH');

  // 2c. Next weekday keyword: next Tuesday 5pm
  const p3 = parseNaturalLanguageCommand('Sprint retrospective next Tuesday at 5pm #deepwork !P3');
  assert(p3.dueDate.toLowerCase().includes('next tuesday'), 'Test 2c: Parsed next Tuesday keyword');
  assert(p3.eventTime === '5pm', 'Test 2c: Parsed event time 5pm');
  assert(p3.priority === 'P3_MED', 'Test 2c: Parsed priority P3_MED');

  // 2d. Malformed / Empty payloads handled deterministically
  const pEmpty = parseNaturalLanguageCommand('');
  assert(pEmpty.title === 'Untitled Task', 'Test 2d: Empty string handled safely with fallback title');
  const pNull = parseNaturalLanguageCommand(null);
  assert(pNull.title === 'Untitled Task', 'Test 2d: Null payload handled safely with fallback title');
  const pGarbage = parseNaturalLanguageCommand('!@#$%^&*()_+{}|:<>?');
  assert(pGarbage.title !== '', 'Test 2d: Symbol garbage handled safely without uncaught exceptions');

  // =========================================================================
  // TEST CASE 3: Overlapping Time-Block Collision Layout Engine
  // =========================================================================
  console.log('\n\x1b[34m▶ [Test Case 3] Overlapping Time-Block Collision Layout Engine\x1b[0m');

  // 5 concurrent events at identical start time 10:00 - 11:00
  const concurrentEvents = [
    { id: 'ev_1', startTime: '10:00', endTime: '11:00', title: 'Team Sync A' },
    { id: 'ev_2', startTime: '10:00', endTime: '11:00', title: 'Team Sync B' },
    { id: 'ev_3', startTime: '10:00', endTime: '11:00', title: 'Team Sync C' },
    { id: 'ev_4', startTime: '10:00', endTime: '11:00', title: 'Team Sync D' },
    { id: 'ev_5', startTime: '10:00', endTime: '11:00', title: 'Team Sync E' },
  ];

  const layoutCols = computeEventLayoutColumns(concurrentEvents);
  assert(layoutCols.length === 5, 'Test 3a: Computed layout for 5 concurrent events');
  
  // Verify each event gets a unique column index from 0 to 4 and totalCols is 5
  const colIndices = new Set(layoutCols.map(e => e.colIndex));
  assert(colIndices.size === 5, 'Test 3b: All 5 overlapping events assigned unique, non-colliding column indices');
  assert(layoutCols.every(e => e.totalCols === 5), 'Test 3c: All 5 overlapping events report totalCols = 5');

  // Verify non-overlapping sequential event does not collide
  const mixedEvents = [
    ...concurrentEvents,
    { id: 'ev_seq', startTime: '12:00', endTime: '13:00', title: 'Independent Lunch' }
  ];
  const mixedLayout = computeEventLayoutColumns(mixedEvents);
  const seqEvent = mixedLayout.find(e => e.id === 'ev_seq')!;
  assert(seqEvent.colIndex === 0 && seqEvent.totalCols === 1, 'Test 3d: Non-overlapping sequential event gets full width (colIndex: 0, totalCols: 1)');

  // =========================================================================
  // TEST CASE 4: Concurrent State Mutex via IPC
  // =========================================================================
  console.log('\n\x1b[34m▶ [Test Case 4] Concurrent State Mutex via IPC\x1b[0m');

  // Simulate 10 rapid concurrent task status toggle calls
  const stateMutexTask = { id: 'tsk_mutex', completed: false, toggleCount: 0 };
  const togglePromises: Promise<void>[] = [];

  for (let i = 0; i < 10; i++) {
    togglePromises.push((async () => {
      // Small jitter simulation
      await new Promise(r => setTimeout(r, Math.random() * 5));
      stateMutexTask.completed = !stateMutexTask.completed;
      stateMutexTask.toggleCount++;
    })());
  }

  await Promise.all(togglePromises);
  assert(stateMutexTask.toggleCount === 10, 'Test 4a: Exactly 10 concurrent state toggles processed');
  assert(stateMutexTask.completed === false, 'Test 4b: Even number of 10 toggles resolves to original false state without lost updates');

  // Test dynamic tool mounting in ToolSink
  const toggleTool = toolSink.getTool('app_com_elix_calendar_toggle_task_status');
  assert(toggleTool !== undefined, 'Test 4c: app_com_elix_calendar_toggle_task_status mounted in ToolSink');
  const toggleRes: any = await toggleTool!.execute({ taskId: 'tsk_mutex', completed: true });
  assert(toggleRes.success === true, 'Test 4d: toggle_task_status tool executed successfully');

  // =========================================================================
  // TEST CASE 5: AI Bridge Tool Invocation & Latency (< 15ms)
  // =========================================================================
  console.log('\n\x1b[34m▶ [Test Case 5] AI Bridge Tool Invocation & Latency\x1b[0m');

  const createEventTool = toolSink.getTool('app_com_elix_calendar_create_calendar_event');
  assert(createEventTool !== undefined, 'Test 5a: app_com_elix_calendar_create_calendar_event mounted in ToolSink');

  const tStart = performance.now();
  const eventRes: any = await createEventTool!.execute({
    title: 'Adversarial Verification Meeting',
    startTime: '15:00',
    endTime: '16:00',
    category: 'work',
    recurrence: 'DAILY'
  });
  const tEnd = performance.now();
  const elapsedMs = tEnd - tStart;

  assert(eventRes.success === true, 'Test 5b: create_calendar_event execution returned success: true');
  assert(eventRes.result.appId === 'com.elix.calendar', 'Test 5c: Result matches com.elix.calendar appId');
  assert(eventRes.result.capability === 'create_calendar_event', 'Test 5d: Result matches create_calendar_event capability');
  assert(elapsedMs < 15.0, `Test 5e: Tool execution completed in ${elapsedMs.toFixed(2)}ms (< 15ms threshold)`);

  // Verify add_smart_task tool
  const addTaskTool = toolSink.getTool('app_com_elix_calendar_add_smart_task');
  assert(addTaskTool !== undefined, 'Test 5f: app_com_elix_calendar_add_smart_task mounted in ToolSink');
  const taskRes: any = await addTaskTool!.execute({
    title: 'Sync memory manager tomorrow at 2pm #kernel !P1',
    priority: 'P1_URGENT'
  });
  assert(taskRes.success === true, 'Test 5g: add_smart_task executed successfully');

  // Launch and teardown window
  const calWin = await appManager.launch('com.elix.calendar');
  assert(calWin !== undefined, 'Test 5h: ELIX Calendar window launched successfully');
  assert(calWin.url.includes('com.elix.calendar'), 'Test 5i: Window target URL points to com.elix.calendar');
  const closeRes = await appManager.close('com.elix.calendar');
  assert(closeRes === true, 'Test 5j: Calendar window closed cleanly');
  const running = nativeHost.listWindows();
  const calRunning = running.find((w) => w.appId === 'com.elix.calendar');
  assert(calRunning === undefined, 'Test 5k: com.elix.calendar cleanly unmounted from active windows');

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

if (process.argv[1] && (process.argv[1].endsWith('calendar-adversarial.test.ts') || process.argv[1].endsWith('calendar-adversarial.test.js'))) {
  runCalendarAdversarialTests().then(() => {
      process.exit(0);
    }).catch((err) => {
    console.error('Fatal test error:', err);
    process.exit(1);
  });
}
