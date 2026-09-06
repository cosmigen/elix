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
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { validateAppManifest } from './validator.js';
import { ElixZip } from './utils/zip.js';
import { promptConsentCli } from './utils/prompts.js';
import { StoragePartitionManager } from './data/storage-partition.js';
import type {
  AppCapabilitySummary,
  AppConsentPayload,
  AppPermissionSummary,
  AppStoragePaths,
  ElixAppCapability,
  ElixAppManifest,
  ElixInstallerEventMap,
  FileListenerOptions,
  InstalledApp,
  InstallOptions,
  RegisteredAppTool,
  UninstallImpactPlan,
  UninstallOptions,
} from './types.js';

/**
 * Generate a short random string ID
 */
function randomId(length: number = 8): string {
  return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
}

/**
 * Human-readable metadata and description lookup for standard ELIX permissions
 */
export const PERMISSION_METADATA: Record<
  string,
  { label: string; description: string; sensitive: boolean }
> = {
  'fs:read': { label: 'Read Filesystem', description: 'Read local files and directories', sensitive: false },
  'fs:write': { label: 'Write Filesystem', description: 'Create, modify, and delete local files', sensitive: false },
  'fs:all': { label: 'Full Filesystem Access', description: 'Unrestricted read/write access to host filesystem', sensitive: true },
  'net:http': { label: 'HTTP / Web Access', description: 'Make HTTP/HTTPS network and API requests', sensitive: false },
  'net:ws': { label: 'WebSocket Networking', description: 'Open real-time bidirectional WebSocket connections', sensitive: false },
  'net:all': { label: 'Full Network Access', description: 'Unrestricted raw socket and network access', sensitive: true },
  'os:exec': { label: 'Execute OS Commands', description: 'Run system shell commands and native binaries', sensitive: true },
  'os:env': { label: 'Read Environment Variables', description: 'Access host environment variables and system config', sensitive: true },
  'os:info': { label: 'System Telemetry', description: 'Query CPU, memory, OS version, and hardware metrics', sensitive: false },
  'agent:memory': { label: 'Agent Long-Term Memory', description: 'Store and recall knowledge in agent long-term memory', sensitive: false },
  'agent:tools': { label: 'Agent Tool Invocation', description: 'Invoke other microkernel agent tools and services', sensitive: false },
  'agent:llm': { label: 'Direct AI / LLM Access', description: 'Query underlying language models and embeddings', sensitive: false },
  'ui:notification': { label: 'Desktop Notifications', description: 'Display desktop alerts and toast notifications', sensitive: false },
  'ui:dialog': { label: 'System Dialogs', description: 'Show modal prompts and confirmation dialogs', sensitive: false },
  'ui:tray': { label: 'System Tray', description: 'Create and manage background system tray icons', sensitive: false },
  'clipboard:read': { label: 'Read Clipboard', description: 'Access content copied to the system clipboard', sensitive: true },
  'clipboard:write': { label: 'Write Clipboard', description: 'Modify and copy content to system clipboard', sensitive: false },
  'system:power': { label: 'Power Management', description: 'Prevent system sleep or display sleep during execution', sensitive: false },
};

/**
 * Local registry schema stored in ~/.elix/app-registry/registry.json
 */
interface RegistryData {
  version: string;
  updatedAt: number;
  apps: Record<string, InstalledApp>;
}

/**
 * ELIX Native App Package Installer and Background File Association Service
 */
export class ElixAppInstaller extends EventEmitter {
  public readonly storage: StoragePartitionManager;
  public readonly baseDir: string;
  private appsDir: string;
  private stagingDir: string;
  private registryFile: string;
  private installedApps: Map<string, InstalledApp> = new Map();
  private fileWatcher: fs.FSWatcher | null = null;
  private isWatching: boolean = false;
  private pendingFiles: Set<string> = new Set();

