/**
 * ELIX Native App Runtime & Dynamic App Bridge
 * Storage Partitioning and Data Safety Manager (ELIXAPP Spec v1.2.0)
 *
 * Partitions storage into:
 * - `apps/<app-id>/` (Immutable package binaries)
 * - `app-data/<app-id>/` (Persistent user data — preserved across updates/repairs)
 * - `app-cache/<app-id>/` (Disposable cache)
 * - `app-staging/<tx-id>/` (Transaction staging during install/update)
 * - `app-registry/` (Authoritative AppRecord JSON state)
 * - `app-journal/` (Crash recovery logs)
 *
 * @module @deepseek-ai/elix-app-bridge/data/storage-partition
 */
import type { AppStoragePaths, AppStorageUsage } from '../types.js';
export interface JournalEntry {
    txId: string;
    action: string;
    appId?: string;
    timestamp: number;
    details?: any;
    status: 'started' | 'completed' | 'failed' | 'rolled_back';
}
/**
 * Storage Partitioning Engine for ELIX OS
 */
export declare class StoragePartitionManager {
    readonly rootDir: string;
    readonly appsDir: string;
    readonly appDataDir: string;
    readonly appCacheDir: string;
    readonly appStagingDir: string;
    readonly appRegistryDir: string;
    readonly appJournalDir: string;
    constructor(rootDir?: string);
    /**
     * Initializes and ensures all partitioned directories exist
     */
    ensurePartitions(): Promise<void>;
    /**
     * Synchronously ensures partitions exist (for constructor / bootstrap)
     */
    ensurePartitionsSync(): void;
    /**
     * Returns partitioned storage paths for a specific application
     */
    getAppStoragePaths(appId: string): AppStoragePaths;
    /**
     * Creates a dedicated transaction staging directory
     */
    createStagingTx(txId?: string): Promise<{
        txId: string;
        stagingPath: string;
    }>;
    /**
     * Cleans up a transaction staging directory
     */
    cleanStagingTx(txId: string): Promise<void>;
    /**
     * Writes a transaction journal entry for crash recovery
     */
    writeJournal(entry: JournalEntry): Promise<void>;
    /**
     * Clears a completed transaction journal entry
     */
    cleanJournal(txId: string): Promise<void>;
    /**
     * Recursively calculates disk usage for a directory in bytes
     */
    calculateDirectorySize(dirPath: string): Promise<number>;
    /**
     * Calculates total storage usage across binaries, user data, and cache
     */
    getAppStorageUsage(appId: string): Promise<AppStorageUsage>;
    /**
     * Purges application immutable binaries (apps/<app-id>/)
     */
    purgeAppBinaries(appId: string): Promise<void>;
    /**
     * Purges disposable application cache (app-cache/<app-id>/)
     */
    purgeAppCache(appId: string): Promise<void>;
    /**
     * Purges persistent user data (app-data/<app-id>/) - Explicit only!
     */
    purgeAppData(appId: string): Promise<void>;
    /**
     * Registry file location
     */
    getRegistryFilePath(): string;
}
//# sourceMappingURL=storage-partition.d.ts.map