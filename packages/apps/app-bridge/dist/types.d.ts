/**
 * ELIX Native App Runtime & Dynamic App Bridge
 * Core Type Definitions & Data Models
 *
 * @module @deepseek-ai/elix-app-bridge/types
 */
/**
 * Window appearance and geometry configuration for ELIX apps.
 */
export interface ElixAppWindowConfig {
    /** Initial window width in pixels. Default: 800 */
    width?: number;
    /** Initial window height in pixels. Default: 600 */
    height?: number;
    /** Minimum window width constraint in pixels. Default: 320 */
    minWidth?: number;
    /** Minimum window height constraint in pixels. Default: 240 */
    minHeight?: number;
    /** Maximum window width constraint in pixels */
    maxWidth?: number;
    /** Maximum window height constraint in pixels */
    maxHeight?: number;
    /** Whether the window can be resized by the user. Default: true */
    resizable?: boolean;
    /** Whether the window stays on top of all other windows. Default: false */
    alwaysOnTop?: boolean;
    /** Whether the window displays standard OS frame/decorations. Default: true */
    frame?: boolean;
    /** Whether the window background is transparent. Default: false */
    transparent?: boolean;
    /** Initial window title override (defaults to app name) */
    title?: string;
    /** Whether to center the window upon launching. Default: true */
    center?: boolean;
    /** Whether to start the app in fullscreen mode. Default: false */
    fullscreen?: boolean;
    /** Background hex color code, e.g., "#1e1e2e" or "transparent" */
    backgroundColor?: string;
}
/**
 * Author metadata specification.
 */
export interface ElixAppAuthorObject {
    /** Author name */
    name: string;
    /** Author email address */
    email?: string;
    /** Author website or portfolio URL */
    url?: string;
}
export type ElixAppAuthor = string | ElixAppAuthorObject;
/**
 * ELIX OS Known System Permissions
 */
export type ElixKnownPermission = 'fs:read' | 'fs:write' | 'fs:all' | 'net:http' | 'net:ws' | 'net:all' | 'os:exec' | 'os:env' | 'os:info' | 'agent:memory' | 'agent:tools' | 'agent:llm' | 'ui:notification' | 'ui:dialog' | 'ui:tray' | 'clipboard:read' | 'clipboard:write' | 'system:power';
/**
 * String permission descriptor (can be known permission or namespaced custom permission)
 */
export type ElixAppPermission = ElixKnownPermission | (string & {});
/**
 * Supported JSON Schema data types for tool capability parameters
 */
export type JSONSchemaPrimitiveType = 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'null';
/**
 * JSON Schema parameter definition conforming to JSON Schema Draft 7 / Schemastery format
 */
export interface JSONSchemaProperty {
    type?: JSONSchemaPrimitiveType | JSONSchemaPrimitiveType[];
    description?: string;
    properties?: Record<string, JSONSchemaProperty>;
    required?: string[];
    items?: JSONSchemaProperty | JSONSchemaProperty[];
    enum?: (string | number | boolean | null)[];
    default?: unknown;
    minimum?: number;
    maximum?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    additionalProperties?: boolean | JSONSchemaProperty;
    title?: string;
}
/**
 * JSON Schema Object specifically for capability input/output definition
 */
export interface JSONSchemaObject extends JSONSchemaProperty {
    type: 'object';
    properties: Record<string, JSONSchemaProperty>;
    required?: string[];
    additionalProperties?: boolean | JSONSchemaProperty;
}
/**
 * Capability definition exposed by an ELIX app for AI Agent Tool Calling and Cordis RPC.
 */
export interface ElixAppCapability {
    /** Unique capability name within the application */
    name: string;
    /** Clear human-readable description for AI agents and developer tooling */
    description: string;
    /** JSON Schema parameters expected when calling this capability */
    parameters: JSONSchemaObject;
    /** Optional JSON Schema defining the return shape */
    returns?: JSONSchemaProperty;
    /** List of permissions required to execute this capability */
    permissions?: ElixAppPermission[];
    /** Execution timeout in milliseconds (default: 30000) */
    timeoutMs?: number;
}
/**
 * ELIX Application Manifest (.ELIXAPP / elix.app.json) Specification
 */
