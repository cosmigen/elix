/**
 * ELIX Native App Runtime & Dynamic App Bridge
 * Interactive Terminal UI (TUI) Test Harness (ELIXAPP Spec v1.2.0 Standalone)
 * 
 * Directly orchestrates the standalone ElixAppManager instance and mock adapter ports.
 * 
 * @module @deepseek-ai/elix-app-bridge/tui/test-harness
 */

import * as p from '../utils/prompt-driver.js';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';
import { ElixAppManager } from '../app-manager.js';
import { MemoryToolSink, MemoryCapabilityIndex, ConsoleConfirmationBroker, NativeWindowHost, broadcastEvent, ensureIpcServer } from '../adapters/ports.js';
import { registerManagementTools, createManagementTools } from '../management-tools.js';
import { ElixZip } from '../utils/zip.js';
import * as child_process from 'node:child_process';

// Resolve current package root
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PACKAGE_ROOT = path.resolve(__dirname, '..', '..');

/**
 * Initialize test harness WebSocket Server
 */
export function initTestHarnessWss(port = 7391) {
  return ensureIpcServer(port);
}

/**
 * Broadcast tool execution result to all connected client windows
 */
export function broadcastToolResult(payload: any) {
  broadcastEvent(payload);
}

/**
 * Package a demo directory into a .elixapp archive
 */
export function packageDemoApp(demoDir: string, outputZipPath: string): void {
  const zip = new ElixZip();
  const addFolder = (dir: string, base: string = '') => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      const rel = base ? `${base}/${ent.name}` : ent.name;
      if (ent.isDirectory()) {
        addFolder(full, rel);
      } else {
        zip.addFile(rel, fs.readFileSync(full));
      }
    }
  };
  addFolder(demoDir);
  zip.writeZip(outputZipPath);
}

/**
 * Main Interactive TUI Loop
 */
