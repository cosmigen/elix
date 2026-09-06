/**
 * Comprehensive Test Suite for ELIX Window Manager & Preload IPC Channel
 */

import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { ElixAppInstaller } from '../src/installer.js';
import { ElixWindowManager } from '../src/window-manager.js';
import { generatePreloadScript } from '../src/ipc-channel.js';
import { ElixZip } from '../src/utils/zip.js';
import type { ElixAppManifest, IpcPacket } from '../src/types.js';

console.log('=== RUNNING ELIX WINDOW MANAGER & IPC TEST SUITE ===\n');

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
  const sandboxDir = path.join(os.tmpdir(), `elix-wm-test-${Date.now()}`);
  await fsp.mkdir(sandboxDir, { recursive: true });

  const installer = new ElixAppInstaller(sandboxDir);
  const wm = new ElixWindowManager(installer, { screenWidth: 1920, screenHeight: 1080 });

  // 1. Create and install a test app with window and capability configurations
  const manifest: ElixAppManifest = {
    id: 'com.elix.calc',
    name: 'Floating Calculator',
    version: '1.0.0',
    description: 'Frameless floating calculator with dynamic agent capabilities',
    author: 'DeepSeek AI',
    entry: 'index.html',
    window: {
      width: 400,
      height: 550,
      minWidth: 300,
      minHeight: 400,
      resizable: true,
      alwaysOnTop: true,
      frame: false,
      transparent: true,
    },
    capabilities: {
      evaluate: {
        name: 'evaluate',
        description: 'Evaluate a mathematical expression',
        parameters: {
          type: 'object',
          properties: {
            expression: { type: 'string' },
          },
          required: ['expression'],
        },
      },
    },
  };

  const packageZip = new ElixZip();
  packageZip.addFile('elix.app.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8'));
  packageZip.addFile('index.html', Buffer.from('<!DOCTYPE html><html><body>Calculator</body></html>', 'utf-8'));

  const pkgPath = path.join(sandboxDir, 'calc.elixapp');
  packageZip.writeZip(pkgPath);

  const installedApp = await installer.install(pkgPath, { skipConsent: true });
  assert(installedApp.manifest.id === 'com.elix.calc', 'Setup: App successfully installed');

  // Test 1: Launch Floating Window
  let launchedEventFired = false;
  wm.once('window:launched', (win) => {
    launchedEventFired = true;
    assert(win.appId === 'com.elix.calc', 'Test 1a: window:launched event carries correct appId');
  });

  const win = await wm.launch('com.elix.calc', 'keypad');
  assert(win !== undefined, 'Test 1b: launch() returns active ElixAppWindow');
  assert(win.appId === 'com.elix.calc', 'Test 1c: Window appId matches');
  assert(win.url.includes('#keypad'), 'Test 1d: Initial route #keypad attached to URL');
  assert(win.state === 'open', 'Test 1e: Window state initialized to open');
  assert(launchedEventFired === true, 'Test 1f: window:launched event fired');

  // Test 2: Window properties & Frameless / Transparent Defaults
  assert(win.config.width === 400, 'Test 2a: Window width matches manifest (400px)');
  assert(win.config.height === 550, 'Test 2b: Window height matches manifest (550px)');
  assert(win.config.minWidth === 300, 'Test 2c: Window minWidth matches manifest (300px)');
  assert(win.config.frame === false, 'Test 2d: Window is frameless (frame: false)');
  assert(win.config.transparent === true, 'Test 2e: Window is transparent (transparent: true)');
  assert(win.config.alwaysOnTop === true, 'Test 2f: Window is alwaysOnTop');

  // Test 3: Window Lifecycle Controls
  // Focus
  await wm.focus('com.elix.calc');
  assert(win.state === 'focused', 'Test 3a: focus() sets state to focused');

  // Minimize
  await wm.minimize('com.elix.calc');
  assert(win.isMinimized === true && win.state === 'minimized', 'Test 3b: minimize() sets state to minimized');

  // Maximize
  await wm.maximize('com.elix.calc');
  assert(win.isMaximized === true && win.state === 'maximized', 'Test 3c: maximize() sets state to maximized');
  assert(win.geometry.width === 1920 && win.geometry.height === 1080, 'Test 3d: Maximize expands to screen dimensions');

  // Unmaximize
  await wm.unmaximize('com.elix.calc');
  assert(win.isMaximized === false && win.geometry.width === 400, 'Test 3e: unmaximize() restores original geometry');

  // Set Always On Top
  await wm.setAlwaysOnTop('com.elix.calc', false);
  assert(win.alwaysOnTop === false, 'Test 3f: setAlwaysOnTop(false) updates flag');

  // Test 4: Preload Script Generation
  const preloadScript = generatePreloadScript('com.elix.calc', win.id, { manifest });
  assert(preloadScript.includes('window.elix = elixBridge;'), 'Test 4a: Preload script exposes window.elix');
  assert(preloadScript.includes('handle: function(capabilityName, handler)'), 'Test 4b: Preload script defines handle() method');
  assert(preloadScript.includes('call: function(service, actionOrArgs, payload)'), 'Test 4c: Preload script defines call() method');
  assert(preloadScript.includes('emit: function(eventName, payload)'), 'Test 4d: Preload script defines emit() method');
  assert(preloadScript.includes('minimize: function()'), 'Test 4e: Preload script defines window controls');
  assert(preloadScript.includes('[data-elix-drag]'), 'Test 4f: Preload script injects frameless draggable window CSS');

  // Test 5: Bidirectional Tool Dispatch Mechanism (Host -> Window -> Host)
  // Simulate Webview Guest Transport
  const clientHandlers = new Map<string, (args: any) => any>();

  // Register client capability handler
  clientHandlers.set('evaluate', (args: { expression: string }) => {
    if (args.expression === '2 + 2') return 4;
    if (args.expression === 'error') throw new Error('Invalid math syntax');
    return 42;
  });

  // Connect simulated bidirectional transport
  win.ipcSession.bindTransport((packet: IpcPacket) => {
    // Client receives packet
    if (packet.type === 'TOOL_INVOKE') {
      const { capability, args } = (packet.payload as any) || {};
      const handler = clientHandlers.get(capability);
      if (handler) {
        try {
          const res = handler(args);
          // Send result back to host
          win.ipcSession.handleIncomingPacket({
            type: 'TOOL_RESULT',
            id: packet.id,
            appId: win.appId,
            windowId: win.id,
            payload: res,
          });
        } catch (err: any) {
          win.ipcSession.handleIncomingPacket({
            type: 'TOOL_ERROR',
            id: packet.id,
            appId: win.appId,
            windowId: win.id,
            error: { message: err.message },
          });
        }
      }
    }
  });

  // Host invokes tool on active window
  const toolResult = await wm.sendToolCall('com.elix.calc', 'evaluate', { expression: '2 + 2' });
  assert(toolResult === 4, 'Test 5a: sendToolCall() awaits and returns evaluation result (4)');

  // Test Tool Error handling
  let errorCaught = false;
  try {
    await win.sendToolCall('evaluate', { expression: 'error' });
  } catch (err: any) {
    if (err.message.includes('Invalid math syntax')) {
      errorCaught = true;
    }
  }
  assert(errorCaught === true, 'Test 5b: Client capability exception propagates to Host promise rejection');

  // Test 6: Client-to-Host Storage and Window Actions
  // Client sets storage item
  await win.ipcSession.handleIncomingPacket({
    type: 'SERVICE_CALL',
    id: 'req_1',
    appId: win.appId,
    windowId: win.id,
    payload: {
      service: 'storage',
      action: 'set',
      payload: { key: 'theme', value: 'dracula' },
    },
  });

  // Client gets storage item
  let storageResult: any;
  win.ipcSession.bindTransport((packet) => {
    if (packet.type === 'SERVICE_RESPONSE' && packet.id === 'req_2') {
      storageResult = packet.payload;
    }
  });

  await win.ipcSession.handleIncomingPacket({
    type: 'SERVICE_CALL',
    id: 'req_2',
    appId: win.appId,
    windowId: win.id,
    payload: {
      service: 'storage',
      action: 'get',
      payload: { key: 'theme' },
    },
  });
  assert(storageResult === 'dracula', 'Test 6: Client can invoke host storage service');

  // Test 7: Window Close Lifecycle
  let closedEventFired = false;
  wm.once('window:closed', (windowId, appId) => {
    if (appId === 'com.elix.calc') {
      closedEventFired = true;
    }
  });

  await wm.close('com.elix.calc');
  assert(win.state === 'closed', 'Test 7a: close() sets state to closed');
  assert(wm.listWindows().length === 0, 'Test 7b: Window removed from active windows list');
  assert(closedEventFired === true, 'Test 7c: window:closed event emitted');

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
