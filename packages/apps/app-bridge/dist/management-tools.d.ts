/**
 * ELIX Native App Runtime & Dynamic App Bridge
 * Universal App Management AI Tools (Hexagonal Architecture)
 *
 * @module @deepseek-ai/elix-app-bridge/management-tools
 */
import { type CoreToolDefinition } from './utils/tools.js';
import type { ElixAppInstaller } from './installer.js';
import type { WindowHost, ToolSink } from './adapters/ports.js';
export interface AppInfoSummary {
    appId: string;
    name: string;
    version: string;
    description: string;
    status: 'running' | 'installed';
    windowId?: string;
    url?: string;
    capabilities: string[];
    permissions: string[];
}
/**
 * Creates the 4 mandatory AI app management tool definitions
 *
 * @param installer Package Installer instance
 * @param windowHost Window Host instance
 * @param toolSinkOrCtx Optional ToolSink port or Context for auto-mounting tools post-install
 */
export declare function createManagementTools(installer: ElixAppInstaller, windowHost: WindowHost, toolSinkOrCtx?: ToolSink | {
    tools?: any;
    [key: string]: any;
}): CoreToolDefinition[];
/**
 * Registers all 4 universal application management tools onto a ToolSink or Microkernel Context.
 *
 * @param toolSinkOrCtx ToolSink port or Microkernel Context
 * @param installer Package Installer instance
 * @param windowHost Window Host instance
 * @returns Disposer function to unregister all 4 management tools
 */
export declare function registerManagementTools(toolSinkOrCtx: ToolSink | {
    tools?: any;
    [key: string]: any;
}, installer: ElixAppInstaller, windowHost: WindowHost): () => void;
//# sourceMappingURL=management-tools.d.ts.map