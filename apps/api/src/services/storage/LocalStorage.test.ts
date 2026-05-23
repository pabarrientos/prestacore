import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocalStorage } from './LocalStorage';

// Helper to create mock functions
const createMockFn = () => vi.fn();

describe('LocalStorage', () => {
  const BACKUPS_DIR = '/app/backups';

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BACKUPS_DIR = BACKUPS_DIR;
  });

  describe('getPath', () => {
    it('should return full path for filename', () => {
      const storage = new LocalStorage();
      const fullPath = storage.getPath('test-backup.dump');

      expect(fullPath).toBe('/app/backups/test-backup.dump');
    });

    it('should handle different filenames', () => {
      const storage = new LocalStorage();
      
      expect(storage.getPath('backup-2024-01-01.dump')).toBe('/app/backups/backup-2024-01-01.dump');
      expect(storage.getPath('my.backup.sql')).toBe('/app/backups/my.backup.sql');
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
});