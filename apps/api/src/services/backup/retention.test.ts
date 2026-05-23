import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RetentionEngine } from './retention';

// BackupRecord interface - duplicated from @prestamos/shared to avoid import issues
interface BackupRecord {
  id: string;
  filename: string;
  sizeBytes: number;
  type: 'MANUAL' | 'SCHEDULED' | 'UPLOADED';
  status: 'COMPLETED' | 'FAILED' | 'RESTORING';
  error?: string;
  createdAt: string;
}

// Mock Prisma
const mockFindMany = vi.fn();
const mockFindUnique = vi.fn();
const mockDelete = vi.fn();
const mockSettingFindUnique = vi.fn();

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => ({
    backup: {
      findMany: mockFindMany,
      findUnique: mockFindUnique,
      delete: mockDelete,
    },
    setting: {
      findUnique: mockSettingFindUnique,
    },
  })),
}));

// Mock datetime service
vi.mock('./datetime', () => ({
  getToday: vi.fn(() => Promise.resolve(new Date('2026-05-23'))),
}));

describe('RetentionEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('enforceRetention', () => {
    it('should not delete anything when within limits', async () => {
      // Setup: 3 backups within maxCount=5 and maxAgeDays=30
      const mockBackups: BackupRecord[] = [
        { id: '1', filename: 'backup1.dump', sizeBytes: 1000, type: 'MANUAL', status: 'COMPLETED', createdAt: '2026-05-22T00:00:00Z' },
        { id: '2', filename: 'backup2.dump', sizeBytes: 1000, type: 'MANUAL', status: 'COMPLETED', createdAt: '2026-05-21T00:00:00Z' },
        { id: '3', filename: 'backup3.dump', sizeBytes: 1000, type: 'MANUAL', status: 'COMPLETED', createdAt: '2026-05-20T00:00:00Z' },
      ];

      mockFindMany.mockResolvedValue(mockBackups);
      mockSettingFindUnique.mockResolvedValue({
        key: 'BACKUP_RETENTION',
        value: JSON.stringify({ maxCount: 5, maxAgeDays: 30 }),
      });

      const { PrismaClient } = await import('@prisma/client');
      const engine = new RetentionEngine(new PrismaClient() as any);
      await engine.enforceRetention();

      // Should not have called delete
      expect(mockDelete).not.toHaveBeenCalled();
    });

    it('should delete oldest backup when maxCount exceeded', async () => {
      // Setup: 6 backups with maxCount=5
      const mockBackups: BackupRecord[] = [
        { id: '1', filename: 'backup1.dump', sizeBytes: 1000, type: 'MANUAL', status: 'COMPLETED', createdAt: '2026-05-22T00:00:00Z' },
        { id: '2', filename: 'backup2.dump', sizeBytes: 1000, type: 'MANUAL', status: 'COMPLETED', createdAt: '2026-05-21T00:00:00Z' },
        { id: '3', filename: 'backup3.dump', sizeBytes: 1000, type: 'MANUAL', status: 'COMPLETED', createdAt: '2026-05-20T00:00:00Z' },
        { id: '4', filename: 'backup4.dump', sizeBytes: 1000, type: 'MANUAL', status: 'COMPLETED', createdAt: '2026-05-19T00:00:00Z' },
        { id: '5', filename: 'backup5.dump', sizeBytes: 1000, type: 'MANUAL', status: 'COMPLETED', createdAt: '2026-05-18T00:00:00Z' },
        { id: '6', filename: 'backup6.dump', sizeBytes: 1000, type: 'MANUAL', status: 'COMPLETED', createdAt: '2026-05-17T00:00:00Z' },
      ];

      mockFindMany.mockResolvedValue(mockBackups);
      mockSettingFindUnique.mockResolvedValue({
        key: 'BACKUP_RETENTION',
        value: JSON.stringify({ maxCount: 5, maxAgeDays: 30 }),
      });
      mockFindUnique.mockResolvedValue({ filepath: '/app/backups/backup6.dump' });
      mockDelete.mockResolvedValue(undefined);

      const { PrismaClient } = await import('@prisma/client');
      const engine = new RetentionEngine(new PrismaClient() as any);
      await engine.enforceRetention();

      // Should delete exactly one (the oldest: id '6')
      expect(mockDelete).toHaveBeenCalledTimes(1);
    });

    it('should delete expired backups by age', async () => {
      // Setup: backups with one older than maxAgeDays=30
      // Current date is 2026-05-23, oldest is 2026-04-20 (33 days ago)
      const mockBackups: BackupRecord[] = [
        { id: '1', filename: 'backup1.dump', sizeBytes: 1000, type: 'MANUAL', status: 'COMPLETED', createdAt: '2026-05-22T00:00:00Z' },
        { id: '2', filename: 'backup2.dump', sizeBytes: 1000, type: 'MANUAL', status: 'COMPLETED', createdAt: '2026-04-20T00:00:00Z' }, // 33 days old
        { id: '3', filename: 'backup3.dump', sizeBytes: 1000, type: 'MANUAL', status: 'COMPLETED', createdAt: '2026-05-20T00:00:00Z' },
      ];

      mockFindMany.mockResolvedValue(mockBackups);
      mockSettingFindUnique.mockResolvedValue({
        key: 'BACKUP_RETENTION',
        value: JSON.stringify({ maxCount: 10, maxAgeDays: 30 }),
      });
      mockFindUnique.mockResolvedValue({ filepath: '/app/backups/backup2.dump' });
      mockDelete.mockResolvedValue(undefined);

      const { PrismaClient } = await import('@prisma/client');
      const engine = new RetentionEngine(new PrismaClient() as any);
      await engine.enforceRetention();

      // Should delete the expired one (id '2')
      expect(mockDelete).toHaveBeenCalledTimes(1);
    });

    it('should delete backups exceeding EITHER limit (count OR age)', async () => {
      // Setup: 6 backups, one expired by age, maxCount=5
      // Backups sorted by createdAt desc: 1(May22), 2(May21), 3(May20), 4(May19), 5(May18, 5d old), 6(Apr10, 43d old)
      const mockBackups: BackupRecord[] = [
        { id: '1', filename: 'backup1.dump', sizeBytes: 1000, type: 'MANUAL', status: 'COMPLETED', createdAt: '2026-05-22T00:00:00Z' },
        { id: '2', filename: 'backup2.dump', sizeBytes: 1000, type: 'MANUAL', status: 'COMPLETED', createdAt: '2026-05-21T00:00:00Z' },
        { id: '3', filename: 'backup3.dump', sizeBytes: 1000, type: 'MANUAL', status: 'COMPLETED', createdAt: '2026-05-20T00:00:00Z' },
        { id: '4', filename: 'backup4.dump', sizeBytes: 1000, type: 'MANUAL', status: 'COMPLETED', createdAt: '2026-05-19T00:00:00Z' },
        { id: '5', filename: 'backup5.dump', sizeBytes: 1000, type: 'MANUAL', status: 'COMPLETED', createdAt: '2026-05-18T00:00:00Z' }, // 5 days old
        { id: '6', filename: 'backup6.dump', sizeBytes: 1000, type: 'MANUAL', status: 'COMPLETED', createdAt: '2026-04-10T00:00:00Z' }, // 43 days old - EXPIRED
      ];

      mockFindMany.mockResolvedValue(mockBackups);
      mockSettingFindUnique.mockResolvedValue({
        key: 'BACKUP_RETENTION',
        value: JSON.stringify({ maxCount: 5, maxAgeDays: 30 }),
      });
      // Only backup6 exceeds both limits (count=6>5 AND age=43>30), backup5 only exceeds count
      mockFindUnique.mockResolvedValue({ id: '6', filepath: '/app/backups/backup6.dump' });
      mockDelete.mockResolvedValue(undefined);

      const { PrismaClient } = await import('@prisma/client');
      const engine = new RetentionEngine(new PrismaClient() as any);
      await engine.enforceRetention();

      // Only backup6 is deleted - it's the only one exceeding BOTH limits
      // backup5 only exceeds count limit (not age: only 5 days old)
      expect(mockDelete).toHaveBeenCalledTimes(1);
      expect(mockDelete).toHaveBeenCalledWith({ where: { id: '6' } });
    });

    it('should handle no retention config gracefully', async () => {
      mockFindMany.mockResolvedValue([]);
      mockSettingFindUnique.mockResolvedValue(null);

      const { PrismaClient } = await import('@prisma/client');
      const engine = new RetentionEngine(new PrismaClient() as any);
      await expect(engine.enforceRetention()).resolves.not.toThrow();
    });

    it('should handle empty backup list', async () => {
      mockFindMany.mockResolvedValue([]);
      mockSettingFindUnique.mockResolvedValue({
        key: 'BACKUP_RETENTION',
        value: JSON.stringify({ maxCount: 5, maxAgeDays: 30 }),
      });

      const { PrismaClient } = await import('@prisma/client');
      const engine = new RetentionEngine(new PrismaClient() as any);
      await engine.enforceRetention();

      expect(mockDelete).not.toHaveBeenCalled();
    });
  });

  describe('getRetentionConfig', () => {
    it('should parse retention config from settings', async () => {
      mockSettingFindUnique.mockResolvedValue({
        key: 'BACKUP_RETENTION',
        value: JSON.stringify({ maxCount: 10, maxAgeDays: 60 }),
      });

      const { PrismaClient } = await import('@prisma/client');
      const engine = new RetentionEngine(new PrismaClient() as any);
      const config = await engine.getRetentionConfig();

      expect(config).toEqual({ maxCount: 10, maxAgeDays: 60 });
    });

    it('should return default config when no setting exists', async () => {
      mockSettingFindUnique.mockResolvedValue(null);

      const { PrismaClient } = await import('@prisma/client');
      const engine = new RetentionEngine(new PrismaClient() as any);
      const config = await engine.getRetentionConfig();

      expect(config).toEqual({ maxCount: undefined, maxAgeDays: undefined });
    });

    it('should handle malformed JSON gracefully', async () => {
      mockSettingFindUnique.mockResolvedValue({
        key: 'BACKUP_RETENTION',
        value: 'not valid json',
      });

      const { PrismaClient } = await import('@prisma/client');
      const engine = new RetentionEngine(new PrismaClient() as any);
      const config = await engine.getRetentionConfig();

      expect(config).toEqual({ maxCount: undefined, maxAgeDays: undefined });
    });
  });
});