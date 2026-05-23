import { PrismaClient } from '@prisma/client';

// RetentionConfig interface - duplicated from @prestamos/shared to avoid import issues
interface RetentionConfig {
  maxCount?: number;
  maxAgeDays?: number;
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
  async enforceRetention(): Promise<void> {
    const config = await this.getRetentionConfig();
    const backups = await this.prisma.backup.findMany({
      orderBy: { createdAt: 'desc' },
    });

    if (backups.length === 0) return;

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
    for (const id of toDeleteIds) {
      await this.deleteBackup(id);
    }
  }

  /**
   * Get retention configuration from settings
   */
  async getRetentionConfig(): Promise<RetentionConfig> {
    const setting = await this.prisma.setting.findUnique({
      where: { key: 'BACKUP_RETENTION' },
    });

    if (!setting) {
      return { maxCount: undefined, maxAgeDays: undefined };
    }

    try {
      const config = JSON.parse(setting.value) as RetentionConfig;
      return {
        maxCount: config.maxCount,
        maxAgeDays: config.maxAgeDays,
      };
    } catch {
      return { maxCount: undefined, maxAgeDays: undefined };
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