export interface ElixAppManifest {
    /** Unique app identifier (kebab-case or reverse-DNS, e.g., "com.elix.calculator" or "sys-monitor") */
    id: string;
    /** Display name of the application */
    name: string;
    /** Semantic version string (e.g., "1.0.0") */
    version: string;
    /** Brief summary of the application's purpose */
    description: string;
    /** Author or maintainer of the application */
    author: ElixAppAuthor;
    /** Relative path to entry point file (e.g., "index.html" or "dist/index.html") */
    entry: string;
    /** Relative path to application icon (PNG, SVG, or WebP) */
    icon?: string;
    /** Window appearance and configuration settings */
    window?: ElixAppWindowConfig;
    /** List of requested system permissions */
    permissions?: ElixAppPermission[];
    /** Dynamic capabilities exposed as Cordis tools / Agent RPC endpoints */
    capabilities?: Record<string, ElixAppCapability> | ElixAppCapability[];
    /** Application homepage or documentation URL */
    homepage?: string;
    /** Source repository URL */
    repository?: string;
    /** Software license (e.g. "MIT", "Apache-2.0") */
    license?: string;
    /** Categorization tags for the app store/launcher */
    categories?: string[];
    /** Keywords for indexing and search */
    keywords?: string[];
    /** Minimum ELIX OS / Cordis runtime version required (semver range) */
    minElixVersion?: string;
}
/**
 * Lifecycle state of an installed ELIX application
 */
export type AppLifecycleState = 'idle' | 'starting' | 'running' | 'paused' | 'stopping' | 'crashed' | 'error';
/**
 * Runtime execution state details
 */
export interface AppProcessInfo {
    /** OS Process ID or Webview instance identifier */
    pid: number;
    /** IPC Socket / WebSocket port or endpoint */
    ipcEndpoint?: string;
    /** Timestamp when process was started */
    startedAt: number;
    /** Current CPU / Memory metrics if available */
    memoryUsageBytes?: number;
}
/**
 * Registered Cordis Tool metadata for an active application capability
 */
export interface RegisteredAppTool {
    /** Global namespaced tool ID in Cordis (e.g. "app:com.elix.calculator:calculate") */
    id: string;
    /** App ID that registered the tool */
    appId: string;
    /** Capability name */
    name: string;
    /** Tool description for LLM / Cordis */
    description: string;
    /** Parameter schema */
    parameters: JSONSchemaObject;
    /** Whether the tool is currently available */
    enabled: boolean;
}
/**
 * Installed ELIX application record on the host system
 */
export interface InstalledApp {
    /** Complete validated manifest */
    manifest: ElixAppManifest;
    /** Absolute path to the unpacked application directory */
    installPath: string;
    /** Path to the original .elixapp archive (if kept) */
    archivePath?: string;
    /** Timestamp of installation */
    installedAt: number;
    /** Timestamp of last update or verification */
    updatedAt: number;
    /** Last launched timestamp */
    lastLaunchedAt?: number;
    /** Current runtime state */
    state: AppLifecycleState;
    /** Active process information when running */
    process?: AppProcessInfo;
    /** List of tools registered to the Cordis Microkernel */
    registeredTools: RegisteredAppTool[];
    /** Storage partitioning paths */
    storage?: AppStoragePaths;
}
/**
 * Window Management IPC APIs exposed through `window.elix.window`
 */
