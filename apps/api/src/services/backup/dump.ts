import { execFile } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { LocalStorage } from '../storage/LocalStorage';
import { RetentionEngine } from './retention';

const execFileAsync = promisify(execFile);
const DUMP_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export interface BackupResult {
  id: string;
  filename: string;
  filepath: string;
  sizeBytes: number;
  checksum: string;
}

/**
 * Parse DATABASE_URL to extract connection parameters for pg_dump
 */
function parseDatabaseUrl(url: string): {
  host: string;
  port: string;
  user: string;
  password: string;
  dbname: string;
} {
  const parsed = new URL(url);
  return {
    host: parsed.hostname || 'localhost',
    port: parsed.port || '5432',
    user: parsed.username || 'postgres',
    password: parsed.password || '',
    dbname: parsed.pathname?.slice(1) || 'postgres',
  };
}

/**
 * Calculate SHA-256 checksum of a file
 */
async function calculateChecksum(filepath: string): Promise<string> {
  const hash = crypto.createHash('sha256');
  const { createReadStream } = await import('fs');
  
  return new Promise((resolve, reject) => {
    const stream = createReadStream(filepath);
    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * Create a database backup using pg_dump
 */
export async function createBackup(
  prisma: PrismaClient,
  type: 'MANUAL' | 'SCHEDULED' | 'UPLOADED' = 'MANUAL'
): Promise<BackupResult> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `backup-${timestamp}.dump`;
  const storage = new LocalStorage();
  const filepath = storage.getPath(filename);

  // Parse DATABASE_URL
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  const dbParams = parseDatabaseUrl(dbUrl);

  // Build pg_dump arguments
  const pgDumpArgs = [
    '-h', dbParams.host,
    '-p', dbParams.port,
    '-U', dbParams.user,
    '-d', dbParams.dbname,
    '-Fc', // Custom PostgreSQL format (compressed)
    '-f', filepath,
  ];

  // Set PGPASSWORD environment variable
  const env = { ...process.env, PGPASSWORD: dbParams.password };

  try {
    await execFileAsync('pg_dump', pgDumpArgs, {
      timeout: DUMP_TIMEOUT_MS,
      env,
    });
  } catch (error: any) {
    // If pg_dump failed, create FAILED backup record and throw
    await prisma.backup.create({
      data: {
        filename,
        filepath,
        sizeBytes: 0,
        type,
        status: 'FAILED',
        error: error.message || 'pg_dump failed',
      },
    });
    throw new Error(`pg_dump failed: ${error.message}`);
  }

  // Calculate checksum
  const checksum = await calculateChecksum(filepath);

  // Get file size
  const stats = await storage.getStats(filepath);

  // Create backup record
  const backup = await prisma.backup.create({
    data: {
      filename,
      filepath,
      sizeBytes: stats.sizeBytes,
      type,
      status: 'COMPLETED',
      checksum,
    },
  });

  // Enforce retention policy after each backup
  const retentionEngine = new RetentionEngine(prisma);
  await retentionEngine.enforceRetention();

  return {
    id: backup.id,
    filename: backup.filename,
    filepath: backup.filepath,
    sizeBytes: backup.sizeBytes,
    checksum: backup.checksum!,
  };
}

/**
 * Spawn pg_restore to restore a backup
 */
export async function executeRestore(
  prisma: PrismaClient,
  backupId: string
): Promise<void> {
  const backup = await prisma.backup.findUnique({ where: { id: backupId } });
  if (!backup) {
    throw new Error('Backup not found');
  }

  if (backup.status === 'RESTORING') {
    throw new Error('Restore already in progress');
  }

  // Update status to RESTORING
  await prisma.backup.update({
    where: { id: backupId },
    data: { status: 'RESTORING' },
  });

  // Parse DATABASE_URL
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  const dbParams = parseDatabaseUrl(dbUrl);

  // Build pg_restore arguments
  const pgRestoreArgs = [
    '-h', dbParams.host,
    '-p', dbParams.port,
    '-U', dbParams.user,
    '-d', dbParams.dbname,
    '--clean',      // Drop existing objects before creating
    '--if-exists',  // Don't error if object doesn't exist
    backup.filepath,
  ];

  // Set PGPASSWORD environment variable
  const env = { ...process.env, PGPASSWORD: dbParams.password };

  try {
    await execFileAsync('pg_restore', pgRestoreArgs, {
      timeout: DUMP_TIMEOUT_MS,
      env,
    });

    // Update status to COMPLETED (record may have been dropped/recreated by restore)
    try {
      await prisma.backup.update({
        where: { id: backupId },
        data: { status: 'COMPLETED' },
      });
    } catch {
      // Record was likely dropped and recreated from dump — status update is optional
      console.log('Backup record was recreated during restore — status update skipped');
    }
  } catch (error: any) {
    // Try to update status to FAILED, but the backup record may have been
    // dropped by pg_restore --clean if the restore partially completed
    try {
      await prisma.backup.update({
        where: { id: backupId },
        data: {
          status: 'FAILED',
          error: error.message || 'pg_restore failed',
        },
      });
    } catch {
      // Record was likely dropped during restore — can't update
      console.error('Could not update backup status (record may have been dropped):', error.message);
    }
    throw new Error(`pg_restore failed: ${error.message}`);
  }
}