  /**
   * Initialize the App Installer with base ELIX partitioned directories.
   * 
   * @param customBaseDir Optional custom base directory (defaults to ~/.elix)
   */
  constructor(customBaseDir?: string) {
    super();
    this.baseDir = customBaseDir || path.join(os.homedir(), '.elix');
    this.storage = new StoragePartitionManager(this.baseDir);
    this.storage.ensurePartitionsSync();

    this.appsDir = this.storage.appsDir;
    this.stagingDir = this.storage.appStagingDir;
    this.registryFile = this.storage.getRegistryFilePath();

    this.loadRegistrySync();
  }

  /**
   * Typed event listener support
   */
  public override on<K extends keyof ElixInstallerEventMap>(
    event: K,
    listener: ElixInstallerEventMap[K]
  ): this {
    return super.on(event, listener as (...args: any[]) => void);
  }

  public override emit<K extends keyof ElixInstallerEventMap>(
    event: K,
    ...args: Parameters<ElixInstallerEventMap[K]>
  ): boolean {
    return super.emit(event, ...args);
  }

  /**
   * Get the configured base ELIX directory (~/.elix)
   */
  public getBaseDir(): string {
    return this.baseDir;
  }

  /**
   * Get the configured installed apps directory (~/.elix/apps)
   */
  public getAppsDir(): string {
    return this.appsDir;
  }

  /**
   * Get the configured staging/drop directory (~/.elix/app-staging)
   */
  public getStagingDir(): string {
    return this.stagingDir;
  }

