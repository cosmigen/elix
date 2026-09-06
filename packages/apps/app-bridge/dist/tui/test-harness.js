/**
 * ELIX Native App Runtime & Dynamic App Bridge
 * Interactive Terminal UI (TUI) Test Harness (ELIXAPP Spec v1.2.0 Standalone)
 *
 * Directly orchestrates the standalone ElixAppManager instance and mock adapter ports.
 *
 * @module @deepseek-ai/elix-app-bridge/tui/test-harness
 */
import * as p from '@clack/prompts';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';
import { ElixAppManager } from '../app-manager.js';
import { MemoryToolSink, MemoryCapabilityIndex, ConsoleConfirmationBroker } from '../adapters/ports.js';
import { registerManagementTools, createManagementTools } from '../management-tools.js';
import { ElixZip } from '../utils/zip.js';
// Resolve current package root
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PACKAGE_ROOT = path.resolve(__dirname, '..', '..');
/**
 * Package a demo directory into a .elixapp archive
 */
export function packageDemoApp(demoDir, outputZipPath) {
    const zip = new ElixZip();
    const addFolder = (dir, base = '') => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const ent of entries) {
            const full = path.join(dir, ent.name);
            const rel = base ? `${base}/${ent.name}` : ent.name;
            if (ent.isDirectory()) {
                addFolder(full, rel);
            }
            else {
                zip.addLocalFile(full, base);
            }
        }
    };
    addFolder(demoDir);
    zip.writeZip(outputZipPath);
}
/**
 * Main Interactive TUI Loop
 */
