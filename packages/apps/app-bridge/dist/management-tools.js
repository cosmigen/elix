/**
 * ELIX Native App Runtime & Dynamic App Bridge
 * Universal App Management AI Tools (Hexagonal Architecture)
 *
 * @module @deepseek-ai/elix-app-bridge/management-tools
 */
import { defineTool } from './utils/tools.js';
import { registerAppTools, unregisterAppTools } from './tool-registry.js';
import { sysFsList, sysFsReadWrite, sysHardwareScan } from './sys-primitives.js';
import { globalSysExecManager } from './sys-exec-stream.js';
/**
 * Creates the 4 mandatory AI app management tool definitions
 *
 * @param installer Package Installer instance
 * @param windowHost Window Host instance
 * @param toolSinkOrCtx Optional ToolSink port or Context for auto-mounting tools post-install
 */
export function createManagementTools(installer, windowHost, toolSinkOrCtx) {
    // 1. get_app_list
    const getAppListParams = {
        type: 'object',
        properties: {
            filter: {
                type: 'string',
                enum: ['all', 'running', 'installed'],
                description: "Filter apps by state: 'all' (default), 'running' (currently active window), or 'installed'",
                default: 'all',
            },
        },
        required: [],
    };
    const getAppListTool = defineTool({
        name: 'get_app_list',
        description: "List ELIX applications on the system. Filters by 'all', 'running', or 'installed'.",
        parameters: getAppListParams,
        execute: async (args) => {
            const filter = args?.filter || 'all';
            const installedApps = installer.listInstalledApps();
            const activeWindows = windowHost.listWindows();
            const activeAppIds = new Set(activeWindows.map((w) => w.appId));
            const results = [];
            for (const app of installedApps) {
                const isRunning = activeAppIds.has(app.manifest.id);
                const win = isRunning ? windowHost.getWindow(app.manifest.id) : undefined;
                if (filter === 'running' && !isRunning)
                    continue;
                if (filter === 'installed' && isRunning)
                    continue;
                const capabilities = app.manifest.capabilities || {};
                const capNames = Array.isArray(capabilities)
                    ? capabilities.map((c) => c.name)
                    : Object.keys(capabilities);
                results.push({
                    appId: app.manifest.id,
                    name: app.manifest.name,
                    version: app.manifest.version,
                    description: app.manifest.description,
                    status: isRunning ? 'running' : 'installed',
                    windowId: win?.id,
                    url: win?.url,
                    capabilities: capNames,
                    permissions: app.manifest.permissions || [],
                    mountedToolsCount: capNames.length,
                });
            }
            return {
                count: results.length,
                filter,
                apps: results,
            };
        },
    });
    // 2. open_app
    const openAppParams = {
        type: 'object',
        properties: {
            appId: {
                type: 'string',
                description: "Unique identifier of the application (e.g. 'com.elix.calculator')",
            },
            initialRoute: {
                type: 'string',
                description: "Optional initial route, view, or hash to navigate to (e.g. '/history' or 'settings')",
            },
        },
        required: ['appId'],
    };
    const openAppTool = defineTool({
        name: 'open_app',
        description: "Launch or focus an installed ELIX application window by its App ID.",
        parameters: openAppParams,
        execute: async (args) => {
            if (!args || !args.appId) {
                throw new Error("Missing required parameter 'appId'");
            }
            const win = await windowHost.launch(args.appId, args.initialRoute);
            return {
                success: true,
                appId: win.appId,
                windowId: win.id,
                state: win.state,
                title: win.title,
                geometry: win.geometry,
                url: win.url,
            };
        },
    });
    // 3. close_app
    const closeAppParams = {
        type: 'object',
        properties: {
            appId: {
                type: 'string',
                description: "Unique identifier of the application to close",
            },
        },
        required: ['appId'],
    };
    const closeAppTool = defineTool({
        name: 'close_app',
        description: "Close an active ELIX application window by its App ID.",
        parameters: closeAppParams,
        execute: async (args) => {
            if (!args || !args.appId) {
                throw new Error("Missing required parameter 'appId'");
            }
            const closed = await windowHost.close(args.appId);
            return {
                success: closed,
                appId: args.appId,
                message: closed
                    ? `Application '${args.appId}' closed successfully`
                    : `No active window found for app '${args.appId}'`,
            };
        },
    });
    // 4. install_elix_app
    const installAppParams = {
        type: 'object',
        properties: {
            packagePath: {
                type: 'string',
                description: "Path to the .elixapp archive or directory bundle",
            },
            force: {
                type: 'boolean',
                description: "Whether to overwrite an existing installation (default: false)",
                default: false,
            },
        },
        required: ['packagePath'],
    };
    const installAppTool = defineTool({
        name: 'install_elix_app',
        description: "Install or update an ELIX application package (.elixapp bundle) from a local path.",
        parameters: installAppParams,
        execute: async (args) => {
            if (!args || !args.packagePath) {
                throw new Error("Missing required parameter 'packagePath'");
            }
            const installedApp = await installer.install(args.packagePath, {
                force: !!args.force,
                skipConsent: true,
            });
            // Auto-register capabilities with ToolSink if provided
            if (toolSinkOrCtx) {
                registerAppTools(toolSinkOrCtx, windowHost, installedApp);
            }
            return {
                success: true,
                appId: installedApp.manifest.id,
                name: installedApp.manifest.name,
                version: installedApp.manifest.version,
                description: installedApp.manifest.description,
                installPath: installedApp.installPath,
                capabilities: installedApp.registeredTools.map((t) => t.name),
                permissions: installedApp.manifest.permissions || [],
            };
        },
    });
    // 5. uninstall_elix_app
    const uninstallAppParams = {
        type: 'object',
        properties: {
            appId: {
                type: 'string',
                description: "Unique identifier of the application to uninstall",
            },
            keepData: {
                type: 'boolean',
                description: "Whether to preserve persistent user data in app-data/<app-id>/ (default: true)",
                default: true,
            },
        },
        required: ['appId'],
    };
    const uninstallAppTool = defineTool({
        name: 'uninstall_elix_app',
        description: "Uninstall an ELIX application package with data safety retention options.",
        parameters: uninstallAppParams,
        execute: async (args) => {
            if (!args || !args.appId) {
                throw new Error("Missing required parameter 'appId'");
            }
            await windowHost.close(args.appId).catch(() => { });
            const keepData = args.keepData !== false;
            const success = await installer.uninstall(args.appId, { keepData });
            if (toolSinkOrCtx) {
                unregisterAppTools(toolSinkOrCtx, args.appId);
            }
            return {
                success,
                appId: args.appId,
                dataPreserved: keepData,
                message: success
                    ? `Application '${args.appId}' uninstalled successfully (${keepData ? 'User data preserved' : 'All data wiped'})`
                    : `Application '${args.appId}' was not installed`,
            };
        },
    });
    return [getAppListTool, openAppTool, closeAppTool, installAppTool, uninstallAppTool];
}
/**
 * Creates the 4 host-level OS access primitives for ELIX OS:
 * 1. sys_exec_code
 * 2. sys_fs_list
 * 3. sys_fs_read_write
 * 4. sys_hardware_scan
 */
