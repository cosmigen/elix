/**
 * Built-in Resilient Zip Archive Utility for ELIX OS
 * Zero external dependencies: pure Node.js (node:zlib, node:fs, node:path)
 * 
 * Supports both creating and extracting standard .zip / .elixapp archives with Deflate compression.
 * 
 * @module @deepseek-ai/elix-app-bridge/utils/zip
 */

import * as zlib from 'node:zlib';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';

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

/**
 * CRC32 table calculation
 */
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[i] = c >>> 0;
}

export function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    const byte = buf[i] ?? 0;
    crc = (crc >>> 8) ^ (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * ELIX Native Zip Archive Manager
 */
export class ElixZip {
  private entries: Map<string, ZipEntryInfo> = new Map();

  constructor(filePathOrBuffer?: string | Buffer) {
    if (filePathOrBuffer) {
      if (typeof filePathOrBuffer === 'string') {
        if (fs.existsSync(filePathOrBuffer)) {
          const buffer = fs.readFileSync(filePathOrBuffer);
          this.readZipBuffer(buffer);
        }
      } else if (Buffer.isBuffer(filePathOrBuffer)) {
        this.readZipBuffer(filePathOrBuffer);
      }
    }
  }

  /**
   * Add a file buffer to the archive
   */
  public addFile(entryName: string, data: Buffer): void {
    const normalized = entryName.replace(/\\/g, '/').replace(/^\//, '');
    const isDir = normalized.endsWith('/');
    const compressed = isDir || data.length === 0 ? Buffer.alloc(0) : zlib.deflateRawSync(data);
    const checksum = isDir ? 0 : crc32(data);

    this.entries.set(normalized, {
      entryName: normalized,
      name: path.posix.basename(normalized),
      isDirectory: isDir,
      compressedSize: compressed.length,
      uncompressedSize: data.length,
      compressionMethod: isDir || data.length === 0 ? 0 : 8,
      crc32: checksum,
      data,
    });
  }

  /**
   * Add a local file from disk into the archive
   */
  public addLocalFile(localPath: string, zipPath?: string): void {
    const data = fs.readFileSync(localPath);
    const targetName = zipPath ? path.posix.join(zipPath, path.basename(localPath)) : path.basename(localPath);
    this.addFile(targetName, data);
  }

  /**
   * Get all entries in the archive
   */
  public getEntries(): ZipEntryInfo[] {
    return Array.from(this.entries.values());
  }

  /**
   * Get entry by name
   */
  public getEntry(name: string): ZipEntryInfo | null {
    const normalized = name.replace(/\\/g, '/').replace(/^\//, '');
    return this.entries.get(normalized) || null;
  }

  /**
   * Read entry content as string
   */
  public readAsText(nameOrEntry: string | ZipEntryInfo, encoding: BufferEncoding = 'utf-8'): string {
    if (typeof nameOrEntry === 'string') {
      const entry = this.getEntry(nameOrEntry);
      if (!entry) {
        throw new Error(`Zip entry '${nameOrEntry}' not found in archive`);
      }
      return entry.data.toString(encoding);
    }
    return nameOrEntry.data.toString(encoding);
  }

  /**
   * Extract all entries into target directory with directory-traversal protection
   */
  public extractAllTo(targetDir: string, _overwrite: boolean = true): void {
    const resolvedTarget = path.resolve(targetDir);
    if (!fs.existsSync(resolvedTarget)) {
      fs.mkdirSync(resolvedTarget, { recursive: true });
    }

    for (const entry of this.entries.values()) {
      const entryRelative = entry.entryName.replace(/\//g, path.sep);
      const destination = path.resolve(resolvedTarget, entryRelative);

      // Zip-slip security check
      if (!destination.startsWith(resolvedTarget)) {
        throw new Error(`Zip-slip security violation: '${entry.entryName}' escapes destination`);
      }

      if (entry.isDirectory) {
        if (!fs.existsSync(destination)) {
          fs.mkdirSync(destination, { recursive: true });
        }
      } else {
        const parentDir = path.dirname(destination);
        if (!fs.existsSync(parentDir)) {
          fs.mkdirSync(parentDir, { recursive: true });
        }
        fs.writeFileSync(destination, entry.data);
      }
    }
  }

  /**
   * Async extract all entries
   */
  public async extractAllToAsync(targetDir: string): Promise<void> {
    const resolvedTarget = path.resolve(targetDir);
    await fsp.mkdir(resolvedTarget, { recursive: true });

    for (const entry of this.entries.values()) {
      const entryRelative = entry.entryName.replace(/\//g, path.sep);
      const destination = path.resolve(resolvedTarget, entryRelative);

      if (!destination.startsWith(resolvedTarget)) {
        throw new Error(`Zip-slip security violation: '${entry.entryName}' escapes destination`);
      }

      if (entry.isDirectory) {
        await fsp.mkdir(destination, { recursive: true });
      } else {
        await fsp.mkdir(path.dirname(destination), { recursive: true });
        await fsp.writeFile(destination, entry.data);
      }
    }
  }

  /**
   * Write zip archive to disk
   */
  public writeZip(targetPath: string): void {
    const buffer = this.toBuffer();
    const resolved = path.resolve(targetPath);
    const dir = path.dirname(resolved);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(resolved, buffer);
  }

  /**
   * Generate binary ZIP Buffer
   */
  public toBuffer(): Buffer {
    const localHeaders: Buffer[] = [];
    const centralHeaders: Buffer[] = [];
    let offset = 0;

    for (const entry of this.entries.values()) {
      const nameBuf = Buffer.from(entry.entryName, 'utf-8');
      const isCompressed = entry.compressionMethod === 8;
      const fileData = isCompressed && entry.data.length > 0 ? zlib.deflateRawSync(entry.data) : entry.data;

      // Local file header (30 bytes + filename)
      const localHdr = Buffer.alloc(30 + nameBuf.length);
      localHdr.writeUInt32LE(0x04034b50, 0); // signature
      localHdr.writeUInt16LE(20, 4); // min version (2.0)
      localHdr.writeUInt16LE(0x0800, 6); // general purpose bit flag (UTF-8)
      localHdr.writeUInt16LE(entry.compressionMethod, 8); // compression method
      localHdr.writeUInt16LE(0, 10); // time
      localHdr.writeUInt16LE(0, 12); // date
      localHdr.writeUInt32LE(entry.crc32, 14); // crc32
      localHdr.writeUInt32LE(fileData.length, 18); // compressed size
      localHdr.writeUInt32LE(entry.uncompressedSize, 22); // uncompressed size
      localHdr.writeUInt16LE(nameBuf.length, 26); // filename length
      localHdr.writeUInt16LE(0, 28); // extra field length
      nameBuf.copy(localHdr, 30);

      localHeaders.push(localHdr, fileData);

      // Central directory header (46 bytes + filename)
      const centralHdr = Buffer.alloc(46 + nameBuf.length);
      centralHdr.writeUInt32LE(0x02014b50, 0); // signature
      centralHdr.writeUInt16LE(20, 4); // version made by
      centralHdr.writeUInt16LE(20, 6); // min version
      centralHdr.writeUInt16LE(0x0800, 8); // general purpose bit flag
      centralHdr.writeUInt16LE(entry.compressionMethod, 10);
      centralHdr.writeUInt16LE(0, 12);
      centralHdr.writeUInt16LE(0, 14);
      centralHdr.writeUInt32LE(entry.crc32, 16);
      centralHdr.writeUInt32LE(fileData.length, 20);
      centralHdr.writeUInt32LE(entry.uncompressedSize, 24);
      centralHdr.writeUInt16LE(nameBuf.length, 28);
      centralHdr.writeUInt16LE(0, 30); // extra field length
      centralHdr.writeUInt16LE(0, 32); // comment length
      centralHdr.writeUInt16LE(0, 34); // disk number start
      centralHdr.writeUInt16LE(0, 36); // internal attrs
      centralHdr.writeUInt32LE(entry.isDirectory ? 0x10 : 0x20, 38); // external attrs
      centralHdr.writeUInt32LE(offset, 42); // relative offset of local header
      nameBuf.copy(centralHdr, 46);

      centralHeaders.push(centralHdr);
      offset += localHdr.length + fileData.length;
    }

    const centralDirOffset = offset;
    const centralDirBuffer = Buffer.concat(centralHeaders);
    const centralDirLength = centralDirBuffer.length;

    // End of central directory record (22 bytes)
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0); // signature
    eocd.writeUInt16LE(0, 4); // disk number
    eocd.writeUInt16LE(0, 6); // disk with central dir
    eocd.writeUInt16LE(this.entries.size, 8); // total entries on disk
    eocd.writeUInt16LE(this.entries.size, 10); // total entries
    eocd.writeUInt32LE(centralDirLength, 12); // central dir size
    eocd.writeUInt32LE(centralDirOffset, 16); // offset of central dir
    eocd.writeUInt16LE(0, 20); // comment length

    return Buffer.concat([...localHeaders, centralDirBuffer, eocd]);
  }

  /**
   * Internal ZIP buffer parser
   */
  private readZipBuffer(buffer: Buffer): void {
    // Find End of Central Directory Record (EOCD)
    let eocdOffset = -1;
    for (let i = buffer.length - 22; i >= 0; i--) {
      if (buffer.readUInt32LE(i) === 0x06054b50) {
        eocdOffset = i;
        break;
      }
    }

    if (eocdOffset === -1) {
      throw new Error('Invalid ZIP archive: End of Central Directory record not found');
    }

    const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
    const centralDirOffset = buffer.readUInt32LE(eocdOffset + 16);

    let cdPos = centralDirOffset;
    for (let i = 0; i < totalEntries; i++) {
      if (cdPos + 46 > buffer.length) break;
      const sig = buffer.readUInt32LE(cdPos);
      if (sig !== 0x02014b50) break;

      const compressionMethod = buffer.readUInt16LE(cdPos + 10);
      const crc = buffer.readUInt32LE(cdPos + 16);
      const compressedSize = buffer.readUInt32LE(cdPos + 20);
      const uncompressedSize = buffer.readUInt32LE(cdPos + 24);
      const fileNameLen = buffer.readUInt16LE(cdPos + 28);
      const extraFieldLen = buffer.readUInt16LE(cdPos + 30);
      const commentLen = buffer.readUInt16LE(cdPos + 32);
      const localHeaderOffset = buffer.readUInt32LE(cdPos + 42);

      const entryName = buffer.toString('utf-8', cdPos + 46, cdPos + 46 + fileNameLen);
      const isDirectory = entryName.endsWith('/');

      // Read from local header
      const localFileNameLen = buffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLen = buffer.readUInt16LE(localHeaderOffset + 28);
      const dataOffset = localHeaderOffset + 30 + localFileNameLen + localExtraLen;
      const rawData = buffer.subarray(dataOffset, dataOffset + compressedSize);

      let uncompressedData: Buffer;
      if (isDirectory || uncompressedSize === 0) {
        uncompressedData = Buffer.alloc(0);
      } else if (compressionMethod === 8) {
        uncompressedData = zlib.inflateRawSync(rawData);
      } else {
        uncompressedData = Buffer.from(rawData);
      }

      const normalized = entryName.replace(/\\/g, '/').replace(/^\//, '');
      this.entries.set(normalized, {
        entryName: normalized,
        name: path.posix.basename(normalized),
        isDirectory,
        compressedSize,
        uncompressedSize,
        compressionMethod,
        crc32: crc,
        data: uncompressedData,
      });

      cdPos += 46 + fileNameLen + extraFieldLen + commentLen;
    }
  }
}

/**
 * Convenience helper to package a directory folder into a .elixapp archive
 */
export function packageFolderToZip(folderPath: string, outputZipPath: string): void {
  const zip = new ElixZip();
  const addFolder = (dir: string, base: string = '') => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      const rel = base ? `${base}/${ent.name}` : ent.name;
      if (ent.isDirectory()) {
        addFolder(full, rel);
      } else {
        zip.addLocalFile(full, base);
      }
    }
  };
  addFolder(folderPath);
  zip.writeZip(outputZipPath);
}