export async function runTui() {
    console.clear();
    p.intro('\x1b[36m⚡ ELIX OS Native App Runtime & Dynamic App Bridge TUI (v1.2.0 Standalone)\x1b[0m');
    const elixDir = path.join(os.homedir(), '.elix');
    const toolSink = new MemoryToolSink();
    const capabilityIndex = new MemoryCapabilityIndex();
    const confirmationBroker = new ConsoleConfirmationBroker(true);
    const appManager = new ElixAppManager({
        baseDir: elixDir,
        toolSink,
        capabilityIndex,
        confirmationBroker,
    });
    // Register universal management tools
    registerManagementTools(toolSink, appManager.installer, appManager.windowHost);
    // Auto-build and install demo apps if no apps installed yet
    const initialApps = appManager.list();
    if (initialApps.length === 0) {
        const s = p.spinner();
        s.start('Pre-packaging reference demo applications (Notes & Calculator)...');
        const demoNotesDir = path.join(PACKAGE_ROOT, 'demo-apps', 'com.elix.notes');
        const demoCalcDir = path.join(PACKAGE_ROOT, 'demo-apps', 'com.elix.calculator');
        const tmpDir = path.join(elixDir, 'app-staging', 'demo-bootstrap');
        fs.mkdirSync(tmpDir, { recursive: true });
        if (fs.existsSync(demoNotesDir)) {
            const notesZip = path.join(tmpDir, 'com.elix.notes.elixapp');
            packageDemoApp(demoNotesDir, notesZip);
            await appManager.install(notesZip, { skipConsent: true, force: true });
        }
        if (fs.existsSync(demoCalcDir)) {
            const calcZip = path.join(tmpDir, 'com.elix.calculator.elixapp');
            packageDemoApp(demoCalcDir, calcZip);
            await appManager.install(calcZip, { skipConsent: true, force: true });
        }
        s.stop('Reference demo applications installed and tools mounted.');
    }
    const managementToolsList = createManagementTools(appManager.installer, appManager.windowHost, toolSink);
    const getAppListTool = managementToolsList.find((t) => t.name === 'get_app_list');
    const openAppTool = managementToolsList.find((t) => t.name === 'open_app');
    const closeAppTool = managementToolsList.find((t) => t.name === 'close_app');
    let running = true;
    while (running) {
        const installed = appManager.list('all');
        const active = appManager.list('running');
        const registeredTools = toolSink.listTools();
        p.log.info(`Status: \x1b[32m${installed.length} Installed\x1b[0m | \x1b[36m${active.length} Running\x1b[0m | \x1b[35m${registeredTools.length} AI Tools Mounted\x1b[0m`);
        const action = await p.select({
            message: 'Select Action:',
            options: [
                { value: 'list', label: '1. List Installed Apps (get_app_list)', hint: 'Query all / running apps' },
                { value: 'inspect', label: '2. Inspect .ELIXAPP Package', hint: 'Inspect manifest & permissions' },
                { value: 'open', label: '3. Open Floating App Window (open_app)', hint: 'Launch frameless window' },
                { value: 'call', label: '4. Execute Dynamic Tool Call', hint: 'Invoke app capability via AI bridge' },
                { value: 'install', label: '5. Install .ELIXAPP Package (install_elix_app)', hint: 'Install bundle from path' },
                { value: 'build_demos', label: '6. Rebuild & Reinstall Demo Apps', hint: 'Refresh Notes & Calculator' },
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
                if (p.isCancel(filterChoice))
                    break;
                const result = await getAppListTool.execute({ filter: filterChoice });
                p.log.step(`Installed ELIX Applications (${result.count}):`);
                if (result.apps.length === 0) {
                    p.log.message('  No applications matched the filter.');
                }
                else {
                    for (const app of result.apps) {
                        const statusIcon = app.status === 'running' ? '🟢 [RUNNING]' : '⚪ [IDLE]';
                        p.log.message(`  \x1b[1m${app.name}\x1b[0m (${app.appId}) v${app.version} ${statusIcon}`);
                        p.log.message(`    Description: ${app.description}`);
                        p.log.message(`    Capabilities: ${app.capabilities.join(', ') || 'none'}`);
                        p.log.message(`    Permissions: ${app.permissions.join(', ') || 'sandbox'}`);
                        if (app.url)
                            p.log.message(`    Window URL: ${app.url}`);
                    }
                }
                break;
            }
            case 'inspect': {
                const pkgInput = await p.text({
                    message: 'Enter path to .elixapp archive or directory to inspect:',
                    placeholder: 'e.g. demo-apps/com.elix.notes',
                });
                if (p.isCancel(pkgInput) || !pkgInput.trim())
                    break;
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
                }
                catch (err) {
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
                const appToOpen = await p.select({
                    message: 'Select app to launch:',
                    options: apps.map((a) => ({
                        value: a.appId,
                        label: `${a.name} (${a.appId})`,
                        hint: `v${a.version}`,
                    })),
                });
                if (p.isCancel(appToOpen))
                    break;
                const route = await p.text({
                    message: 'Optional initial route/view (press Enter for default):',
                    placeholder: 'e.g. #settings or leave blank',
                });
                if (p.isCancel(route))
                    break;
                const s = p.spinner();
                s.start(`Launching window for '${appToOpen}'...`);
                try {
                    const res = await openAppTool.execute({ appId: appToOpen, initialRoute: route || undefined });
                    s.stop(`Window launched successfully! [Window ID: ${res.windowId}]`);
                    p.log.info(`Geometry: ${res.geometry.width}x${res.geometry.height} | URL: ${res.url}`);
                }
                catch (err) {
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
                if (p.isCancel(selectedToolName))
                    break;
                const tool = tools.find((t) => t.name === selectedToolName);
                // Provide sample arguments helper
                let defaultArgs = '{}';
                if (selectedToolName.includes('create_note')) {
                    defaultArgs = JSON.stringify({ title: 'AI Research Note', body: 'Autonomous OS Architecture with Hexagonal Ports', tags: ['ai', 'ports'] }, null, 2);
                }
                else if (selectedToolName.includes('calculate')) {
                    defaultArgs = JSON.stringify({ expression: '48 * 12 + 144 / 12' }, null, 2);
                }
                else if (selectedToolName.includes('search_notes')) {
                    defaultArgs = JSON.stringify({ query: 'architecture' }, null, 2);
                }
                const inputJson = await p.text({
                    message: `Enter JSON arguments for '${selectedToolName}':`,
                    initialValue: defaultArgs,
                    validate: (val) => {
                        try {
                            JSON.parse(val);
                            return;
                        }
                        catch {
                            return 'Invalid JSON syntax';
                        }
                    },
                });
                if (p.isCancel(inputJson))
                    break;
                const parsedArgs = JSON.parse(inputJson);
                const s = p.spinner();
                s.start(`Executing tool '${selectedToolName}'...`);
                const startTime = Date.now();
                try {
                    const result = await tool.execute(parsedArgs);
                    const elapsed = Date.now() - startTime;
                    s.stop(`Tool executed in ${elapsed}ms! Result:`);
                    console.log('\x1b[32m' + JSON.stringify(result, null, 2) + '\x1b[0m');
                }
                catch (err) {
                    s.stop(`Tool execution failed: ${err.message}`);
                }
                break;
            }
            case 'install': {
                const packagePathInput = await p.text({
                    message: 'Enter path to .elixapp archive or directory bundle:',
                    placeholder: 'e.g. fixtures/com.elix.fakeapp or demo-apps/com.elix.notes',
                });
                if (p.isCancel(packagePathInput) || !packagePathInput.trim())
                    break;
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
                }
                catch (err) {
                    s.stop(`Installation failed: ${err.message}`);
                }
                break;
            }
            case 'build_demos': {
                const s = p.spinner();
                s.start('Rebuilding and packaging demo applications...');
                const demoNotesDir = path.join(PACKAGE_ROOT, 'demo-apps', 'com.elix.notes');
                const demoCalcDir = path.join(PACKAGE_ROOT, 'demo-apps', 'com.elix.calculator');
                const tmpDir = path.join(elixDir, 'app-staging', 'demo-build');
                fs.mkdirSync(tmpDir, { recursive: true });
                const notesZip = path.join(tmpDir, 'com.elix.notes.elixapp');
                packageDemoApp(demoNotesDir, notesZip);
                await appManager.install(notesZip, { skipConsent: true, force: true });
                const calcZip = path.join(tmpDir, 'com.elix.calculator.elixapp');
                packageDemoApp(demoCalcDir, calcZip);
                await appManager.install(calcZip, { skipConsent: true, force: true });
                s.stop('Demo apps refreshed and mounted to ToolSink.');
                break;
            }
            case 'policy': {
                const apps = appManager.list('all');
                if (apps.length === 0) {
                    p.log.warn('No applications installed.');
                    break;
                }
                const selectedApp = await p.select({
                    message: 'Select app to manage policies:',
                    options: apps.map((a) => ({ value: a.appId, label: a.name, hint: a.appId })),
                });
                if (p.isCancel(selectedApp))
                    break;
                const perms = appManager.getPermissions(selectedApp);
                const caps = appManager.getCapabilities(selectedApp);
                p.log.step(`Policies for '${selectedApp}':`);
                p.log.message(`  Active Permissions: ${perms.join(', ') || 'None'}`);
                p.log.message(`  Capabilities: ${caps.map((c) => c.name).join(', ') || 'None'}`);
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
                if (p.isCancel(appToRepair))
                    break;
                const s = p.spinner();
                s.start(`Repairing application '${appToRepair}'...`);
                try {
                    const repaired = await appManager.repair(appToRepair);
                    s.stop(`Application '${repaired.manifest.name}' repaired successfully!`);
                }
                catch (err) {
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
                if (p.isCancel(appToUninstall))
                    break;
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
                if (p.isCancel(keepDataChoice))
                    break;
                const s = p.spinner();
                s.start(`Uninstalling '${plan.name}'...`);
                try {
                    await appManager.uninstall(appToUninstall, { keepData: keepDataChoice });
                    s.stop(`Application '${plan.name}' uninstalled successfully! (Data preserved: ${keepDataChoice})`);
                }
                catch (err) {
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
                if (p.isCancel(winToClose))
                    break;
                const res = await closeAppTool.execute({ appId: winToClose });
                p.log.success(res.message);
                break;
            }
        }
        console.log('');
    }
    p.outro('ELIX OS App Bridge session ended.');
}
// Auto-run if executed directly
if (process.argv[1] && (process.argv[1].endsWith('test-harness.ts') || process.argv[1].endsWith('test-harness.js'))) {
    runTui().catch((err) => {
        console.error('Fatal TUI error:', err);
        process.exit(1);
    });
}
//# sourceMappingURL=test-harness.js.map