export interface WindowElixBridgeWindowControls {
    /** Minimize the application window */
    minimize(): Promise<void>;
    /** Maximize the application window */
    maximize(): Promise<void>;
    /** Restore the application window from maximized state */
    unmaximize(): Promise<void>;
    /** Toggle between maximized and normal window states */
    toggleMaximize(): Promise<void>;
    /** Close the application window */
    close(): Promise<void>;
    /** Update the window title */
    setTitle(title: string): Promise<void>;
    /** Set window dimensions */
    setSize(width: number, height: number): Promise<void>;
    /** Get current window position */
    getPosition(): Promise<{
        x: number;
        y: number;
    }>;
    /** Set window position */
    setPosition(x: number, y: number): Promise<void>;
    /** Check if window is currently maximized */
    isMaximized(): Promise<boolean>;
    /** Set always on top behavior */
    setAlwaysOnTop(alwaysOnTop: boolean): Promise<void>;
}
/**
 * Sandboxed Key-Value Storage IPC APIs exposed through `window.elix.storage`
 */
export interface WindowElixBridgeStorage {
    /** Get item by key from app sandbox storage */
    getItem<T = unknown>(key: string): Promise<T | null>;
    /** Set item in app sandbox storage */
    setItem<T = unknown>(key: string, value: T): Promise<void>;
    /** Remove item by key */
    removeItem(key: string): Promise<void>;
    /** Clear all items in app storage */
    clear(): Promise<void>;
    /** List all stored keys */
    keys(): Promise<string[]>;
}
/**
 * Clipboard IPC APIs exposed through `window.elix.clipboard`
 */
export interface WindowElixBridgeClipboard {
    /** Read plain text from clipboard */
    readText(): Promise<string>;
    /** Write plain text to clipboard */
    writeText(text: string): Promise<void>;
}
/**
 * System Information and Notification APIs exposed through `window.elix.system`
 */
export interface WindowElixBridgeSystem {
    /** Get host platform identifier */
    getPlatform(): Promise<string>;
    /** Get current ELIX OS runtime version */
    getElixVersion(): Promise<string>;
    /** Display OS notification */
    notify(title: string, options?: {
        body?: string;
        icon?: string;
    }): Promise<void>;
}
/**
 * WindowElixBridge Interface: The `window.elix` dynamic bridge exposed inside
 * native app webviews / execution contexts for Bidirectional IPC with ELIX OS.
 */
export interface WindowElixBridge {
    /**
     * Register a local capability handler invoked when AI agent dispatches tool calls.
     * Returns an unregister function.
     */
    handle(capabilityName: string, handler: (args: any) => Promise<any> | any): () => void;
    /**
     * Call a host kernel service with service name and action.
     */
    call<T = unknown, R = unknown>(service: string, action: string, payload?: T): Promise<R>;
    call<T = unknown, R = unknown>(serviceOrTool: string, argsOrAction?: T, payload?: unknown): Promise<R>;
    /**
     * Invoke a registered capability on this app or another service via Cordis Microkernel.
     */
    invoke<T = unknown, R = unknown>(capability: string, payload?: T): Promise<R>;
    /**
     * Subscribe to an ELIX OS event or custom IPC event.
     * Returns an unsubscribe function.
     */
    on(event: string, handler: (payload: any) => void): () => void;
    /**
     * Remove an event listener.
     */
    off(event: string, handler: (payload: any) => void): void;
    /**
     * Subscribe to a single event occurrence.
     */
    once(event: string, handler: (payload: any) => void): () => void;
    /**
     * Emit an event to the ELIX App Bridge IPC.
     */
    emit(event: string, payload?: unknown): void;
    /**
     * Get the current application manifest.
     */
    getManifest(): Promise<ElixAppManifest>;
    /**
     * Get the list of currently granted permissions.
     */
    getPermissions(): Promise<ElixAppPermission[]>;
    /**
     * Check if a specific permission is granted.
     */
    hasPermission(permission: ElixAppPermission): Promise<boolean>;
    /**
     * Request additional permissions from the user/runtime at runtime.
     */
    requestPermissions(permissions: ElixAppPermission[]): Promise<Record<string, boolean>>;
    /** Window control subsystem */
    window: WindowElixBridgeWindowControls;
    /** Sandboxed key-value storage subsystem */
    storage: WindowElixBridgeStorage;
    /** Clipboard subsystem */
    clipboard: WindowElixBridgeClipboard;
    /** System information and notifications subsystem */
    system: WindowElixBridgeSystem;
}
/**
 * Extend global Window interface with `window.elix`
 */
