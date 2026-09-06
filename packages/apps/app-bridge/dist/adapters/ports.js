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
//# sourceMappingURL=ports.js.map