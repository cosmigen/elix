/**
 * ELIX Native App Runtime & Dynamic App Bridge
 * Unified Public Application Manager Facade (ELIXAPP Spec v1.2.0)
 * 
 * @module @deepseek-ai/elix-app-bridge/app-manager
 */

import { EventEmitter } from 'node:events';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ElixAppInstaller } from './installer.js';
import { ElixWindowManager, type ElixAppWindow } from './window-manager.js';
import { registerAppTools, unregisterAppTools } from './tool-registry.js';
import { ElixZip } from './utils/zip.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import {
  type WindowHost,
  type ConfirmationBroker,
  type ToolSink,
  type CapabilityIndex,
  type EventSink,
  MemoryToolSink,
  MemoryCapabilityIndex,
  ConsoleConfirmationBroker,
  EventEmitterEventSink,
} from './adapters/ports.js';
import type {
  AppConsentPayload,
  ElixAppCapability,
  ElixAppWindowConfig,
  InstallOptions,
  InstalledApp,
  ManifestValidationResult,
  UninstallImpactPlan,
  UninstallOptions,
} from './types.js';
import { validateAppManifest } from './validator.js';

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
export class ElixAppManager extends EventEmitter {
  public readonly installer: ElixAppInstaller;
  public readonly windowHost: WindowHost;
  public readonly confirmationBroker: ConfirmationBroker;
  public readonly toolSink: ToolSink;
  public readonly capabilityIndex: CapabilityIndex;
  public readonly eventSink: EventSink;

  private permissionGrants: Map<string, Set<string>> = new Map();
  private disabledCapabilities: Map<string, Set<string>> = new Map();

  constructor(options?: AppManagerOptions) {
    super();

    const baseDir = options?.baseDir || path.join(os.homedir(), '.elix');

    this.installer = options?.installer || new ElixAppInstaller(baseDir);
    this.windowHost = options?.windowHost || new ElixWindowManager(this.installer);
    this.confirmationBroker = options?.confirmationBroker || new ConsoleConfirmationBroker(false);
    this.toolSink = options?.toolSink || new MemoryToolSink();
    this.capabilityIndex = options?.capabilityIndex || new MemoryCapabilityIndex();
    this.eventSink = options?.eventSink || new EventEmitterEventSink();

    // Pipe installer events to eventSink and facade
    this.installer.on('app:installed', (data) => {
      this.emit('app:installed', data);
      this.eventSink.emit('app:installed', data);
    });

    this.installer.on('app:uninstalled', (data) => {
      this.emit('app:uninstalled', data);
      this.eventSink.emit('app:uninstalled', data);
    });

    this.installer.on('app:file-trigger', (data) => {
      this.emit('app:file-trigger', data);
      this.eventSink.emit('app:file-trigger', data);
    });

    // Scan all installed app manifests on startup and automatically mount their dynamic capability tools
    try {
      const installed = this.installer.listInstalledApps();
      for (const app of installed) {
        registerAppTools(this.toolSink, this.windowHost, app, this.capabilityIndex);
      }
    } catch {
      // Ignore if directory not yet initialized
    }
  }

  // ==========================================================================
  // 1. Metadata Operations
  // ==========================================================================

  /**
   * List all installed applications with live execution state
   * 
   * @param filter Optional filter: 'all' | 'running' | 'installed'
   */
  public list(filter: 'all' | 'running' | 'installed' = 'all'): AppSummary[] {
    const installed = this.installer.listInstalledApps();
    const activeWindows = this.windowHost.listWindows();
    const activeAppMap = new Map<string, ElixAppWindow>();

    for (const win of activeWindows) {
      if (win.state !== 'closed') {
        activeAppMap.set(win.appId, win);
      }
    }

    const summaries: AppSummary[] = [];

    for (const app of installed) {
      const isRunning = activeAppMap.has(app.manifest.id);
      const win = activeAppMap.get(app.manifest.id);

      if (filter === 'running' && !isRunning) continue;
      if (filter === 'installed' && isRunning) continue;

      const capabilities = app.manifest.capabilities || {};
      const capNames = Array.isArray(capabilities)
        ? capabilities.map((c) => c.name)
        : Object.keys(capabilities);

      summaries.push({
        appId: app.manifest.id,
        name: app.manifest.name,
        version: app.manifest.version,
        description: app.manifest.description,
        status: isRunning ? 'running' : 'installed',
        windowId: win?.id,
        installPath: app.installPath,
        capabilities: capNames,
        permissions: this.getPermissions(app.manifest.id),
        installedAt: app.installedAt,
      });
    }

    return summaries;
  }

  /**
   * Get an installed app by its unique App ID
   */
  public get(appId: string): InstalledApp | undefined {
    return this.installer.getApp(appId);
  }

  /**
   * Inspect an app package bundle without installing it
   */
  public async inspectPackage(packagePath: string): Promise<AppConsentPayload> {
    return this.installer.inspectPackage(packagePath);
  }

  /**
   * Verify package structure and manifest integrity
   */
  public async verifyPackage(packagePath: string): Promise<ValidationResult> {
    const payload = await this.installer.inspectPackage(packagePath);
    return validateAppManifest({
      id: payload.appId,
      name: payload.name,
      version: payload.version,
      description: payload.description,
      author: payload.author,
      entry: 'index.html',
      permissions: payload.permissions.map((p) => p.permission),
      capabilities: payload.capabilities.map((c) => ({
        name: c.name,
        description: c.description,
        parameters: { type: 'object', properties: {} },
      })),
    });
  }

  // ==========================================================================
  // 2. Lifecycle Operations
  // ==========================================================================

  /**
   * Install an application package (.elixapp bundle or folder)
   */
  public async install(packagePath: string, options?: InstallOptions): Promise<InstalledApp> {
    // 1. Inspect package and request consent if needed
    const payload = await this.installer.inspectPackage(packagePath);

    if (!options?.skipConsent) {
      const agreed = await this.confirmationBroker.requestConfirmation(payload);
      if (!agreed) {
        throw new Error(`Installation of '${payload.name}' (${payload.appId}) rejected by user.`);
      }
    }

    // 2. Install application
    const installedApp = await this.installer.install(packagePath, {
      ...options,
      skipConsent: true,
    });

    // 3. Initialize default permission grants
    const defaultPermissions = new Set(installedApp.manifest.permissions || []);
    this.permissionGrants.set(installedApp.manifest.id, defaultPermissions);

    // 4. Auto-mount capabilities onto ToolSink & CapabilityIndex
    registerAppTools(this.toolSink, this.windowHost, installedApp, this.capabilityIndex);

    return installedApp;
  }

