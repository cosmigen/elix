/**
 * ELIX OS — Bare-Metal System & Filesystem Primitives
 *
 * Provides hardened, host-level OS access primitives for ELIX OS:
 * 1. `sys_fs_list`: Real filesystem and drive root enumeration with rich metadata and MIME type hints.
 * 2. `sys_fs_read_write`: Canonical file I/O with protected Windows system root security guards.
 * 3. `sys_hardware_scan`: Hardware and peripheral diagnostics via systeminformation.
 *
 * @module @deepseek-ai/elix-app-bridge/sys-primitives
 */
export interface FileEntryInfo {
    name: string;
    path: string;
    isDirectory: boolean;
    isFile: boolean;
    isSymbolicLink: boolean;
    size: number;
    extension: string;
    mimeType: string;
    permissions: string;
    modifiedMs: number;
    modifiedTime: string;
    createdMs: number;
    createdTime: string;
}
export interface DriveInfo {
    drive: string;
    label: string;
    isReady: boolean;
    type: 'fixed' | 'removable' | 'virtual';
}
export interface FsListResult {
    currentPath: string;
    parentPath: string | null;
    drives?: DriveInfo[];
    standardFolders?: {
        name: string;
        path: string;
        icon: string;
    }[];
    entries: FileEntryInfo[];
    totalCount: number;
}
export interface FsReadWriteParams {
    action: 'read' | 'write' | 'delete' | 'mkdir' | 'move' | 'exists' | 'stat' | 'copy';
    targetPath: string;
    content?: string;
    encoding?: BufferEncoding;
    destinationPath?: string;
}
export interface FsReadWriteResult {
    success: boolean;
    action: string;
    targetPath: string;
    content?: string;
    size?: number;
    exists?: boolean;
    error?: string;
    stat?: any;
}
export interface HardwareScanResult {
    network: {
        interfaces: Array<{
            iface: string;
            ip4: string;
            ip6: string;
            mac: string;
            internal: boolean;
            virtual: boolean;
            operstate: string;
            type: string;
            speed?: number;
        }>;
        defaultInterface?: string;
    };
    displays: Array<{
        vendor: string;
        model: string;
        resolutionX: number;
        resolutionY: number;
        pixelDepth?: number;
        refreshRate?: number;
        main: boolean;
        connection?: string;
    }>;
    audioDevices: Array<{
        name: string;
        type: string;
        isDefault: boolean;
        status: string;
    }>;
    cameras: Array<{
        name: string;
        id: string;
        resolution?: string;
        status: string;
    }>;
    system: {
        platform: string;
        distro: string;
        release: string;
        arch: string;
        hostname: string;
        cpuModel: string;
        cpuCores: number;
        totalMemBytes: number;
        freeMemBytes: number;
        uptimeSeconds: number;
    };
}
/**
 * Validates whether a path points to a protected system zone.
 */
export declare function isProtectedPath(rawPath: string): boolean;
/**
 * Determines MIME type from file extension
 */
export declare function getMimeType(filename: string): string;
/**
 * Enumerate available physical Windows drives (C:\, D:\, etc.)
 */
export declare function getAvailableDrives(): DriveInfo[];
/**
 * Standard user environment folders
 */
export declare function getStandardUserFolders(): Array<{
    name: string;
    path: string;
    icon: string;
}>;
/**
 * Enumerate physical directory and drive roots
 */
export declare function sysFsList(dirPath?: string, includeHidden?: boolean): Promise<FsListResult>;
/**
 * Hardened filesystem read/write/delete/mkdir/stat primitive with protected root guard
 */
export declare function sysFsReadWrite(params: FsReadWriteParams): Promise<FsReadWriteResult>;
/**
 * Scans hardware, network adapters, displays, and audio/video devices
 */
export declare function sysHardwareScan(): Promise<HardwareScanResult>;
//# sourceMappingURL=sys-primitives.d.ts.map