declare global {
    interface Window {
        elix?: WindowElixBridge;
    }
}
/**
 * Validation Issue Severity
 */
export type ValidationSeverity = 'error' | 'warning';
/**
 * Validation Issue Description
 */
export interface ValidationIssue {
    /** Path in the manifest object, e.g. "window.width" or "capabilities[0].name" */
    path: string;
    /** Human-readable explanation of why validation failed */
    message: string;
    /** Severity level */
    severity: ValidationSeverity;
    /** Machine-readable error code */
    code: string;
}
/**
 * Manifest Validation Result
 */
export interface ManifestValidationResult<T = ElixAppManifest> {
    /** True if validation succeeded with no errors */
    valid: boolean;
    /** Validated and normalized manifest if valid */
    manifest?: T;
    /** List of validation errors */
    errors: ValidationIssue[];
    /** List of validation warnings (non-fatal) */
    warnings: ValidationIssue[];
}
/**
 * Human-readable Permission item for Consent UI
 */
export interface AppPermissionSummary {
    /** Permission identifier (e.g. "fs:read") */
    permission: ElixAppPermission;
    /** Friendly display label (e.g. "Read Filesystem") */
    label: string;
    /** Human-readable explanation of risk/access */
    description: string;
    /** Whether the permission represents elevated privilege */
    sensitive: boolean;
}
/**
 * Exported AI Capability summary for Consent UI
 */
export interface AppCapabilitySummary {
    /** Capability name */
    name: string;
    /** Tool description */
    description: string;
    /** Number of parameters required/accepted */
    parameterCount: number;
    /** Parameter property names */
    parameterNames: string[];
    /** Required permissions if any */
    permissions: ElixAppPermission[];
}
/**
 * Interactive Installation & Permissions Consent UI Payload
 */
export interface AppConsentPayload {
    /** App unique identifier */
    appId: string;
    /** App display name */
    name: string;
    /** App version */
    version: string;
    /** App description */
    description: string;
    /** Author details */
    author: ElixAppAuthor;
    /** Relative or extracted icon path if available */
    iconPath?: string;
    /** Window configuration overview */
    window?: ElixAppWindowConfig;
    /** Summary of requested permissions */
    permissions: AppPermissionSummary[];
    /** Summary of exported AI capabilities */
    capabilities: AppCapabilitySummary[];
    /** Source package / archive path */
    packagePath: string;
    /** Package file size in bytes */
    packageSizeBytes?: number;
}
/**
 * Storage partition layout paths for an application
 */
export interface AppStoragePaths {
    /** Immutable package binaries (~/.elix/apps/<app-id>/) */
    binPath: string;
    /** Persistent user data (~/.elix/app-data/<app-id>/) */
    dataPath: string;
    /** Disposable cache (~/.elix/app-cache/<app-id>/) */
    cachePath: string;
}
/**
 * Storage usage metrics in bytes
 */
export interface AppStorageUsage {
    binSizeBytes: number;
    dataSizeBytes: number;
    cacheSizeBytes: number;
    totalSizeBytes: number;
}
/**
 * Options for application uninstallation
 */
export interface UninstallOptions {
    /**
     * Whether to preserve user data in app-data/<app-id>/ (Default: true)
     */
    keepData?: boolean;
    /**
     * Whether to purge disposable cache in app-cache/<app-id>/ (Default: true)
     */
    purgeCache?: boolean;
}
/**
 * Detailed uninstallation impact plan
 */