export function createSystemTools() {
    // sys_exec_code
    const sysExecCodeTool = defineTool({
        name: 'sys_exec_code',
        description: 'Execute code or terminal commands (Node.js, Python, PowerShell) with real-time streaming output over WebSocket and process tree termination safety.',
        parameters: {
            type: 'object',
            properties: {
                command: { type: 'string', description: "Executable or shell to run ('node', 'python', 'powershell', 'bash')", default: 'node' },
                code: { type: 'string', description: 'Script source code to execute' },
                args: { type: 'array', items: { type: 'string' }, description: 'Command line arguments' },
                timeoutMs: { type: 'number', description: 'Execution timeout in ms (default: 15000)', default: 15000 },
                cwd: { type: 'string', description: 'Working directory path' },
                env: { type: 'object', description: 'Environment variables object' },
                executionId: { type: 'string', description: 'Unique tracking ID for streaming output' },
            },
            required: [],
        },
        execute: async (args) => {
            const executionId = args?.executionId || `exec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
            return new Promise((resolve) => {
                globalSysExecManager.execute({
                    executionId,
                    command: args?.command || 'node',
                    code: args?.code,
                    args: args?.args || [],
                    timeoutMs: args?.timeoutMs ?? 15000,
                    cwd: args?.cwd,
                    env: args?.env,
                }, () => true, (res) => resolve(res.result || res));
            });
        },
    });
    // sys_fs_list
    const sysFsListTool = defineTool({
        name: 'sys_fs_list',
        description: 'Enumerate physical Windows drives, standard user folders, and directories with file sizes, POSIX permissions, timestamps, and MIME types.',
        parameters: {
            type: 'object',
            properties: {
                dirPath: { type: 'string', description: 'Target directory path to inspect (empty for root drives)' },
                includeHidden: { type: 'boolean', description: 'Whether to include hidden and dot files', default: false },
            },
            required: [],
        },
        execute: async (args) => {
            return sysFsList(args?.dirPath, args?.includeHidden);
        },
    });
    // sys_fs_read_write
    const sysFsReadWriteTool = defineTool({
        name: 'sys_fs_read_write',
        description: 'Read, write, delete, move, create directories, and inspect file stats on physical storage with protected Windows system root security guards.',
        parameters: {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    enum: ['read', 'write', 'delete', 'mkdir', 'move', 'copy', 'exists', 'stat'],
                    description: 'Filesystem operation to perform',
                },
                targetPath: { type: 'string', description: 'Canonical target file or directory path' },
                content: { type: 'string', description: 'Text content to write (for action: write)' },
                encoding: { type: 'string', description: 'Text encoding (default: utf8)', default: 'utf8' },
                destinationPath: { type: 'string', description: 'Destination path for move or copy actions' },
            },
            required: ['action', 'targetPath'],
        },
        execute: async (args) => {
            return sysFsReadWrite(args);
        },
    });
    // sys_hardware_scan
    const sysHardwareScanTool = defineTool({
        name: 'sys_hardware_scan',
        description: 'Scan host hardware peripherals, active network adapters with IP/MAC addresses, connected audio/video hardware, and display monitor topologies.',
        parameters: {
            type: 'object',
            properties: {},
            required: [],
        },
        execute: async () => {
            return sysHardwareScan();
        },
    });
    return [sysExecCodeTool, sysFsListTool, sysFsReadWriteTool, sysHardwareScanTool];
}
/**
 * Registers all universal application management and system tools onto a ToolSink or Microkernel Context.
 *
 * @param toolSinkOrCtx ToolSink port or Microkernel Context
 * @param installer Package Installer instance
 * @param windowHost Window Host instance
 * @returns Disposer function to unregister all tools
 */
export function registerManagementTools(toolSinkOrCtx, installer, windowHost) {
    const tools = createManagementTools(installer, windowHost, toolSinkOrCtx);
    const disposers = [];
    const sink = 'registerTool' in toolSinkOrCtx && typeof toolSinkOrCtx.registerTool === 'function'
        ? toolSinkOrCtx
        : {
            registerTool: (tool) => {
                const toolsSvc = toolSinkOrCtx.tools;
                if (toolsSvc && typeof toolsSvc.register === 'function') {
                    const res = toolsSvc.register(tool);
                    return typeof res === 'function' ? res : () => toolsSvc.unregister?.(tool.name);
                }
                return () => { };
            },
            unregisterTool: (name) => {
                const toolsSvc = toolSinkOrCtx.tools;
                if (toolsSvc && typeof toolsSvc.unregister === 'function') {
                    toolsSvc.unregister(name);
                }
            },
        };
    for (const tool of tools) {
        const disposeFn = sink.registerTool(tool);
        disposers.push(disposeFn);
    }
    return () => {
        for (const dispose of disposers) {
            try {
                dispose();
            }
            catch {
                // Ignore dispose error
            }
        }
    };
}
/**
 * Registers the 4 host-level OS access primitives onto a ToolSink or Microkernel Context.
 *
 * @param toolSinkOrCtx ToolSink port or Microkernel Context
 * @returns Disposer function to unregister all system tools
 */
export function registerSystemTools(toolSinkOrCtx) {
    const tools = createSystemTools();
    const disposers = [];
    const sink = 'registerTool' in toolSinkOrCtx && typeof toolSinkOrCtx.registerTool === 'function'
        ? toolSinkOrCtx
        : {
            registerTool: (tool) => {
                const toolsSvc = toolSinkOrCtx.tools;
                if (toolsSvc && typeof toolsSvc.register === 'function') {
                    const res = toolsSvc.register(tool);
                    return typeof res === 'function' ? res : () => toolsSvc.unregister?.(tool.name);
                }
                return () => { };
            },
            unregisterTool: (name) => {
                const toolsSvc = toolSinkOrCtx.tools;
                if (toolsSvc && typeof toolsSvc.unregister === 'function') {
                    toolsSvc.unregister(name);
                }
            },
        };
    for (const tool of tools) {
        const disposeFn = sink.registerTool(tool);
        disposers.push(disposeFn);
    }
    return () => {
        for (const dispose of disposers) {
            try {
                dispose();
            }
            catch {
                // Ignore dispose error
            }
        }
    };
}
//# sourceMappingURL=management-tools.js.map