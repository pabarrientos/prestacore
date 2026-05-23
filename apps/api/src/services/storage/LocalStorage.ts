import { createReadStream, createWriteStream } from 'fs';
import { stat, unlink, readdir, access, mkdir } from 'fs/promises';
import { pipeline } from 'stream/promises';
import path from 'path';
import { IStorageAdapter } from './IStorageAdapter';

const DEFAULT_BACKUPS_DIR = '/app/backups';

export class LocalStorage implements IStorageAdapter {
  private readonly backupsDir: string;

  constructor(backupsDir?: string) {
    this.backupsDir = backupsDir || process.env.BACKUPS_DIR || DEFAULT_BACKUPS_DIR;
  }

  async save(stream: import('stream').Readable, filename: string): Promise<{ filepath: string; sizeBytes: number }> {
    const filepath = this.getPath(filename);

    // Ensure directory exists
    await this.ensureDirectoryExists();

    // Write stream to file
    const writeStream = createWriteStream(filepath);
    await pipeline(stream, writeStream);

    // Get file stats for size
    const stats = await stat(filepath);
    return { filepath, sizeBytes: stats.size };
  }

  async getReadStream(filepath: string): Promise<import('stream').Readable> {
    // Check if file exists first
    await this.ensureFileExists(filepath);
    return createReadStream(filepath);
  }

  async delete(filepath: string): Promise<void> {
    await unlink(filepath);
  }

  async list(): Promise<string[]> {
    try {
      const files = await readdir(this.backupsDir);
      return files;
    } catch {
      // Directory doesn't exist yet, return empty list
      return [];
    }
  }

  getPath(filename: string): string {
    return path.join(this.backupsDir, filename);
  }

  async getStats(filepath: string): Promise<{ sizeBytes: number }> {
    const stats = await stat(filepath);
    return { sizeBytes: stats.size };
  }

  private async ensureDirectoryExists(): Promise<void> {
    try {
      await access(this.backupsDir);
    } catch {
      // Directory doesn't exist, create it
      await mkdir(this.backupsDir, { recursive: true });
    }
  }

  private async ensureFileExists(filepath: string): Promise<void> {
    try {
      await access(filepath);
    } catch {
      throw new Error(`File not found: ${filepath}`);
    }
  }
}