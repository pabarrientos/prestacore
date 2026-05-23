import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LocalStorage } from './LocalStorage';
import fs from 'fs/promises';
import path from 'path';

// Helper to create mock functions
const createMockFn = () => vi.fn();

describe('LocalStorage', () => {
  const TEST_DIR = '/tmp/test-localstorage';

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.BACKUPS_DIR = TEST_DIR;
    // Ensure test directory exists
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test files
    try {
      const files = await fs.readdir(TEST_DIR);
      for (const file of files) {
        await fs.unlink(path.join(TEST_DIR, file));
      }
    } catch { /* ignore */ }
  });

  describe('getPath', () => {
    it('should return full path for filename', () => {
      const storage = new LocalStorage();
      const fullPath = storage.getPath('test-backup.dump');

      expect(fullPath).toBe('/tmp/test-localstorage/test-backup.dump');
    });

    it('should handle different filenames', () => {
      const storage = new LocalStorage();

      expect(storage.getPath('backup-2024-01-01.dump')).toBe('/tmp/test-localstorage/backup-2024-01-01.dump');
      expect(storage.getPath('my.backup.sql')).toBe('/tmp/test-localstorage/my.backup.sql');
    });
  });

  describe('default directory', () => {
    it('should use BACKUPS_DIR env variable when set', () => {
      process.env.BACKUPS_DIR = '/custom/path';
      const storage = new LocalStorage();
      expect(storage.getPath('test')).toBe('/custom/path/test');
    });

    it('should use /app/backups when BACKUPS_DIR not set', () => {
      delete process.env.BACKUPS_DIR;
      const storage = new LocalStorage();
      expect(storage.getPath('test')).toBe('/app/backups/test');
    });
  });

  describe('save', () => {
    it('should write a file and verify it exists', async () => {
      const storage = new LocalStorage();
      const { Readable } = await import('stream');

      const content = 'test backup content\nline 2\nline 3';
      const stream = Readable.from([content]);
      const filename = 'save-test.dump';

      const result = await storage.save(stream, filename);

      expect(result.filepath).toBe(path.join(TEST_DIR, filename));
      expect(result.sizeBytes).toBeGreaterThan(0);

      // Verify file exists and has correct content
      const exists = await fs.access(result.filepath).then(() => true).catch(() => false);
      expect(exists).toBe(true);

      const savedContent = await fs.readFile(result.filepath, 'utf-8');
      expect(savedContent).toBe(content);
    });
  });

  describe('delete', () => {
    it('should remove a file and verify it is gone', async () => {
      const storage = new LocalStorage();

      // Create a file to delete
      const filename = 'delete-test.dump';
      const filepath = path.join(TEST_DIR, filename);
      await fs.writeFile(filepath, 'content to delete');

      // Verify it exists
      let exists = await fs.access(filepath).then(() => true).catch(() => false);
      expect(exists).toBe(true);

      // Delete it
      await storage.delete(filepath);

      // Verify it's gone
      exists = await fs.access(filepath).then(() => true).catch(() => false);
      expect(exists).toBe(false);
    });
  });

  describe('list', () => {
    it('should return file list', async () => {
      const storage = new LocalStorage();

      // Create some test files
      await fs.writeFile(path.join(TEST_DIR, 'file1.dump'), 'content 1');
      await fs.writeFile(path.join(TEST_DIR, 'file2.sql'), 'content 2');
      await fs.writeFile(path.join(TEST_DIR, 'file3.tar'), 'content 3');

      const files = await storage.list();

      expect(files).toContain('file1.dump');
      expect(files).toContain('file2.sql');
      expect(files).toContain('file3.tar');
      expect(files.length).toBe(3);
    });

    it('should return empty list when directory is empty', async () => {
      const storage = new LocalStorage();

      const files = await storage.list();

      expect(Array.isArray(files)).toBe(true);
    });
  });

  describe('getStats', () => {
    it('should return file stats', async () => {
      const storage = new LocalStorage();

      // Create a file with known content
      const filename = 'stats-test.dump';
      const filepath = path.join(TEST_DIR, filename);
      const content = 'x'.repeat(12345);
      await fs.writeFile(filepath, content);

      const stats = await storage.getStats(filepath);

      expect(stats.sizeBytes).toBe(12345);
    });
  });
});