  /**
   * Update an existing application package
   */
  public async update(
    appId: string,
    packagePath: string,
    options?: InstallOptions
  ): Promise<InstalledApp> {
    const inspect = await this.installer.inspectPackage(packagePath);
    if (inspect.appId !== appId) {
      throw new Error(
        `Package App ID mismatch: Expected '${appId}' but package contains '${inspect.appId}'`
      );
    }

    return this.install(packagePath, { ...options, force: true });
  }

  /**
   * Repair an installed application (re-reads files and re-mounts tools)
   */
  public async repair(appId: string): Promise<InstalledApp> {
    const app = this.get(appId);
    if (!app) {
      throw new Error(`Cannot repair '${appId}': Application is not installed`);
    }

    // Re-register tools
    registerAppTools(this.toolSink, this.windowHost, app, this.capabilityIndex);
    return app;
  }

  /**
   * Rebuilds reference demo applications from demo-apps/ directory and updates installed apps,
   * ensuring the latest index.html and assets are properly synced and copied to ~/.elix/apps/
   */
  public async rebuildDemoApps(demoAppsDir?: string): Promise<InstalledApp[]> {
    const pkgRoot = path.resolve(__dirname, '..');
    const defaultDemoDir = path.join(pkgRoot, 'demo-apps');
    const resolvedDemoDir = demoAppsDir || defaultDemoDir;
    const results: InstalledApp[] = [];

    const notesSrc = path.join(resolvedDemoDir, 'com.elix.notes');
    const calcSrc = path.join(resolvedDemoDir, 'com.elix.calculator');

    const stagingDir = path.join(this.installer.baseDir, 'app-staging', 'demo-build');
    await fsp.mkdir(stagingDir, { recursive: true });

    if (fs.existsSync(notesSrc)) {
      const notesZip = path.join(stagingDir, 'com.elix.notes.elixapp');
      const zip = new ElixZip();
      const addFolder = (dir: string, base: string = '') => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const ent of entries) {
          const full = path.join(dir, ent.name);
          const rel = base ? `${base}/${ent.name}` : ent.name;
          if (ent.isDirectory()) {
            addFolder(full, rel);
          } else {
            zip.addFile(rel, fs.readFileSync(full));
          }
        }
      };
      addFolder(notesSrc);
      zip.writeZip(notesZip);

      const installedApp = await this.install(notesZip, { force: true, skipConsent: true });

      // Directly sync and copy latest index.html into installPath
      const srcIndex = path.join(notesSrc, 'index.html');
      const destIndex = path.join(installedApp.installPath, 'index.html');
      if (fs.existsSync(srcIndex)) {
        await fsp.copyFile(srcIndex, destIndex);
      }
      const requiredSnippets = [
        "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; connect-src * ws://127.0.0.1:* ws://localhost:*;",
        'ws://127.0.0.1:7391',
        'create_note',
        'search_notes',
        'delete_note',
      ];
      const verifyAndPatch = async (filePath: string) => {
        if (!fs.existsSync(filePath) || !fs.existsSync(srcIndex)) return;
        const content = await fsp.readFile(filePath, 'utf8');
        const missing = requiredSnippets.some((s) => !content.includes(s));
        if (missing) {
          await fsp.copyFile(srcIndex, filePath);
        }
      };
      await verifyAndPatch(destIndex);
      const homeNotesIndex = path.join(os.homedir(), '.elix', 'apps', 'com.elix.notes', 'index.html');
      if (fs.existsSync(path.dirname(homeNotesIndex))) {
        await fsp.copyFile(srcIndex, homeNotesIndex).catch(() => {});
        await verifyAndPatch(homeNotesIndex);
      }
      const srcDemoIndex = path.join(pkgRoot, 'src', 'demo-apps', 'com.elix.notes', 'index.html');
      if (fs.existsSync(path.dirname(srcDemoIndex))) {
        await fsp.mkdir(path.dirname(srcDemoIndex), { recursive: true });
        await fsp.copyFile(srcIndex, srcDemoIndex).catch(() => {});
      }

