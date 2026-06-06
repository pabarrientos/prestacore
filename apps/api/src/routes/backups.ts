import { Router, Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { requireAdmin } from '../middleware/rbac';
import multer from 'multer';
import path from 'path';
import { createBackup, calculateChecksum } from '../services/backup/dump';
import { previewRestore, validateBackupFile } from '../services/backup/restore';
import { executeRestore } from '../services/backup/dump';
import { reconcileBackups } from '../services/backup/reconcile';
import { getScheduleConfig, updateScheduleConfig } from '../services/backup/scheduler';
import { RetentionEngine } from '../services/backup/retention';
import { LocalStorage } from '../services/storage/LocalStorage';
import fs from 'fs/promises';

const router: ReturnType<typeof Router> = Router();
const prisma = new PrismaClient();

// Multer configuration for file uploads
const upload = multer({
  dest: '/tmp/backup-uploads',
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB max
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.sql', '.dump', '.tar'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only .sql, .dump, and .tar files are allowed.'));
    }
  },
});

// Zod schemas
const scheduleSchema = z.object({
  enabled: z.boolean(),
  frequency: z.enum(['daily', 'weekly', 'monthly']),
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59).default(0),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  retention: z.object({
    maxCount: z.number().int().min(1).optional(),
    maxAgeDays: z.number().int().min(1).optional(),
  }).optional(),
});

const restoreSchema = z.object({
  confirm: z.boolean(),
});

