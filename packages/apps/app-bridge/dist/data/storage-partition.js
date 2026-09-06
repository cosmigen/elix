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
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
function randomTxId(prefix = 'tx') {
    return `${prefix}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
}
/**
 * Storage Partitioning Engine for ELIX OS
 */
export class StoragePartitionManager {
    rootDir;
    appsDir;
    appDataDir;
    appCacheDir;
    appStagingDir;
    appRegistryDir;
    appJournalDir;
    constructor(rootDir) {
        this.rootDir = rootDir || path.join(os.homedir(), '.elix');
        this.appsDir = path.join(this.rootDir, 'apps');
        this.appDataDir = path.join(this.rootDir, 'app-data');
        this.appCacheDir = path.join(this.rootDir, 'app-cache');
        this.appStagingDir = path.join(this.rootDir, 'app-staging');
        this.appRegistryDir = path.join(this.rootDir, 'app-registry');
        this.appJournalDir = path.join(this.rootDir, 'app-journal');
    }
    /**
     * Initializes and ensures all partitioned directories exist
     */
    async ensurePartitions() {
        const dirs = [
            this.rootDir,
            this.appsDir,
            this.appDataDir,
            this.appCacheDir,
            this.appStagingDir,
            this.appRegistryDir,
            this.appJournalDir,
        ];
        for (const dir of dirs) {
            await fsp.mkdir(dir, { recursive: true });
        }
    }
    /**
     * Synchronously ensures partitions exist (for constructor / bootstrap)
     */
    ensurePartitionsSync() {
        const dirs = [
            this.rootDir,
            this.appsDir,
            this.appDataDir,
            this.appCacheDir,
            this.appStagingDir,
            this.appRegistryDir,
            this.appJournalDir,
        ];
        for (const dir of dirs) {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        }
    }
    /**
     * Returns partitioned storage paths for a specific application
     */
    getAppStoragePaths(appId) {
        return {
            binPath: path.join(this.appsDir, appId),
            dataPath: path.join(this.appDataDir, appId),
            cachePath: path.join(this.appCacheDir, appId),
        };
    }
    /**
     * Creates a dedicated transaction staging directory
     */
    async createStagingTx(txId) {
        const id = txId || randomTxId('tx_install');
        const stagingPath = path.join(this.appStagingDir, id);
        await fsp.mkdir(stagingPath, { recursive: true });
        return { txId: id, stagingPath };
    }
    /**
     * Cleans up a transaction staging directory
     */
    async cleanStagingTx(txId) {
        const stagingPath = path.join(this.appStagingDir, txId);
        await fsp.rm(stagingPath, { recursive: true, force: true }).catch(() => { });
    }
    /**
     * Writes a transaction journal entry for crash recovery
     */
    async writeJournal(entry) {
        try {
            await fsp.mkdir(this.appJournalDir, { recursive: true });
            const journalFile = path.join(this.appJournalDir, `${entry.txId}.json`);
            await fsp.writeFile(journalFile, JSON.stringify(entry, null, 2), 'utf-8');
        }
        catch {
            // Ignore journal write error
        }
    }
    /**
     * Clears a completed transaction journal entry
     */
    async cleanJournal(txId) {
        const journalFile = path.join(this.appJournalDir, `${txId}.json`);
        await fsp.rm(journalFile, { force: true }).catch(() => { });
    }
    /**
     * Recursively calculates disk usage for a directory in bytes
     */
    async calculateDirectorySize(dirPath) {
        if (!fs.existsSync(dirPath)) {
            return 0;
        }
        let total = 0;
        try {
            const entries = await fsp.readdir(dirPath, { withFileTypes: true });
            for (const entry of entries) {
                const full = path.join(dirPath, entry.name);
                if (entry.isDirectory()) {
                    total += await this.calculateDirectorySize(full);
                }
                else if (entry.isFile()) {
                    const stat = await fsp.stat(full).catch(() => null);
                    if (stat)
                        total += stat.size;
                }
            }
        }
        catch {
            // Ignore read errors
        }
        return total;
    }
    /**
     * Calculates total storage usage across binaries, user data, and cache
     */
    async getAppStorageUsage(appId) {
        const paths = this.getAppStoragePaths(appId);
        const [binSize, dataSize, cacheSize] = await Promise.all([
            this.calculateDirectorySize(paths.binPath),
            this.calculateDirectorySize(paths.dataPath),
            this.calculateDirectorySize(paths.cachePath),
        ]);
        return {
            binSizeBytes: binSize,
            dataSizeBytes: dataSize,
            cacheSizeBytes: cacheSize,
            totalSizeBytes: binSize + dataSize + cacheSize,
        };
    }
    /**
     * Purges application immutable binaries (apps/<app-id>/)
     */
    async purgeAppBinaries(appId) {
        const binPath = path.join(this.appsDir, appId);
        await fsp.rm(binPath, { recursive: true, force: true }).catch(() => { });
    }
    /**
     * Purges disposable application cache (app-cache/<app-id>/)
     */
    async purgeAppCache(appId) {
        const cachePath = path.join(this.appCacheDir, appId);
        await fsp.rm(cachePath, { recursive: true, force: true }).catch(() => { });
    }
    /**
     * Purges persistent user data (app-data/<app-id>/) - Explicit only!
     */
    async purgeAppData(appId) {
        const dataPath = path.join(this.appDataDir, appId);
        await fsp.rm(dataPath, { recursive: true, force: true }).catch(() => { });
    }
    /**
     * Registry file location
     */
    getRegistryFilePath() {
        return path.join(this.appRegistryDir, 'registry.json');
    }
}
//# sourceMappingURL=storage-partition.js.map