      results.push(installedApp);
    }

    if (fs.existsSync(calcSrc)) {
      const calcZip = path.join(stagingDir, 'com.elix.calculator.elixapp');
      const zip = new ElixZip();
      const addFolder = (dir: string, base: string = '') => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const ent of entries) {
          const full = path.join(dir, ent.name);
          const rel = base ? `${base}/${ent.name}` : ent.name;
          if (ent.isDirectory()) {
            addFolder(full, rel);
          } else {
            zip.addFile(rel, fs.readFileSync(full));
          }
        }
      };
      addFolder(calcSrc);
      zip.writeZip(calcZip);

      const installedApp = await this.install(calcZip, { force: true, skipConsent: true });

      // Directly sync and copy latest index.html into installPath
      const srcIndex = path.join(calcSrc, 'index.html');
      const destIndex = path.join(installedApp.installPath, 'index.html');
      if (fs.existsSync(srcIndex)) {
        await fsp.copyFile(srcIndex, destIndex);
      }
      const homeCalcIndex = path.join(os.homedir(), '.elix', 'apps', 'com.elix.calculator', 'index.html');
      if (fs.existsSync(path.dirname(homeCalcIndex))) {
        await fsp.copyFile(srcIndex, homeCalcIndex).catch(() => {});
      }
      const srcCalcDemoIndex = path.join(pkgRoot, 'src', 'demo-apps', 'com.elix.calculator', 'index.html');
      if (fs.existsSync(path.dirname(srcCalcDemoIndex))) {
        await fsp.copyFile(srcIndex, srcCalcDemoIndex).catch(() => {});
      }

      results.push(installedApp);
    }

    const clockSrc = path.join(resolvedDemoDir, 'com.elix.clock');
    if (fs.existsSync(clockSrc)) {
      const clockZip = path.join(stagingDir, 'com.elix.clock.elixapp');
      const zip = new ElixZip();
      const addFolder = (dir: string, base: string = '') => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const ent of entries) {
          const full = path.join(dir, ent.name);
          const rel = base ? `${base}/${ent.name}` : ent.name;
          if (ent.isDirectory()) {
            addFolder(full, rel);
          } else {
            zip.addFile(rel, fs.readFileSync(full));
          }
        }
      };
      addFolder(clockSrc);
      zip.writeZip(clockZip);

      const installedApp = await this.install(clockZip, { force: true, skipConsent: true });

      // Directly sync and copy latest index.html into installPath
      const srcIndex = path.join(clockSrc, 'index.html');
      const destIndex = path.join(installedApp.installPath, 'index.html');
      if (fs.existsSync(srcIndex)) {
        await fsp.copyFile(srcIndex, destIndex);
      }
      const homeClockIndex = path.join(os.homedir(), '.elix', 'apps', 'com.elix.clock', 'index.html');
      if (fs.existsSync(path.dirname(homeClockIndex))) {
        await fsp.copyFile(srcIndex, homeClockIndex).catch(() => {});
      }
      const srcClockDemoIndex = path.join(pkgRoot, 'src', 'demo-apps', 'com.elix.clock', 'index.html');
      if (fs.existsSync(path.dirname(srcClockDemoIndex))) {
        await fsp.copyFile(srcIndex, srcClockDemoIndex).catch(() => {});
      }

      results.push(installedApp);
    }

    // Package and deploy ELIX Calendar & Tasks (com.elix.calendar)
    const calSrc = path.join(resolvedDemoDir, 'com.elix.calendar');
    if (fs.existsSync(calSrc)) {
      const calZip = path.join(stagingDir, 'com.elix.calendar.elixapp');
      const zip = new ElixZip();
      const addFolder = (dir: string, base: string = '') => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const ent of entries) {
          const full = path.join(dir, ent.name);
          const rel = base ? `${base}/${ent.name}` : ent.name;
          if (ent.isDirectory()) {
            addFolder(full, rel);
          } else {
            zip.addFile(rel, fs.readFileSync(full));
          }
        }
      };
      addFolder(calSrc);
      zip.writeZip(calZip);

      const installedApp = await this.install(calZip, { force: true, skipConsent: true });

      // Directly sync and copy latest index.html into installPath
      const srcIndex = path.join(calSrc, 'index.html');
      const destIndex = path.join(installedApp.installPath, 'index.html');
      if (fs.existsSync(srcIndex)) {
        await fsp.copyFile(srcIndex, destIndex);
      }
      const homeCalIndex = path.join(os.homedir(), '.elix', 'apps', 'com.elix.calendar', 'index.html');
      if (fs.existsSync(path.dirname(homeCalIndex))) {
        await fsp.copyFile(srcIndex, homeCalIndex).catch(() => {});
      }
      const srcCalDemoIndex = path.join(pkgRoot, 'src', 'demo-apps', 'com.elix.calendar', 'index.html');
      if (fs.existsSync(path.dirname(srcCalDemoIndex))) {
        await fsp.copyFile(srcIndex, srcCalDemoIndex).catch(() => {});
      }

      results.push(installedApp);
    }

    // Package and deploy ELIX Utilities (com.elix.utilities)
    const utilSrc = path.join(resolvedDemoDir, 'com.elix.utilities');
    if (fs.existsSync(utilSrc)) {
      const utilZip = path.join(stagingDir, 'com.elix.utilities.elixapp');
      const zip = new ElixZip();
      const addFolder = (dir: string, base: string = '') => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const ent of entries) {
          const full = path.join(dir, ent.name);
          const rel = base ? `${base}/${ent.name}` : ent.name;
          if (ent.isDirectory()) {
            addFolder(full, rel);
          } else {
            zip.addFile(rel, fs.readFileSync(full));
          }
        }
      };
      addFolder(utilSrc);
      zip.writeZip(utilZip);

      const installedApp = await this.install(utilZip, { force: true, skipConsent: true });

      // Directly sync and copy latest index.html into installPath
      const srcIndex = path.join(utilSrc, 'index.html');
      const destIndex = path.join(installedApp.installPath, 'index.html');
      if (fs.existsSync(srcIndex)) {
        await fsp.copyFile(srcIndex, destIndex);
      }
      const homeUtilIndex = path.join(os.homedir(), '.elix', 'apps', 'com.elix.utilities', 'index.html');
      if (fs.existsSync(path.dirname(homeUtilIndex))) {
        await fsp.copyFile(srcIndex, homeUtilIndex).catch(() => {});
      }
      const srcUtilDemoIndex = path.join(pkgRoot, 'src', 'demo-apps', 'com.elix.utilities', 'index.html');
      if (fs.existsSync(path.dirname(srcUtilDemoIndex))) {
        await fsp.copyFile(srcIndex, srcUtilDemoIndex).catch(() => {});
      }

      results.push(installedApp);
    }

    // Package and deploy ELIX Files (com.elix.files)
    const filesSrc = path.join(resolvedDemoDir, 'com.elix.files');
    if (fs.existsSync(filesSrc)) {
      const filesZip = path.join(stagingDir, 'com.elix.files.elixapp');
      const zip = new ElixZip();
      const addFolder = (dir: string, base: string = '') => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const ent of entries) {
          const full = path.join(dir, ent.name);
          const rel = base ? `${base}/${ent.name}` : ent.name;
          if (ent.isDirectory()) {
            addFolder(full, rel);
          } else {
            zip.addFile(rel, fs.readFileSync(full));
          }
        }
      };
      addFolder(filesSrc);
      zip.writeZip(filesZip);

      const installedApp = await this.install(filesZip, { force: true, skipConsent: true });

      // Directly sync and copy latest index.html into installPath
      const srcIndex = path.join(filesSrc, 'index.html');
      const destIndex = path.join(installedApp.installPath, 'index.html');
      if (fs.existsSync(srcIndex)) {
        await fsp.copyFile(srcIndex, destIndex);
      }
      const homeFilesIndex = path.join(os.homedir(), '.elix', 'apps', 'com.elix.files', 'index.html');
      if (fs.existsSync(path.dirname(homeFilesIndex))) {
        await fsp.copyFile(srcIndex, homeFilesIndex).catch(() => {});
      }
      const srcFilesDemoIndex = path.join(pkgRoot, 'src', 'demo-apps', 'com.elix.files', 'index.html');
      if (fs.existsSync(path.dirname(srcFilesDemoIndex))) {
        await fsp.copyFile(srcIndex, srcFilesDemoIndex).catch(() => {});
      }

      results.push(installedApp);
    }

    // Package and deploy ELIX Media (com.elix.media)
    const mediaSrc = path.join(resolvedDemoDir, 'com.elix.media');
    if (fs.existsSync(mediaSrc)) {
      const mediaZip = path.join(stagingDir, 'com.elix.media.elixapp');
      const zip = new ElixZip();
      const addFolder = (dir: string, base: string = '') => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const ent of entries) {
          const full = path.join(dir, ent.name);
          const rel = base ? `${base}/${ent.name}` : ent.name;
          if (ent.isDirectory()) {
            addFolder(full, rel);
          } else {
            zip.addFile(rel, fs.readFileSync(full));
          }
        }
      };
      addFolder(mediaSrc);
      zip.writeZip(mediaZip);

      const installedApp = await this.install(mediaZip, { force: true, skipConsent: true });

      // Directly sync and copy latest index.html into installPath
      const srcIndex = path.join(mediaSrc, 'index.html');
      const destIndex = path.join(installedApp.installPath, 'index.html');
      if (fs.existsSync(srcIndex)) {
        await fsp.copyFile(srcIndex, destIndex);
      }
      const homeMediaIndex = path.join(os.homedir(), '.elix', 'apps', 'com.elix.media', 'index.html');
      if (fs.existsSync(path.dirname(homeMediaIndex))) {
        await fsp.copyFile(srcIndex, homeMediaIndex).catch(() => {});
      }
      const srcMediaDemoIndex = path.join(pkgRoot, 'src', 'demo-apps', 'com.elix.media', 'index.html');
      if (fs.existsSync(path.dirname(srcMediaDemoIndex))) {
        await fsp.copyFile(srcIndex, srcMediaDemoIndex).catch(() => {});
      }

      results.push(installedApp);
    }

    // Package and deploy ELIX Media Studio (com.elix.mediastudio)
    const mediaStudioSrc = path.join(resolvedDemoDir, 'com.elix.mediastudio');
    if (fs.existsSync(mediaStudioSrc)) {
      const mediaStudioZip = path.join(stagingDir, 'com.elix.mediastudio.elixapp');
      const zip = new ElixZip();
      const addFolder = (dir: string, base: string = '') => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const ent of entries) {
          const full = path.join(dir, ent.name);
          const rel = base ? `${base}/${ent.name}` : ent.name;
          if (ent.isDirectory()) {
            addFolder(full, rel);
          } else {
            zip.addFile(rel, fs.readFileSync(full));
          }
        }
      };
      addFolder(mediaStudioSrc);
      zip.writeZip(mediaStudioZip);

      const installedApp = await this.install(mediaStudioZip, { force: true, skipConsent: true });

      // Directly sync and copy latest index.html into installPath
      const srcIndex = path.join(mediaStudioSrc, 'index.html');
      const destIndex = path.join(installedApp.installPath, 'index.html');
      if (fs.existsSync(srcIndex)) {
        await fsp.copyFile(srcIndex, destIndex);
      }
      const homeMediaStudioIndex = path.join(os.homedir(), '.elix', 'apps', 'com.elix.mediastudio', 'index.html');
      if (fs.existsSync(path.dirname(homeMediaStudioIndex))) {
        await fsp.copyFile(srcIndex, homeMediaStudioIndex).catch(() => {});
      }
      const srcMediaStudioDemoIndex = path.join(pkgRoot, 'src', 'demo-apps', 'com.elix.mediastudio', 'index.html');
      if (fs.existsSync(path.dirname(srcMediaStudioDemoIndex))) {
        await fsp.copyFile(srcIndex, srcMediaStudioDemoIndex).catch(() => {});
      }

      results.push(installedApp);
    }

    // Package and deploy ELIX 3D Studio (com.elix.studio3d)
    const studio3dSrc = path.join(resolvedDemoDir, 'com.elix.studio3d');
    if (fs.existsSync(studio3dSrc)) {
      const studio3dZip = path.join(stagingDir, 'com.elix.studio3d.elixapp');
      const zip = new ElixZip();
      const addFolder = (dir: string, base: string = '') => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const ent of entries) {
          const full = path.join(dir, ent.name);
          const rel = base ? `${base}/${ent.name}` : ent.name;
          if (ent.isDirectory()) {
            addFolder(full, rel);
          } else {
            zip.addFile(rel, fs.readFileSync(full));
          }
        }
      };
      addFolder(studio3dSrc);
      zip.writeZip(studio3dZip);

      const installedApp = await this.install(studio3dZip, { force: true, skipConsent: true });

      // Directly sync and copy latest index.html into installPath
      const srcIndex = path.join(studio3dSrc, 'index.html');
      const destIndex = path.join(installedApp.installPath, 'index.html');
      if (fs.existsSync(srcIndex)) {
        await fsp.copyFile(srcIndex, destIndex);
      }
      const homeStudio3dIndex = path.join(os.homedir(), '.elix', 'apps', 'com.elix.studio3d', 'index.html');
      if (fs.existsSync(path.dirname(homeStudio3dIndex))) {
        await fsp.copyFile(srcIndex, homeStudio3dIndex).catch(() => {});
      }
      const srcStudio3dDemoIndex = path.join(pkgRoot, 'src', 'demo-apps', 'com.elix.studio3d', 'index.html');
      if (fs.existsSync(path.dirname(srcStudio3dDemoIndex))) {
        await fsp.copyFile(srcIndex, srcStudio3dDemoIndex).catch(() => {});
      }

      results.push(installedApp);
    }

    // Package and deploy ELIX Documents (com.elix.documents)
    const documentsSrc = path.join(resolvedDemoDir, 'com.elix.documents');
    if (fs.existsSync(documentsSrc)) {
      const documentsZip = path.join(stagingDir, 'com.elix.documents.elixapp');
      const zip = new ElixZip();
      const addFolder = (dir: string, base: string = '') => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const ent of entries) {
          const full = path.join(dir, ent.name);
          const rel = base ? `${base}/${ent.name}` : ent.name;
          if (ent.isDirectory()) {
            addFolder(full, rel);
          } else {
            zip.addFile(rel, fs.readFileSync(full));
          }
        }
      };
      addFolder(documentsSrc);
      zip.writeZip(documentsZip);

      const installedApp = await this.install(documentsZip, { force: true, skipConsent: true });

      // Directly sync and copy latest index.html into installPath
      const srcIndex = path.join(documentsSrc, 'index.html');
      const destIndex = path.join(installedApp.installPath, 'index.html');
      if (fs.existsSync(srcIndex)) {
        await fsp.copyFile(srcIndex, destIndex);
      }
      const homeDocumentsIndex = path.join(os.homedir(), '.elix', 'apps', 'com.elix.documents', 'index.html');
      if (fs.existsSync(path.dirname(homeDocumentsIndex))) {
        await fsp.copyFile(srcIndex, homeDocumentsIndex).catch(() => {});
      }
      const srcDocumentsDemoIndex = path.join(pkgRoot, 'src', 'demo-apps', 'com.elix.documents', 'index.html');
      if (fs.existsSync(path.dirname(srcDocumentsDemoIndex))) {
        await fsp.copyFile(srcIndex, srcDocumentsDemoIndex).catch(() => {});
      }

      results.push(installedApp);
    }

    // Package and deploy ELIX Capture (com.elix.capture)
    const captureSrc = path.join(resolvedDemoDir, 'com.elix.capture');
    if (fs.existsSync(captureSrc)) {
      const captureZip = path.join(stagingDir, 'com.elix.capture.elixapp');
      const zip = new ElixZip();
      const addFolder = (dir: string, base: string = '') => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const ent of entries) {
          const full = path.join(dir, ent.name);
          const rel = base ? `${base}/${ent.name}` : ent.name;
          if (ent.isDirectory()) {
            addFolder(full, rel);
          } else {
            zip.addFile(rel, fs.readFileSync(full));
          }
        }
      };
      addFolder(captureSrc);
      zip.writeZip(captureZip);

      const installedApp = await this.install(captureZip, { force: true, skipConsent: true });

      // Directly sync and copy latest index.html into installPath
      const srcIndex = path.join(captureSrc, 'index.html');
      const destIndex = path.join(installedApp.installPath, 'index.html');
      if (fs.existsSync(srcIndex)) {
        await fsp.copyFile(srcIndex, destIndex);
      }
      const homeCaptureIndex = path.join(os.homedir(), '.elix', 'apps', 'com.elix.capture', 'index.html');
      if (fs.existsSync(path.dirname(homeCaptureIndex))) {
        await fsp.copyFile(srcIndex, homeCaptureIndex).catch(() => {});
      }
      const srcCaptureDemoIndex = path.join(pkgRoot, 'src', 'demo-apps', 'com.elix.capture', 'index.html');
      if (fs.existsSync(path.dirname(srcCaptureDemoIndex))) {
        await fsp.copyFile(srcIndex, srcCaptureDemoIndex).catch(() => {});
      }

      results.push(installedApp);
    }

    // Package and deploy ELIX Camera & Recorder (com.elix.camera)
    const cameraSrc = path.join(resolvedDemoDir, 'com.elix.camera');
    if (fs.existsSync(cameraSrc)) {
      const cameraZip = path.join(stagingDir, 'com.elix.camera.elixapp');
      const zip = new ElixZip();
      const addFolder = (dir: string, base: string = '') => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const ent of entries) {
          const full = path.join(dir, ent.name);
          const rel = base ? `${base}/${ent.name}` : ent.name;
          if (ent.isDirectory()) {
            addFolder(full, rel);
          } else {
            zip.addFile(rel, fs.readFileSync(full));
          }
        }
      };
      addFolder(cameraSrc);
      zip.writeZip(cameraZip);

      const installedApp = await this.install(cameraZip, { force: true, skipConsent: true });

      // Directly sync and copy latest index.html into installPath
      const srcIndex = path.join(cameraSrc, 'index.html');
      const destIndex = path.join(installedApp.installPath, 'index.html');
      if (fs.existsSync(srcIndex)) {
        await fsp.copyFile(srcIndex, destIndex);
      }
      const homeCameraIndex = path.join(os.homedir(), '.elix', 'apps', 'com.elix.camera', 'index.html');
      if (fs.existsSync(path.dirname(homeCameraIndex))) {
        await fsp.copyFile(srcIndex, homeCameraIndex).catch(() => {});
      }
      const srcCameraDemoIndex = path.join(pkgRoot, 'src', 'demo-apps', 'com.elix.camera', 'index.html');
      if (fs.existsSync(path.dirname(srcCameraDemoIndex))) {
        await fsp.copyFile(srcIndex, srcCameraDemoIndex).catch(() => {});
      }

      results.push(installedApp);
    }

    // Package and deploy ELIX Terminal (com.elix.terminal)
    const terminalSrc = path.join(resolvedDemoDir, 'com.elix.terminal');
    if (fs.existsSync(terminalSrc)) {
      const terminalZip = path.join(stagingDir, 'com.elix.terminal.elixapp');
      const zip = new ElixZip();
      const addFolder = (dir: string, base: string = '') => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const ent of entries) {
          const full = path.join(dir, ent.name);
          const rel = base ? `${base}/${ent.name}` : ent.name;
          if (ent.isDirectory()) {
            addFolder(full, rel);
          } else {
            zip.addFile(rel, fs.readFileSync(full));
          }
        }
      };
      addFolder(terminalSrc);
      zip.writeZip(terminalZip);

      const installedApp = await this.install(terminalZip, { force: true, skipConsent: true });

      // Directly sync and copy latest index.html into installPath
      const srcIndex = path.join(terminalSrc, 'index.html');
      const destIndex = path.join(installedApp.installPath, 'index.html');
      if (fs.existsSync(srcIndex)) {
        await fsp.copyFile(srcIndex, destIndex);
      }
      const homeTerminalIndex = path.join(os.homedir(), '.elix', 'apps', 'com.elix.terminal', 'index.html');
      if (fs.existsSync(path.dirname(homeTerminalIndex))) {
        await fsp.copyFile(srcIndex, homeTerminalIndex).catch(() => {});
      }
      const srcTerminalDemoIndex = path.join(pkgRoot, 'src', 'demo-apps', 'com.elix.terminal', 'index.html');
      if (fs.existsSync(path.dirname(srcTerminalDemoIndex))) {
        await fsp.copyFile(srcIndex, srcTerminalDemoIndex).catch(() => {});
      }

      results.push(installedApp);
    }

    // Package and deploy ELIX Code (com.elix.code)
    const codeSrc = path.join(resolvedDemoDir, 'com.elix.code');
    if (fs.existsSync(codeSrc)) {
      const codeZip = path.join(stagingDir, 'com.elix.code.elixapp');
      const zip = new ElixZip();
      const addFolder = (dir: string, base: string = '') => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const ent of entries) {
          const full = path.join(dir, ent.name);
          const rel = base ? `${base}/${ent.name}` : ent.name;
          if (ent.isDirectory()) {
            addFolder(full, rel);
          } else {
            zip.addFile(rel, fs.readFileSync(full));
          }
        }
      };
      addFolder(codeSrc);
      zip.writeZip(codeZip);

      const installedApp = await this.install(codeZip, { force: true, skipConsent: true });

      // Directly sync and copy latest index.html into installPath
      const srcIndex = path.join(codeSrc, 'index.html');
      const destIndex = path.join(installedApp.installPath, 'index.html');
      if (fs.existsSync(srcIndex)) {
        await fsp.copyFile(srcIndex, destIndex);
      }
      const homeCodeIndex = path.join(os.homedir(), '.elix', 'apps', 'com.elix.code', 'index.html');
      if (fs.existsSync(path.dirname(homeCodeIndex))) {
        await fsp.copyFile(srcIndex, homeCodeIndex).catch(() => {});
      }
      const srcCodeDemoIndex = path.join(pkgRoot, 'src', 'demo-apps', 'com.elix.code', 'index.html');
      if (fs.existsSync(path.dirname(srcCodeDemoIndex))) {
        await fsp.copyFile(srcIndex, srcCodeDemoIndex).catch(() => {});
      }

      results.push(installedApp);
    }

    // Package and deploy ELIX System Monitor (com.elix.sysmon)
    const sysmonSrc = path.join(resolvedDemoDir, 'com.elix.sysmon');
    if (fs.existsSync(sysmonSrc)) {
      const sysmonZip = path.join(stagingDir, 'com.elix.sysmon.elixapp');
      const zip = new ElixZip();
      const addFolder = (dir: string, base: string = '') => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const ent of entries) {
          const full = path.join(dir, ent.name);
          const rel = base ? `${base}/${ent.name}` : ent.name;
          if (ent.isDirectory()) {
            addFolder(full, rel);
          } else {
            zip.addFile(rel, fs.readFileSync(full));
          }
        }
      };
      addFolder(sysmonSrc);
      zip.writeZip(sysmonZip);

      const installedApp = await this.install(sysmonZip, { force: true, skipConsent: true });

      // Directly sync and copy latest index.html into installPath
      const srcIndex = path.join(sysmonSrc, 'index.html');
      const destIndex = path.join(installedApp.installPath, 'index.html');
      if (fs.existsSync(srcIndex)) {
        await fsp.copyFile(srcIndex, destIndex);
      }
      const homeSysmonIndex = path.join(os.homedir(), '.elix', 'apps', 'com.elix.sysmon', 'index.html');
      if (fs.existsSync(path.dirname(homeSysmonIndex))) {
        await fsp.copyFile(srcIndex, homeSysmonIndex).catch(() => {});
      }
      const srcSysmonDemoIndex = path.join(pkgRoot, 'src', 'demo-apps', 'com.elix.sysmon', 'index.html');
      if (fs.existsSync(path.dirname(srcSysmonDemoIndex))) {
        await fsp.copyFile(srcIndex, srcSysmonDemoIndex).catch(() => {});
      }

      results.push(installedApp);
    }

    // Package and deploy ELIX Devices (com.elix.devices)
    const devicesSrc = path.join(resolvedDemoDir, 'com.elix.devices');
    if (fs.existsSync(devicesSrc)) {
      const devicesZip = path.join(stagingDir, 'com.elix.devices.elixapp');
      const zip = new ElixZip();
      const addFolder = (dir: string, base: string = '') => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const ent of entries) {
          const full = path.join(dir, ent.name);
          const rel = base ? `${base}/${ent.name}` : ent.name;
          if (ent.isDirectory()) {
            addFolder(full, rel);
          } else {
            zip.addFile(rel, fs.readFileSync(full));
          }
        }
      };
      addFolder(devicesSrc);
      zip.writeZip(devicesZip);

      const installedApp = await this.install(devicesZip, { force: true, skipConsent: true });

      // Directly sync and copy latest index.html into installPath
      const srcIndex = path.join(devicesSrc, 'index.html');
      const destIndex = path.join(installedApp.installPath, 'index.html');
      if (fs.existsSync(srcIndex)) {
        await fsp.copyFile(srcIndex, destIndex);
      }
      const homeDevicesIndex = path.join(os.homedir(), '.elix', 'apps', 'com.elix.devices', 'index.html');
      if (fs.existsSync(path.dirname(homeDevicesIndex))) {
        await fsp.copyFile(srcIndex, homeDevicesIndex).catch(() => {});
      }
      const srcDevicesDemoIndex = path.join(pkgRoot, 'src', 'demo-apps', 'com.elix.devices', 'index.html');
      if (fs.existsSync(path.dirname(srcDevicesDemoIndex))) {
        await fsp.copyFile(srcIndex, srcDevicesDemoIndex).catch(() => {});
      }

      results.push(installedApp);
    }

    // Package and deploy ELIX Settings (com.elix.settings)
    const settingsSrc = path.join(resolvedDemoDir, 'com.elix.settings');
    if (fs.existsSync(settingsSrc)) {
      const settingsZip = path.join(stagingDir, 'com.elix.settings.elixapp');
      const zip = new ElixZip();
      const addFolder = (dir: string, base: string = '') => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const ent of entries) {
          const full = path.join(dir, ent.name);
          const rel = base ? `${base}/${ent.name}` : ent.name;
          if (ent.isDirectory()) {
            addFolder(full, rel);
          } else {
            zip.addFile(rel, fs.readFileSync(full));
          }
        }
      };
      addFolder(settingsSrc);
      zip.writeZip(settingsZip);

      const installedApp = await this.install(settingsZip, { force: true, skipConsent: true });

      // Directly sync and copy latest index.html into installPath
      const srcIndex = path.join(settingsSrc, 'index.html');
      const destIndex = path.join(installedApp.installPath, 'index.html');
      if (fs.existsSync(srcIndex)) {
        await fsp.copyFile(srcIndex, destIndex);
      }
      const homeSettingsIndex = path.join(os.homedir(), '.elix', 'apps', 'com.elix.settings', 'index.html');
      if (fs.existsSync(path.dirname(homeSettingsIndex))) {
        await fsp.copyFile(srcIndex, homeSettingsIndex).catch(() => {});
      }
      const srcSettingsDemoIndex = path.join(pkgRoot, 'src', 'demo-apps', 'com.elix.settings', 'index.html');
      if (fs.existsSync(path.dirname(srcSettingsDemoIndex))) {
        await fsp.copyFile(srcIndex, srcSettingsDemoIndex).catch(() => {});
      }

      results.push(installedApp);
    }

    // Package and deploy ELIX App Center (com.elix.appcenter)
    const appcenterSrc = path.join(resolvedDemoDir, 'com.elix.appcenter');
    if (fs.existsSync(appcenterSrc)) {
      const appcenterZip = path.join(stagingDir, 'com.elix.appcenter.elixapp');
      const zip = new ElixZip();
      const addFolder = (dir: string, base: string = '') => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const ent of entries) {
          const full = path.join(dir, ent.name);
          const rel = base ? `${base}/${ent.name}` : ent.name;
          if (ent.isDirectory()) {
            addFolder(full, rel);
          } else {
            zip.addFile(rel, fs.readFileSync(full));
          }
        }
      };
      addFolder(appcenterSrc);
      zip.writeZip(appcenterZip);

      const installedApp = await this.install(appcenterZip, { force: true, skipConsent: true });

      // Directly sync and copy latest index.html into installPath
      const srcIndex = path.join(appcenterSrc, 'index.html');
      const destIndex = path.join(installedApp.installPath, 'index.html');
      if (fs.existsSync(srcIndex)) {
        await fsp.copyFile(srcIndex, destIndex);
      }
      const homeAppcenterIndex = path.join(os.homedir(), '.elix', 'apps', 'com.elix.appcenter', 'index.html');
      if (fs.existsSync(path.dirname(homeAppcenterIndex))) {
        await fsp.copyFile(srcIndex, homeAppcenterIndex).catch(() => {});
      }
      const srcAppcenterDemoIndex = path.join(pkgRoot, 'src', 'demo-apps', 'com.elix.appcenter', 'index.html');
      if (fs.existsSync(path.dirname(srcAppcenterDemoIndex))) {
        await fsp.copyFile(srcIndex, srcAppcenterDemoIndex).catch(() => {});
      }

      results.push(installedApp);
    }

    // Package and deploy ELIX Universal Search (com.elix.search)
    const searchSrc = path.join(resolvedDemoDir, 'com.elix.search');
    if (fs.existsSync(searchSrc)) {
      const searchZip = path.join(stagingDir, 'com.elix.search.elixapp');
      const zip = new ElixZip();
      const addFolder = (dir: string, base: string = '') => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const ent of entries) {
          const full = path.join(dir, ent.name);
          const rel = base ? `${base}/${ent.name}` : ent.name;
          if (ent.isDirectory()) {
            addFolder(full, rel);
          } else {
            zip.addFile(rel, fs.readFileSync(full));
          }
        }
      };
      addFolder(searchSrc);
      zip.writeZip(searchZip);

      const installedApp = await this.install(searchZip, { force: true, skipConsent: true });

      // Directly sync and copy latest index.html into installPath
      const srcIndex = path.join(searchSrc, 'index.html');
      const destIndex = path.join(installedApp.installPath, 'index.html');
      if (fs.existsSync(srcIndex)) {
        await fsp.copyFile(srcIndex, destIndex);
      }
      const homeSearchIndex = path.join(os.homedir(), '.elix', 'apps', 'com.elix.search', 'index.html');
      if (fs.existsSync(path.dirname(homeSearchIndex))) {
        await fsp.copyFile(srcIndex, homeSearchIndex).catch(() => {});
      }
      const srcSearchDemoIndex = path.join(pkgRoot, 'src', 'demo-apps', 'com.elix.search', 'index.html');
      if (fs.existsSync(path.dirname(srcSearchDemoIndex))) {
        await fsp.copyFile(srcIndex, srcSearchDemoIndex).catch(() => {});
      }

      results.push(installedApp);
    }

    // Package and deploy ELIX Center (com.elix.center)
    const centerSrc = path.join(resolvedDemoDir, 'com.elix.center');
    if (fs.existsSync(centerSrc)) {
      const centerZip = path.join(stagingDir, 'com.elix.center.elixapp');
      const zip = new ElixZip();
      const addFolder = (dir: string, base: string = '') => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const ent of entries) {
          const full = path.join(dir, ent.name);
          const rel = base ? `${base}/${ent.name}` : ent.name;
          if (ent.isDirectory()) {
            addFolder(full, rel);
          } else {
            zip.addFile(rel, fs.readFileSync(full));
          }
        }
      };
      addFolder(centerSrc);
      zip.writeZip(centerZip);

      const installedApp = await this.install(centerZip, { force: true, skipConsent: true });

      // Directly sync and copy latest index.html into installPath
      const srcIndex = path.join(centerSrc, 'index.html');
      const destIndex = path.join(installedApp.installPath, 'index.html');
      if (fs.existsSync(srcIndex)) {
        await fsp.copyFile(srcIndex, destIndex);
      }
      const homeCenterIndex = path.join(os.homedir(), '.elix', 'apps', 'com.elix.center', 'index.html');
      if (fs.existsSync(path.dirname(homeCenterIndex))) {
        await fsp.copyFile(srcIndex, homeCenterIndex).catch(() => {});
      }
      const srcCenterDemoIndex = path.join(pkgRoot, 'src', 'demo-apps', 'com.elix.center', 'index.html');
      if (fs.existsSync(path.dirname(srcCenterDemoIndex))) {
        await fsp.copyFile(srcIndex, srcCenterDemoIndex).catch(() => {});
      }

      results.push(installedApp);
    }

    const fakeSrc = path.join(pkgRoot, 'fixtures', 'com.elix.fakeapp');
    if (fs.existsSync(fakeSrc)) {
      const fakeZip = path.join(stagingDir, 'com.elix.fakeapp.elixapp');
      const zip = new ElixZip();
      const addFolder = (dir: string, base: string = '') => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const ent of entries) {
          const full = path.join(dir, ent.name);
          const rel = base ? `${base}/${ent.name}` : ent.name;
          if (ent.isDirectory()) {
            addFolder(full, rel);
          } else {
            zip.addFile(rel, fs.readFileSync(full));
          }
        }
      };
      addFolder(fakeSrc);
      zip.writeZip(fakeZip);

      const installedApp = await this.install(fakeZip, { force: true, skipConsent: true });

      const srcIndex = path.join(fakeSrc, 'dist', 'index.html');
      const destIndex = path.join(installedApp.installPath, 'dist', 'index.html');
      const rootDestIndex = path.join(installedApp.installPath, 'index.html');
      if (fs.existsSync(srcIndex)) {
        await fsp.mkdir(path.dirname(destIndex), { recursive: true });
        await fsp.copyFile(srcIndex, destIndex);
        await fsp.copyFile(srcIndex, rootDestIndex);
      }

      results.push(installedApp);
    }

    return results;
  }

  /**
   * Prepare uninstall impact plan and preflight report
   */
  public async prepareUninstall(appId: string): Promise<UninstallImpactPlan> {
    const win = this.windowHost.getWindow(appId);
    const plan = await this.installer.prepareUninstall(appId);
    if (win && win.state !== 'closed') {
      plan.isRunning = true;
      plan.activeWindowId = win.id;
    }
    return plan;
  }

  /**
   * Uninstall an application with data safety options (keepData defaults to true)
   */
  public async uninstall(appId: string, options?: UninstallOptions): Promise<boolean> {
    // Close active window if running
    await this.windowHost.close(appId).catch(() => {});

    // Unregister tools from ToolSink and CapabilityIndex
    unregisterAppTools(this.toolSink, appId);

    // Clean up local policy maps
    this.permissionGrants.delete(appId);
    this.disabledCapabilities.delete(appId);

    // Remove from installer
    return this.installer.uninstall(appId, options);
  }

  /**
   * Launch or focus an installed application window
   */
  public async launch(
    appId: string,
    initialRoute?: string,
    windowOverrides?: Partial<ElixAppWindowConfig>
  ): Promise<ElixAppWindow> {
    const app = this.get(appId);
    if (app) {
      registerAppTools(this.toolSink, this.windowHost, app, this.capabilityIndex);
    }
    return this.windowHost.launch(appId, initialRoute, windowOverrides);
  }

  /**
   * Open / launch an application window (alias for launch)
   */
  public async openApp(
    appId: string,
    initialRoute?: string,
    windowOverrides?: Partial<ElixAppWindowConfig>
  ): Promise<ElixAppWindow> {
    return this.launch(appId, initialRoute, windowOverrides);
  }

  /**
   * Close an active application window
   */
  public async close(appId: string): Promise<boolean> {
    return this.windowHost.close(appId);
  }

  // ==========================================================================
  // 3. Policies & Permissions
  // ==========================================================================

  /**
   * Get granted permissions for an application
   */
  public getPermissions(appId: string): string[] {
    const app = this.get(appId);
    if (!app) return [];

    const granted = this.permissionGrants.get(appId);
    if (granted) {
      return Array.from(granted);
    }
    return app.manifest.permissions || [];
  }

  /**
   * Grant or revoke a permission for an application
   */
  public setPermission(appId: string, permission: string, granted: boolean): boolean {
    const app = this.get(appId);
    if (!app) return false;

    let set = this.permissionGrants.get(appId);
    if (!set) {
      set = new Set(app.manifest.permissions || []);
      this.permissionGrants.set(appId, set);
    }

    if (granted) {
      set.add(permission);
    } else {
      set.delete(permission);
    }

    this.emit('policy:permission-changed', { appId, permission, granted });
    return true;
  }

  /**
   * Get capabilities of an application
   */
  public getCapabilities(appId: string): ElixAppCapability[] {
    const app = this.get(appId);
    if (!app) return [];

    const caps = app.manifest.capabilities || {};
    return Array.isArray(caps) ? caps : Object.values(caps);
  }

  /**
   * Enable or disable a specific capability for an app
   */
  public setCapability(appId: string, capabilityName: string, enabled: boolean): boolean {
    const app = this.get(appId);
    if (!app) return false;

    let disabledSet = this.disabledCapabilities.get(appId);
    if (!disabledSet) {
      disabledSet = new Set();
      this.disabledCapabilities.set(appId, disabledSet);
    }

    if (enabled) {
      disabledSet.delete(capabilityName);
      // Re-register
      registerAppTools(this.toolSink, this.windowHost, app, this.capabilityIndex);
    } else {
      disabledSet.add(capabilityName);
      // Re-register remaining
      const filteredManifest: any = {
        ...app.manifest,
        capabilities: Object.fromEntries(
          Object.entries(app.manifest.capabilities || {}).filter(([name]) => !disabledSet!.has(name))
        ),
      };
      registerAppTools(this.toolSink, this.windowHost, { ...app, manifest: filteredManifest }, this.capabilityIndex);
    }

    this.emit('policy:capability-changed', { appId, capabilityName, enabled });
    return true;
  }

  // ==========================================================================
  // 4. Events & Tool Dispatch
  // ==========================================================================

  /**
   * Subscribe to lifecycle and system events
   */
  public subscribe(event: string, listener: (...args: any[]) => void): () => void {
    this.on(event, listener);
    return () => {
      this.off(event, listener);
    };
  }

  /**
   * Send a tool call directly to an application
   */
  public async sendToolCall<T = any, R = any>(
    appId: string,
    capability: string,
    args: T,
    timeoutMs?: number
  ): Promise<R> {
    if (this.windowHost.sendToolCall) {
      return this.windowHost.sendToolCall<T, R>(appId, capability, args, timeoutMs);
    }

    let win = this.windowHost.getWindow(appId);
    if (!win || win.state === 'closed') {
      win = await this.windowHost.launch(appId);
    }

    return win.sendToolCall<T, R>(capability, args, timeoutMs);
  }
}