// GET /api/backups - List all backups
router.get('/', authMiddleware, requireAdmin, async (_req, res: Response): Promise<void> => {
  try {
    const backups = await prisma.backup.findMany({
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: backups,
    });
  } catch (error) {
    console.error('List backups error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// POST /api/backups - Create a manual backup
router.post('/', authMiddleware, requireAdmin, async (_req, res: Response): Promise<void> => {
  const start = Date.now();
  try {
    const result = await createBackup(prisma, 'MANUAL');

    // Log successful execution
    try {
      await prisma.backupExecutionLog.create({
        data: {
          type: 'MANUAL',
          status: 'SUCCESS',
          durationMs: Date.now() - start,
          backupId: result.id,
        },
      });
    } catch (logErr) {
      console.error('Failed to log manual backup:', logErr);
    }

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    // Log failed execution
    try {
      await prisma.backupExecutionLog.create({
        data: {
          type: 'MANUAL',
          status: 'FAILED',
          message: error.message || 'Unknown error',
          durationMs: Date.now() - start,
        },
      });
    } catch (logErr) {
      console.error('Failed to log manual backup failure:', logErr);
    }

    console.error('Create backup error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create backup',
    });
  }
});

// GET /api/backups/schedule - Get schedule configuration
router.get('/schedule', authMiddleware, requireAdmin, async (_req, res: Response): Promise<void> => {
  try {
    const schedule = await getScheduleConfig(prisma);

    // Also load retention config
    let retention = null;
    try {
      const retentionSetting = await prisma.setting.findUnique({
        where: { key: 'BACKUP_RETENTION' },
      });
      if (retentionSetting) {
        retention = JSON.parse(retentionSetting.value);
      }
    } catch {
      // Retention config may not exist yet
    }

    res.json({
      success: true,
      data: { schedule, retention },
    });
  } catch (error) {
    console.error('Get schedule error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// PATCH /api/backups/schedule - Update schedule configuration
router.patch('/schedule', authMiddleware, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const body = scheduleSchema.parse(req.body);

    // Extract retention before passing to updateScheduleConfig (which only handles schedule)
    const { retention, ...scheduleConfig } = body;
    await updateScheduleConfig(prisma, scheduleConfig);

    // Save retention config separately
    if (retention) {
      await prisma.setting.upsert({
        where: { key: 'BACKUP_RETENTION' },
        update: { value: JSON.stringify(retention) },
        create: {
          key: 'BACKUP_RETENTION',
          value: JSON.stringify(retention),
          description: 'Backup retention policy (maxCount and/or maxAgeDays)',
        },
      });

      // Automatically enforce retention after config change
      const retentionEngine = new RetentionEngine(prisma);
      const result = await retentionEngine.enforceRetention();

      // Log the enforcement
      try {
        await prisma.backupExecutionLog.create({
          data: {
            type: 'RETENTION',
            status: 'SUCCESS',
            message: `Deleted ${result.deleted} backup(s) due to retention policy change`,
          },
        });
      } catch (logErr) {
        console.error('Failed to log retention enforcement:', logErr);
      }
    }

    res.json({
      success: true,
      data: body,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      });
      return;
    }
    console.error('Update schedule error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// POST /api/backups/retention/enforce - Manually trigger retention policy
router.post('/retention/enforce', authMiddleware, requireAdmin, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const retentionEngine = new RetentionEngine(prisma);
    const result = await retentionEngine.enforceRetention();

    // Log the enforcement
    try {
      await prisma.backupExecutionLog.create({
        data: {
          type: 'RETENTION',
          status: 'SUCCESS',
          message: `Manually enforced: deleted ${result.deleted} backup(s)`,
        },
      });
    } catch (logErr) {
      console.error('Failed to log retention enforcement:', logErr);
    }

    res.json({
      success: true,
      data: {
        deleted: result.deleted,
        ids: result.ids,
      },
    });
  } catch (error) {
    console.error('Enforce retention error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// GET /api/backups/logs - Get execution logs from scheduler
router.get('/logs', authMiddleware, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;

    const logs = await prisma.backupExecutionLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200), // Cap at 200 to avoid excessive data
    });

    res.json({
      success: true,
      data: logs,
    });
  } catch (error) {
    console.error('Get execution logs error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// DELETE /api/backups/logs/:id - Delete a specific execution log
router.delete('/logs/:id', authMiddleware, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const log = await prisma.backupExecutionLog.findUnique({ where: { id } });
    if (!log) {
      res.status(404).json({
        success: false,
        error: 'Log entry not found',
      });
      return;
    }

    await prisma.backupExecutionLog.delete({ where: { id } });

    res.json({
      success: true,
      data: { id },
    });
  } catch (error) {
    console.error('Delete execution log error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// DELETE /api/backups/logs - Delete all execution logs
router.delete('/logs', authMiddleware, requireAdmin, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await prisma.backupExecutionLog.deleteMany();

    res.json({
      success: true,
      data: { deleted: result.count },
    });
  } catch (error) {
    console.error('Delete all execution logs error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// GET /api/backups/:id/download - Download a backup file
router.get('/:id/download', authMiddleware, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const backup = await prisma.backup.findUnique({ where: { id } });
    if (!backup) {
      res.status(404).json({
        success: false,
        error: 'Backup not found',
      });
      return;
    }

    // Check if file exists
    try {
      await fs.access(backup.filepath);
    } catch {
      res.status(404).json({
        success: false,
        error: 'Backup file not found on disk',
      });
      return;
    }

    res.download(backup.filepath, backup.filename);
  } catch (error) {
    console.error('Download backup error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// DELETE /api/backups/:id - Delete a backup
router.delete('/:id', authMiddleware, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const backup = await prisma.backup.findUnique({ where: { id } });
    if (!backup) {
      res.status(404).json({
        success: false,
        error: 'Backup not found',
      });
      return;
    }

    // Delete file from disk
    try {
      await fs.unlink(backup.filepath);
    } catch {
      // File may not exist, continue with DB deletion
    }

    // Delete database record
    await prisma.backup.delete({ where: { id } });

    res.json({
      success: true,
      data: { id },
    });
  } catch (error) {
    console.error('Delete backup error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// POST /api/backups/upload - Upload a backup file for restore
router.post('/upload', authMiddleware, requireAdmin, upload.single('file'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    console.log('[upload] Received upload request');
    if (!req.file) {
      console.log('[upload] No file in request');
      res.status(400).json({
        success: false,
        error: 'No file uploaded',
      });
      return;
    }

    console.log('[upload] File received:', req.file.originalname, req.file.size, 'bytes');

    const storage = new LocalStorage();
    const filename = `upload-${Date.now()}${path.extname(req.file.originalname)}`;
    const destPath = storage.getPath(filename);

    // Move file from temp location to backups directory
    // Use copyFile + unlink instead of rename to handle cross-device moves (Docker volumes)
    console.log('[upload] Copying from', req.file.path, 'to', destPath);
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    await fs.copyFile(req.file.path, destPath);
    await fs.unlink(req.file.path);
    console.log('[upload] File copied successfully');

    // Validate the backup file
    console.log('[upload] Validating backup file...');
    const isValid = await validateBackupFile(destPath);
    console.log('[upload] Validation result:', isValid);
    if (!isValid) {
      await fs.unlink(destPath).catch(() => {});
      res.status(400).json({
        success: false,
        error: 'Invalid backup file',
      });
      return;
    }

    // Get file stats
    const stats = await fs.stat(destPath);

    // Calculate SHA-256 checksum
    const checksum = await calculateChecksum(destPath);

    // Create backup record
    const backup = await prisma.backup.create({
      data: {
        filename,
        filepath: destPath,
        sizeBytes: stats.size,
        type: 'UPLOADED',
        status: 'COMPLETED',
        checksum,
      },
    });

    res.status(201).json({
      success: true,
      data: backup,
    });
  } catch (error) {
    console.error('Upload backup error:', error);
    // Clean up temp file if it exists
    if (req.file?.path) {
      await fs.unlink(req.file.path).catch(() => {});
    }
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// GET /api/backups/preview/:id - Preview restore contents
router.get('/preview/:id', authMiddleware, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const backup = await prisma.backup.findUnique({ where: { id } });
    if (!backup) {
      res.status(404).json({
        success: false,
        error: 'Backup not found',
      });
      return;
    }

    // Validate file exists
    try {
      await fs.access(backup.filepath);
    } catch {
      res.status(404).json({
        success: false,
        error: 'Backup file not found on disk',
      });
      return;
    }

    const preview = await previewRestore(backup.filepath);

    res.json({
      success: true,
      data: preview,
    });
  } catch (error) {
    console.error('Preview restore error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// POST /api/backups/:id/restore - Restore from a backup
router.post('/:id/restore', authMiddleware, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Validate confirmation
    const body = restoreSchema.parse(req.body);
    if (!body.confirm) {
      res.status(400).json({
        success: false,
        error: 'Confirmation required',
      });
      return;
    }

    const backup = await prisma.backup.findUnique({ where: { id } });
    if (!backup) {
      res.status(404).json({
        success: false,
        error: 'Backup not found',
      });
      return;
    }

    // Create a safety backup before restoring
    let safetyBackupId: string | null = null;
    try {
      const safetyBackup = await createBackup(prisma, 'MANUAL');
      safetyBackupId = safetyBackup.id;
      console.log('[restore] Pre-restore safety backup created:', safetyBackupId);
    } catch (err) {
      console.error('[restore] Failed to create safety backup:', err);
      // Continue with restore even if safety backup fails
    }

    // Execute the restore
    await executeRestore(prisma, id);

    // Reconcile backup files on disk with database after restore
    // (the Backup table may have been dropped and recreated by pg_restore --clean)
    try {
      const { created, removed } = await reconcileBackups(prisma);
      console.log(`[restore] Reconciliation: ${created} created, ${removed} removed`);
    } catch (err) {
      console.error('[restore] Reconciliation failed:', err);
    }

    res.json({
      success: true,
      data: { id, status: 'RESTORING' },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: 'Confirmation required',
      });
      return;
    }
    if (error instanceof Error && error.message === 'Restore already in progress') {
      res.status(409).json({
        success: false,
        error: 'Restore already in progress',
      });
      return;
    }
    console.error('Restore backup error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

export default router;