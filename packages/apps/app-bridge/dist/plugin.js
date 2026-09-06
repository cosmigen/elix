/**
 * ELIX Native App Runtime & Dynamic App Bridge
 * Official Cordis Microkernel Integration Plugin
 *
 * @module @deepseek-ai/elix-app-bridge/plugin
 */
import { ElixAppManager } from './app-manager.js';
import { registerManagementTools } from './management-tools.js';
import { registerAppTools, unregisterAppTools } from './tool-registry.js';
export const name = 'elix-app-bridge';
/**
 * Cordis Microkernel Plugin class for ELIX Native App Bridge
 */
export class ElixAppBridgePlugin {
    manager;
    ctx;
    constructor(ctx, config) {
        this.ctx = ctx;
        this.manager = new ElixAppManager(config);
        this.init();
    }
    init() {
        // 1. Register 5 universal management tools on ctx.tools
        // (get_app_list, open_app, close_app, install_elix_app, uninstall_elix_app)
        registerManagementTools(this.ctx, this.manager.installer, this.manager.windowHost);
        // 2. Mount existing installed apps tools into ctx.tools
        const installed = this.manager.installer.listInstalledApps();
        for (const app of installed) {
            registerAppTools(this.ctx, this.manager.windowHost, app);
        }
        // 3. Subscribe to dynamic lifecycle events to mount/unmount tools on the fly
        this.manager.subscribe('app:installed', (payload) => {
            if (payload?.app) {
                registerAppTools(this.ctx, this.manager.windowHost, payload.app);
            }
        });
        this.manager.subscribe('app:uninstalled', (payload) => {
            if (payload?.appId) {
                unregisterAppTools(this.ctx, payload.appId);
            }
        });
    }
}
/**
 * Cordis plugin apply entry point
 */
export function apply(ctx, config) {
    return new ElixAppBridgePlugin(ctx, config);
}
export default apply;
//# sourceMappingURL=plugin.js.map