/**
 * ELIX Native App Runtime & Dynamic App Bridge
 * Package Installer, Unpacker, Manifest Verifier, and Ambient File Listener (ELIXAPP Spec v1.2.0)
 *
 * Enforces Storage Partitioning & Data Safety:
 * - `apps/<app-id>/` (Immutable binaries)
 * - `app-data/<app-id>/` (Persistent user data — preserved across updates)
 * - `app-cache/<app-id>/` (Disposable cache)
 * - `app-staging/<tx-id>/` (Transaction staging)
 * - `app-registry/` (Authoritative registry state)
 * - `app-journal/` (Crash recovery logs)
 *
 * @module @deepseek-ai/elix-app-bridge/installer
 */
import { EventEmitter } from 'node:events';
import { StoragePartitionManager } from './data/storage-partition.js';
import type { AppConsentPayload, ElixInstallerEventMap, FileListenerOptions, InstalledApp, InstallOptions, UninstallImpactPlan, UninstallOptions } from './types.js';
/**
 * Human-readable metadata and description lookup for standard ELIX permissions
 */
export declare const PERMISSION_METADATA: Record<string, {
    label: string;
    description: string;
    sensitive: boolean;
}>;
/**
 * ELIX Native App Package Installer and Background File Association Service
 */
export declare class ElixAppInstaller extends EventEmitter {
    readonly storage: StoragePartitionManager;
    private baseDir;
    private appsDir;
    private stagingDir;
    private registryFile;
    private installedApps;
    private fileWatcher;
    private isWatching;
    private pendingFiles;
    /**
     * Initialize the App Installer with base ELIX partitioned directories.
     *
     * @param customBaseDir Optional custom base directory (defaults to ~/.elix)
     */
    constructor(customBaseDir?: string);
    /**
     * Typed event listener support
     */
    on<K extends keyof ElixInstallerEventMap>(event: K, listener: ElixInstallerEventMap[K]): this;
    emit<K extends keyof ElixInstallerEventMap>(event: K, ...args: Parameters<ElixInstallerEventMap[K]>): boolean;
    /**
     * Get the configured base ELIX directory (~/.elix)
     */
    getBaseDir(): string;
    /**
     * Get the configured installed apps directory (~/.elix/apps)
     */
    getAppsDir(): string;
    /**
     * Get the configured staging/drop directory (~/.elix/app-staging)
     */
    getStagingDir(): string;
    /**
     * Inspect a package bundle (.elixapp file or directory) without installing it.
     * Extracts metadata, validates manifest, and constructs the consent payload.
     *
     * @param packagePath Path to .elixapp archive or bundle directory
     * @returns Detailed consent payload for user authorization
     */
    inspectPackage(packagePath: string): Promise<AppConsentPayload>;
    /**
     * Install an application package (.elixapp archive or directory bundle).
     *
     * Transactional Flow:
     * 1. Inspect & construct consent payload
     * 2. Request user consent (or skip if configured)
     * 3. Extract to staging transaction folder (`app-staging/<tx-id>/`)
     * 4. Verify integrity & structure
     * 5. Atomically promote to `apps/<app-id>/`
     * 6. Ensure `app-data/<app-id>/` persistent storage exists
     * 7. Update authoritative registry & emit events
     *
     * @param packagePath Path to .elixapp archive or directory
     * @param options Installation options
     * @returns Installed application record
     */
    install(packagePath: string, options?: InstallOptions): Promise<InstalledApp>;
    /**
     * Prepares a detailed uninstallation impact plan without performing the deletion
     */
    prepareUninstall(appId: string): Promise<UninstallImpactPlan>;
    /**
     * Uninstall an installed application by its ID with data retention options.
     *
     * @param appId Unique application ID (e.g. "com.elix.calculator")
     * @param options Uninstall options: { keepData: true } preserves user data in app-data/<app-id>/
     * @returns true if uninstalled successfully, false if app was not found
     */
    uninstall(appId: string, options?: UninstallOptions): Promise<boolean>;
    /**
     * List all currently installed ELIX applications.
     */
    listInstalledApps(): InstalledApp[];
    /**
     * Get an installed application by ID.
     *
     * @param appId Unique app ID
     */
    getApp(appId: string): InstalledApp | undefined;
    /**
     * Ambient Background Listener:
     * Starts a background file-association watcher on the staging directory (`~/.elix/app-staging`).
     * When `.elixapp` files are dropped or opened, intercepts the event, generates consent payload,
     * and triggers the installation workflow.
     *
     * @param options Background listener configuration
     */
    startFileListener(options?: FileListenerOptions): void;
    /**
     * Stops the ambient background file listener.
     */
    stopFileListener(): void;
    /**
     * Handles an intercepted file association trigger on a `.elixapp` bundle.
     *
     * @param packagePath Path to intercepted package
     * @param options Listener options
     */
    handleFileAssociationTrigger(packagePath: string, options?: FileListenerOptions): Promise<void>;
    /**
     * Convert manifest capabilities to RegisteredAppTool records
     */
    private buildRegisteredTools;
    /**
     * Synchronously loads the local app registry from disk
     */
    private loadRegistrySync;
    /**
     * Disk recovery scan if registry JSON is missing
     */
    private recoverFromDiskSync;
    /**
     * Asynchronously saves the local app registry
     */
    private saveRegistryAsync;
    /**
     * Synchronously saves the local app registry
     */
    private saveRegistrySync;
    /**
     * Ensures directory exists synchronously
     */
    private ensureDirectorySync;
}
//# sourceMappingURL=installer.d.ts.map