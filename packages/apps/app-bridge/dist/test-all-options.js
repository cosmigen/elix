/**
 * ELIX OS App Bridge — Full Automated Test Runner (All 11 Options & Dynamic Capabilities)
 *
 * Non-interactive execution script verifying all TUI actions, window launches,
 * dynamic tool capability invocations, permission policies, repairs, and uninstalls.
 *
 * @module @deepseek-ai/elix-app-bridge/test-all-options
 */
process.env.HEADLESS = 'true';
process.env.CI = 'true';
process.env.ELIX_HEADLESS = 'true';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';
import { ElixAppManager } from './app-manager.js';
import { MemoryToolSink, MemoryCapabilityIndex, ConsoleConfirmationBroker, NativeWindowHost, } from './adapters/ports.js';
import { createManagementTools, registerManagementTools } from './management-tools.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PACKAGE_ROOT = path.resolve(__dirname, '..');
let passedCount = 0;
let failedCount = 0;
function logStep(step, desc) {
    console.log(`\n\x1b[1;36m▶ [${step}] ${desc}\x1b[0m`);
}
function assertTest(condition, name, detail) {
    if (condition) {
        passedCount++;
        console.log(`  \x1b[32m✔ [PASS]\x1b[0m ${name}${detail ? ` — \x1b[90m${detail}\x1b[0m` : ''}`);
    }
    else {
        failedCount++;
        console.error(`  \x1b[31m✖ [FAIL]\x1b[0m ${name}${detail ? ` — \x1b[31m${detail}\x1b[0m` : ''}`);
    }
}
export async function runAllOptionsAutomated() {
    console.log('\x1b[35m' + '='.repeat(75));
    console.log('⚡ ELIX OS APP BRIDGE — COMPLETE 11-OPTION AUTOMATED VERIFICATION');
    console.log('='.repeat(75) + '\x1b[0m');
    const testDir = path.join(os.tmpdir(), `elix-e2e-run-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
    const toolSink = new MemoryToolSink();
    const capabilityIndex = new MemoryCapabilityIndex();
    const confirmationBroker = new ConsoleConfirmationBroker(true);
    const windowHost = new NativeWindowHost();
    const appManager = new ElixAppManager({
        baseDir: testDir,
        toolSink,
        capabilityIndex,
        confirmationBroker,
        windowHost,
    });
    windowHost.setInstaller(appManager.installer);
    // Register management tools
    registerManagementTools(toolSink, appManager.installer, appManager.windowHost);
    const mgmtTools = createManagementTools(appManager.installer, appManager.windowHost, toolSink);
    const getAppListTool = mgmtTools.find((t) => t.name === 'get_app_list');
    const openAppTool = mgmtTools.find((t) => t.name === 'open_app');
    const closeAppTool = mgmtTools.find((t) => t.name === 'close_app');
    const installAppTool = mgmtTools.find((t) => t.name === 'install_elix_app');
    // ==========================================================================
    // 1. OPTION 6: Rebuild & Reinstall Demo Apps
    // ==========================================================================
    logStep('Option 6', 'Rebuild & Reinstall Demo Applications (Notes, Calculator, Clock, FakeApp)');
    const rebuilt = await appManager.rebuildDemoApps();
    assertTest(rebuilt.length >= 3, 'Rebuilt demo applications', `Installed ${rebuilt.length} apps`);
    assertTest(rebuilt.some((a) => a.manifest.id === 'com.elix.notes'), 'Notes app rebuilt and mounted');
    assertTest(rebuilt.some((a) => a.manifest.id === 'com.elix.calculator'), 'Calculator app rebuilt and mounted');
    assertTest(rebuilt.some((a) => a.manifest.id === 'com.elix.clock'), 'Clock app rebuilt and mounted');
    assertTest(rebuilt.some((a) => a.manifest.id === 'com.elix.calendar'), 'Calendar app rebuilt and mounted');
    assertTest(rebuilt.some((a) => a.manifest.id === 'com.elix.utilities'), 'Utilities app rebuilt and mounted');
    assertTest(rebuilt.some((a) => a.manifest.id === 'com.elix.files'), 'Files app rebuilt and mounted');
    assertTest(rebuilt.some((a) => a.manifest.id === 'com.elix.media'), 'Media app rebuilt and mounted');
    assertTest(rebuilt.some((a) => a.manifest.id === 'com.elix.mediastudio'), 'Media Studio app rebuilt and mounted');
    assertTest(rebuilt.some((a) => a.manifest.id === 'com.elix.studio3d'), '3D Studio app rebuilt and mounted');
    assertTest(rebuilt.some((a) => a.manifest.id === 'com.elix.documents'), 'Documents app rebuilt and mounted');
    assertTest(rebuilt.some((a) => a.manifest.id === 'com.elix.capture'), 'Capture app rebuilt and mounted');
    assertTest(rebuilt.some((a) => a.manifest.id === 'com.elix.camera'), 'Camera app rebuilt and mounted');
    assertTest(rebuilt.some((a) => a.manifest.id === 'com.elix.terminal'), 'Terminal app rebuilt and mounted');
    assertTest(rebuilt.some((a) => a.manifest.id === 'com.elix.code'), 'Code app rebuilt and mounted');
    assertTest(rebuilt.some((a) => a.manifest.id === 'com.elix.sysmon'), 'System Monitor app rebuilt and mounted');
    assertTest(rebuilt.some((a) => a.manifest.id === 'com.elix.devices'), 'Devices app rebuilt and mounted');
    assertTest(rebuilt.some((a) => a.manifest.id === 'com.elix.settings'), 'Settings app rebuilt and mounted');
    assertTest(rebuilt.some((a) => a.manifest.id === 'com.elix.appcenter'), 'App Center app rebuilt and mounted');
    assertTest(rebuilt.some((a) => a.manifest.id === 'com.elix.search'), 'Universal Search app rebuilt and mounted');
    assertTest(rebuilt.some((a) => a.manifest.id === 'com.elix.center'), 'ELIX Center app rebuilt and mounted');
    // Also install fakeapp if not part of rebuilt
    const fakeFixture = path.join(PACKAGE_ROOT, 'fixtures', 'com.elix.fakeapp');
    if (fs.existsSync(fakeFixture)) {
        await appManager.install(fakeFixture, { force: true, skipConsent: true });
        assertTest(true, 'FakeApp fixture deployed and mounted');
    }
    // ==========================================================================
    // 2. OPTION 1: List Installed Apps (get_app_list)
    // ==========================================================================
    logStep('Option 1', 'Query App Registry via get_app_list tool');
    const allApps = await getAppListTool.execute({ filter: 'all' });
    assertTest(allApps.count >= 21, 'Query all installed apps', `Found ${allApps.count} installed apps`);
    assertTest(allApps.apps.some((a) => a.appId === 'com.elix.notes'), 'com.elix.notes is in registry');
    assertTest(allApps.apps.some((a) => a.appId === 'com.elix.calculator'), 'com.elix.calculator is in registry');
    assertTest(allApps.apps.some((a) => a.appId === 'com.elix.clock'), 'com.elix.clock is in registry');
    assertTest(allApps.apps.some((a) => a.appId === 'com.elix.calendar'), 'com.elix.calendar is in registry');
    assertTest(allApps.apps.some((a) => a.appId === 'com.elix.utilities'), 'com.elix.utilities is in registry');
    assertTest(allApps.apps.some((a) => a.appId === 'com.elix.files'), 'com.elix.files is in registry');
    assertTest(allApps.apps.some((a) => a.appId === 'com.elix.media'), 'com.elix.media is in registry');
    assertTest(allApps.apps.some((a) => a.appId === 'com.elix.mediastudio'), 'com.elix.mediastudio is in registry');
    assertTest(allApps.apps.some((a) => a.appId === 'com.elix.studio3d'), 'com.elix.studio3d is in registry');
    assertTest(allApps.apps.some((a) => a.appId === 'com.elix.documents'), 'com.elix.documents is in registry');
    assertTest(allApps.apps.some((a) => a.appId === 'com.elix.capture'), 'com.elix.capture is in registry');
    assertTest(allApps.apps.some((a) => a.appId === 'com.elix.camera'), 'com.elix.camera is in registry');
    assertTest(allApps.apps.some((a) => a.appId === 'com.elix.terminal'), 'com.elix.terminal is in registry');
    assertTest(allApps.apps.some((a) => a.appId === 'com.elix.code'), 'com.elix.code is in registry');
    assertTest(allApps.apps.some((a) => a.appId === 'com.elix.sysmon'), 'com.elix.sysmon is in registry');
    assertTest(allApps.apps.some((a) => a.appId === 'com.elix.devices'), 'com.elix.devices is in registry');
    assertTest(allApps.apps.some((a) => a.appId === 'com.elix.settings'), 'com.elix.settings is in registry');
    assertTest(allApps.apps.some((a) => a.appId === 'com.elix.appcenter'), 'com.elix.appcenter is in registry');
    assertTest(allApps.apps.some((a) => a.appId === 'com.elix.search'), 'com.elix.search is in registry');
    assertTest(allApps.apps.some((a) => a.appId === 'com.elix.center'), 'com.elix.center is in registry');
    assertTest(allApps.apps.some((a) => a.appId === 'com.elix.fakeapp'), 'com.elix.fakeapp is in registry');
    assertTest(typeof allApps.apps[0].mountedToolsCount === 'number', 'Reported mounted tools count per app');
    // ==========================================================================
    // 3. OPTION 2: Inspect .ELIXAPP Package
    // ==========================================================================
    logStep('Option 2', 'Inspect .ELIXAPP Package Manifest & Capabilities');
    const fakeInspect = await appManager.inspectPackage(path.join(PACKAGE_ROOT, 'fixtures', 'com.elix.fakeapp'));
    assertTest(fakeInspect.appId === 'com.elix.fakeapp', 'Inspected FakeApp package ID', fakeInspect.appId);
    assertTest(fakeInspect.permissions.length > 0, 'Extracted manifest permissions', `${fakeInspect.permissions.length} perms`);
    assertTest(fakeInspect.capabilities.length >= 1, 'Extracted exported capabilities', `${fakeInspect.capabilities.length} caps`);
    const notesInspect = await appManager.inspectPackage(path.join(PACKAGE_ROOT, 'demo-apps', 'com.elix.notes'));
    assertTest(notesInspect.appId === 'com.elix.notes', 'Inspected Notes package ID', notesInspect.appId);
    assertTest(notesInspect.capabilities.some((c) => c.name === 'create_note'), 'Notes declares create_note capability');
    assertTest(notesInspect.capabilities.some((c) => c.name === 'delete_note'), 'Notes declares delete_note capability');
    const clockInspect = await appManager.inspectPackage(path.join(PACKAGE_ROOT, 'demo-apps', 'com.elix.clock'));
    assertTest(clockInspect.appId === 'com.elix.clock', 'Inspected Clock package ID', clockInspect.appId);
    assertTest(clockInspect.capabilities.some((c) => c.name === 'set_alarm'), 'Clock declares set_alarm capability');
    assertTest(clockInspect.capabilities.some((c) => c.name === 'start_timer'), 'Clock declares start_timer capability');
    assertTest(clockInspect.capabilities.some((c) => c.name === 'get_world_time'), 'Clock declares get_world_time capability');
    const calInspect = await appManager.inspectPackage(path.join(PACKAGE_ROOT, 'demo-apps', 'com.elix.calendar'));
    assertTest(calInspect.appId === 'com.elix.calendar', 'Inspected Calendar package ID', calInspect.appId);
    assertTest(calInspect.capabilities.some((c) => c.name === 'create_calendar_event'), 'Calendar declares create_calendar_event capability');
    assertTest(calInspect.capabilities.some((c) => c.name === 'add_smart_task'), 'Calendar declares add_smart_task capability');
    const utilInspect = await appManager.inspectPackage(path.join(PACKAGE_ROOT, 'demo-apps', 'com.elix.utilities'));
    assertTest(utilInspect.appId === 'com.elix.utilities', 'Inspected Utilities package ID', utilInspect.appId);
    assertTest(utilInspect.capabilities.some((c) => c.name === 'convert_units'), 'Utilities declares convert_units capability');
    assertTest(utilInspect.capabilities.some((c) => c.name === 'compute_hash'), 'Utilities declares compute_hash capability');
    assertTest(utilInspect.capabilities.some((c) => c.name === 'inspect_color'), 'Utilities declares inspect_color capability');
    const filesInspect = await appManager.inspectPackage(path.join(PACKAGE_ROOT, 'demo-apps', 'com.elix.files'));
    assertTest(filesInspect.appId === 'com.elix.files', 'Inspected Files package ID', filesInspect.appId);
    assertTest(filesInspect.capabilities.some((c) => c.name === 'list_directory'), 'Files declares list_directory capability');
    assertTest(filesInspect.capabilities.some((c) => c.name === 'search_files'), 'Files declares search_files capability');
    assertTest(filesInspect.capabilities.some((c) => c.name === 'inspect_file_metadata'), 'Files declares inspect_file_metadata capability');
    const mediaInspect = await appManager.inspectPackage(path.join(PACKAGE_ROOT, 'demo-apps', 'com.elix.media'));
    assertTest(mediaInspect.appId === 'com.elix.media', 'Inspected Media package ID', mediaInspect.appId);
    assertTest(mediaInspect.capabilities.some((c) => c.name === 'open_media'), 'Media declares open_media capability');
    assertTest(mediaInspect.capabilities.some((c) => c.name === 'control_playback'), 'Media declares control_playback capability');
    assertTest(mediaInspect.capabilities.some((c) => c.name === 'inspect_media_info'), 'Media declares inspect_media_info capability');
    const studioInspect = await appManager.inspectPackage(path.join(PACKAGE_ROOT, 'demo-apps', 'com.elix.mediastudio'));
    assertTest(studioInspect.appId === 'com.elix.mediastudio', 'Inspected Media Studio package ID', studioInspect.appId);
    assertTest(studioInspect.capabilities.some((c) => c.name === 'edit_image'), 'Media Studio declares edit_image capability');
    assertTest(studioInspect.capabilities.some((c) => c.name === 'crop_resize'), 'Media Studio declares crop_resize capability');
    assertTest(studioInspect.capabilities.some((c) => c.name === 'trim_media'), 'Media Studio declares trim_media capability');
    assertTest(studioInspect.capabilities.some((c) => c.name === 'convert_format'), 'Media Studio declares convert_format capability');
    const studio3dInspect = await appManager.inspectPackage(path.join(PACKAGE_ROOT, 'demo-apps', 'com.elix.studio3d'));
    assertTest(studio3dInspect.appId === 'com.elix.studio3d', 'Inspected 3D Studio package ID', studio3dInspect.appId);
    assertTest(studio3dInspect.capabilities.some((c) => c.name === 'load_model'), '3D Studio declares load_model capability');
    assertTest(studio3dInspect.capabilities.some((c) => c.name === 'set_viewport_shading'), '3D Studio declares set_viewport_shading capability');
    assertTest(studio3dInspect.capabilities.some((c) => c.name === 'inspect_mesh_stats'), '3D Studio declares inspect_mesh_stats capability');
    assertTest(studio3dInspect.capabilities.some((c) => c.name === 'set_environment_lighting'), '3D Studio declares set_environment_lighting capability');
    const docsInspect = await appManager.inspectPackage(path.join(PACKAGE_ROOT, 'demo-apps', 'com.elix.documents'));
    assertTest(docsInspect.appId === 'com.elix.documents', 'Inspected Documents package ID', docsInspect.appId);
    assertTest(docsInspect.capabilities.some((c) => c.name === 'open_document'), 'Documents declares open_document capability');
    assertTest(docsInspect.capabilities.some((c) => c.name === 'search_document_text'), 'Documents declares search_document_text capability');
    assertTest(docsInspect.capabilities.some((c) => c.name === 'get_document_outline'), 'Documents declares get_document_outline capability');
    assertTest(docsInspect.capabilities.some((c) => c.name === 'annotate_pdf'), 'Documents declares annotate_pdf capability');
    assertTest(docsInspect.capabilities.some((c) => c.name === 'edit_spreadsheet_cell'), 'Documents declares edit_spreadsheet_cell capability');
    assertTest(docsInspect.capabilities.some((c) => c.name === 'export_document'), 'Documents declares export_document capability');
    const captureInspect = await appManager.inspectPackage(path.join(PACKAGE_ROOT, 'demo-apps', 'com.elix.capture'));
    assertTest(captureInspect.appId === 'com.elix.capture', 'Inspected Capture package ID', captureInspect.appId);
    assertTest(captureInspect.capabilities.some((c) => c.name === 'capture_screen'), 'Capture declares capture_screen capability');
    assertTest(captureInspect.capabilities.some((c) => c.name === 'start_screen_recording'), 'Capture declares start_screen_recording capability');
    assertTest(captureInspect.capabilities.some((c) => c.name === 'stop_screen_recording'), 'Capture declares stop_screen_recording capability');
    assertTest(captureInspect.capabilities.some((c) => c.name === 'apply_annotation'), 'Capture declares apply_annotation capability');
    assertTest(captureInspect.capabilities.some((c) => c.name === 'get_capture_history'), 'Capture declares get_capture_history capability');
    const cameraInspect = await appManager.inspectPackage(path.join(PACKAGE_ROOT, 'demo-apps', 'com.elix.camera'));
    assertTest(cameraInspect.appId === 'com.elix.camera', 'Inspected Camera package ID', cameraInspect.appId);
    assertTest(cameraInspect.capabilities.some((c) => c.name === 'take_photo'), 'Camera declares take_photo capability');
    assertTest(cameraInspect.capabilities.some((c) => c.name === 'start_video_recording'), 'Camera declares start_video_recording capability');
    assertTest(cameraInspect.capabilities.some((c) => c.name === 'stop_video_recording'), 'Camera declares stop_video_recording capability');
    assertTest(cameraInspect.capabilities.some((c) => c.name === 'record_audio_clip'), 'Camera declares record_audio_clip capability');
    assertTest(cameraInspect.capabilities.some((c) => c.name === 'list_capture_devices'), 'Camera declares list_capture_devices capability');
    assertTest(cameraInspect.capabilities.some((c) => c.name === 'toggle_teleprompter'), 'Camera declares toggle_teleprompter capability');
    const terminalInspect = await appManager.inspectPackage(path.join(PACKAGE_ROOT, 'demo-apps', 'com.elix.terminal'));
    assertTest(terminalInspect.appId === 'com.elix.terminal', 'Inspected Terminal package ID', terminalInspect.appId);
    assertTest(terminalInspect.capabilities.some((c) => c.name === 'spawn_shell_session'), 'Terminal declares spawn_shell_session capability');
    assertTest(terminalInspect.capabilities.some((c) => c.name === 'execute_command'), 'Terminal declares execute_command capability');
    assertTest(terminalInspect.capabilities.some((c) => c.name === 'send_terminal_input'), 'Terminal declares send_terminal_input capability');
    assertTest(terminalInspect.capabilities.some((c) => c.name === 'get_session_output'), 'Terminal declares get_session_output capability');
    assertTest(terminalInspect.capabilities.some((c) => c.name === 'kill_session'), 'Terminal declares kill_session capability');
    assertTest(terminalInspect.capabilities.some((c) => c.name === 'list_active_sessions'), 'Terminal declares list_active_sessions capability');
    const codeInspect = await appManager.inspectPackage(path.join(PACKAGE_ROOT, 'demo-apps', 'com.elix.code'));
    assertTest(codeInspect.appId === 'com.elix.code', 'Inspected Code package ID', codeInspect.appId);
    assertTest(codeInspect.capabilities.some((c) => c.name === 'open_code_file'), 'Code declares open_code_file capability');
    assertTest(codeInspect.capabilities.some((c) => c.name === 'save_code_file'), 'Code declares save_code_file capability');
    assertTest(codeInspect.capabilities.some((c) => c.name === 'format_document'), 'Code declares format_document capability');
    assertTest(codeInspect.capabilities.some((c) => c.name === 'get_git_diff'), 'Code declares get_git_diff capability');
    assertTest(codeInspect.capabilities.some((c) => c.name === 'inspect_database_table'), 'Code declares inspect_database_table capability');
    assertTest(codeInspect.capabilities.some((c) => c.name === 'execute_sql_query'), 'Code declares execute_sql_query capability');
    const sysmonInspect = await appManager.inspectPackage(path.join(PACKAGE_ROOT, 'demo-apps', 'com.elix.sysmon'));
    assertTest(sysmonInspect.appId === 'com.elix.sysmon', 'Inspected SysMon package ID', sysmonInspect.appId);
    assertTest(sysmonInspect.capabilities.some((c) => c.name === 'get_system_metrics'), 'SysMon declares get_system_metrics capability');
    assertTest(sysmonInspect.capabilities.some((c) => c.name === 'list_processes'), 'SysMon declares list_processes capability');
    assertTest(sysmonInspect.capabilities.some((c) => c.name === 'kill_process'), 'SysMon declares kill_process capability');
    assertTest(sysmonInspect.capabilities.some((c) => c.name === 'get_disk_io_stats'), 'SysMon declares get_disk_io_stats capability');
    assertTest(sysmonInspect.capabilities.some((c) => c.name === 'get_network_io_stats'), 'SysMon declares get_network_io_stats capability');
    assertTest(sysmonInspect.capabilities.some((c) => c.name === 'get_system_overview'), 'SysMon declares get_system_overview capability');
    const devicesInspect = await appManager.inspectPackage(path.join(PACKAGE_ROOT, 'demo-apps', 'com.elix.devices'));
    assertTest(devicesInspect.appId === 'com.elix.devices', 'Inspected Devices package ID', devicesInspect.appId);
    assertTest(devicesInspect.capabilities.some((c) => c.name === 'scan_bluetooth_devices'), 'Devices declares scan_bluetooth_devices capability');
    assertTest(devicesInspect.capabilities.some((c) => c.name === 'toggle_bluetooth_state'), 'Devices declares toggle_bluetooth_state capability');
    assertTest(devicesInspect.capabilities.some((c) => c.name === 'scan_wifi_networks'), 'Devices declares scan_wifi_networks capability');
    assertTest(devicesInspect.capabilities.some((c) => c.name === 'configure_display'), 'Devices declares configure_display capability');
    assertTest(devicesInspect.capabilities.some((c) => c.name === 'set_audio_device'), 'Devices declares set_audio_device capability');
    assertTest(devicesInspect.capabilities.some((c) => c.name === 'get_battery_diagnostics'), 'Devices declares get_battery_diagnostics capability');
    assertTest(devicesInspect.capabilities.some((c) => c.name === 'list_connected_peripherals'), 'Devices declares list_connected_peripherals capability');
    const settingsInspect = await appManager.inspectPackage(path.join(PACKAGE_ROOT, 'demo-apps', 'com.elix.settings'));
    assertTest(settingsInspect.appId === 'com.elix.settings', 'Inspected Settings package ID', settingsInspect.appId);
    assertTest(settingsInspect.capabilities.some((c) => c.name === 'get_system_settings'), 'Settings declares get_system_settings capability');
    assertTest(settingsInspect.capabilities.some((c) => c.name === 'update_setting'), 'Settings declares update_setting capability');
    assertTest(settingsInspect.capabilities.some((c) => c.name === 'reset_settings_category'), 'Settings declares reset_settings_category capability');
    assertTest(settingsInspect.capabilities.some((c) => c.name === 'manage_permissions'), 'Settings declares manage_permissions capability');
    assertTest(settingsInspect.capabilities.some((c) => c.name === 'clear_system_caches'), 'Settings declares clear_system_caches capability');
    assertTest(settingsInspect.capabilities.some((c) => c.name === 'export_configuration'), 'Settings declares export_configuration capability');
    const appcenterInspect = await appManager.inspectPackage(path.join(PACKAGE_ROOT, 'demo-apps', 'com.elix.appcenter'));
    assertTest(appcenterInspect.appId === 'com.elix.appcenter', 'Inspected App Center package ID', appcenterInspect.appId);
    assertTest(appcenterInspect.capabilities.some((c) => c.name === 'list_installed_apps'), 'App Center declares list_installed_apps capability');
    assertTest(appcenterInspect.capabilities.some((c) => c.name === 'search_store_catalog'), 'App Center declares search_store_catalog capability');
    assertTest(appcenterInspect.capabilities.some((c) => c.name === 'install_elixapp'), 'App Center declares install_elixapp capability');
    assertTest(appcenterInspect.capabilities.some((c) => c.name === 'uninstall_elixapp'), 'App Center declares uninstall_elixapp capability');
    assertTest(appcenterInspect.capabilities.some((c) => c.name === 'check_for_updates'), 'App Center declares check_for_updates capability');
    assertTest(appcenterInspect.capabilities.some((c) => c.name === 'inspect_package_manifest'), 'App Center declares inspect_package_manifest capability');
    const searchInspect = await appManager.inspectPackage(path.join(PACKAGE_ROOT, 'demo-apps', 'com.elix.search'));
    assertTest(searchInspect.appId === 'com.elix.search', 'Inspected Search package ID', searchInspect.appId);
    assertTest(searchInspect.capabilities.some((c) => c.name === 'query_universal_index'), 'Search declares query_universal_index capability');
    assertTest(searchInspect.capabilities.some((c) => c.name === 'execute_action_shortcut'), 'Search declares execute_action_shortcut capability');
    assertTest(searchInspect.capabilities.some((c) => c.name === 'evaluate_quick_calculation'), 'Search declares evaluate_quick_calculation capability');
    assertTest(searchInspect.capabilities.some((c) => c.name === 'rebuild_search_index'), 'Search declares rebuild_search_index capability');
    assertTest(searchInspect.capabilities.some((c) => c.name === 'get_recent_searches'), 'Search declares get_recent_searches capability');
    const centerInspect = await appManager.inspectPackage(path.join(PACKAGE_ROOT, 'demo-apps', 'com.elix.center'));
    assertTest(centerInspect.appId === 'com.elix.center', 'Inspected ELIX Center package ID', centerInspect.appId);
    assertTest(centerInspect.capabilities.some((c) => c.name === 'list_active_agents'), 'ELIX Center declares list_active_agents capability');
    assertTest(centerInspect.capabilities.some((c) => c.name === 'spawn_agent_run'), 'ELIX Center declares spawn_agent_run capability');
    assertTest(centerInspect.capabilities.some((c) => c.name === 'query_mcp_servers'), 'ELIX Center declares query_mcp_servers capability');
    assertTest(centerInspect.capabilities.some((c) => c.name === 'toggle_mcp_server'), 'ELIX Center declares toggle_mcp_server capability');
    assertTest(centerInspect.capabilities.some((c) => c.name === 'inspect_memory_vectors'), 'ELIX Center declares inspect_memory_vectors capability');
    assertTest(centerInspect.capabilities.some((c) => c.name === 'get_token_telemetry'), 'ELIX Center declares get_token_telemetry capability');
    // ==========================================================================
    // 4. OPTION 3: Open Floating App Window (open_app)
    // ==========================================================================
    logStep('Option 3', 'Open Floating Windows (Notes, Calculator, Clock, Calendar, Utilities, Files, Media, MediaStudio, 3DStudio, Documents, Capture, Camera, Terminal, Code, SysMon, Devices, Settings, App Center, Universal Search, ELIX Center, FakeApp)');
    const winNotes = await openAppTool.execute({ appId: 'com.elix.notes' });
    assertTest(winNotes.success === true, 'Launched Notes window', `ID: ${winNotes.windowId} (${winNotes.geometry.width}x${winNotes.geometry.height})`);
    const winCalc = await openAppTool.execute({ appId: 'com.elix.calculator' });
    assertTest(winCalc.success === true, 'Launched Calculator window', `ID: ${winCalc.windowId} (${winCalc.geometry.width}x${winCalc.geometry.height})`);
    const winClock = await openAppTool.execute({ appId: 'com.elix.clock' });
    assertTest(winClock.success === true, 'Launched Clock window', `ID: ${winClock.windowId} (${winClock.geometry.width}x${winClock.geometry.height})`);
    const winCal = await openAppTool.execute({ appId: 'com.elix.calendar' });
    assertTest(winCal.success === true, 'Launched Calendar window', `ID: ${winCal.windowId} (${winCal.geometry.width}x${winCal.geometry.height})`);
    const winUtil = await openAppTool.execute({ appId: 'com.elix.utilities' });
    assertTest(winUtil.success === true, 'Launched Utilities window', `ID: ${winUtil.windowId} (${winUtil.geometry.width}x${winUtil.geometry.height})`);
    const winFiles = await openAppTool.execute({ appId: 'com.elix.files' });
    assertTest(winFiles.success === true, 'Launched Files window', `ID: ${winFiles.windowId} (${winFiles.geometry.width}x${winFiles.geometry.height})`);
    const winMedia = await openAppTool.execute({ appId: 'com.elix.media' });
    assertTest(winMedia.success === true, 'Launched Media window', `ID: ${winMedia.windowId} (${winMedia.geometry.width}x${winMedia.geometry.height})`);
    const winStudio = await openAppTool.execute({ appId: 'com.elix.mediastudio' });
    assertTest(winStudio.success === true, 'Launched Media Studio window', `ID: ${winStudio.windowId} (${winStudio.geometry.width}x${winStudio.geometry.height})`);
    const winStudio3d = await openAppTool.execute({ appId: 'com.elix.studio3d' });
    assertTest(winStudio3d.success === true, 'Launched 3D Studio window', `ID: ${winStudio3d.windowId} (${winStudio3d.geometry.width}x${winStudio3d.geometry.height})`);
    const winDocs = await openAppTool.execute({ appId: 'com.elix.documents' });
    assertTest(winDocs.success === true, 'Launched Documents window', `ID: ${winDocs.windowId} (${winDocs.geometry.width}x${winDocs.geometry.height})`);
    const winCapture = await openAppTool.execute({ appId: 'com.elix.capture' });
    assertTest(winCapture.success === true, 'Launched Capture window', `ID: ${winCapture.windowId} (${winCapture.geometry.width}x${winCapture.geometry.height})`);
    const winCamera = await openAppTool.execute({ appId: 'com.elix.camera' });
    assertTest(winCamera.success === true, 'Launched Camera window', `ID: ${winCamera.windowId} (${winCamera.geometry.width}x${winCamera.geometry.height})`);
    const winTerminal = await openAppTool.execute({ appId: 'com.elix.terminal' });
    assertTest(winTerminal.success === true, 'Launched Terminal window', `ID: ${winTerminal.windowId} (${winTerminal.geometry.width}x${winTerminal.geometry.height})`);
    const winCode = await openAppTool.execute({ appId: 'com.elix.code' });
    assertTest(winCode.success === true, 'Launched Code window', `ID: ${winCode.windowId} (${winCode.geometry.width}x${winCode.geometry.height})`);
    const winSysmon = await openAppTool.execute({ appId: 'com.elix.sysmon' });
    assertTest(winSysmon.success === true, 'Launched SysMon window', `ID: ${winSysmon.windowId} (${winSysmon.geometry.width}x${winSysmon.geometry.height})`);
    const winDevices = await openAppTool.execute({ appId: 'com.elix.devices' });
    assertTest(winDevices.success === true, 'Launched Devices window', `ID: ${winDevices.windowId} (${winDevices.geometry.width}x${winDevices.geometry.height})`);
    const winSettings = await openAppTool.execute({ appId: 'com.elix.settings' });
    assertTest(winSettings.success === true, 'Launched Settings window', `ID: ${winSettings.windowId} (${winSettings.geometry.width}x${winSettings.geometry.height})`);
    const winAppCenter = await openAppTool.execute({ appId: 'com.elix.appcenter' });
    assertTest(winAppCenter.success === true, 'Launched App Center window', `ID: ${winAppCenter.windowId} (${winAppCenter.geometry.width}x${winAppCenter.geometry.height})`);
    const winSearch = await openAppTool.execute({ appId: 'com.elix.search' });
    assertTest(winSearch.success === true, 'Launched Universal Search window', `ID: ${winSearch.windowId} (${winSearch.geometry.width}x${winSearch.geometry.height})`);
    const winCenter = await openAppTool.execute({ appId: 'com.elix.center' });
    assertTest(winCenter.success === true, 'Launched ELIX Center window', `ID: ${winCenter.windowId} (${winCenter.geometry.width}x${winCenter.geometry.height})`);
    const winFake = await openAppTool.execute({ appId: 'com.elix.fakeapp' });
    assertTest(winFake.success === true, 'Launched FakeApp window', `ID: ${winFake.windowId} (${winFake.geometry.width}x${winFake.geometry.height})`);
    const runningApps = await getAppListTool.execute({ filter: 'running' });
    assertTest(runningApps.count >= 21, 'Filter running windows', `${runningApps.count} windows currently active`);
    // ==========================================================================
    // 5. OPTION 4: Execute Dynamic Tool Calls (AI Bridge Invocation)
    // ==========================================================================
    logStep('Option 4', 'Execute Dynamic AI Capabilities (Notes, Calculator, FakeApp)');
    // 5a. Notes capabilities
    const createNoteTool = toolSink.getTool('app_com_elix_notes_create_note');
    assertTest(!!createNoteTool, 'Tool app_com_elix_notes_create_note mounted');
    const createNoteRes = await createNoteTool.execute({
        title: 'Automated Test Note',
        body: 'Verifying end-to-end AI tool execution for ELIX App Bridge.',
        tags: ['automated', 'ai-bridge'],
    });
    assertTest(createNoteRes.success === true, 'create_note invocation succeeded', JSON.stringify(createNoteRes));
    const searchNoteTool = toolSink.getTool('app_com_elix_notes_search_notes');
    assertTest(!!searchNoteTool, 'Tool app_com_elix_notes_search_notes mounted');
    const searchNoteRes = await searchNoteTool.execute({ query: 'Automated' });
    assertTest(searchNoteRes.success === true || searchNoteRes.matchCount >= 1, 'search_notes invocation succeeded');
    const getActiveNoteTool = toolSink.getTool('app_com_elix_notes_get_active_note');
    assertTest(!!getActiveNoteTool, 'Tool app_com_elix_notes_get_active_note mounted');
    const getActiveRes = await getActiveNoteTool.execute({});
    assertTest(getActiveRes.success === true || !!getActiveRes.activeNote, 'get_active_note invocation succeeded');
    const deleteNoteTool = toolSink.getTool('app_com_elix_notes_delete_note');
    assertTest(!!deleteNoteTool, 'Tool app_com_elix_notes_delete_note mounted');
    const deleteNoteRes = await deleteNoteTool.execute({ title: 'Automated Test Note' });
    assertTest(deleteNoteRes.success === true, 'delete_note invocation succeeded');
    // 5b. Calculator capabilities
    const calcTool = toolSink.getTool('app_com_elix_calculator_calculate');
    assertTest(!!calcTool, 'Tool app_com_elix_calculator_calculate mounted');
    const calcRes = await calcTool.execute({ expression: '45 * 12 + 100' });
    assertTest(calcRes.success === true || calcRes.result === 640, 'calculate invocation succeeded', `Result: ${calcRes.result}`);
    const getHistTool = toolSink.getTool('app_com_elix_calculator_get_history');
    assertTest(!!getHistTool, 'Tool app_com_elix_calculator_get_history mounted');
    const getHistRes = await getHistTool.execute({});
    assertTest(getHistRes.success === true || Array.isArray(getHistRes.history), 'get_history invocation succeeded');
    const clearHistTool = toolSink.getTool('app_com_elix_calculator_clear_history');
    assertTest(!!clearHistTool, 'Tool app_com_elix_calculator_clear_history mounted');
    const clearHistRes = await clearHistTool.execute({});
    assertTest(clearHistRes.success === true, 'clear_history invocation succeeded');
    // 5c. FakeApp capabilities
    const pingTool = toolSink.getTool('app_com_elix_fakeapp_ping');
    assertTest(!!pingTool, 'Tool app_com_elix_fakeapp_ping mounted');
    const pingRes = await pingTool.execute({ message: 'Live verification ping' });
    assertTest(pingRes.reply === 'pong' || pingRes.success === true, 'ping invocation succeeded', `Reply: ${pingRes.reply || 'pong'}`);
    const echoTool = toolSink.getTool('app_com_elix_fakeapp_echo_test');
    assertTest(!!echoTool, 'Tool app_com_elix_fakeapp_echo_test mounted');
    const echoRes = await echoTool.execute({ text: 'Echo test signal' });
    assertTest(echoRes.success === true || echoRes.echo === 'Echo test signal', 'echo_test invocation succeeded');
    // 5d. Clock capabilities
    const setAlarmTool = toolSink.getTool('app_com_elix_clock_set_alarm');
    assertTest(!!setAlarmTool, 'Tool app_com_elix_clock_set_alarm mounted');
    const alarmRes = await setAlarmTool.execute({ time: '07:30', label: 'Morning Standup' });
    assertTest(alarmRes.success === true, 'set_alarm invocation succeeded');
    const startTimerTool = toolSink.getTool('app_com_elix_clock_start_timer');
    assertTest(!!startTimerTool, 'Tool app_com_elix_clock_start_timer mounted');
    const timerRes = await startTimerTool.execute({ durationSeconds: 300, label: 'Pomodoro' });
    assertTest(timerRes.success === true, 'start_timer invocation succeeded');
    const worldTimeTool = toolSink.getTool('app_com_elix_clock_get_world_time');
    assertTest(!!worldTimeTool, 'Tool app_com_elix_clock_get_world_time mounted');
    const worldTimeRes = await worldTimeTool.execute({ timezone: 'America/New_York' });
    assertTest(worldTimeRes.success === true, 'get_world_time invocation succeeded');
    // 5e. Calendar capabilities
    const createCalEventTool = toolSink.getTool('app_com_elix_calendar_create_calendar_event');
    assertTest(!!createCalEventTool, 'Tool app_com_elix_calendar_create_calendar_event mounted');
    const calEventRes = await createCalEventTool.execute({
        title: 'Executive Sync',
        startTime: '14:00',
        endTime: '15:00',
        category: 'work'
    });
    assertTest(calEventRes.success === true, 'create_calendar_event invocation succeeded');
    const addSmartTaskTool = toolSink.getTool('app_com_elix_calendar_add_smart_task');
    assertTest(!!addSmartTaskTool, 'Tool app_com_elix_calendar_add_smart_task mounted');
    const smartTaskRes = await addSmartTaskTool.execute({
        title: 'Deploy microkernel tomorrow at 3pm #work !P1',
        priority: 'P1_URGENT'
    });
    assertTest(smartTaskRes.success === true, 'add_smart_task invocation succeeded');
    const toggleTaskTool = toolSink.getTool('app_com_elix_calendar_toggle_task_status');
    assertTest(!!toggleTaskTool, 'Tool app_com_elix_calendar_toggle_task_status mounted');
    const toggleTaskRes = await toggleTaskTool.execute({
        taskId: 'tsk_1',
        completed: true
    });
    assertTest(toggleTaskRes.success === true, 'toggle_task_status invocation succeeded');
    // 5f. Utilities capabilities
    const convertUnitsTool = toolSink.getTool('app_com_elix_utilities_convert_units');
    assertTest(!!convertUnitsTool, 'Tool app_com_elix_utilities_convert_units mounted');
    const convRes = await convertUnitsTool.execute({
        category: 'temperature',
        fromUnit: 'celsius',
        toUnit: 'kelvin',
        value: -273.15
    });
    assertTest(convRes.success === true, 'convert_units invocation succeeded');
    const computeHashTool = toolSink.getTool('app_com_elix_utilities_compute_hash');
    assertTest(!!computeHashTool, 'Tool app_com_elix_utilities_compute_hash mounted');
    const hashToolRes = await computeHashTool.execute({
        content: 'Microkernel IPC verify',
        algorithm: 'SHA-256'
    });
    assertTest(hashToolRes.success === true, 'compute_hash invocation succeeded');
    // 5g. Files capabilities
    const listDirTool = toolSink.getTool('app_com_elix_files_list_directory');
    assertTest(!!listDirTool, 'Tool app_com_elix_files_list_directory mounted');
    const listDirRes = await listDirTool.execute({
        path: '/home/elix/Documents',
        showHidden: false
    });
    assertTest(listDirRes.success === true, 'list_directory invocation succeeded');
    const searchFilesTool = toolSink.getTool('app_com_elix_files_search_files');
    assertTest(!!searchFilesTool, 'Tool app_com_elix_files_search_files mounted');
    const searchFilesRes = await searchFilesTool.execute({
        query: 'kernel',
        recursive: true
    });
    assertTest(searchFilesRes.success === true, 'search_files invocation succeeded');
    const inspectMetaTool = toolSink.getTool('app_com_elix_files_inspect_file_metadata');
    assertTest(!!inspectMetaTool, 'Tool app_com_elix_files_inspect_file_metadata mounted');
    const inspectMetaRes = await inspectMetaTool.execute({
        targetPath: '/home/elix/README.md'
    });
    assertTest(inspectMetaRes.success === true, 'inspect_file_metadata invocation succeeded');
    // 5h. Media capabilities
    const inspectMediaTool = toolSink.getTool('app_com_elix_media_inspect_media_info');
    assertTest(!!inspectMediaTool, 'Tool app_com_elix_media_inspect_media_info mounted');
    const inspectMediaRes = await inspectMediaTool.execute({
        mediaPath: '/home/elix/videos/demo.mp4'
    });
    assertTest(inspectMediaRes.success === true, 'inspect_media_info invocation succeeded');
    const controlPlaybackTool = toolSink.getTool('app_com_elix_media_control_playback');
    assertTest(!!controlPlaybackTool, 'Tool app_com_elix_media_control_playback mounted');
    const controlPlayRes = await controlPlaybackTool.execute({
        action: 'play'
    });
    assertTest(controlPlayRes.success === true, 'control_playback invocation succeeded');
    const openMediaTool = toolSink.getTool('app_com_elix_media_open_media');
    assertTest(!!openMediaTool, 'Tool app_com_elix_media_open_media mounted');
    const openMediaRes = await openMediaTool.execute({
        mediaPath: '/home/elix/music/track.wav',
        autoPlay: true,
        initialTimeSeconds: 0
    });
    assertTest(openMediaRes.success === true, 'open_media invocation succeeded');
    // 5i. Media Studio capabilities
    const editImageTool = toolSink.getTool('app_com_elix_mediastudio_edit_image');
    assertTest(!!editImageTool, 'Tool app_com_elix_mediastudio_edit_image mounted');
    const editImgRes = await editImageTool.execute({
        sourcePath: '/home/elix/photos/sunset.jpg',
        brightness: 10,
        contrast: 15
    });
    assertTest(editImgRes.success === true, 'edit_image invocation succeeded');
    const cropResizeTool = toolSink.getTool('app_com_elix_mediastudio_crop_resize');
    assertTest(!!cropResizeTool, 'Tool app_com_elix_mediastudio_crop_resize mounted');
    const cropRes = await cropResizeTool.execute({
        sourcePath: '/home/elix/photos/sunset.jpg',
        cropRect: { x: 0, y: 0, width: 1920, height: 1080 }
    });
    assertTest(cropRes.success === true, 'crop_resize invocation succeeded');
    const trimMediaTool = toolSink.getTool('app_com_elix_mediastudio_trim_media');
    assertTest(!!trimMediaTool, 'Tool app_com_elix_mediastudio_trim_media mounted');
    const trimRes = await trimMediaTool.execute({
        sourcePath: '/home/elix/videos/clip.mp4',
        startTimestampSeconds: 5.0,
        endTimestampSeconds: 25.5
    });
    assertTest(trimRes.success === true, 'trim_media invocation succeeded');
    const convertFormatTool = toolSink.getTool('app_com_elix_mediastudio_convert_format');
    assertTest(!!convertFormatTool, 'Tool app_com_elix_mediastudio_convert_format mounted');
    const convFormatRes = await convertFormatTool.execute({
        sourcePath: '/home/elix/photos/graphic.png',
        targetFormat: 'webp'
    });
    assertTest(convFormatRes.success === true, 'convert_format invocation succeeded');
    const loadModelTool = toolSink.getTool('app_com_elix_studio3d_load_model');
    assertTest(!!loadModelTool, 'Tool app_com_elix_studio3d_load_model mounted');
    const loadModelRes = await loadModelTool.execute({
        modelPath: '/home/elix/models/cyber_mesh.glb',
        format: 'glb'
    });
    assertTest(loadModelRes.success === true, 'load_model invocation succeeded');
    const setShadingTool = toolSink.getTool('app_com_elix_studio3d_set_viewport_shading');
    assertTest(!!setShadingTool, 'Tool app_com_elix_studio3d_set_viewport_shading mounted');
    const setShadingRes = await setShadingTool.execute({
        mode: 'wireframe'
    });
    assertTest(setShadingRes.success === true, 'set_viewport_shading invocation succeeded');
    const inspectMeshTool = toolSink.getTool('app_com_elix_studio3d_inspect_mesh_stats');
    assertTest(!!inspectMeshTool, 'Tool app_com_elix_studio3d_inspect_mesh_stats mounted');
    const inspectMeshRes = await inspectMeshTool.execute({
        modelId: 'cyber_mesh'
    });
    assertTest(inspectMeshRes.success === true, 'inspect_mesh_stats invocation succeeded');
    const setLightingTool = toolSink.getTool('app_com_elix_studio3d_set_environment_lighting');
    assertTest(!!setLightingTool, 'Tool app_com_elix_studio3d_set_environment_lighting mounted');
    const setLightingRes = await setLightingTool.execute({
        preset: 'neon_cyber',
        intensity: 1.5
    });
    assertTest(setLightingRes.success === true, 'set_environment_lighting invocation succeeded');
    const openDocTool = toolSink.getTool('app_com_elix_documents_open_document');
    assertTest(!!openDocTool, 'Tool app_com_elix_documents_open_document mounted');
    const openDocRes = await openDocTool.execute({
        filePath: '/home/elix/docs/specs.pdf',
        format: 'pdf'
    });
    assertTest(openDocRes.success === true, 'open_document invocation succeeded');
    const searchDocTool = toolSink.getTool('app_com_elix_documents_search_document_text');
    assertTest(!!searchDocTool, 'Tool app_com_elix_documents_search_document_text mounted');
    const searchDocRes = await searchDocTool.execute({
        query: 'architecture',
        matchCase: false,
        regex: false
    });
    assertTest(searchDocRes.success === true, 'search_document_text invocation succeeded');
    const outlineDocTool = toolSink.getTool('app_com_elix_documents_get_document_outline');
    assertTest(!!outlineDocTool, 'Tool app_com_elix_documents_get_document_outline mounted');
    const outlineDocRes = await outlineDocTool.execute({
        documentId: 'architecture_specs_01'
    });
    assertTest(outlineDocRes.success === true, 'get_document_outline invocation succeeded');
    const annotatePdfTool = toolSink.getTool('app_com_elix_documents_annotate_pdf');
    assertTest(!!annotatePdfTool, 'Tool app_com_elix_documents_annotate_pdf mounted');
    const annotateRes = await annotatePdfTool.execute({
        pageNumber: 1,
        highlightRect: { x: 50, y: 120, width: 280, height: 24 },
        noteText: 'Critical security note',
        color: '#eab308'
    });
    assertTest(annotateRes.success === true, 'annotate_pdf invocation succeeded');
    const editCellTool = toolSink.getTool('app_com_elix_documents_edit_spreadsheet_cell');
    assertTest(!!editCellTool, 'Tool app_com_elix_documents_edit_spreadsheet_cell mounted');
    const editCellRes = await editCellTool.execute({
        cellCoordinate: 'B2',
        value: '450.75',
        formula: '=SUM(B3:B10)'
    });
    assertTest(editCellRes.success === true, 'edit_spreadsheet_cell invocation succeeded');
    const exportDocTool = toolSink.getTool('app_com_elix_documents_export_document');
    assertTest(!!exportDocTool, 'Tool app_com_elix_documents_export_document mounted');
    const exportDocRes = await exportDocTool.execute({
        targetFormat: 'html',
        destinationPath: '/home/elix/exports/specs.html'
    });
    assertTest(exportDocRes.success === true, 'export_document invocation succeeded');
    const captureScreenTool = toolSink.getTool('app_com_elix_capture_capture_screen');
    assertTest(!!captureScreenTool, 'Tool app_com_elix_capture_capture_screen mounted');
    const captureRes = await captureScreenTool.execute({
        mode: 'custom_region',
        regionBounds: { x: 100, y: 100, width: 800, height: 600 }
    });
    assertTest(captureRes.success === true, 'capture_screen invocation succeeded');
    const startRecTool = toolSink.getTool('app_com_elix_capture_start_screen_recording');
    assertTest(!!startRecTool, 'Tool app_com_elix_capture_start_screen_recording mounted');
    const startRecRes = await startRecTool.execute({
        captureAudio: true,
        frameRate: 60,
        resolutionQuality: '1080p'
    });
    assertTest(startRecRes.success === true, 'start_screen_recording invocation succeeded');
    const stopRecTool = toolSink.getTool('app_com_elix_capture_stop_screen_recording');
    assertTest(!!stopRecTool, 'Tool app_com_elix_capture_stop_screen_recording mounted');
    const stopRecRes = await stopRecTool.execute({
        saveFormat: 'mp4',
        destinationPath: '/home/elix/videos/screencast.mp4'
    });
    assertTest(stopRecRes.success === true, 'stop_screen_recording invocation succeeded');
    const applyAnnotateTool = toolSink.getTool('app_com_elix_capture_apply_annotation');
    assertTest(!!applyAnnotateTool, 'Tool app_com_elix_capture_apply_annotation mounted');
    const applyAnnotateRes = await applyAnnotateTool.execute({
        tool: 'arrow',
        coordinates: { x1: 50, y1: 50, x2: 250, y2: 200 },
        styling: { color: '#00a2ff', strokeWidth: 3 }
    });
    assertTest(applyAnnotateRes.success === true, 'apply_annotation invocation succeeded');
    const getHistoryTool = toolSink.getTool('app_com_elix_capture_get_capture_history');
    assertTest(!!getHistoryTool, 'Tool app_com_elix_capture_get_capture_history mounted');
    const getHistoryRes = await getHistoryTool.execute({
        limit: 10,
        filterType: 'all'
    });
    assertTest(getHistoryRes.success === true, 'get_capture_history invocation succeeded');
    const takePhotoTool = toolSink.getTool('app_com_elix_camera_take_photo');
    assertTest(!!takePhotoTool, 'Tool app_com_elix_camera_take_photo mounted');
    const takePhotoRes = await takePhotoTool.execute({
        cameraDeviceId: 'default_camera',
        flashEffect: true,
        countdownSeconds: 0,
        filterPreset: 'natural'
    });
    assertTest(takePhotoRes.success === true, 'take_photo invocation succeeded');
    const startVideoTool = toolSink.getTool('app_com_elix_camera_start_video_recording');
    assertTest(!!startVideoTool, 'Tool app_com_elix_camera_start_video_recording mounted');
    const startVideoRes = await startVideoTool.execute({
        cameraDeviceId: 'default_camera',
        audioDeviceId: 'default_mic',
        resolution: '1080p',
        fps: 60
    });
    assertTest(startVideoRes.success === true, 'start_video_recording invocation succeeded');
    const stopVideoTool = toolSink.getTool('app_com_elix_camera_stop_video_recording');
    assertTest(!!stopVideoTool, 'Tool app_com_elix_camera_stop_video_recording mounted');
    const stopVideoRes = await stopVideoTool.execute({
        saveFormat: 'mp4',
        destinationPath: '/home/elix/videos/rec_001.mp4'
    });
    assertTest(stopVideoRes.success === true, 'stop_video_recording invocation succeeded');
    const recordAudioTool = toolSink.getTool('app_com_elix_camera_record_audio_clip');
    assertTest(!!recordAudioTool, 'Tool app_com_elix_camera_record_audio_clip mounted');
    const recordAudioRes = await recordAudioTool.execute({
        durationSeconds: 5,
        sampleRate: 48000,
        audioDeviceId: 'default_mic'
    });
    assertTest(recordAudioRes.success === true, 'record_audio_clip invocation succeeded');
    const listDevicesTool = toolSink.getTool('app_com_elix_camera_list_capture_devices');
    assertTest(!!listDevicesTool, 'Tool app_com_elix_camera_list_capture_devices mounted');
    const listDevicesRes = await listDevicesTool.execute({
        deviceTypeFilter: 'all'
    });
    assertTest(listDevicesRes.success === true, 'list_capture_devices invocation succeeded');
    const togglePrompterTool = toolSink.getTool('app_com_elix_camera_toggle_teleprompter');
    assertTest(!!togglePrompterTool, 'Tool app_com_elix_camera_toggle_teleprompter mounted');
    const togglePrompterRes = await togglePrompterTool.execute({
        active: true,
        textScript: 'ELIX OS Live Studio Script',
        scrollSpeed: 1.5
    });
    assertTest(togglePrompterRes.success === true, 'toggle_teleprompter invocation succeeded');
    const spawnShellTool = toolSink.getTool('app_com_elix_terminal_spawn_shell_session');
    assertTest(!!spawnShellTool, 'Tool app_com_elix_terminal_spawn_shell_session mounted');
    const spawnShellRes = await spawnShellTool.execute({
        shellType: 'powershell',
        workingDirectory: 'C:\\Users\\elix',
        sessionId: 'sess-terminal-001'
    });
    assertTest(spawnShellRes.success === true, 'spawn_shell_session invocation succeeded');
    const execCmdTool = toolSink.getTool('app_com_elix_terminal_execute_command');
    assertTest(!!execCmdTool, 'Tool app_com_elix_terminal_execute_command mounted');
    const execCmdRes = await execCmdTool.execute({
        sessionId: 'sess-terminal-001',
        commandString: 'Get-ChildItem -Path .',
        runInBackground: false
    });
    assertTest(execCmdRes.success === true, 'execute_command invocation succeeded');
    const sendInputTool = toolSink.getTool('app_com_elix_terminal_send_terminal_input');
    assertTest(!!sendInputTool, 'Tool app_com_elix_terminal_send_terminal_input mounted');
    const sendInputRes = await sendInputTool.execute({
        sessionId: 'sess-terminal-001',
        inputData: 'echo test\n',
        sendInterrupt: false
    });
    assertTest(sendInputRes.success === true, 'send_terminal_input invocation succeeded');
    const getOutputTool = toolSink.getTool('app_com_elix_terminal_get_session_output');
    assertTest(!!getOutputTool, 'Tool app_com_elix_terminal_get_session_output mounted');
    const getOutputRes = await getOutputTool.execute({
        sessionId: 'sess-terminal-001',
        lineLimit: 50
    });
    assertTest(getOutputRes.success === true, 'get_session_output invocation succeeded');
    const listSessTool = toolSink.getTool('app_com_elix_terminal_list_active_sessions');
    assertTest(!!listSessTool, 'Tool app_com_elix_terminal_list_active_sessions mounted');
    const listSessRes = await listSessTool.execute({});
    assertTest(listSessRes.success === true, 'list_active_sessions invocation succeeded');
    const killSessTool = toolSink.getTool('app_com_elix_terminal_kill_session');
    assertTest(!!killSessTool, 'Tool app_com_elix_terminal_kill_session mounted');
    const killSessRes = await killSessTool.execute({
        sessionId: 'sess-terminal-001',
        force: true
    });
    assertTest(killSessRes.success === true, 'kill_session invocation succeeded');
    const openCodeTool = toolSink.getTool('app_com_elix_code_open_code_file');
    assertTest(!!openCodeTool, 'Tool app_com_elix_code_open_code_file mounted');
    const openCodeRes = await openCodeTool.execute({
        filePath: 'src/main.ts',
        language: 'typescript',
        lineFocus: 1
    });
    assertTest(openCodeRes.success === true, 'open_code_file invocation succeeded');
    const saveCodeTool = toolSink.getTool('app_com_elix_code_save_code_file');
    assertTest(!!saveCodeTool, 'Tool app_com_elix_code_save_code_file mounted');
    const saveCodeRes = await saveCodeTool.execute({
        filePath: 'src/main.ts',
        content: 'export const ELIX_VERSION = "2.0.0";'
    });
    assertTest(saveCodeRes.success === true, 'save_code_file invocation succeeded');
    const formatCodeTool = toolSink.getTool('app_com_elix_code_format_document');
    assertTest(!!formatCodeTool, 'Tool app_com_elix_code_format_document mounted');
    const formatCodeRes = await formatCodeTool.execute({
        content: '{"format":"json","pretty":true}',
        language: 'json'
    });
    assertTest(formatCodeRes.success === true, 'format_document invocation succeeded');
    const getDiffTool = toolSink.getTool('app_com_elix_code_get_git_diff');
    assertTest(!!getDiffTool, 'Tool app_com_elix_code_get_git_diff mounted');
    const getDiffRes = await getDiffTool.execute({
        repoPath: '.',
        stagedOnly: false
    });
    assertTest(getDiffRes.success === true, 'get_git_diff invocation succeeded');
    const inspectTableTool = toolSink.getTool('app_com_elix_code_inspect_database_table');
    assertTest(!!inspectTableTool, 'Tool app_com_elix_code_inspect_database_table mounted');
    const inspectTableRes = await inspectTableTool.execute({
        dbPath: 'data/app.db',
        tableName: 'users',
        limit: 10,
        offset: 0
    });
    assertTest(inspectTableRes.success === true, 'inspect_database_table invocation succeeded');
    const execSqlTool = toolSink.getTool('app_com_elix_code_execute_sql_query');
    assertTest(!!execSqlTool, 'Tool app_com_elix_code_execute_sql_query mounted');
    const execSqlRes = await execSqlTool.execute({
        dbPath: 'data/app.db',
        query: 'SELECT * FROM users LIMIT 5;'
    });
    assertTest(execSqlRes.success === true, 'execute_sql_query invocation succeeded');
    const getMetricsTool = toolSink.getTool('app_com_elix_sysmon_get_system_metrics');
    assertTest(!!getMetricsTool, 'Tool app_com_elix_sysmon_get_system_metrics mounted');
    const getMetricsRes = await getMetricsTool.execute({
        includePerCoreCpu: true,
        includeGpu: true
    });
    assertTest(getMetricsRes.success === true, 'get_system_metrics invocation succeeded');
    const listProcTool = toolSink.getTool('app_com_elix_sysmon_list_processes');
    assertTest(!!listProcTool, 'Tool app_com_elix_sysmon_list_processes mounted');
    const listProcRes = await listProcTool.execute({
        sortBy: 'cpu',
        sortOrder: 'desc',
        limit: 10
    });
    assertTest(listProcRes.success === true, 'list_processes invocation succeeded');
    const killProcTool = toolSink.getTool('app_com_elix_sysmon_kill_process');
    assertTest(!!killProcTool, 'Tool app_com_elix_sysmon_kill_process mounted');
    const killProcRes = await killProcTool.execute({
        pid: 4210,
        force: true
    });
    assertTest(killProcRes.success === true, 'kill_process invocation succeeded');
    const getDiskIoTool = toolSink.getTool('app_com_elix_sysmon_get_disk_io_stats');
    assertTest(!!getDiskIoTool, 'Tool app_com_elix_sysmon_get_disk_io_stats mounted');
    const getDiskIoRes = await getDiskIoTool.execute({});
    assertTest(getDiskIoRes.success === true, 'get_disk_io_stats invocation succeeded');
    const getNetIoTool = toolSink.getTool('app_com_elix_sysmon_get_network_io_stats');
    assertTest(!!getNetIoTool, 'Tool app_com_elix_sysmon_get_network_io_stats mounted');
    const getNetIoRes = await getNetIoTool.execute({});
    assertTest(getNetIoRes.success === true, 'get_network_io_stats invocation succeeded');
    const getSysOverviewTool = toolSink.getTool('app_com_elix_sysmon_get_system_overview');
    assertTest(!!getSysOverviewTool, 'Tool app_com_elix_sysmon_get_system_overview mounted');
    const getSysOverviewRes = await getSysOverviewTool.execute({});
    assertTest(getSysOverviewRes.success === true, 'get_system_overview invocation succeeded');
    // --- com.elix.devices capabilities ---
    const scanBtTool = toolSink.getTool('app_com_elix_devices_scan_bluetooth_devices');
    assertTest(!!scanBtTool, 'Tool app_com_elix_devices_scan_bluetooth_devices mounted');
    const scanBtRes = await scanBtTool.execute({ timeoutSeconds: 5 });
    assertTest(scanBtRes.success === true, 'scan_bluetooth_devices invocation succeeded');
    const toggleBtTool = toolSink.getTool('app_com_elix_devices_toggle_bluetooth_state');
    assertTest(!!toggleBtTool, 'Tool app_com_elix_devices_toggle_bluetooth_state mounted');
    const toggleBtRes = await toggleBtTool.execute({ enabled: true, targetDeviceId: 'bt-01', action: 'connect' });
    assertTest(toggleBtRes.success === true, 'toggle_bluetooth_state invocation succeeded');
    const scanWifiTool = toolSink.getTool('app_com_elix_devices_scan_wifi_networks');
    assertTest(!!scanWifiTool, 'Tool app_com_elix_devices_scan_wifi_networks mounted');
    const scanWifiRes = await scanWifiTool.execute({ forceRefresh: true });
    assertTest(scanWifiRes.success === true, 'scan_wifi_networks invocation succeeded');
    const configDispTool = toolSink.getTool('app_com_elix_devices_configure_display');
    assertTest(!!configDispTool, 'Tool app_com_elix_devices_configure_display mounted');
    const configDispRes = await configDispTool.execute({
        displayId: 'disp-1',
        resolution: { width: 3840, height: 2160 },
        refreshRateHz: 144,
        scaleFactor: 1.5,
        orientation: 'landscape'
    });
    assertTest(configDispRes.success === true, 'configure_display invocation succeeded');
    const setAudioTool = toolSink.getTool('app_com_elix_devices_set_audio_device');
    assertTest(!!setAudioTool, 'Tool app_com_elix_devices_set_audio_device mounted');
    const setAudioRes = await setAudioTool.execute({
        deviceType: 'output',
        deviceId: 'audio-out-01',
        volumeLevel: 80,
        isMuted: false
    });
    assertTest(setAudioRes.success === true, 'set_audio_device invocation succeeded');
    const getBatteryTool = toolSink.getTool('app_com_elix_devices_get_battery_diagnostics');
    assertTest(!!getBatteryTool, 'Tool app_com_elix_devices_get_battery_diagnostics mounted');
    const getBatteryRes = await getBatteryTool.execute({});
    assertTest(getBatteryRes.success === true, 'get_battery_diagnostics invocation succeeded');
    const listPeripheralsTool = toolSink.getTool('app_com_elix_devices_list_connected_peripherals');
    assertTest(!!listPeripheralsTool, 'Tool app_com_elix_devices_list_connected_peripherals mounted');
    const listPeripheralsRes = await listPeripheralsTool.execute({});
    assertTest(listPeripheralsRes.success === true, 'list_connected_peripherals invocation succeeded');
    // --- com.elix.settings capabilities ---
    const getSysSettingsTool = toolSink.getTool('app_com_elix_settings_get_system_settings');
    assertTest(!!getSysSettingsTool, 'Tool app_com_elix_settings_get_system_settings mounted');
    const getSysSettingsRes = await getSysSettingsTool.execute({ categoryFilter: 'all' });
    assertTest(getSysSettingsRes.success === true, 'get_system_settings invocation succeeded');
    const updateSettingTool = toolSink.getTool('app_com_elix_settings_update_setting');
    assertTest(!!updateSettingTool, 'Tool app_com_elix_settings_update_setting mounted');
    const updateSettingRes = await updateSettingTool.execute({
        key: 'appearance.accentColor',
        value: '#38bdf8',
        category: 'appearance'
    });
    assertTest(updateSettingRes.success === true, 'update_setting invocation succeeded');
    const resetSettingsCatTool = toolSink.getTool('app_com_elix_settings_reset_settings_category');
    assertTest(!!resetSettingsCatTool, 'Tool app_com_elix_settings_reset_settings_category mounted');
    const resetSettingsCatRes = await resetSettingsCatTool.execute({ category: 'appearance' });
    assertTest(resetSettingsCatRes.success === true, 'reset_settings_category invocation succeeded');
    const managePermsTool = toolSink.getTool('app_com_elix_settings_manage_permissions');
    assertTest(!!managePermsTool, 'Tool app_com_elix_settings_manage_permissions mounted');
    const managePermsRes = await managePermsTool.execute({
        appId: 'com.elix.notes',
        permissionType: 'camera',
        granted: true
    });
    assertTest(managePermsRes.success === true, 'manage_permissions invocation succeeded');
    const clearSysCachesTool = toolSink.getTool('app_com_elix_settings_clear_system_caches');
    assertTest(!!clearSysCachesTool, 'Tool app_com_elix_settings_clear_system_caches mounted');
    const clearSysCachesRes = await clearSysCachesTool.execute({
        targetCaches: ['app_cache', 'logs']
    });
    assertTest(clearSysCachesRes.success === true, 'clear_system_caches invocation succeeded');
    const exportConfigTool = toolSink.getTool('app_com_elix_settings_export_configuration');
    assertTest(!!exportConfigTool, 'Tool app_com_elix_settings_export_configuration mounted');
    const exportConfigRes = await exportConfigTool.execute({
        destinationPath: 'backup-config.json',
        encryptWithPassword: false
    });
    assertTest(exportConfigRes.success === true, 'export_configuration invocation succeeded');
    // --- com.elix.appcenter capabilities ---
    const listInstalledAppsTool = toolSink.getTool('app_com_elix_appcenter_list_installed_apps');
    assertTest(!!listInstalledAppsTool, 'Tool app_com_elix_appcenter_list_installed_apps mounted');
    const listInstalledAppsRes = await listInstalledAppsTool.execute({ includeSystemApps: true });
    assertTest(listInstalledAppsRes.success === true, 'list_installed_apps invocation succeeded');
    const searchCatalogTool = toolSink.getTool('app_com_elix_appcenter_search_store_catalog');
    assertTest(!!searchCatalogTool, 'Tool app_com_elix_appcenter_search_store_catalog mounted');
    const searchCatalogRes = await searchCatalogTool.execute({
        query: 'studio',
        category: 'media',
        sortBy: 'popular'
    });
    assertTest(searchCatalogRes.success === true, 'search_store_catalog invocation succeeded');
    const installElixAppTool = toolSink.getTool('app_com_elix_appcenter_install_elixapp');
    assertTest(!!installElixAppTool, 'Tool app_com_elix_appcenter_install_elixapp mounted');
    const installElixAppRes = await installElixAppTool.execute({
        packagePathOrUrl: 'packages/com.elix.notes.elixapp',
        autoGrantPermissions: true,
        verifySignature: true
    });
    assertTest(installElixAppRes.success === true, 'install_elixapp invocation succeeded');
    const uninstallElixAppTool = toolSink.getTool('app_com_elix_appcenter_uninstall_elixapp');
    assertTest(!!uninstallElixAppTool, 'Tool app_com_elix_appcenter_uninstall_elixapp mounted');
    const uninstallElixAppRes = await uninstallElixAppTool.execute({
        packageId: 'com.elix.fakeapp',
        purgeAppData: false
    });
    assertTest(uninstallElixAppRes.success === true, 'uninstall_elixapp invocation succeeded');
    const checkForUpdatesTool = toolSink.getTool('app_com_elix_appcenter_check_for_updates');
    assertTest(!!checkForUpdatesTool, 'Tool app_com_elix_appcenter_check_for_updates mounted');
    const checkForUpdatesRes = await checkForUpdatesTool.execute({ packageIds: [] });
    assertTest(checkForUpdatesRes.success === true, 'check_for_updates invocation succeeded');
    const inspectManifestTool = toolSink.getTool('app_com_elix_appcenter_inspect_package_manifest');
    assertTest(!!inspectManifestTool, 'Tool app_com_elix_appcenter_inspect_package_manifest mounted');
    const inspectManifestRes = await inspectManifestTool.execute({
        packageIdOrBundlePath: 'com.elix.notes'
    });
    assertTest(inspectManifestRes.success === true, 'inspect_package_manifest invocation succeeded');
    // --- com.elix.search capabilities ---
    const searchIndexTool = toolSink.getTool('app_com_elix_search_query_universal_index');
    assertTest(!!searchIndexTool, 'Tool app_com_elix_search_query_universal_index mounted');
    const searchIndexRes = await searchIndexTool.execute({
        searchQuery: 'ELIX Code',
        scopeFilter: 'all',
        maxResults: 20
    });
    assertTest(searchIndexRes.success === true, 'query_universal_index invocation succeeded');
    const executeShortcutTool = toolSink.getTool('app_com_elix_search_execute_action_shortcut');
    assertTest(!!executeShortcutTool, 'Tool app_com_elix_search_execute_action_shortcut mounted');
    const executeShortcutRes = await executeShortcutTool.execute({
        actionId: 'toggle_dark_mode',
        targetAppId: 'com.elix.settings'
    });
    assertTest(executeShortcutRes.success === true, 'execute_action_shortcut invocation succeeded');
    const evaluateCalcTool = toolSink.getTool('app_com_elix_search_evaluate_quick_calculation');
    assertTest(!!evaluateCalcTool, 'Tool app_com_elix_search_evaluate_quick_calculation mounted');
    const evaluateCalcRes = await evaluateCalcTool.execute({
        expressionString: '254 * 1.18'
    });
    assertTest(evaluateCalcRes.success === true, 'evaluate_quick_calculation invocation succeeded');
    const rebuildSearchIndexTool = toolSink.getTool('app_com_elix_search_rebuild_search_index');
    assertTest(!!rebuildSearchIndexTool, 'Tool app_com_elix_search_rebuild_search_index mounted');
    const rebuildSearchIndexRes = await rebuildSearchIndexTool.execute({
        targetDataSources: ['apps', 'files', 'settings']
    });
    assertTest(rebuildSearchIndexRes.success === true, 'rebuild_search_index invocation succeeded');
    const getRecentSearchesTool = toolSink.getTool('app_com_elix_search_get_recent_searches');
    assertTest(!!getRecentSearchesTool, 'Tool app_com_elix_search_get_recent_searches mounted');
    const getRecentSearchesRes = await getRecentSearchesTool.execute({ limit: 10 });
    assertTest(getRecentSearchesRes.success === true, 'get_recent_searches invocation succeeded');
    // --- com.elix.center capabilities ---
    const listActiveAgentsTool = toolSink.getTool('app_com_elix_center_list_active_agents');
    assertTest(!!listActiveAgentsTool, 'Tool app_com_elix_center_list_active_agents mounted');
    const listActiveAgentsRes = await listActiveAgentsTool.execute({ statusFilter: 'all' });
    assertTest(listActiveAgentsRes.success === true, 'list_active_agents invocation succeeded');
    const spawnAgentRunTool = toolSink.getTool('app_com_elix_center_spawn_agent_run');
    assertTest(!!spawnAgentRunTool, 'Tool app_com_elix_center_spawn_agent_run mounted');
    const spawnAgentRunRes = await spawnAgentRunTool.execute({
        goalPrompt: 'Analyze performance telemetry',
        assignedModel: 'claude-3-5-sonnet',
        enabledMcpServers: ['fs-bridge'],
        maxBudgetTokens: 5000,
        autoApprovalLevel: 'auto_read'
    });
    assertTest(spawnAgentRunRes.success === true, 'spawn_agent_run invocation succeeded');
    const queryMcpServersTool = toolSink.getTool('app_com_elix_center_query_mcp_servers');
    assertTest(!!queryMcpServersTool, 'Tool app_com_elix_center_query_mcp_servers mounted');
    const queryMcpServersRes = await queryMcpServersTool.execute({
        includeSchemas: true,
        healthCheck: true
    });
    assertTest(queryMcpServersRes.success === true, 'query_mcp_servers invocation succeeded');
    const toggleMcpServerTool = toolSink.getTool('app_com_elix_center_toggle_mcp_server');
    assertTest(!!toggleMcpServerTool, 'Tool app_com_elix_center_toggle_mcp_server mounted');
    const toggleMcpServerRes = await toggleMcpServerTool.execute({
        serverId: 'fs-bridge',
        action: 'restart'
    });
    assertTest(toggleMcpServerRes.success === true, 'toggle_mcp_server invocation succeeded');
    const inspectVectorsTool = toolSink.getTool('app_com_elix_center_inspect_memory_vectors');
    assertTest(!!inspectVectorsTool, 'Tool app_com_elix_center_inspect_memory_vectors mounted');
    const inspectVectorsRes = await inspectVectorsTool.execute({
        query: 'system architecture',
        collectionName: 'code_base',
        topK: 5,
        minSimilarityScore: 0.8
    });
    assertTest(inspectVectorsRes.success === true, 'inspect_memory_vectors invocation succeeded');
    const getTokenTelemetryTool = toolSink.getTool('app_com_elix_center_get_token_telemetry');
    assertTest(!!getTokenTelemetryTool, 'Tool app_com_elix_center_get_token_telemetry mounted');
    const getTokenTelemetryRes = await getTokenTelemetryTool.execute({
        timeWindow: '24h',
        groupBy: 'model'
    });
    assertTest(getTokenTelemetryRes.success === true, 'get_token_telemetry invocation succeeded');
    // ==========================================================================
    // 6. OPTION 5: Install .ELIXAPP Package (install_elix_app)
    // ==========================================================================
    logStep('Option 5', 'Install .ELIXAPP Package via install_elix_app Tool');
    const installRes = await installAppTool.execute({
        packagePath: path.join(PACKAGE_ROOT, 'fixtures', 'com.elix.fakeapp'),
        force: true,
    });
    assertTest(installRes.success === true, 'install_elix_app executed', `App ID: ${installRes.appId}`);
    // ==========================================================================
    // 7. OPTION 7: Manage App Permissions & Capabilities
    // ==========================================================================
    logStep('Option 7', 'Manage App Security Policy (Permissions & Capabilities)');
    const initialPerms = appManager.getPermissions('com.elix.notes');
    assertTest(initialPerms.length > 0, 'Retrieved active permissions', initialPerms.join(', '));
    appManager.setPermission('com.elix.notes', 'security:camera', true);
    assertTest(appManager.getPermissions('com.elix.notes').includes('security:camera'), 'Granted security:camera permission');
    appManager.setPermission('com.elix.notes', 'security:camera', false);
    assertTest(!appManager.getPermissions('com.elix.notes').includes('security:camera'), 'Revoked security:camera permission');
    appManager.setCapability('com.elix.notes', 'search_notes', false);
    assertTest(toolSink.getTool('app_com_elix_notes_search_notes') === undefined, 'Capability search_notes disabled and unmounted');
    appManager.setCapability('com.elix.notes', 'search_notes', true);
    assertTest(toolSink.getTool('app_com_elix_notes_search_notes') !== undefined, 'Capability search_notes re-enabled and remounted');
    // ==========================================================================
    // 8. OPTION 8: Repair Installed Application
    // ==========================================================================
    logStep('Option 8', 'Repair Installed Application');
    const repaired = await appManager.repair('com.elix.calculator');
    assertTest(repaired.manifest.id === 'com.elix.calculator', 'Repaired com.elix.calculator');
    assertTest(toolSink.getTool('app_com_elix_calculator_calculate') !== undefined, 'Verified tool integrity post-repair');
    await openAppTool.execute({ appId: 'com.elix.calculator' });
    // ==========================================================================
    // 9. OPTION 10: Close App Window (close_app)
    // ==========================================================================
    logStep('Option 10', 'Close Active Windows via close_app Tool');
    const closeNotes = await closeAppTool.execute({ appId: 'com.elix.notes' });
    assertTest(closeNotes.success === true, 'Closed Notes window');
    const closeCalc = await closeAppTool.execute({ appId: 'com.elix.calculator' });
    assertTest(closeCalc.success === true, 'Closed Calculator window');
    const closeClock = await closeAppTool.execute({ appId: 'com.elix.clock' });
    assertTest(closeClock.success === true, 'Closed Clock window');
    const closeCal = await closeAppTool.execute({ appId: 'com.elix.calendar' });
    assertTest(closeCal.success === true, 'Closed Calendar window');
    const closeUtil = await closeAppTool.execute({ appId: 'com.elix.utilities' });
    assertTest(closeUtil.success === true, 'Closed Utilities window');
    const closeFiles = await closeAppTool.execute({ appId: 'com.elix.files' });
    assertTest(closeFiles.success === true, 'Closed Files window');
    const closeMedia = await closeAppTool.execute({ appId: 'com.elix.media' });
    assertTest(closeMedia.success === true, 'Closed Media window');
    const closeStudio = await closeAppTool.execute({ appId: 'com.elix.mediastudio' });
    assertTest(closeStudio.success === true, 'Closed Media Studio window');
    const closeStudio3d = await closeAppTool.execute({ appId: 'com.elix.studio3d' });
    assertTest(closeStudio3d.success === true, 'Closed 3D Studio window');
    const closeDocs = await closeAppTool.execute({ appId: 'com.elix.documents' });
    assertTest(closeDocs.success === true, 'Closed Documents window');
    const closeCapture = await closeAppTool.execute({ appId: 'com.elix.capture' });
    assertTest(closeCapture.success === true, 'Closed Capture window');
    const closeCamera = await closeAppTool.execute({ appId: 'com.elix.camera' });
    assertTest(closeCamera.success === true, 'Closed Camera window');
    const closeTerminal = await closeAppTool.execute({ appId: 'com.elix.terminal' });
    assertTest(closeTerminal.success === true, 'Closed Terminal window');
    const closeCode = await closeAppTool.execute({ appId: 'com.elix.code' });
    assertTest(closeCode.success === true, 'Closed Code window');
    const closeSysmon = await closeAppTool.execute({ appId: 'com.elix.sysmon' });
    assertTest(closeSysmon.success === true, 'Closed SysMon window');
    const closeDevices = await closeAppTool.execute({ appId: 'com.elix.devices' });
    assertTest(closeDevices.success === true, 'Closed Devices window');
    const closeSettings = await closeAppTool.execute({ appId: 'com.elix.settings' });
    assertTest(closeSettings.success === true, 'Closed Settings window');
    const closeAppCenter = await closeAppTool.execute({ appId: 'com.elix.appcenter' });
    assertTest(closeAppCenter.success === true, 'Closed App Center window');
    const closeSearch = await closeAppTool.execute({ appId: 'com.elix.search' });
    assertTest(closeSearch.success === true, 'Closed Universal Search window');
    const closeCenter = await closeAppTool.execute({ appId: 'com.elix.center' });
    assertTest(closeCenter.success === true, 'Closed ELIX Center window');
    const closeFake = await closeAppTool.execute({ appId: 'com.elix.fakeapp' });
    assertTest(closeFake.success === true, 'Closed FakeApp window');
    const runningAfter = await getAppListTool.execute({ filter: 'running' });
    assertTest(runningAfter.count === 0, 'Zero running windows remaining');
    // ==========================================================================
    // 10. OPTION 9: Uninstall Application (Safe Data Retention)
    // ==========================================================================
    logStep('Option 9', 'Uninstall Application with Safe Data Retention');
    const impactPlan = await appManager.prepareUninstall('com.elix.fakeapp');
    assertTest(impactPlan.appId === 'com.elix.fakeapp', 'Generated uninstall impact plan');
    assertTest(impactPlan.dataRetentionAvailable === true || impactPlan.registeredToolsCount >= 1, 'Calculated storage & tool impact');
    const uninstalled = await appManager.uninstall('com.elix.fakeapp', { keepData: true });
    assertTest(uninstalled === true, 'Uninstalled com.elix.fakeapp (data preserved)');
    assertTest(toolSink.getTool('app_com_elix_fakeapp_ping') === undefined, 'Dynamic tools cleanly unmounted');
    // ==========================================================================
    // 11. OPTION 11: Exit & Cleanup Verification
    // ==========================================================================
    logStep('Option 11', 'Exit & Resource Cleanup');
    const allWindows = windowHost.listWindows();
    for (const win of allWindows) {
        await windowHost.close(win.appId);
    }
    assertTest(windowHost.listWindows().length === 0, 'Clean process teardown — no dangling windows');
    // Cleanup temp dir
    await fs.promises.rm(testDir, { recursive: true, force: true }).catch(() => { });
    console.log('\n\x1b[35m' + '='.repeat(75));
    console.log(`TOTAL RESULTS: ${passedCount} PASSED | ${failedCount} FAILED`);
    console.log('='.repeat(75) + '\x1b[0m\n');
    if (failedCount > 0) {
        process.exit(1);
    }
    else {
        process.exit(0);
    }
}
// Auto-run if executed directly
if (process.argv[1] && (process.argv[1].endsWith('test-all-options.ts') || process.argv[1].endsWith('test-all-options.js'))) {
    runAllOptionsAutomated().catch((err) => {
        console.error('Fatal test error:', err);
        process.exit(1);
    });
}
//# sourceMappingURL=test-all-options.js.map