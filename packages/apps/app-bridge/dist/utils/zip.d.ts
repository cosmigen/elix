/**
 * Built-in Resilient Zip Archive Utility for ELIX OS
 * Zero external dependencies: pure Node.js (node:zlib, node:fs, node:path)
 *
 * Supports both creating and extracting standard .zip / .elixapp archives with Deflate compression.
 *
 * @module @deepseek-ai/elix-app-bridge/utils/zip
 */
export interface ZipEntryInfo {
    entryName: string;
    name: string;
    isDirectory: boolean;
    compressedSize: number;
    uncompressedSize: number;
    compressionMethod: number;
    crc32: number;
    data: Buffer;
}
export declare function crc32(buf: Buffer): number;
/**
 * ELIX Native Zip Archive Manager
 */
export declare class ElixZip {
    private entries;
    constructor(filePathOrBuffer?: string | Buffer);
    /**
     * Add a file buffer to the archive
     */
    addFile(entryName: string, data: Buffer): void;
    /**
     * Add a local file from disk into the archive
     */
    addLocalFile(localPath: string, zipPath?: string): void;
    /**
     * Get all entries in the archive
     */
    getEntries(): ZipEntryInfo[];
    /**
     * Get entry by name
     */
    getEntry(name: string): ZipEntryInfo | null;
    /**
     * Read entry content as string
     */
    readAsText(nameOrEntry: string | ZipEntryInfo, encoding?: BufferEncoding): string;
    /**
     * Extract all entries into target directory with directory-traversal protection
     */
    extractAllTo(targetDir: string, _overwrite?: boolean): void;
    /**
     * Async extract all entries
     */
    extractAllToAsync(targetDir: string): Promise<void>;
    /**
     * Write zip archive to disk
     */
    writeZip(targetPath: string): void;
    /**
     * Generate binary ZIP Buffer
     */
    toBuffer(): Buffer;
    /**
     * Internal ZIP buffer parser
     */
    private readZipBuffer;
}
/**
 * Convenience helper to package a directory folder into a .elixapp archive
 */
export declare function packageFolderToZip(folderPath: string, outputZipPath: string): void;
//# sourceMappingURL=zip.d.ts.map