import cron, { ScheduledTask } from 'node-cron';
import { PrismaClient } from '@prisma/client';

// BackupSchedule interface - duplicated from @prestamos/shared to avoid import issues
interface BackupSchedule {
  enabled: boolean;
  frequency: 'daily' | 'weekly' | 'monthly';
  hour: number;
  dayOfWeek?: number;
  dayOfMonth?: number;
}

let scheduledTask: ScheduledTask | null = null;

/**
 * Parse schedule configuration from database setting
 */
export function parseScheduleConfig(config: BackupSchedule): {
  hour: number;
  dayOfMonth?: number;
  dayOfWeek?: number;
} {
  return {
    hour: config.hour,
    dayOfMonth: config.dayOfMonth,
    dayOfWeek: config.dayOfWeek,
  };
}

/**
 * Build a cron expression from schedule parameters
 */
export function buildCronExpression(params: { hour: number; dayOfWeek?: number; dayOfMonth?: number }): string {
  const { hour, dayOfWeek, dayOfMonth } = params;

  // Validate hour (0-23)
  if (hour < 0 || hour > 23) {
    throw new Error('Hour must be between 0 and 23');
  }

  // Validate dayOfWeek (0-6)
  if (dayOfWeek !== undefined && (dayOfWeek < 0 || dayOfWeek > 6)) {
    throw new Error('Day of week must be between 0 and 6');
  }

  // Validate dayOfMonth (1-31)
  if (dayOfMonth !== undefined && (dayOfMonth < 1 || dayOfMonth > 31)) {
    throw new Error('Day of month must be between 1 and 31');
  }

  if (dayOfWeek !== undefined) {
    // Weekly: minute hour * * dayOfWeek
    return `0 ${hour} * * ${dayOfWeek}`;
  } else if (dayOfMonth !== undefined) {
    // Monthly: minute hour dayOfMonth * *
    return `0 ${hour} ${dayOfMonth} * *`;
  } else {
    // Daily: minute hour * * *
    return `0 ${hour} * * *`;
  }
}

/**
 * Try to acquire an advisory lock to prevent multiple instances from
 * running the scheduler simultaneously. The lock is session-scoped
 * and auto-released if the process/connection dies.
 */
async function tryAcquireSchedulerLock(prisma: PrismaClient): Promise<boolean> {
  try {
    const result = await prisma.$queryRaw<Array<{ locked: boolean }>>`
      SELECT pg_try_advisory_lock(hashtext('backup-scheduler')) AS locked
    `;
    return result[0]?.locked ?? false;
  } catch (err) {
    console.error('Failed to acquire advisory lock:', err);
    return false;
  }
}

/**
 * Start the backup scheduler
 */
export async function startScheduler(prisma: PrismaClient): Promise<void> {
  // Stop existing scheduler if running
  stopScheduler();

  // Try to acquire advisory lock (prevents duplicate schedulers in multi-instance setups)
  const acquired = await tryAcquireSchedulerLock(prisma);
  if (!acquired) {
    console.log('Backup scheduler: another instance already holds the lock, skipping');
    return;
  }

  // Get schedule from settings
  const setting = await prisma.setting.findUnique({
    where: { key: 'BACKUP_SCHEDULE' },
  });

  if (!setting) {
    console.log('No backup schedule configured');
    return;
  }

  let schedule: BackupSchedule;
  try {
    schedule = JSON.parse(setting.value) as BackupSchedule;
  } catch {
    console.error('Invalid BACKUP_SCHEDULE setting');
    return;
  }

  if (!schedule.enabled) {
    console.log('Backup scheduler is disabled');
    return;
  }

  // Build cron expression
  const cronExpr = buildCronExpression({
    hour: schedule.hour,
    dayOfWeek: schedule.dayOfWeek,
    dayOfMonth: schedule.dayOfMonth,
  });

  // Validate cron expression
  if (!cron.validate(cronExpr)) {
    throw new Error(`Invalid cron expression: ${cronExpr}`);
  }

  // Schedule the task
  scheduledTask = cron.schedule(cronExpr, async () => {
    const start = Date.now();
    console.log('[scheduler] Scheduled backup triggered');
    try {
      // Import here to avoid circular dependency
      const { createBackup } = await import('./dump');
      const result = await createBackup(prisma, 'SCHEDULED');

      // Log successful execution
      await prisma.backupExecutionLog.create({
        data: {
          type: 'SCHEDULED',
          status: 'SUCCESS',
          durationMs: Date.now() - start,
          backupId: result.id,
        },
      });
      console.log(`[scheduler] Backup completed: ${result.filename}`);
    } catch (error: any) {
      console.error('[scheduler] Scheduled backup failed:', error);

      // Log failed execution
      try {
        await prisma.backupExecutionLog.create({
          data: {
            type: 'SCHEDULED',
            status: 'FAILED',
            message: error.message || 'Unknown error',
            durationMs: Date.now() - start,
          },
        });
      } catch (logErr) {
        console.error('[scheduler] Failed to log execution:', logErr);
      }
    }
  });

  console.log(`Backup scheduler started with cron: ${cronExpr}`);
}

/**
 * Stop the backup scheduler
 */
export function stopScheduler(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    console.log('Backup scheduler stopped');
  }
}

/**
 * Get current schedule configuration
 */
export async function getScheduleConfig(prisma: PrismaClient): Promise<BackupSchedule | null> {
  const setting = await prisma.setting.findUnique({
    where: { key: 'BACKUP_SCHEDULE' },
  });

  if (!setting) {
    return null;
  }

  try {
    return JSON.parse(setting.value) as BackupSchedule;
  } catch {
    return null;
  }
}

/**
 * Update schedule configuration
 */
export async function updateScheduleConfig(prisma: PrismaClient, config: BackupSchedule): Promise<void> {
  // Upsert the schedule setting
  await prisma.setting.upsert({
    where: { key: 'BACKUP_SCHEDULE' },
    update: { value: JSON.stringify(config) },
    create: {
      key: 'BACKUP_SCHEDULE',
      value: JSON.stringify(config),
      description: 'Backup schedule configuration (cron-based)',
    },
  });

  // Restart scheduler with new config
  await startScheduler(prisma);
}
