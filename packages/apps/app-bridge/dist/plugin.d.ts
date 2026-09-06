/**
 * ELIX Native App Runtime & Dynamic App Bridge
 * Official Cordis Microkernel Integration Plugin
 *
 * @module @deepseek-ai/elix-app-bridge/plugin
 */
import type { Context } from '@deepseek-ai/cordis';
import { ElixAppManager, type AppManagerOptions } from './app-manager.js';
export declare const name = "elix-app-bridge";
export interface ElixAppBridgeConfig extends AppManagerOptions {
    /** Root directory for ~/.elix partitions */
    baseDir?: string;
}
/**
 * Cordis Microkernel Plugin class for ELIX Native App Bridge
 */
export declare class ElixAppBridgePlugin {
    readonly manager: ElixAppManager;
    readonly ctx: Context;
    constructor(ctx: Context, config?: ElixAppBridgeConfig);
    private init;
}
/**
 * Cordis plugin apply entry point
 */
export declare function apply(ctx: Context, config?: ElixAppBridgeConfig): ElixAppBridgePlugin;
export default apply;
//# sourceMappingURL=plugin.d.ts.map