export interface UninstallImpactPlan {
    appId: string;
    name: string;
    version: string;
    isRunning: boolean;
    activeWindowId?: string;
    registeredToolsCount: number;
    permissionsCount: number;
    storage: AppStorageUsage;
    paths: AppStoragePaths;
    dataRetentionAvailable: boolean;
}
/**
 * Options for application installation
 */
export interface InstallOptions {
    /** Overwrite existing installation if app ID already exists */
    force?: boolean;
    /** Custom installation directory (defaults to ~/.elix/apps) */
    appsDir?: string;
    /** Whether to keep the source archive */
    keepArchive?: boolean;
    /** Skip user interactive consent prompt */
    skipConsent?: boolean;
}
/**
 * Result of installation process
 */
export interface InstallResult {
    success: boolean;
    app?: InstalledApp;
    isUpgrade?: boolean;
    error?: string;
    warnings?: ValidationIssue[];
}
/**
 * Background File Listener Options
 */
export interface FileListenerOptions {
    /** Directory to watch for dropped .elixapp files (defaults to ~/.elix/staging) */
    watchDir?: string;
    /** Custom handler for consent evaluation; if returns true, installation proceeds */
    onConsentRequest?: (consent: AppConsentPayload) => Promise<boolean>;
    /** Auto-delete dropped package after processing */
    cleanupOnInstall?: boolean;
}
/**
 * App Installer Lifecycle Event Signatures
 */
export interface ElixInstallerEventMap {
    'app:file-trigger': (payload: {
        packagePath: string;
        consentPayload: AppConsentPayload;
    }) => void;
    'app:installing': (payload: {
        packagePath: string;
        appId: string;
    }) => void;
    'app:installed': (payload: {
        app: InstalledApp;
        isUpgrade: boolean;
    }) => void;
    'app:uninstalling': (payload: {
        appId: string;
    }) => void;
    'app:uninstalled': (payload: {
        appId: string;
    }) => void;
    'error': (payload: {
        code: string;
        message: string;
        error?: Error;
    }) => void;
}
/**
 * Window Geometry & Position
 */
export interface WindowGeometry {
    x: number;
    y: number;
    width: number;
    height: number;
}
/**
 * Window Runtime State
 */
export type WindowState = 'launching' | 'open' | 'focused' | 'minimized' | 'maximized' | 'hidden' | 'closed';
/**
 * Window Manager Event Signatures
 */
export interface WindowManagerEvents {
    'window:launched': (window: any) => void;
    'window:focused': (window: any) => void;
    'window:minimized': (window: any) => void;
    'window:maximized': (window: any) => void;
    'window:restored': (window: any) => void;
    'window:closed': (windowId: string, appId: string) => void;
    'window:state-change': (window: any, state: WindowState) => void;
    'tool:dispatch': (payload: {
        windowId: string;
        appId: string;
        capability: string;
        args: any;
    }) => void;
    'tool:result': (payload: {
        windowId: string;
        appId: string;
        capability: string;
        result: any;
    }) => void;
    'tool:error': (payload: {
        windowId: string;
        appId: string;
        capability: string;
        error: any;
    }) => void;
    'error': (payload: {
        code: string;
        message: string;
        error?: Error;
    }) => void;
}
/**
 * Bidirectional IPC Message Types
 */
export type IpcMessageType = 'TOOL_INVOKE' | 'TOOL_RESULT' | 'TOOL_ERROR' | 'SERVICE_CALL' | 'SERVICE_RESPONSE' | 'EVENT_EMIT' | 'WINDOW_ACTION' | 'STORAGE_ACTION' | 'STORAGE_RESPONSE' | 'HANDSHAKE' | 'HANDSHAKE_ACK' | 'PING' | 'PONG';
/**
 * Generic IPC Packet Envelope
 */
export interface IpcPacket<T = unknown> {
    type: IpcMessageType;
    id?: string;
    appId?: string;
    windowId?: string;
    payload?: T;
    error?: {
        message: string;
        code?: string;
        stack?: string;
    };
}
//# sourceMappingURL=types.d.ts.map