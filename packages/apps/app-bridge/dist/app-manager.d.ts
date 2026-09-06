/**
 * ELIX Native App Runtime & Dynamic App Bridge
 * Unified Public Application Manager Facade (ELIXAPP Spec v1.2.0)
 *
 * @module @deepseek-ai/elix-app-bridge/app-manager
 */
import { EventEmitter } from 'node:events';
import { ElixAppInstaller } from './installer.js';
import { type ElixAppWindow } from './window-manager.js';
import { type WindowHost, type ConfirmationBroker, type ToolSink, type CapabilityIndex, type EventSink } from './adapters/ports.js';
import type { AppConsentPayload, ElixAppCapability, ElixAppWindowConfig, InstallOptions, InstalledApp, ManifestValidationResult, UninstallImpactPlan, UninstallOptions } from './types.js';
export type ValidationResult = ManifestValidationResult;
export type { UninstallImpactPlan, UninstallOptions };
export interface AppSummary {
    appId: string;
    name: string;
    version: string;
    description: string;
    status: 'running' | 'installed';
    windowId?: string;
    installPath: string;
    capabilities: string[];
    permissions: string[];
    installedAt: number;
}
export interface AppManagerOptions {
    /** Base root storage directory (default: ~/.elix) */
    baseDir?: string;
    /** Custom package installer instance */
    installer?: ElixAppInstaller;
    /** WindowHost port instance */
    windowHost?: WindowHost;
    /** ConfirmationBroker port instance */
    confirmationBroker?: ConfirmationBroker;
    /** ToolSink port instance */
    toolSink?: ToolSink;
    /** CapabilityIndex port instance */
    capabilityIndex?: CapabilityIndex;
    /** EventSink port instance */
    eventSink?: EventSink;
}
/**
 * Single Unified Facade for ELIX OS Native Application Lifecycle & Policy Management
 */
export declare class ElixAppManager extends EventEmitter {
    readonly installer: ElixAppInstaller;
    readonly windowHost: WindowHost;
    readonly confirmationBroker: ConfirmationBroker;
    readonly toolSink: ToolSink;
    readonly capabilityIndex: CapabilityIndex;
    readonly eventSink: EventSink;
    private permissionGrants;
    private disabledCapabilities;
    constructor(options?: AppManagerOptions);
    /**
     * List all installed applications with live execution state
     *
     * @param filter Optional filter: 'all' | 'running' | 'installed'
     */
    list(filter?: 'all' | 'running' | 'installed'): AppSummary[];
    /**
     * Get an installed app by its unique App ID
     */
    get(appId: string): InstalledApp | undefined;
    /**
     * Inspect an app package bundle without installing it
     */
    inspectPackage(packagePath: string): Promise<AppConsentPayload>;
    /**
     * Verify package structure and manifest integrity
     */
    verifyPackage(packagePath: string): Promise<ValidationResult>;
    /**
     * Install an application package (.elixapp bundle or folder)
     */
    install(packagePath: string, options?: InstallOptions): Promise<InstalledApp>;
    /**
     * Update an existing application package
     */
    update(appId: string, packagePath: string, options?: InstallOptions): Promise<InstalledApp>;
    /**
     * Repair an installed application (re-reads files and re-mounts tools)
     */
    repair(appId: string): Promise<InstalledApp>;
    /**
     * Prepare uninstall impact plan and preflight report
     */
    prepareUninstall(appId: string): Promise<UninstallImpactPlan>;
    /**
     * Uninstall an application with data safety options (keepData defaults to true)
     */
    uninstall(appId: string, options?: UninstallOptions): Promise<boolean>;
    /**
     * Launch or focus an installed application window
     */
    launch(appId: string, initialRoute?: string, windowOverrides?: Partial<ElixAppWindowConfig>): Promise<ElixAppWindow>;
    /**
     * Close an active application window
     */
    close(appId: string): Promise<boolean>;
    /**
     * Get granted permissions for an application
     */
    getPermissions(appId: string): string[];
    /**
     * Grant or revoke a permission for an application
     */
    setPermission(appId: string, permission: string, granted: boolean): boolean;
    /**
     * Get capabilities of an application
     */
    getCapabilities(appId: string): ElixAppCapability[];
    /**
     * Enable or disable a specific capability for an app
     */
    setCapability(appId: string, capabilityName: string, enabled: boolean): boolean;
    /**
     * Subscribe to lifecycle and system events
     */
    subscribe(event: string, listener: (...args: any[]) => void): () => void;
    /**
     * Send a tool call directly to an application
     */
    sendToolCall<T = any, R = any>(appId: string, capability: string, args: T, timeoutMs?: number): Promise<R>;
}
//# sourceMappingURL=app-manager.d.ts.map