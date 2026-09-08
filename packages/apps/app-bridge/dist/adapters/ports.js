/**
 * ELIX Native App Runtime & Dynamic App Bridge
 * Abstract Ports & Hexagonal Architecture Interfaces (ELIXAPP Spec v1.2.0)
 *
 * @module @deepseek-ai/elix-app-bridge/adapters/ports
 */
import { EventEmitter } from 'node:events';
// ============================================================================
// Default Standalone Mock Implementations (Node.js standalone runtime)
// ============================================================================
/**
 * In-memory Tool Sink for standalone Node.js environments
 */
export class MemoryToolSink {
    tools = new Map();
    registerTool(tool) {
        this.tools.set(tool.name, tool);
        return () => this.unregisterTool(tool.name);
    }
    unregisterTool(name) {
        this.tools.delete(name);
    }
    getTool(name) {
        return this.tools.get(name);
    }
    listTools() {
        return Array.from(this.tools.values());
    }
}
/**
 * In-memory Capability Index for standalone Node.js environments
 */
export class MemoryCapabilityIndex {
    entries = new Map();
    registerCapability(entry) {
        this.entries.set(entry.id, entry);
    }
    unregisterOwner(ownerId) {
        for (const [id, entry] of this.entries.entries()) {
            if (entry.appId === ownerId || id.startsWith(`app:${ownerId}:`)) {
                this.entries.delete(id);
            }
        }
    }
    unregisterByAppId(appId) {
        this.unregisterOwner(appId);
    }
    searchCapabilities(query) {
        const q = query.toLowerCase();
        return Array.from(this.entries.values()).filter((e) => e.name.toLowerCase().includes(q) || e.description.toLowerCase().includes(q));
    }
    listAll() {
        return Array.from(this.entries.values());
    }
}
/**
 * Console Confirmation Broker (auto-accepts in non-interactive tests or prompts)
 */
export class ConsoleConfirmationBroker {
    autoAccept;
    constructor(autoAccept = false) {
        this.autoAccept = autoAccept;
    }
    async requestConfirmation(payload) {
        if (this.autoAccept)
            return true;
        console.log(`\n[ELIX ConfirmationBroker] Requesting installation consent for '${payload.name}' (${payload.appId})`);
        console.log(`  Requested Permissions: ${payload.permissions.join(', ') || 'None'}`);
        console.log(`  Exported Capabilities: ${payload.capabilities.map((c) => c.name).join(', ') || 'None'}`);
        return true;
    }
    validateToken(_appId, _token) {
        return true;
    }
}
/**
 * In-memory Event Sink backed by node:events EventEmitter
 */
export class EventEmitterEventSink {
    emitter = new EventEmitter();
    emit(event, ...args) {
        this.emitter.emit(event, ...args);
    }
    on(event, listener) {
        this.emitter.on(event, listener);
        return () => {
            this.emitter.off(event, listener);
        };
    }
    off(event, listener) {
        this.emitter.off(event, listener);
    }
}
/**
 * Mock Window Host for standalone Node.js environments and automated interactive TUI testing
 */
export class MockWindowHost {
    windows = new Map();
    simulatedHandlers = new Map();
    defaultTimeoutMs;
    constructor(options) {
        this.defaultTimeoutMs = options?.defaultTimeoutMs ?? 500;
    }
    registerCapabilityHandler(appId, capability, handler) {
        this.simulatedHandlers.set(`${appId}:${capability}`, handler);
    }
    async launch(appId, initialRoute, windowOverrides) {
        if (this.windows.has(appId)) {
            const existing = this.windows.get(appId);
            existing.state = 'focused';
            return existing;
        }
        const { ElixAppWindow: WinClass } = await import('../window-manager.js');
        const mockApp = {
            manifest: {
                id: appId,
                name: appId,
                version: '1.0.0',
                description: 'Mock Window',
                author: { name: 'ELIX Mock', email: 'mock@elix.os' },
                entry: 'dist/index.html',
                window: {
                    width: 480,
                    height: 600,
                    frame: false,
                    transparent: true,
                    ...windowOverrides,
                },
            },
            installPath: `/mock/apps/${appId}`,
            installedAt: Date.now(),
            updatedAt: Date.now(),
            state: 'idle',
            registeredTools: [],
        };
        const win = new WinClass(`win_${appId}_mock`, mockApp, `file:///mock/apps/${appId}/dist/index.html${initialRoute || ''}`, { x: 100, y: 100, width: 480, height: 600 }, windowOverrides);
        win.state = 'open';
        this.windows.set(appId, win);
        return win;
    }
    async focus(appIdOrWindowId) {
        const win = this.getWindow(appIdOrWindowId);
        if (win) {
            win.state = 'focused';
            return true;
        }
        return false;
    }
    async close(appIdOrWindowId) {
        const win = this.getWindow(appIdOrWindowId);
        if (win) {
            win.state = 'closed';
            this.windows.delete(win.appId);
            return true;
        }
        return false;
    }
    listWindows() {
        return Array.from(this.windows.values()).filter((w) => w.state !== 'closed');
    }
    getWindow(appIdOrWindowId) {
        for (const [appId, win] of this.windows.entries()) {
            if (appId === appIdOrWindowId || win.id === appIdOrWindowId) {
                return win;
            }
        }
        return undefined;
    }
    /**
     * Dispatches a capability tool call to the application.
     * Checks for an active simulated handler, or races live webview with 500ms timeout,
     * returning standard mock success response immediately instead of hanging.
     */
    async sendToolCall(appId, capabilityName, args, timeoutMs = this.defaultTimeoutMs) {
        const key = `${appId}:${capabilityName}`;
        if (this.simulatedHandlers.has(key)) {
            const handler = this.simulatedHandlers.get(key);
            return Promise.resolve(handler(args));
        }
        const win = this.getWindow(appId);
        if (win && win.state !== 'closed') {
            try {
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs));
                const liveCall = win.sendToolCall(capabilityName, args, timeoutMs);
                return await Promise.race([liveCall, timeoutPromise]);
            }
            catch {
                // Fallback to standard mock response
            }
        }
        return {
            success: true,
            result: {
                status: 'ok',
                appId,
                capability: capabilityName,
                data: args,
                receivedParams: args,
                timestamp: new Date().toISOString(),
            },
        };
    }
    async callAppCapability(appId, capability, params) {
        return this.sendToolCall(appId, capability, params);
    }
}
export { NativeWindowHost, broadcastToWindows, broadcastEvent, ensureIpcServer, launchNativeWindow } from '../native-window-host.js';
//# sourceMappingURL=ports.js.map