  /**
   * Inspect a package bundle (.elixapp file or directory) without installing it.
   * Extracts metadata, validates manifest, and constructs the consent payload.
   * 
   * @param packagePath Path to .elixapp archive or bundle directory
   * @returns Detailed consent payload for user authorization
   */
  public async inspectPackage(packagePath: string): Promise<AppConsentPayload> {
    const resolvedPath = path.resolve(packagePath);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Package file does not exist at '${resolvedPath}'`);
    }

    const stat = await fsp.stat(resolvedPath);
    let manifestContent: string;
    let iconPath: string | undefined;

    if (stat.isDirectory()) {
      const manifestFile = path.join(resolvedPath, 'elix.app.json');
      if (!fs.existsSync(manifestFile)) {
        throw new Error(`Invalid package directory: 'elix.app.json' not found at '${manifestFile}'`);
      }
      manifestContent = await fsp.readFile(manifestFile, 'utf-8');
      const parsedRaw = JSON.parse(manifestContent);
      if (parsedRaw.icon && fs.existsSync(path.join(resolvedPath, parsedRaw.icon))) {
        iconPath = path.join(resolvedPath, parsedRaw.icon);
      }
    } else {
      const zip = new ElixZip(resolvedPath);
      const manifestEntry = zip.getEntry('elix.app.json');
      if (!manifestEntry) {
        throw new Error(`Invalid .elixapp archive: Missing 'elix.app.json' in '${resolvedPath}'`);
      }
      manifestContent = manifestEntry.data.toString('utf-8');
      const parsedRaw = JSON.parse(manifestContent);
      if (parsedRaw.icon && zip.getEntry(parsedRaw.icon)) {
        iconPath = parsedRaw.icon;
      }
    }

    let rawManifest: unknown;
    try {
      rawManifest = JSON.parse(manifestContent);
    } catch {
      throw new Error("Corrupted package: 'elix.app.json' is not valid JSON");
    }

    const validation = validateAppManifest(rawManifest);
    if (!validation.valid || !validation.manifest) {
      const issues = validation.errors.map((e) => `${e.path}: ${e.message}`).join(', ');
      throw new Error(`Manifest validation failed: ${issues}`);
    }

    const manifest = validation.manifest;

    // Build permission summaries
    const permissionSummaries: AppPermissionSummary[] = (manifest.permissions || []).map((perm) => {
      const meta = PERMISSION_METADATA[perm] || {
        label: perm,
        description: `Access to ${perm}`,
        sensitive: true,
      };
      return {
        permission: perm,
        label: meta.label,
        description: meta.description,
        sensitive: meta.sensitive,
      };
    });

    // Build capability summaries
    const capabilities = manifest.capabilities || {};
    const capList = Array.isArray(capabilities) ? capabilities : Object.values(capabilities);
    const capabilitySummaries: AppCapabilitySummary[] = capList.map((cap) => {
      const paramProps = (cap.parameters && typeof cap.parameters === 'object' && cap.parameters.properties) || {};
      const paramNames = Object.keys(paramProps);
      return {
        name: cap.name,
        description: cap.description,
        parameterCount: paramNames.length,
        parameterNames: paramNames,
        permissions: cap.permissions || [],
      };
    });

    return {
      appId: manifest.id,
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      author: manifest.author,
      iconPath,
      window: manifest.window,
      permissions: permissionSummaries,
      capabilities: capabilitySummaries,
      packagePath: resolvedPath,
      packageSizeBytes: stat.size,
    };
  }

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
  public async install(packagePath: string, options?: InstallOptions): Promise<InstalledApp> {
    const resolvedPath = path.resolve(packagePath);
    const consent = await this.inspectPackage(resolvedPath);

    // Step 1: User Consent Evaluation
    if (!options?.skipConsent) {
      const agreed = await promptConsentCli(consent);
      if (!agreed) {
        throw new Error(`Installation of '${consent.name}' (${consent.appId}) was declined by user.`);
      }
    }

    const storagePaths: AppStoragePaths = this.storage.getAppStoragePaths(consent.appId);
    const appTargetDir = storagePaths.binPath;
    const isUpgrade = this.installedApps.has(consent.appId);

    if (isUpgrade && !options?.force) {
      throw new Error(
        `Application '${consent.appId}' is already installed (v${this.installedApps.get(consent.appId)!.manifest.version}). Pass { force: true } to overwrite.`
      );
    }

    this.emit('app:installing', { packagePath: resolvedPath, appId: consent.appId });

    // Step 2: Extract to transactional staging directory
    const { txId, stagingPath } = await this.storage.createStagingTx();
    await this.storage.writeJournal({
      txId,
      action: isUpgrade ? 'update' : 'install',
      appId: consent.appId,
      timestamp: Date.now(),
      status: 'started',
    });

    try {
      const stat = await fsp.stat(resolvedPath);
      if (stat.isDirectory()) {
        await fsp.cp(resolvedPath, stagingPath, { recursive: true });
      } else {
        const zip = new ElixZip(resolvedPath);
        await zip.extractAllToAsync(stagingPath);
      }

      // Step 3: Validate file existence and directory layout
      const manifestPath = path.join(stagingPath, 'elix.app.json');
      if (!fs.existsSync(manifestPath)) {
        throw new Error("Missing 'elix.app.json' in unpacked package bundle");
      }

      const manifestContent = JSON.parse(await fsp.readFile(manifestPath, 'utf-8'));
      const validation = validateAppManifest(manifestContent);
      if (!validation.valid || !validation.manifest) {
        const errors = validation.errors.map((e) => ` - ${e.message}`).join('\n');
        throw new Error(`Manifest validation failed on unpacked files:\n${errors}`);
      }

      const manifest = validation.manifest;

      // Verify entry file existence
      const entryFilePath = path.join(stagingPath, manifest.entry);
      if (!fs.existsSync(entryFilePath)) {
        throw new Error(`Entry file specified in manifest not found: '${manifest.entry}' at ${entryFilePath}`);
      }

      // Verify icon file existence if specified
      if (manifest.icon) {
        const iconFilePath = path.join(stagingPath, manifest.icon);
        if (!fs.existsSync(iconFilePath)) {
          this.emit('error', {
            code: 'ICON_NOT_FOUND',
            message: `Specified icon '${manifest.icon}' was not found in package directory`,
          });
        }
      }

      // Step 4: Promote staging directory to immutable binaries target directory atomically
      if (fs.existsSync(appTargetDir)) {
        await fsp.rm(appTargetDir, { recursive: true, force: true });
      }
      await fsp.mkdir(path.dirname(appTargetDir), { recursive: true });
      await fsp.rename(stagingPath, appTargetDir);

      // Ensure persistent user data directory exists (never touched during updates/repairs!)
      await fsp.mkdir(storagePaths.dataPath, { recursive: true });
      await fsp.mkdir(storagePaths.cachePath, { recursive: true });

      let savedArchivePath: string | undefined;
      if (options?.keepArchive && !stat.isDirectory()) {
        savedArchivePath = path.join(appTargetDir, `${manifest.id}.elixapp`);
        await fsp.copyFile(resolvedPath, savedArchivePath);
      }

      // Step 5: Build InstalledApp record
      const registeredTools: RegisteredAppTool[] = this.buildRegisteredTools(manifest);

      const installedApp: InstalledApp = {
        manifest,
        installPath: appTargetDir,
        archivePath: savedArchivePath,
        installedAt: Date.now(),
        updatedAt: Date.now(),
        state: 'idle',
        registeredTools,
        storage: storagePaths,
      };

      this.installedApps.set(manifest.id, installedApp);
      await this.saveRegistryAsync();
      await this.storage.cleanJournal(txId);

      // Step 6: Notify runtime post-install
      this.emit('app:installed', { app: installedApp, isUpgrade });

      return installedApp;
    } catch (error: unknown) {
      // Rollback cleanup
      await this.storage.cleanStagingTx(txId);
      const err = error instanceof Error ? error : new Error(String(error));
      this.emit('error', {
        code: 'INSTALL_FAILED',
        message: `Installation failed for '${consent.appId}': ${err.message}`,
        error: err,
      });
      throw err;
    }
  }

  /**
   * Prepares a detailed uninstallation impact plan without performing the deletion
   */
  public async prepareUninstall(appId: string): Promise<UninstallImpactPlan> {
    const app = this.installedApps.get(appId);
    if (!app) {
      throw new Error(`Cannot prepare uninstall: Application '${appId}' is not installed.`);
    }

    const storageUsage = await this.storage.getAppStorageUsage(appId);
    const paths = this.storage.getAppStoragePaths(appId);
    const capabilities = app.manifest.capabilities || {};
    const capCount = Array.isArray(capabilities) ? capabilities.length : Object.keys(capabilities).length;

    return {
      appId,
      name: app.manifest.name,
      version: app.manifest.version,
      isRunning: app.state === 'running',
      registeredToolsCount: capCount,
      permissionsCount: (app.manifest.permissions || []).length,
      storage: storageUsage,
      paths,
      dataRetentionAvailable: fs.existsSync(paths.dataPath),
    };
  }

  /**
   * Uninstall an installed application by its ID with data retention options.
   * 
   * @param appId Unique application ID (e.g. "com.elix.calculator")
   * @param options Uninstall options: { keepData: true } preserves user data in app-data/<app-id>/
   * @returns true if uninstalled successfully, false if app was not found
   */
  public async uninstall(appId: string, options?: UninstallOptions): Promise<boolean> {
    const app = this.installedApps.get(appId);
    const paths = this.storage.getAppStoragePaths(appId);

    if (!app && !fs.existsSync(paths.binPath)) {
      return false;
    }

    this.emit('app:uninstalling', { appId });

    const keepData = options?.keepData !== false; // Default: preserve user data
    const purgeCache = options?.purgeCache !== false; // Default: purge disposable cache

    try {
      // 1. Purge immutable binaries
      await this.storage.purgeAppBinaries(appId);

      // 2. Purge cache if requested
      if (purgeCache) {
        await this.storage.purgeAppCache(appId);
      }

      // 3. Purge user data only if explicitly requested not to keep
      if (!keepData) {
        await this.storage.purgeAppData(appId);
      }

      this.installedApps.delete(appId);
      await this.saveRegistryAsync();

      this.emit('app:uninstalled', { appId });
      return true;
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.emit('error', {
        code: 'UNINSTALL_FAILED',
        message: `Failed to uninstall app '${appId}': ${error.message}`,
        error,
      });
      throw error;
    }
  }

  /**
   * List all currently installed ELIX applications.
   */
  public listInstalledApps(): InstalledApp[] {
    return Array.from(this.installedApps.values());
  }

  /**
   * Get an installed application by ID.
   * 
   * @param appId Unique app ID
   */
  public getApp(appId: string): InstalledApp | undefined {
    return this.installedApps.get(appId);
  }

  /**
   * Ambient Background Listener:
   * Starts a background file-association watcher on the staging directory (`~/.elix/app-staging`).
   * When `.elixapp` files are dropped or opened, intercepts the event, generates consent payload,
   * and triggers the installation workflow.
   * 
   * @param options Background listener configuration
   */
  public startFileListener(options?: FileListenerOptions): void {
    if (this.isWatching) {
      return;
    }

    const watchDir = options?.watchDir || this.stagingDir;
    this.ensureDirectorySync(watchDir);
    this.isWatching = true;

    try {
      this.fileWatcher = fs.watch(watchDir, async (_eventType, filename) => {
        if (!filename || (!filename.endsWith('.elixapp') && !filename.endsWith('.zip'))) {
          return;
        }

        if (!this.isWatching) {
          return;
        }

        const fullPath = path.join(watchDir, filename);

        // Deduplicate rapid file watcher triggers
        if (this.pendingFiles.has(fullPath)) {
          return;
        }
        this.pendingFiles.add(fullPath);

        // Wait slightly for OS write stream to flush
        await new Promise((resolve) => setTimeout(resolve, 300));

        if (!this.isWatching || !fs.existsSync(fullPath)) {
          this.pendingFiles.delete(fullPath);
          return;
        }

        try {
          await this.handleFileAssociationTrigger(fullPath, options);
        } catch (err: unknown) {
          if (!this.isWatching) return;
          const error = err instanceof Error ? err : new Error(String(err));
          this.emit('error', {
            code: 'FILE_TRIGGER_FAILED',
            message: `Background file listener failed to process ${filename}: ${error.message}`,
            error,
          });
        } finally {
          this.pendingFiles.delete(fullPath);
        }
      });
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.isWatching = false;
      this.emit('error', {
        code: 'WATCHER_FAILED',
        message: `Failed to initialize file listener on ${watchDir}: ${error.message}`,
        error,
      });
    }
  }

  /**
   * Stops the ambient background file listener.
   */
  public stopFileListener(): void {
    if (this.fileWatcher) {
      this.fileWatcher.close();
      this.fileWatcher = null;
    }
    this.isWatching = false;
    this.pendingFiles.clear();
  }

  /**
   * Handles an intercepted file association trigger on a `.elixapp` bundle.
   * 
   * @param packagePath Path to intercepted package
   * @param options Listener options
   */
  public async handleFileAssociationTrigger(
    packagePath: string,
    options?: FileListenerOptions
  ): Promise<void> {
    const consent = await this.inspectPackage(packagePath);

    this.emit('app:file-trigger', {
      packagePath,
      consentPayload: consent,
    });

    let proceed = false;
    if (options?.onConsentRequest) {
      proceed = await options.onConsentRequest(consent);
    } else {
      proceed = await promptConsentCli(consent);
    }

    if (proceed) {
      await this.install(packagePath, { skipConsent: true, force: true });
      if (options?.cleanupOnInstall) {
        await fsp.rm(packagePath, { force: true }).catch(() => {});
      }
    }
  }

  /**
   * Convert manifest capabilities to RegisteredAppTool records
   */
  private buildRegisteredTools(manifest: ElixAppManifest): RegisteredAppTool[] {
    const capabilities = manifest.capabilities || {};
    const capList: ElixAppCapability[] = Array.isArray(capabilities)
      ? capabilities
      : Object.values(capabilities);

    return capList.map((cap) => ({
      id: `app:${manifest.id}:${cap.name}`,
      appId: manifest.id,
      name: `app_${manifest.id.replace(/[^a-zA-Z0-9_]/g, '_')}_${cap.name}`,
      description: cap.description,
      parameters: cap.parameters,
      enabled: true,
    }));
  }

  /**
   * Synchronously loads the local app registry from disk
   */
  private loadRegistrySync(): void {
    try {
      if (fs.existsSync(this.registryFile)) {
        const raw = fs.readFileSync(this.registryFile, 'utf-8');
        const data: RegistryData = JSON.parse(raw);
        if (data && data.apps && typeof data.apps === 'object') {
          for (const [id, app] of Object.entries(data.apps)) {
            // Verify path on disk
            if (fs.existsSync(app.installPath)) {
              this.installedApps.set(id, app);
            }
          }
        }
      } else {
        this.recoverFromDiskSync();
      }
    } catch {
      this.recoverFromDiskSync();
    }
  }

  /**
   * Disk recovery scan if registry JSON is missing
   */
  private recoverFromDiskSync(): void {
    try {
      if (fs.existsSync(this.appsDir)) {
        const entries = fs.readdirSync(this.appsDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const manifestPath = path.join(this.appsDir, entry.name, 'elix.app.json');
            try {
              if (fs.existsSync(manifestPath)) {
                const manifest: ElixAppManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
                const validation = validateAppManifest(manifest);
                if (validation.valid && validation.manifest) {
                  const storagePaths = this.storage.getAppStoragePaths(validation.manifest.id);
                  this.installedApps.set(validation.manifest.id, {
                    manifest: validation.manifest,
                    installPath: storagePaths.binPath,
                    installedAt: Date.now(),
                    updatedAt: Date.now(),
                    state: 'idle',
                    registeredTools: this.buildRegisteredTools(validation.manifest),
                    storage: storagePaths,
                  });
                }
              }
            } catch {
              // Ignore broken directories during recovery scan
            }
          }
        }
      }
      this.saveRegistrySync();
    } catch {
      // Ignore scan failure
    }
  }

  /**
   * Asynchronously saves the local app registry
   */
  private async saveRegistryAsync(): Promise<void> {
    const data: RegistryData = {
      version: '1.0.0',
      updatedAt: Date.now(),
      apps: Object.fromEntries(this.installedApps.entries()),
    };

    try {
      await fsp.mkdir(path.dirname(this.registryFile), { recursive: true });
      const tempFile = `${this.registryFile}.tmp-${randomId(4)}`;
      try {
        await fsp.writeFile(tempFile, JSON.stringify(data, null, 2), 'utf-8');
        try {
          await fsp.rename(tempFile, this.registryFile);
        } catch {
          await fsp.copyFile(tempFile, this.registryFile);
          await fsp.rm(tempFile, { force: true }).catch(() => {});
        }
      } catch {
        await fsp.writeFile(this.registryFile, JSON.stringify(data, null, 2), 'utf-8').catch(() => {});
      }
    } catch {
      // Ignore registry write error during shutdown
    }
  }

  /**
   * Synchronously saves the local app registry
   */
  private saveRegistrySync(): void {
    const data: RegistryData = {
      version: '1.0.0',
      updatedAt: Date.now(),
      apps: Object.fromEntries(this.installedApps.entries()),
    };

    try {
      this.ensureDirectorySync(path.dirname(this.registryFile));
      fs.writeFileSync(this.registryFile, JSON.stringify(data, null, 2), 'utf-8');
    } catch {
      // Ignore registry write error during shutdown
    }
  }

  /**
   * Ensures directory exists synchronously
   */
  private ensureDirectorySync(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }
}