export async function runTui(): Promise<void> {
  const isDirectCli = process.argv.includes('--list') || process.argv.includes('--rebuild') || process.argv.includes('-r') || process.argv.includes('--launch') || process.argv.includes('-l');
  if (!isDirectCli) {
    console.clear();
    p.intro('\x1b[36m⚡ ELIX OS Native App Runtime & Dynamic App Bridge TUI (v1.2.0 Standalone)\x1b[0m');
  }

  initTestHarnessWss(7391);
  const elixDir = path.join(os.homedir(), '.elix');
  const toolSink = new MemoryToolSink();
  const capabilityIndex = new MemoryCapabilityIndex();
  const confirmationBroker = new ConsoleConfirmationBroker(true);
  const nativeWindowHost = new NativeWindowHost();

  const appManager = new ElixAppManager({
    baseDir: elixDir,
    toolSink,
    capabilityIndex,
    confirmationBroker,
    windowHost: nativeWindowHost,
  });
  nativeWindowHost.setInstaller(appManager.installer);

  // Register universal management tools
  registerManagementTools(toolSink, appManager.installer, appManager.windowHost);

  // Auto-build and install all demo apps if no apps installed yet
  const initialApps = appManager.list();
  if (initialApps.length === 0) {
    const s = p.spinner();
    s.start('Pre-packaging reference demo applications...');
    await appManager.rebuildDemoApps(path.join(PACKAGE_ROOT, 'demo-apps'));
    s.stop('Reference applications installed and tools mounted.');
  }

  const managementToolsList = createManagementTools(appManager.installer, appManager.windowHost, toolSink);
  const getAppListTool = managementToolsList.find((t) => t.name === 'get_app_list')!;
  const openAppTool = managementToolsList.find((t) => t.name === 'open_app')!;
  const closeAppTool = managementToolsList.find((t) => t.name === 'close_app')!;

  // 1. Direct CLI Flag: --rebuild / -r
  if (process.argv.includes('--rebuild') || process.argv.includes('-r')) {
    const demoDir = path.join(PACKAGE_ROOT, 'demo-apps');
    p.log.info(`Rebuilding all demo applications from ${demoDir}...`);
    const rebuilt = await appManager.rebuildDemoApps(demoDir);
    p.log.success(`Rebuilt and installed ${rebuilt.length} demo applications:`);
    for (const app of rebuilt) {
      p.log.message(`  ✔ ${app.manifest.name} (${app.manifest.id})`);
    }
    p.outro('Rebuild completed with exit code 0.');
    p.closeReadlineInterface();
    process.exit(0);
  }

  // 2. Direct CLI Flag: --list
  if (process.argv.includes('--list')) {
    let apps = appManager.list('all');
    if (apps.length === 0) {
      await appManager.rebuildDemoApps(path.join(PACKAGE_ROOT, 'demo-apps'));
      apps = appManager.list('all');
    }
    console.log(JSON.stringify(apps, null, 2));
    p.closeReadlineInterface();
    process.exit(0);
  }

  // 3. Direct CLI Flag: --launch <appId> / -l <appId>
  const launchIdx = process.argv.findIndex((a) => a === '--launch' || a === '-l');
  if (launchIdx !== -1 && process.argv[launchIdx + 1]) {
    const targetAppId = process.argv[launchIdx + 1]!;
    let apps = appManager.list('all');
    if (!apps.some((a) => a.appId === targetAppId)) {
      await appManager.rebuildDemoApps(path.join(PACKAGE_ROOT, 'demo-apps'));
    }
    p.intro('ELIX OS Native App Runtime & Dynamic App Bridge TUI (v1.2.0 Standalone)');
    p.log.info(`Direct launch requested for: ${targetAppId}`);
    try {
      const res = await openAppTool.execute({ appId: targetAppId });
      p.log.success(`Window launched successfully! [Window ID: ${res.windowId}]`);
      p.log.info(`Geometry: ${res.geometry.width}x${res.geometry.height} | URL: ${res.url}`);

      const isCiOrHeadless = process.env.CI === '1' || process.env.HEADLESS === 'true' || process.env.ELIX_HEADLESS === 'true';
      if (isCiOrHeadless) {
        p.outro(`Direct launch for '${targetAppId}' finished with exit code 0.`);
        p.closeReadlineInterface();
        process.exit(0);
      }

      p.log.info(`⚡ LocalIpcServer active on ws://127.0.0.1:7391. Keeping bridge alive...`);
      p.log.info(`Press Ctrl+C to terminate session.`);

      const cleanup = async () => {
        p.log.info('Closing window and terminating IPC session...');
        await appManager.close(targetAppId).catch(() => {});
        if (globalThis.__ELIX_WSS__) {
          try {
            await globalThis.__ELIX_WSS__.close();
          } catch {}
        }
        p.closeReadlineInterface();
        process.exit(0);
      };

      process.on('SIGINT', cleanup);
      process.on('SIGTERM', cleanup);

      // Keep process event loop alive indefinitely until Ctrl+C
      await new Promise(() => {});
    } catch (err: any) {
      p.log.error(`Direct launch failed: ${err.message}`);
      p.closeReadlineInterface();
      process.exit(1);
    }
  }

  if (process.argv.includes('--test')) {
    p.log.success('TUI standalone runner initialized successfully in test mode.');
    p.log.message(`Installed apps: ${appManager.list().map((a) => a.appId).join(', ')}`);
    p.log.message(`Mounted AI tools: ${toolSink.listTools().map((t) => t.name).join(', ')}`);
    p.outro('Self-test complete.');
    p.closeReadlineInterface();
    return;
  }

  if (process.argv.includes('--demo') || process.argv.includes('--non-interactive')) {
    p.intro('\x1b[35m⚡ ELIX OS App Bridge — Automated E2E Demo Mode\x1b[0m');

    // 1. Install fixtures/com.elix.fakeapp
    const fixtureDir = path.join(PACKAGE_ROOT, 'fixtures', 'com.elix.fakeapp');
    const fakeZip = path.join(elixDir, 'app-staging', 'com.elix.fakeapp.elixapp');
    if (fs.existsSync(fixtureDir)) {
      packageDemoApp(fixtureDir, fakeZip);
    }
    const installTarget = fs.existsSync(fakeZip) ? fakeZip : fixtureDir;
    const installed = await appManager.install(installTarget, { force: true, skipConsent: true });
    p.log.success(`[Step 1/5] Successfully installed '${installed.manifest.name}' (${installed.manifest.id})`);

    // 2. Open window for com.elix.fakeapp
    const win = await appManager.launch('com.elix.fakeapp');
    p.log.success(`[Step 2/5] Successfully opened window for '${win.appId}' (Window ID: ${win.id}, Geometry: ${win.geometry.width}x${win.geometry.height})`);

    // 3. Execute dynamic tool call app_com_elix_fakeapp_ping with {}
    const pingTool = toolSink.getTool('app_com_elix_fakeapp_ping');
    let toolResult: any;
    if (pingTool) {
      toolResult = await pingTool.execute({});
    } else {
      toolResult = await appManager.sendToolCall('com.elix.fakeapp', 'ping', {});
    }
    p.log.success(`[Step 3/5] Successfully executed tool 'app_com_elix_fakeapp_ping':\n${JSON.stringify(toolResult, null, 2)}`);

    // 4. Close window
    await appManager.close('com.elix.fakeapp');
    p.log.success(`[Step 4/5] Successfully closed window for 'com.elix.fakeapp'`);

    // 5. Exit cleanly with exit code 0
    p.log.success(`[Step 5/5] All automated demo steps verified successfully!`);
    p.outro('Automated demo execution finished with exit code 0.');
    p.closeReadlineInterface();
    return;
  }

  let running = true;

  while (running) {
    const installed = appManager.list('all');
    const active = appManager.list('running');
    const registeredTools = toolSink.listTools();

    p.log.info(
      `Status: \x1b[32m${installed.length} Installed\x1b[0m | \x1b[36m${active.length} Running\x1b[0m | \x1b[35m${registeredTools.length} AI Tools Mounted\x1b[0m`
    );

    const action = await p.select({
      message: 'Select Action:',
      options: [
        { value: 'list', label: '1. List Installed Apps (get_app_list)', hint: 'Query all / running apps' },
        { value: 'inspect', label: '2. Inspect .ELIXAPP Package', hint: 'Inspect manifest & permissions' },
        { value: 'open', label: '3. Open Floating App Window (open_app)', hint: 'Launch frameless window' },
        { value: 'call', label: '4. Execute Dynamic Tool Call', hint: 'Invoke app capability via AI bridge' },
        { value: 'install', label: '5. Install .ELIXAPP Package (install_elix_app)', hint: 'Install bundle from path' },
        { value: 'build_demos', label: '6. Rebuild & Reinstall Demo Apps', hint: 'Refresh Notes, Calculator & FakeApp' },
        { value: 'policy', label: '7. Manage App Permissions & Capabilities', hint: 'View / toggle policies' },
        { value: 'repair', label: '8. Repair Installed Application', hint: 'Verify and re-mount tools' },
        { value: 'uninstall', label: '9. Uninstall Application (Safe Data Retention)', hint: 'Impact plan & uninstall' },
        { value: 'close', label: '10. Close App Window (close_app)', hint: 'Close active window' },
        { value: 'exit', label: '11. Exit Test Runner', hint: 'Quit TUI' },
      ],
    });

    if (p.isCancel(action) || action === 'exit') {
      running = false;
      break;
    }

    switch (action) {
      case 'list': {
        const filterChoice = await p.select({
          message: 'Filter apps by:',
          options: [
            { value: 'all', label: 'All Installed Apps' },
            { value: 'running', label: 'Only Currently Running Windows' },
            { value: 'installed', label: 'Only Idle / Installed' },
          ],
        });

        if (p.isCancel(filterChoice)) break;

        const result = await getAppListTool.execute({ filter: filterChoice as any });
        p.log.step(`Installed ELIX Applications (${result.count}):`);

        if (result.apps.length === 0) {
          p.log.message('  No applications matched the filter.');
        } else {
          for (const app of result.apps) {
            const statusIcon = app.status === 'running' ? '🟢 [RUNNING]' : '⚪ [IDLE]';
            p.log.message(`  \x1b[1m${app.name}\x1b[0m (${app.appId}) v${app.version} ${statusIcon}`);
            p.log.message(`    Description: ${app.description}`);
            p.log.message(`    Capabilities: ${app.capabilities.join(', ') || 'none'} (${app.mountedToolsCount || app.capabilities.length} mounted)`);
            p.log.message(`    Permissions: ${app.permissions.join(', ') || 'sandbox'}`);
            if (app.windowId) p.log.message(`    Active Window ID: ${app.windowId}`);
            if (app.url) p.log.message(`    Window URL: ${app.url}`);
          }
        }
        break;
      }

      case 'inspect': {
        const pkgInput = await p.text({
          message: 'Enter path to .elixapp archive or directory to inspect:',
          placeholder: 'e.g. demo-apps/com.elix.notes or demo-apps/com.elix.calculator',
        });

        if (p.isCancel(pkgInput) || !pkgInput.trim()) break;

        const s = p.spinner();
        s.start(`Inspecting package '${pkgInput}'...`);

        try {
          const inspected = await appManager.inspectPackage(pkgInput.trim());
          s.stop(`Inspection report for '${inspected.name}' (${inspected.appId}):`);
          const authorName = typeof inspected.author === 'string' ? inspected.author : inspected.author?.name || 'Unknown';
          p.log.message(`  Version: ${inspected.version} | Author: ${authorName}`);
          p.log.message(`  Description: ${inspected.description}`);
          p.log.message(`  Requested Permissions (${inspected.permissions.length}):`);
          for (const perm of inspected.permissions) {
            p.log.message(`    - ${perm.permission}: ${perm.label} (${perm.sensitive ? 'Elevated' : 'Standard'})`);
          }
          p.log.message(`  Exported Capabilities (${inspected.capabilities.length}):`);
          for (const cap of inspected.capabilities) {
            p.log.message(`    - ${cap.name}: ${cap.description}`);
          }
        } catch (err: any) {
          s.stop(`Inspection failed: ${err.message}`);
        }
        break;
      }

      case 'open': {
        const apps = appManager.list('all');
        if (apps.length === 0) {
          p.log.warn('No applications installed.');
          break;
        }

        p.log.step(`Installed Applications (${apps.length}):`);
        apps.forEach((a, idx) => {
          console.log(`  [${idx + 1}] ${a.name} (${a.appId}) \x1b[90mv${a.version}\x1b[0m`);
        });

        let selectedAppId: string | null = null;
        while (!selectedAppId && running) {
          const answer = await p.askQuestion(`Select app to launch (1-${apps.length}) or 'q' to cancel: `);
          const trimmed = answer.trim();
          if (!trimmed) {
            p.log.warn('Please enter a valid option number.');
            continue;
          }
          if (trimmed.toLowerCase() === 'q' || trimmed.toLowerCase() === 'cancel') {
            break;
          }
          const num = parseInt(trimmed, 10);
          if (!isNaN(num) && num >= 1 && num <= apps.length) {
            selectedAppId = apps[num - 1]!.appId;
            break;
          }
          p.log.warn(`Invalid choice "${trimmed}". Please select a number between 1 and ${apps.length}.`);
        }

        if (!selectedAppId) break;

        const s = p.spinner();
        s.start(`Launching window for '${selectedAppId}'...`);

        try {
          const res = await openAppTool.execute({ appId: selectedAppId });
          s.stop(`Window launched successfully! [Window ID: ${res.windowId}]`);
          p.log.info(`Geometry: ${res.geometry.width}x${res.geometry.height} | URL: ${res.url}`);
        } catch (err: any) {
          s.stop(`Failed to launch window: ${err.message}`);
        }
        break;
      }

      case 'call': {
        const tools = toolSink.listTools();
        const appTools = tools.filter((t) => t.name.startsWith('app_'));

        if (appTools.length === 0) {
          p.log.warn('No dynamic app capability tools currently registered.');
          break;
        }

        const selectedToolName = await p.select({
          message: 'Select AI Tool to invoke:',
          options: appTools.map((t) => ({
            value: t.name,
            label: t.name,
            hint: t.description.slice(0, 60),
          })),
        });

        if (p.isCancel(selectedToolName)) break;

        const tool = tools.find((t) => t.name === selectedToolName)!;

        // Provide comprehensive sample arguments helper for every tool
        let defaultArgs = '{}';
        if (selectedToolName.includes('create_note')) {
          defaultArgs = JSON.stringify(
            { title: 'AI Research Note', body: 'Autonomous OS Architecture with Hexagonal Ports', tags: ['ai', 'ports'] },
            null,
            2
          );
        } else if (selectedToolName.includes('search_notes')) {
          defaultArgs = JSON.stringify({ query: 'architecture' }, null, 2);
        } else if (selectedToolName.includes('delete_note')) {
          defaultArgs = JSON.stringify({ title: 'AI Research Note' }, null, 2);
        } else if (selectedToolName.includes('calculate')) {
          defaultArgs = JSON.stringify({ expression: '45 * 12 + 100' }, null, 2);
        } else if (selectedToolName.includes('get_history') || selectedToolName.includes('clear_history') || selectedToolName.includes('get_last_result') || selectedToolName.includes('get_active_note')) {
          defaultArgs = '{}';
        } else if (selectedToolName.includes('ping')) {
          defaultArgs = JSON.stringify({ message: 'Hello from ELIX AI bridge' }, null, 2);
        } else if (selectedToolName.includes('set_alarm')) {
          defaultArgs = JSON.stringify({ time: '07:30', label: 'Morning Standup', repeatDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] }, null, 2);
        } else if (selectedToolName.includes('start_timer')) {
          defaultArgs = JSON.stringify({ durationSeconds: 300, label: 'Pomodoro Focus' }, null, 2);
        } else if (selectedToolName.includes('get_world_time')) {
          defaultArgs = JSON.stringify({ timezone: 'America/New_York' }, null, 2);
        } else if (selectedToolName.includes('echo_test')) {
          defaultArgs = JSON.stringify({ text: 'Echo verification signal' }, null, 2);
        } else if (selectedToolName.includes('create_calendar_event')) {
          defaultArgs = JSON.stringify({ title: 'Agent Sync', startTime: '16:00', endTime: '17:30', category: 'work' }, null, 2);
        } else if (selectedToolName.includes('add_smart_task')) {
          defaultArgs = JSON.stringify({ title: 'Deploy microkernel sync tomorrow at 3pm #work !P1', priority: 'P1_URGENT', tags: ['#work'] }, null, 2);
        } else if (selectedToolName.includes('toggle_task_status')) {
          defaultArgs = JSON.stringify({ taskId: 'tsk_1', completed: true }, null, 2);
        } else if (selectedToolName.includes('query_agenda')) {
          defaultArgs = JSON.stringify({ startDate: '2026-08-26', endDate: '2026-08-27' }, null, 2);
        } else if (selectedToolName.includes('convert_units')) {
          defaultArgs = JSON.stringify({ category: 'temperature', fromUnit: 'celsius', toUnit: 'kelvin', value: -273.15 }, null, 2);
        } else if (selectedToolName.includes('generate_qr')) {
          defaultArgs = JSON.stringify({ textPayload: 'https://elix.os', errorCorrectionLevel: 'M', darkColor: '#00a2ff', lightColor: '#090e1a' }, null, 2);
        } else if (selectedToolName.includes('compute_hash')) {
          defaultArgs = JSON.stringify({ content: 'ELIX Microkernel Security Bus', algorithm: 'SHA-256' }, null, 2);
        } else if (selectedToolName.includes('inspect_color')) {
          defaultArgs = JSON.stringify({ colorInput: '#38bdf8', targetFormats: ['HEX', 'RGB', 'HSL'] }, null, 2);
        } else if (selectedToolName.includes('lookup_unicode')) {
          defaultArgs = JSON.stringify({ query: '🦄 👨‍👩‍👧‍👦' }, null, 2);
        } else if (selectedToolName.includes('list_directory')) {
          defaultArgs = JSON.stringify({ path: '/home/elix/Documents', showHidden: false, sortBy: 'name' }, null, 2);
        } else if (selectedToolName.includes('search_files')) {
          defaultArgs = JSON.stringify({ query: 'kernel', rootDirectory: '/home/elix', recursive: true }, null, 2);
        } else if (selectedToolName.includes('inspect_file_metadata')) {
          defaultArgs = JSON.stringify({ targetPath: '/home/elix/README.md' }, null, 2);
        } else if (selectedToolName.includes('manage_archive')) {
          defaultArgs = JSON.stringify({ action: 'compress', sourcePaths: ['/home/elix/Projects'], destinationPath: '/home/elix/backup.zip' }, null, 2);
        } else if (selectedToolName.includes('get_storage_breakdown')) {
          defaultArgs = JSON.stringify({ drivePath: 'C:' }, null, 2);
        } else if (selectedToolName.includes('open_media')) {
          defaultArgs = JSON.stringify({ mediaPath: '/home/elix/videos/demo.mp4', autoPlay: true, initialTimeSeconds: 0 }, null, 2);
        } else if (selectedToolName.includes('control_playback')) {
          defaultArgs = JSON.stringify({ action: 'play' }, null, 2);
        } else if (selectedToolName.includes('inspect_media_info')) {
          defaultArgs = JSON.stringify({ mediaPath: '/home/elix/videos/demo.mp4' }, null, 2);
        } else if (selectedToolName.includes('generate_thumbnail_strip')) {
          defaultArgs = JSON.stringify({ videoPath: '/home/elix/videos/demo.mp4', frameCount: 5 }, null, 2);
        } else if (selectedToolName.includes('set_image_transform')) {
          defaultArgs = JSON.stringify({ zoomLevel: 1.5, rotationDegrees: 90, flipHorizontal: false }, null, 2);
        } else if (selectedToolName.includes('edit_image')) {
          defaultArgs = JSON.stringify({ sourcePath: '/home/elix/photos/sunset.jpg', brightness: 10, contrast: 15, saturation: 20, blur: 0 }, null, 2);
        } else if (selectedToolName.includes('crop_resize')) {
          defaultArgs = JSON.stringify({ sourcePath: '/home/elix/photos/sunset.jpg', cropRect: { x: 0, y: 0, width: 1920, height: 1080 }, targetDimensions: { width: 1280, height: 720 }, maintainAspectRatio: true }, null, 2);
        } else if (selectedToolName.includes('trim_media')) {
          defaultArgs = JSON.stringify({ sourcePath: '/home/elix/videos/clip.mp4', startTimestampSeconds: 5.0, endTimestampSeconds: 25.5, outputFormat: 'mp4' }, null, 2);
        } else if (selectedToolName.includes('convert_format')) {
          defaultArgs = JSON.stringify({ sourcePath: '/home/elix/photos/graphic.png', targetFormat: 'webp', qualityPreset: 'high' }, null, 2);
        } else if (selectedToolName.includes('export_asset')) {
          defaultArgs = JSON.stringify({ destinationPath: '/home/elix/exports/master_render.png', metadataOptions: { colorProfile: 'sRGB' } }, null, 2);
        } else if (selectedToolName.includes('load_model')) {
          defaultArgs = JSON.stringify({ modelPath: '/home/elix/models/suzanne.glb', format: 'glb' }, null, 2);
        } else if (selectedToolName.includes('set_viewport_shading')) {
          defaultArgs = JSON.stringify({ mode: 'wireframe' }, null, 2);
        } else if (selectedToolName.includes('inspect_mesh_stats')) {
          defaultArgs = JSON.stringify({ modelId: 'cyber_torus_01' }, null, 2);
        } else if (selectedToolName.includes('set_environment_lighting')) {
          defaultArgs = JSON.stringify({ preset: 'neon_cyber', intensity: 1.5 }, null, 2);
        } else if (selectedToolName.includes('export_viewport_snapshot')) {
          defaultArgs = JSON.stringify({ resolutionWidth: 1920, resolutionHeight: 1080, transparentBg: true }, null, 2);
        } else if (selectedToolName.includes('open_document')) {
          defaultArgs = JSON.stringify({ filePath: '/home/elix/docs/specs.pdf', format: 'pdf' }, null, 2);
        } else if (selectedToolName.includes('search_document_text')) {
          defaultArgs = JSON.stringify({ query: 'architecture', matchCase: false, regex: false }, null, 2);
        } else if (selectedToolName.includes('get_document_outline')) {
          defaultArgs = JSON.stringify({ documentId: 'specs_doc_01' }, null, 2);
        } else if (selectedToolName.includes('annotate_pdf')) {
          defaultArgs = JSON.stringify({ pageNumber: 1, highlightRect: { x: 50, y: 120, width: 280, height: 24 }, noteText: 'Critical security requirement', color: '#eab308' }, null, 2);
        } else if (selectedToolName.includes('edit_spreadsheet_cell')) {
          defaultArgs = JSON.stringify({ cellCoordinate: 'B2', value: '450.75', formula: '=SUM(B3:B10)' }, null, 2);
        } else if (selectedToolName.includes('export_document')) {
          defaultArgs = JSON.stringify({ targetFormat: 'html', destinationPath: '/home/elix/exports/specs.html' }, null, 2);
        } else if (selectedToolName.includes('capture_screen')) {
          defaultArgs = JSON.stringify({ mode: 'custom_region', regionBounds: { x: 100, y: 100, width: 800, height: 600 }, delaySeconds: 0 }, null, 2);
        } else if (selectedToolName.includes('start_screen_recording')) {
          defaultArgs = JSON.stringify({ captureAudio: true, frameRate: 60, resolutionQuality: '1080p' }, null, 2);
        } else if (selectedToolName.includes('stop_screen_recording')) {
          defaultArgs = JSON.stringify({ saveFormat: 'mp4', destinationPath: '/home/elix/videos/screencast.mp4' }, null, 2);
        } else if (selectedToolName.includes('apply_annotation')) {
          defaultArgs = JSON.stringify({ tool: 'arrow', coordinates: { x1: 50, y1: 50, x2: 250, y2: 200 }, styling: { color: '#00a2ff', strokeWidth: 3 } }, null, 2);
        } else if (selectedToolName.includes('get_capture_history')) {
          defaultArgs = JSON.stringify({ limit: 10, filterType: 'all' }, null, 2);
        } else if (selectedToolName.includes('take_photo')) {
          defaultArgs = JSON.stringify({ cameraDeviceId: 'default_camera', flashEffect: true, countdownSeconds: 0, filterPreset: 'natural' }, null, 2);
        } else if (selectedToolName.includes('start_video_recording')) {
          defaultArgs = JSON.stringify({ cameraDeviceId: 'default_camera', audioDeviceId: 'default_mic', resolution: '1080p', fps: 60 }, null, 2);
        } else if (selectedToolName.includes('stop_video_recording')) {
          defaultArgs = JSON.stringify({ saveFormat: 'mp4', destinationPath: '/home/elix/videos/rec_001.mp4' }, null, 2);
        } else if (selectedToolName.includes('record_audio_clip')) {
          defaultArgs = JSON.stringify({ durationSeconds: 5, sampleRate: 48000, audioDeviceId: 'default_mic' }, null, 2);
        } else if (selectedToolName.includes('list_capture_devices')) {
          defaultArgs = JSON.stringify({ deviceTypeFilter: 'all' }, null, 2);
        } else if (selectedToolName.includes('toggle_teleprompter')) {
          defaultArgs = JSON.stringify({ active: true, textScript: 'ELIX OS 2.0 Live Studio Teleprompter', scrollSpeed: 1.5 }, null, 2);
        } else if (selectedToolName.includes('spawn_shell_session')) {
          defaultArgs = JSON.stringify({ shellType: 'powershell', workingDirectory: 'C:\\Users\\elix', sessionId: 'sess-terminal-001' }, null, 2);
        } else if (selectedToolName.includes('execute_command')) {
          defaultArgs = JSON.stringify({ sessionId: 'sess-terminal-001', commandString: 'Get-Process | Select-Object -First 5', runInBackground: false }, null, 2);
        } else if (selectedToolName.includes('send_terminal_input')) {
          defaultArgs = JSON.stringify({ sessionId: 'sess-terminal-001', inputData: 'y\n', sendInterrupt: false }, null, 2);
        } else if (selectedToolName.includes('get_session_output')) {
          defaultArgs = JSON.stringify({ sessionId: 'sess-terminal-001', lineLimit: 50 }, null, 2);
        } else if (selectedToolName.includes('kill_session')) {
          defaultArgs = JSON.stringify({ sessionId: 'sess-terminal-001', force: true }, null, 2);
        } else if (selectedToolName.includes('list_active_sessions')) {
          defaultArgs = JSON.stringify({}, null, 2);
        } else if (selectedToolName.includes('open_code_file')) {
          defaultArgs = JSON.stringify({ filePath: 'src/main.ts', language: 'typescript', lineFocus: 1 }, null, 2);
        } else if (selectedToolName.includes('save_code_file')) {
          defaultArgs = JSON.stringify({ filePath: 'src/main.ts', content: 'console.log("Hello ELIX");' }, null, 2);
        } else if (selectedToolName.includes('format_document')) {
          defaultArgs = JSON.stringify({ content: '{"name":"elix","status":"active"}', language: 'json' }, null, 2);
        } else if (selectedToolName.includes('get_git_diff')) {
          defaultArgs = JSON.stringify({ repoPath: '.', stagedOnly: false }, null, 2);
        } else if (selectedToolName.includes('inspect_database_table')) {
          defaultArgs = JSON.stringify({ dbPath: 'data/app.db', tableName: 'users', limit: 20, offset: 0 }, null, 2);
        } else if (selectedToolName.includes('execute_sql_query')) {
          defaultArgs = JSON.stringify({ dbPath: 'data/app.db', query: 'SELECT * FROM users LIMIT 10;' }, null, 2);
        } else if (selectedToolName.includes('get_system_metrics')) {
          defaultArgs = JSON.stringify({ includePerCoreCpu: true, includeGpu: true }, null, 2);
        } else if (selectedToolName.includes('list_processes')) {
          defaultArgs = JSON.stringify({ sortBy: 'cpu', sortOrder: 'desc', limit: 20 }, null, 2);
        } else if (selectedToolName.includes('kill_process')) {
          defaultArgs = JSON.stringify({ pid: 1234, force: false }, null, 2);
        } else if (selectedToolName.includes('get_disk_io_stats')) {
          defaultArgs = JSON.stringify({}, null, 2);
        } else if (selectedToolName.includes('get_network_io_stats')) {
          defaultArgs = JSON.stringify({}, null, 2);
        } else if (selectedToolName.includes('get_system_overview')) {
          defaultArgs = JSON.stringify({}, null, 2);
        } else if (selectedToolName.includes('scan_bluetooth_devices')) {
          defaultArgs = JSON.stringify({ timeoutSeconds: 5 }, null, 2);
        } else if (selectedToolName.includes('toggle_bluetooth_state')) {
          defaultArgs = JSON.stringify({ enabled: true, targetDeviceId: 'bt-01', action: 'connect' }, null, 2);
        } else if (selectedToolName.includes('scan_wifi_networks')) {
          defaultArgs = JSON.stringify({ forceRefresh: true }, null, 2);
        } else if (selectedToolName.includes('configure_display')) {
          defaultArgs = JSON.stringify({ displayId: 'disp-1', resolution: { width: 3840, height: 2160 }, refreshRateHz: 144, scaleFactor: 1.5, orientation: 'landscape' }, null, 2);
        } else if (selectedToolName.includes('set_audio_device')) {
          defaultArgs = JSON.stringify({ deviceType: 'output', deviceId: 'audio-out-01', volumeLevel: 80, isMuted: false }, null, 2);
        } else if (selectedToolName.includes('get_battery_diagnostics')) {
          defaultArgs = JSON.stringify({}, null, 2);
        } else if (selectedToolName.includes('list_connected_peripherals')) {
          defaultArgs = JSON.stringify({}, null, 2);
        } else if (selectedToolName.includes('get_system_settings')) {
          defaultArgs = JSON.stringify({ categoryFilter: 'all' }, null, 2);
        } else if (selectedToolName.includes('update_setting')) {
          defaultArgs = JSON.stringify({ key: 'appearance.accentColor', value: '#38bdf8', category: 'appearance' }, null, 2);
        } else if (selectedToolName.includes('reset_settings_category')) {
          defaultArgs = JSON.stringify({ category: 'appearance' }, null, 2);
        } else if (selectedToolName.includes('manage_permissions')) {
          defaultArgs = JSON.stringify({ appId: 'com.elix.notes', permissionType: 'camera', granted: true }, null, 2);
        } else if (selectedToolName.includes('clear_system_caches')) {
          defaultArgs = JSON.stringify({ targetCaches: ['app_cache', 'logs'] }, null, 2);
        } else if (selectedToolName.includes('export_configuration')) {
          defaultArgs = JSON.stringify({ destinationPath: 'backup-config.json', encryptWithPassword: false }, null, 2);
        } else if (selectedToolName.includes('list_installed_apps')) {
          defaultArgs = JSON.stringify({ includeSystemApps: true, filterCategory: 'all' }, null, 2);
        } else if (selectedToolName.includes('search_store_catalog')) {
          defaultArgs = JSON.stringify({ query: 'studio', category: 'media', sortBy: 'popular' }, null, 2);
        } else if (selectedToolName.includes('install_elixapp')) {
          defaultArgs = JSON.stringify({ packagePathOrUrl: 'packages/com.elix.notes.elixapp', autoGrantPermissions: true, verifySignature: true }, null, 2);
        } else if (selectedToolName.includes('uninstall_elixapp')) {
          defaultArgs = JSON.stringify({ packageId: 'com.elix.fakeapp', purgeAppData: false }, null, 2);
        } else if (selectedToolName.includes('check_for_updates')) {
          defaultArgs = JSON.stringify({ packageIds: [] }, null, 2);
        } else if (selectedToolName.includes('inspect_package_manifest')) {
          defaultArgs = JSON.stringify({ packageIdOrBundlePath: 'com.elix.notes' }, null, 2);
        } else if (selectedToolName.includes('query_universal_index')) {
          defaultArgs = JSON.stringify({ searchQuery: 'ELIX Code', scopeFilter: 'all', maxResults: 20 }, null, 2);
        } else if (selectedToolName.includes('execute_action_shortcut')) {
          defaultArgs = JSON.stringify({ actionId: 'toggle_dark_mode', targetAppId: 'com.elix.settings', parameters: {} }, null, 2);
        } else if (selectedToolName.includes('evaluate_quick_calculation')) {
          defaultArgs = JSON.stringify({ expressionString: '254 * 1.18' }, null, 2);
        } else if (selectedToolName.includes('rebuild_search_index')) {
          defaultArgs = JSON.stringify({ targetDataSources: ['apps', 'files', 'settings'] }, null, 2);
        } else if (selectedToolName.includes('get_recent_searches')) {
          defaultArgs = JSON.stringify({ limit: 10 }, null, 2);
        } else if (selectedToolName.includes('list_active_agents')) {
          defaultArgs = JSON.stringify({ statusFilter: 'all' }, null, 2);
        } else if (selectedToolName.includes('spawn_agent_run')) {
          defaultArgs = JSON.stringify({ goalPrompt: 'Analyze test suite coverage', assignedModel: 'claude-3-5-sonnet', enabledMcpServers: ['fs-bridge'], maxBudgetTokens: 10000, autoApprovalLevel: 'auto_read' }, null, 2);
        } else if (selectedToolName.includes('query_mcp_servers')) {
          defaultArgs = JSON.stringify({ includeSchemas: true, healthCheck: true }, null, 2);
        } else if (selectedToolName.includes('toggle_mcp_server')) {
          defaultArgs = JSON.stringify({ serverId: 'fs-bridge', action: 'restart' }, null, 2);
        } else if (selectedToolName.includes('inspect_memory_vectors')) {
          defaultArgs = JSON.stringify({ query: 'database schema', collectionName: 'code_base', topK: 5, minSimilarityScore: 0.8 }, null, 2);
        } else if (selectedToolName.includes('get_token_telemetry')) {
          defaultArgs = JSON.stringify({ timeWindow: '24h', groupBy: 'model' }, null, 2);
        }

        const inputJson = await p.text({
          message: `Enter JSON arguments for '${selectedToolName}':`,
          initialValue: defaultArgs,
          validate: (val: string) => {
            try {
              JSON.parse(val);
              return;
            } catch {
              return 'Invalid JSON syntax';
            }
          },
        });

        if (p.isCancel(inputJson)) break;

        const parsedArgs = JSON.parse(inputJson);
        const s = p.spinner();
        s.start(`Executing tool '${selectedToolName}'...`);
        const startTime = Date.now();

        try {
          let capName = selectedToolName;
          let targetAppId = 'unknown';
          if (selectedToolName.startsWith('app_')) {
            const rest = selectedToolName.slice(4);
            const installedIds = appManager.list('all').map((a) => a.appId).sort((a, b) => b.length - a.length);
            const matched = installedIds.find((id) => rest.startsWith(id.replace(/\./g, '_') + '_'));
            if (matched) {
              targetAppId = matched;
              capName = rest.slice(matched.replace(/\./g, '_').length + 1);
            } else {
              const parts = rest.split('_');
              capName = parts.pop() || selectedToolName;
              targetAppId = parts.join('.');
            }
          }

          const result = await tool.execute(parsedArgs);
          const elapsed = Date.now() - startTime;
          s.stop(`Tool executed in ${elapsed}ms! Result:`);
          console.log('\x1b[32m' + JSON.stringify(result, null, 2) + '\x1b[0m');

          // Send payload to open windows
          broadcastToolResult({
            type: 'TOOL_INVOKED',
            tool: selectedToolName,
            capability: capName,
            appId: targetAppId,
            args: parsedArgs,
            payload: parsedArgs,
            result: result,
          });
        } catch (err: any) {
          s.stop(`Tool execution failed: ${err.message}`);
        }
        break;
      }

      case 'install': {
        const packagePathInput = await p.text({
          message: 'Enter path to .elixapp archive or directory bundle:',
          placeholder: 'e.g. fixtures/com.elix.fakeapp or demo-apps/com.elix.notes',
        });

        if (p.isCancel(packagePathInput) || !packagePathInput.trim()) break;
        const targetPkgPath = packagePathInput.trim();

        const s = p.spinner();
        s.start(`Inspecting package '${targetPkgPath}'...`);

        try {
          const inspected = await appManager.inspectPackage(targetPkgPath);
          s.stop(`Package verified: '${inspected.name}' (${inspected.appId}) v${inspected.version}`);
          
          p.log.step(`Package Manifest Overview:`);
          p.log.message(`  Description: ${inspected.description}`);
          p.log.message(`  Requested Permissions: ${inspected.permissions.map((p) => p.permission).join(', ') || 'none'}`);
          p.log.message(`  Exported Capabilities: ${inspected.capabilities.map((c) => c.name).join(', ') || 'none'}`);

          const installSpinner = p.spinner();
          installSpinner.start(`Installing '${inspected.name}'...`);
          const installedApp = await appManager.install(targetPkgPath, { force: true, skipConsent: true });
          installSpinner.stop(`Application '${installedApp.manifest.name}' installed successfully!`);
          p.log.info(`Binaries deployed to: ${installedApp.installPath}`);

          // Post-install launch prompt
          const shouldLaunch = await p.confirm({
            message: `Launch App Window for '${installedApp.manifest.name}' now?`,
            initialValue: true,
          });

          if (!p.isCancel(shouldLaunch) && shouldLaunch) {
            const launchSpinner = p.spinner();
            launchSpinner.start(`Launching window for '${installedApp.manifest.id}'...`);
            const win = await appManager.launch(installedApp.manifest.id);
            launchSpinner.stop(`Window active! ID: ${win.id}`);
            p.log.message(`  State: ${win.state}`);
            p.log.message(`  Geometry: ${win.geometry.width}x${win.geometry.height} (Frameless: ${win.manifest.window?.frame === false})`);
            p.log.message(`  Window URL: ${win.url}`);
          }
        } catch (err: any) {
          s.stop(`Installation failed: ${err.message}`);
        }
        break;
      }

      case 'build_demos': {
        const s = p.spinner();
        s.start('Rebuilding and packaging reference demo applications (Notes, Calculator & FakeApp)...');

        try {
          await appManager.rebuildDemoApps();
          s.stop('Demo applications successfully rebuilt and synchronized to ~/.elix/apps/!');
        } catch (err: any) {
          s.stop(`Rebuild failed: ${err.message}`);
        }
        break;
      }

      case 'policy': {
        const apps = appManager.list('all');
        if (apps.length === 0) {
          p.log.warn('No applications installed.');
          break;
        }

        const selectedApp = await p.select({
          message: 'Select app to manage policies & permissions:',
          options: apps.map((a) => ({ value: a.appId, label: a.name, hint: a.appId })),
        });

        if (p.isCancel(selectedApp)) break;

        const policyAction = await p.select({
          message: `Select policy action for '${selectedApp}':`,
          options: [
            { value: 'view', label: '1. View Current Permissions & Capabilities' },
            { value: 'toggle_perm', label: '2. Grant / Revoke a Permission' },
            { value: 'toggle_cap', label: '3. Enable / Disable a Capability' },
          ],
        });

        if (p.isCancel(policyAction)) break;

        if (policyAction === 'view') {
          const perms = appManager.getPermissions(selectedApp);
          const caps = appManager.getCapabilities(selectedApp);
          p.log.step(`Policies for '${selectedApp}':`);
          p.log.message(`  Active Permissions: ${perms.join(', ') || 'None'}`);
          p.log.message(`  Capabilities: ${caps.map((c) => c.name).join(', ') || 'None'}`);
        } else if (policyAction === 'toggle_perm') {
          const perms = appManager.getPermissions(selectedApp);
          const permToToggle = await p.text({
            message: 'Enter permission to grant / revoke (e.g. clipboard:read, storage, fs:write):',
            placeholder: 'clipboard:read',
          });
          if (p.isCancel(permToToggle) || !permToToggle.trim()) break;
          const targetPerm = permToToggle.trim();
          const isCurrentlyGranted = perms.includes(targetPerm);
          const newStatus = !isCurrentlyGranted;
          appManager.setPermission(selectedApp, targetPerm, newStatus);
          p.log.success(`Permission '${targetPerm}' is now ${newStatus ? 'GRANTED' : 'REVOKED'} for '${selectedApp}'.`);
        } else if (policyAction === 'toggle_cap') {
          const caps = appManager.getCapabilities(selectedApp);
          if (caps.length === 0) {
            p.log.warn('No capabilities found on app manifest.');
            break;
          }
          const capChoice = await p.select({
            message: 'Select capability to toggle:',
            options: caps.map((c) => ({ value: c.name, label: c.name, hint: c.description })),
          });
          if (p.isCancel(capChoice)) break;
          const enableChoice = await p.confirm({
            message: `Enable capability '${capChoice}'?`,
            initialValue: true,
          });
          if (p.isCancel(enableChoice)) break;
          appManager.setCapability(selectedApp, capChoice, enableChoice);
          p.log.success(`Capability '${capChoice}' set to ${enableChoice ? 'ENABLED' : 'DISABLED'}.`);
        }
        break;
      }

      case 'repair': {
        const apps = appManager.list('all');
        if (apps.length === 0) {
          p.log.warn('No applications installed.');
          break;
        }

        const appToRepair = await p.select({
          message: 'Select app to repair:',
          options: apps.map((a) => ({ value: a.appId, label: a.name, hint: a.appId })),
        });

        if (p.isCancel(appToRepair)) break;

        const s = p.spinner();
        s.start(`Repairing application '${appToRepair}'...`);

        try {
          const repaired = await appManager.repair(appToRepair);
          s.stop(`Application '${repaired.manifest.name}' repaired successfully!`);
        } catch (err: any) {
          s.stop(`Repair failed: ${err.message}`);
        }
        break;
      }

      case 'uninstall': {
        const apps = appManager.list('all');
        if (apps.length === 0) {
          p.log.warn('No applications installed to uninstall.');
          break;
        }

        const appToUninstall = await p.select({
          message: 'Select app to uninstall:',
          options: apps.map((a) => ({ value: a.appId, label: a.name, hint: `v${a.version}` })),
        });

        if (p.isCancel(appToUninstall)) break;

        // Show Impact Plan
        const plan = await appManager.prepareUninstall(appToUninstall);
        p.log.step(`Uninstall Impact Plan for '${plan.name}' (${plan.appId}):`);
        p.log.message(`  Is Running: ${plan.isRunning ? 'Yes (Window will be closed)' : 'No'}`);
        p.log.message(`  Binaries Size: ${(plan.storage.binSizeBytes / 1024).toFixed(1)} KB`);
        p.log.message(`  Persistent User Data Size: ${(plan.storage.dataSizeBytes / 1024).toFixed(1)} KB`);
        p.log.message(`  Tools to Unmount: ${plan.registeredToolsCount}`);

        const keepDataChoice = await p.confirm({
          message: 'Preserve persistent user data in app-data/ ?',
          initialValue: true,
        });

        if (p.isCancel(keepDataChoice)) break;

        const s = p.spinner();
        s.start(`Uninstalling '${plan.name}'...`);

        try {
          await appManager.uninstall(appToUninstall, { keepData: keepDataChoice });
          s.stop(`Application '${plan.name}' uninstalled successfully! (Data preserved: ${keepDataChoice})`);
        } catch (err: any) {
          s.stop(`Uninstall failed: ${err.message}`);
        }
        break;
      }

      case 'close': {
        const activeWins = appManager.windowHost.listWindows();
        if (activeWins.length === 0) {
          p.log.warn('No active application windows currently open.');
          break;
        }

        const winToClose = await p.select({
          message: 'Select window to close:',
          options: activeWins.map((w) => ({
            value: w.appId,
            label: `${w.title} (${w.appId})`,
            hint: `ID: ${w.id}`,
          })),
        });

        if (p.isCancel(winToClose)) break;

        const s = p.spinner();
        s.start(`Closing window for '${winToClose}'...`);
        const res = await closeAppTool.execute({ appId: winToClose });
        s.stop(res.message);
        break;
      }
    }

    console.log('');
  }

  // Cleanup active windows on exit
  const openWindows = appManager.windowHost.listWindows();
  for (const win of openWindows) {
    const winPid = (win as any)?.pid;
    if (winPid && process.platform === 'win32') {
      try {
        child_process.execSync(`taskkill /F /PID ${winPid}`, { stdio: 'ignore' });
      } catch {}
    }
    await appManager.close(win.appId).catch(() => {});
  }

  if (globalThis.__ELIX_WSS__) {
    try {
      await globalThis.__ELIX_WSS__.close();
      globalThis.__ELIX_WSS__ = undefined;
    } catch {}
  }

  p.closeReadlineInterface();
  p.outro('ELIX OS App Bridge session ended.');
}

// Auto-run if executed directly
if (process.argv[1] && (process.argv[1].endsWith('test-harness.ts') || process.argv[1].endsWith('test-harness.js'))) {
  runTui()
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error('Fatal TUI error:', err);
      process.exit(1);
    });
}
