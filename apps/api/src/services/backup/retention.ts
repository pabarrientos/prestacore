import { PrismaClient } from '@prisma/client';

// RetentionConfig interface - duplicated from @prestamos/shared to avoid import issues
interface RetentionConfig {
  maxCount?: number;
  maxAgeDays?: number;
}

// Default retention policy — applied when no setting exists or is malformed
export const DEFAULT_MAX_COUNT = 30;
export const DEFAULT_MAX_AGE_DAYS = 90;

export interface RetentionResult {
  deleted: number;
  ids: string[];
}

export class RetentionEngine {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Enforce retention policy by deleting backups that exceed
   * either maxCount OR maxAgeDays limits.
   * Runs after each backup creation.
   */
  async enforceRetention(): Promise<RetentionResult> {
    const config = await this.getRetentionConfig();
    const backups = await this.prisma.backup.findMany({
      orderBy: { createdAt: 'desc' },
    });

    if (backups.length === 0) return { deleted: 0, ids: [] };

    // Collect IDs to delete
    const toDeleteIds = new Set<string>();

    // Check maxCount limit
    if (config.maxCount && backups.length > config.maxCount) {
      const excessBackups = backups.slice(config.maxCount);
      excessBackups.forEach(backup => toDeleteIds.add(backup.id));
    }

    // Check maxAgeDays limit
    if (config.maxAgeDays) {
      const now = new Date();
      for (const backup of backups) {
        const ageInDays = Math.floor(
          (now.getTime() - new Date(backup.createdAt).getTime()) / (1000 * 60 * 60 * 24)
        );
        if (ageInDays > config.maxAgeDays) {
          toDeleteIds.add(backup.id);
        }
      }
    }

    // Delete expired backups
    const deletedIds: string[] = [];
    for (const id of toDeleteIds) {
      await this.deleteBackup(id);
      deletedIds.push(id);
    }

    if (deletedIds.length > 0) {
      console.log(`Retention: deleted ${deletedIds.length} backup(s)`);
    }

    return { deleted: deletedIds.length, ids: deletedIds };
  }

  /**
   * Get retention configuration from settings.
   * Returns defaults if no setting exists or is malformed.
   */
  async getRetentionConfig(): Promise<RetentionConfig> {
    const setting = await this.prisma.setting.findUnique({
      where: { key: 'BACKUP_RETENTION' },
    });

    if (!setting) {
      console.log(`Retention: no config found, using defaults (maxCount=${DEFAULT_MAX_COUNT}, maxAgeDays=${DEFAULT_MAX_AGE_DAYS})`);
      return { maxCount: DEFAULT_MAX_COUNT, maxAgeDays: DEFAULT_MAX_AGE_DAYS };
    }

    try {
      const config = JSON.parse(setting.value) as RetentionConfig;
      return {
        maxCount: config.maxCount ?? DEFAULT_MAX_COUNT,
        maxAgeDays: config.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS,
      };
    } catch {
      console.log(`Retention: malformed config, using defaults (maxCount=${DEFAULT_MAX_COUNT}, maxAgeDays=${DEFAULT_MAX_AGE_DAYS})`);
      return { maxCount: DEFAULT_MAX_COUNT, maxAgeDays: DEFAULT_MAX_AGE_DAYS };
    }
  }

  /**
   * Delete a backup file and its database record
   */
  private async deleteBackup(id: string): Promise<void> {
    // Get backup to find filepath
    const backup = await this.prisma.backup.findUnique({ where: { id } });
    if (!backup) return;

    // Delete from storage (ignore errors if file doesn't exist)
    try {
      const { LocalStorage } = await import('../storage/LocalStorage');
      const storage = new LocalStorage();
      await storage.delete(backup.filepath);
    } catch {
      // File may not exist, continue with DB deletion
    }

    // Delete database record
    await this.prisma.backup.delete({ where: { id } });
  }
}