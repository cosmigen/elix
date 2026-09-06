/**
 * ELIX Native App Runtime & Dynamic App Bridge
 * Dynamic Tool Registry (Standalone & Hexagonal Architecture)
 *
 * @module @deepseek-ai/elix-app-bridge/tool-registry
 */
import type { ToolSink, CapabilityIndex, WindowHost } from './adapters/ports.js';
import type { ElixAppInstaller } from './installer.js';
import type { InstalledApp, RegisteredAppTool } from './types.js';
/**
 * Sanitizes an identifier segment (replaces dots, dashes, and symbols with underscores)
 */
export declare function sanitizeToolIdentifier(name: string): string;
/**
 * Constructs the canonical Cordis tool name for an app capability:
 * Format: `app_<sanitized_id>_<capability>` (e.g. `app_com_elix_notes_create_note`)
 */
export declare function getAppToolName(appId: string, capabilityName: string): string;
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
export declare function registerAppTools(toolSinkOrCtx: ToolSink | {
    tools?: any;
    [key: string]: any;
}, windowHost: WindowHost, app: InstalledApp, capabilityIndex?: CapabilityIndex): RegisteredAppTool[];
/**
 * Disposes and unregisters all tools for a given application.
 *
 * @param toolSinkOrCtx ToolSink port or Microkernel Context
 * @param appId Unique application ID
 */
export declare function unregisterAppTools(toolSinkOrCtx: ToolSink | {
    tools?: any;
    [key: string]: any;
}, appId: string): void;
/**
 * Synchronizes tool registrations for all currently installed applications.
 *
 * @param toolSinkOrCtx ToolSink port or Context
 * @param windowHost Window Host instance
 * @param installer Package Installer instance
 * @returns Complete list of registered tools
 */
export declare function syncAllAppTools(toolSinkOrCtx: ToolSink | {
    tools?: any;
    [key: string]: any;
}, windowHost: WindowHost, installer: ElixAppInstaller): RegisteredAppTool[];
/**
 * Get the list of currently registered app tools
 *
 * @param appId Optional app ID filter
 */
export declare function getRegisteredAppTools(appId?: string): RegisteredAppTool[];
//# sourceMappingURL=tool-registry.d.ts.map