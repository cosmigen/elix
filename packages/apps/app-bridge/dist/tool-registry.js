/**
 * ELIX Native App Runtime & Dynamic App Bridge
 * Dynamic Tool Registry (Standalone & Hexagonal Architecture)
 *
 * @module @deepseek-ai/elix-app-bridge/tool-registry
 */
import { defineTool } from './utils/tools.js';
import { notifyCapabilitySearch, removeCapabilitySearch } from './capability-stub.js';
/** Global map of active tool registrations: appId -> ToolRegistrationRecord[] */
const activeToolRegistrations = new Map();
/**
 * Sanitizes an identifier segment (replaces dots, dashes, and symbols with underscores)
 */
export function sanitizeToolIdentifier(name) {
    return name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
}
/**
 * Constructs the canonical Cordis tool name for an app capability:
 * Format: `app_<sanitized_id>_<capability>` (e.g. `app_com_elix_notes_create_note`)
 */
export function getAppToolName(appId, capabilityName) {
    const sanitizedAppId = sanitizeToolIdentifier(appId);
    const sanitizedCap = sanitizeToolIdentifier(capabilityName);
    return `app_${sanitizedAppId}_${sanitizedCap}`;
}
/**
 * Converts and registers all dynamic capabilities of an installed ELIX application
 * into callable AI tools on the ToolSink port or microkernel context.
 *
 * @param toolSinkOrCtx ToolSink port or Microkernel Context
 * @param windowHost Floating Window Manager / WindowHost instance
 * @param app Installed application record
 * @param capabilityIndex Optional CapabilityIndex port
 * @returns Array of registered tool descriptors
 */
export function registerAppTools(toolSinkOrCtx, windowHost, app, capabilityIndex) {
    const appId = app.manifest.id;
    // Unregister any existing tools for this app first
    unregisterAppTools(toolSinkOrCtx, appId);
    const capabilities = app.manifest.capabilities || {};
    const capList = Array.isArray(capabilities)
        ? capabilities
        : Object.values(capabilities);
    const registeredList = [];
    const records = [];
    // Adapt ToolSink interface
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
    for (const cap of capList) {
        const toolName = getAppToolName(appId, cap.name);
        const description = `[App: ${app.manifest.name}] ${cap.description}`;
        // Tool execution handler: Auto-launches or focuses window if closed
        const toolDef = defineTool({
            name: toolName,
            description,
            parameters: cap.parameters,
            execute: async (args) => {
                let win = windowHost.getWindow(appId);
                // Auto-launch window if not running
                if (!win || win.state === 'closed') {
                    win = await windowHost.launch(appId);
                }
                else if (win.state === 'minimized') {
                    await win.focus();
                }
                // Dispatch capability tool call to client app and await result
                return win.sendToolCall(cap.name, args, cap.timeoutMs);
            },
        });
        // Register with ToolSink
        const disposeFn = sink.registerTool(toolDef);
        const regTool = {
            id: `app:${appId}:${cap.name}`,
            appId,
            name: toolName,
            description: cap.description,
            parameters: cap.parameters,
            enabled: true,
        };
        records.push({
            toolName,
            appId,
            capabilityName: cap.name,
            dispose: disposeFn,
            registeredTool: regTool,
        });
        registeredList.push(regTool);
    }
    activeToolRegistrations.set(appId, records);
    // Hook into capability search indexer
    notifyCapabilitySearch(capabilityIndex || toolSinkOrCtx, app);
    return registeredList;
}
/**
 * Disposes and unregisters all tools for a given application.
 *
 * @param toolSinkOrCtx ToolSink port or Microkernel Context
 * @param appId Unique application ID
 */
export function unregisterAppTools(toolSinkOrCtx, appId) {
    const records = activeToolRegistrations.get(appId);
    if (records) {
        for (const record of records) {
            try {
                record.dispose();
            }
            catch (err) {
                console.warn(`Failed to dispose tool '${record.toolName}':`, err);
            }
        }
        activeToolRegistrations.delete(appId);
    }
    removeCapabilitySearch(toolSinkOrCtx, appId);
}
/**
 * Synchronizes tool registrations for all currently installed applications.
 *
 * @param toolSinkOrCtx ToolSink port or Context
 * @param windowHost Window Host instance
 * @param installer Package Installer instance
 * @returns Complete list of registered tools
 */
export function syncAllAppTools(toolSinkOrCtx, windowHost, installer) {
    const allInstalled = installer.listInstalledApps();
    const allRegistered = [];
    for (const app of allInstalled) {
        const tools = registerAppTools(toolSinkOrCtx, windowHost, app);
        allRegistered.push(...tools);
    }
    return allRegistered;
}
/**
 * Get the list of currently registered app tools
 *
 * @param appId Optional app ID filter
 */
export function getRegisteredAppTools(appId) {
    if (appId) {
        const records = activeToolRegistrations.get(appId) || [];
        return records.map((r) => r.registeredTool);
    }
    const all = [];
    for (const records of activeToolRegistrations.values()) {
        all.push(...records.map((r) => r.registeredTool));
    }
    return all;
}
//# sourceMappingURL=tool-registry.js.map