/**
 * ELIX Native App Runtime & Dynamic App Bridge
 * Unified Public Application Manager Facade (ELIXAPP Spec v1.2.0)
 *
 * @module @deepseek-ai/elix-app-bridge/app-manager
 */
import { EventEmitter } from 'node:events';
import * as path from 'node:path';
import * as os from 'node:os';
import { ElixAppInstaller } from './installer.js';
import { ElixWindowManager } from './window-manager.js';
import { registerAppTools, unregisterAppTools } from './tool-registry.js';
import { MemoryToolSink, MemoryCapabilityIndex, ConsoleConfirmationBroker, EventEmitterEventSink, } from './adapters/ports.js';
import { validateAppManifest } from './validator.js';
/**
 * Single Unified Facade for ELIX OS Native Application Lifecycle & Policy Management
 */
export class ElixAppManager extends EventEmitter {
    installer;
    windowHost;
    confirmationBroker;
    toolSink;
    capabilityIndex;
    eventSink;
    permissionGrants = new Map();
    disabledCapabilities = new Map();
    constructor(options) {
        super();
        const baseDir = options?.baseDir || path.join(os.homedir(), '.elix');
        this.installer = options?.installer || new ElixAppInstaller(baseDir);
        this.windowHost = options?.windowHost || new ElixWindowManager(this.installer);
        this.confirmationBroker = options?.confirmationBroker || new ConsoleConfirmationBroker(false);
        this.toolSink = options?.toolSink || new MemoryToolSink();
        this.capabilityIndex = options?.capabilityIndex || new MemoryCapabilityIndex();
        this.eventSink = options?.eventSink || new EventEmitterEventSink();
        // Pipe installer events to eventSink and facade
        this.installer.on('app:installed', (data) => {
            this.emit('app:installed', data);
            this.eventSink.emit('app:installed', data);
        });
        this.installer.on('app:uninstalled', (data) => {
            this.emit('app:uninstalled', data);
            this.eventSink.emit('app:uninstalled', data);
        });
        this.installer.on('app:file-trigger', (data) => {
            this.emit('app:file-trigger', data);
            this.eventSink.emit('app:file-trigger', data);
        });
    }
    // ==========================================================================
    // 1. Metadata Operations
    // ==========================================================================
    /**
     * List all installed applications with live execution state
     *
     * @param filter Optional filter: 'all' | 'running' | 'installed'
     */
    list(filter = 'all') {
        const installed = this.installer.listInstalledApps();
        const activeWindows = this.windowHost.listWindows();
        const activeAppMap = new Map();
        for (const win of activeWindows) {
            if (win.state !== 'closed') {
                activeAppMap.set(win.appId, win);
            }
        }
        const summaries = [];
        for (const app of installed) {
            const isRunning = activeAppMap.has(app.manifest.id);
            const win = activeAppMap.get(app.manifest.id);
            if (filter === 'running' && !isRunning)
                continue;
            if (filter === 'installed' && isRunning)
                continue;
            const capabilities = app.manifest.capabilities || {};
            const capNames = Array.isArray(capabilities)
                ? capabilities.map((c) => c.name)
                : Object.keys(capabilities);
            summaries.push({
                appId: app.manifest.id,
                name: app.manifest.name,
                version: app.manifest.version,
                description: app.manifest.description,
                status: isRunning ? 'running' : 'installed',
                windowId: win?.id,
                installPath: app.installPath,
                capabilities: capNames,
                permissions: this.getPermissions(app.manifest.id),
                installedAt: app.installedAt,
            });
        }
        return summaries;
    }
    /**
     * Get an installed app by its unique App ID
     */
    get(appId) {
        return this.installer.getApp(appId);
    }
    /**
     * Inspect an app package bundle without installing it
     */
    async inspectPackage(packagePath) {
        return this.installer.inspectPackage(packagePath);
    }
    /**
     * Verify package structure and manifest integrity
     */
    async verifyPackage(packagePath) {
        const payload = await this.installer.inspectPackage(packagePath);
        return validateAppManifest({
            id: payload.appId,
            name: payload.name,
            version: payload.version,
            description: payload.description,
            author: payload.author,
            entry: 'index.html',
            permissions: payload.permissions.map((p) => p.permission),
            capabilities: payload.capabilities.map((c) => ({
                name: c.name,
                description: c.description,
                parameters: { type: 'object', properties: {} },
            })),
        });
    }
    // ==========================================================================
    // 2. Lifecycle Operations
    // ==========================================================================
    /**
     * Install an application package (.elixapp bundle or folder)
     */
    async install(packagePath, options) {
        // 1. Inspect package and request consent if needed
        const payload = await this.installer.inspectPackage(packagePath);
        if (!options?.skipConsent) {
            const agreed = await this.confirmationBroker.requestConfirmation(payload);
            if (!agreed) {
                throw new Error(`Installation of '${payload.name}' (${payload.appId}) rejected by user.`);
            }
        }
        // 2. Install application
        const installedApp = await this.installer.install(packagePath, {
            ...options,
            skipConsent: true,
        });
        // 3. Initialize default permission grants
        const defaultPermissions = new Set(installedApp.manifest.permissions || []);
        this.permissionGrants.set(installedApp.manifest.id, defaultPermissions);
        // 4. Auto-mount capabilities onto ToolSink & CapabilityIndex
        registerAppTools(this.toolSink, this.windowHost, installedApp, this.capabilityIndex);
        return installedApp;
    }
    /**
     * Update an existing application package
     */
    async update(appId, packagePath, options) {
        const inspect = await this.installer.inspectPackage(packagePath);
        if (inspect.appId !== appId) {
            throw new Error(`Package App ID mismatch: Expected '${appId}' but package contains '${inspect.appId}'`);
        }
        return this.install(packagePath, { ...options, force: true });
    }
    /**
     * Repair an installed application (re-reads files and re-mounts tools)
     */
    async repair(appId) {
        const app = this.get(appId);
        if (!app) {
            throw new Error(`Cannot repair '${appId}': Application is not installed`);
        }
        // Re-register tools
        registerAppTools(this.toolSink, this.windowHost, app, this.capabilityIndex);
        return app;
    }
    /**
     * Prepare uninstall impact plan and preflight report
     */
    async prepareUninstall(appId) {
        const win = this.windowHost.getWindow(appId);
        const plan = await this.installer.prepareUninstall(appId);
        if (win && win.state !== 'closed') {
            plan.isRunning = true;
            plan.activeWindowId = win.id;
        }
        return plan;
    }
    /**
     * Uninstall an application with data safety options (keepData defaults to true)
     */
    async uninstall(appId, options) {
        // Close active window if running
        await this.windowHost.close(appId).catch(() => { });
        // Unregister tools from ToolSink and CapabilityIndex
        unregisterAppTools(this.toolSink, appId);
        // Clean up local policy maps
        this.permissionGrants.delete(appId);
        this.disabledCapabilities.delete(appId);
        // Remove from installer
        return this.installer.uninstall(appId, options);
    }
    /**
     * Launch or focus an installed application window
     */
    async launch(appId, initialRoute, windowOverrides) {
        return this.windowHost.launch(appId, initialRoute, windowOverrides);
    }
    /**
     * Close an active application window
     */
    async close(appId) {
        return this.windowHost.close(appId);
    }
    // ==========================================================================
    // 3. Policies & Permissions
    // ==========================================================================
    /**
     * Get granted permissions for an application
     */
    getPermissions(appId) {
        const app = this.get(appId);
        if (!app)
            return [];
        const granted = this.permissionGrants.get(appId);
        if (granted) {
            return Array.from(granted);
        }
        return app.manifest.permissions || [];
    }
    /**
     * Grant or revoke a permission for an application
     */
    setPermission(appId, permission, granted) {
        const app = this.get(appId);
        if (!app)
            return false;
        let set = this.permissionGrants.get(appId);
        if (!set) {
            set = new Set(app.manifest.permissions || []);
            this.permissionGrants.set(appId, set);
        }
        if (granted) {
            set.add(permission);
        }
        else {
            set.delete(permission);
        }
        this.emit('policy:permission-changed', { appId, permission, granted });
        return true;
    }
    /**
     * Get capabilities of an application
     */
    getCapabilities(appId) {
        const app = this.get(appId);
        if (!app)
            return [];
        const caps = app.manifest.capabilities || {};
        return Array.isArray(caps) ? caps : Object.values(caps);
    }
    /**
     * Enable or disable a specific capability for an app
     */
    setCapability(appId, capabilityName, enabled) {
        const app = this.get(appId);
        if (!app)
            return false;
        let disabledSet = this.disabledCapabilities.get(appId);
        if (!disabledSet) {
            disabledSet = new Set();
            this.disabledCapabilities.set(appId, disabledSet);
        }
        if (enabled) {
            disabledSet.delete(capabilityName);
            // Re-register
            registerAppTools(this.toolSink, this.windowHost, app, this.capabilityIndex);
        }
        else {
            disabledSet.add(capabilityName);
            // Re-register remaining
            const filteredManifest = {
                ...app.manifest,
                capabilities: Object.fromEntries(Object.entries(app.manifest.capabilities || {}).filter(([name]) => !disabledSet.has(name))),
            };
            registerAppTools(this.toolSink, this.windowHost, { ...app, manifest: filteredManifest }, this.capabilityIndex);
        }
        this.emit('policy:capability-changed', { appId, capabilityName, enabled });
        return true;
    }
    // ==========================================================================
    // 4. Events & Tool Dispatch
    // ==========================================================================
    /**
     * Subscribe to lifecycle and system events
     */
    subscribe(event, listener) {
        this.on(event, listener);
        return () => {
            this.off(event, listener);
        };
    }
    /**
     * Send a tool call directly to an application
     */
    async sendToolCall(appId, capability, args, timeoutMs) {
        if (this.windowHost.sendToolCall) {
            return this.windowHost.sendToolCall(appId, capability, args, timeoutMs);
        }
        let win = this.windowHost.getWindow(appId);
        if (!win || win.state === 'closed') {
            win = await this.windowHost.launch(appId);
        }
        return win.sendToolCall(capability, args, timeoutMs);
    }
}
//# sourceMappingURL=app-manager.js.map