import { execFile } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { LocalStorage } from '../storage/LocalStorage';
import { RetentionEngine } from './retention';
import { cleanupStaleRestores } from './restore';

const execFileAsync = promisify(execFile);
const DUMP_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export interface BackupResult {
  id: string;
  filename: string;
  filepath: string;
  sizeBytes: number;
  checksum: string;
}

export interface ParsedDatabaseUrl {
  host: string;
  port: string;
  user: string;
  password: string;
  dbname: string;
  sslArgs: string[]; // Extra pg_dump/pg_restore args for SSL
}

/**
 * Parse DATABASE_URL to extract connection parameters for pg_dump/pg_restore.
 * Handles URL-encoded passwords, special characters, and SSL query params.
 */
export function parseDatabaseUrl(url: string): ParsedDatabaseUrl {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('DATABASE_URL is not a valid URL');
  }

  const host = parsed.hostname || 'localhost';
  const port = parsed.port || '5432';
  const user = decodeURIComponent(parsed.username || 'postgres');
  const password = decodeURIComponent(parsed.password || '');
  const dbname = decodeURIComponent(parsed.pathname?.slice(1) || 'postgres');

  if (!host) {
    throw new Error('DATABASE_URL is missing a host');
  }
  if (!dbname) {
    throw new Error('DATABASE_URL is missing a database name');
  }

  // Extract SSL-related query params and convert to pg_dump/pg_restore flags
  const sslArgs: string[] = [];
  const sslMode = parsed.searchParams.get('sslmode');
  if (sslMode) {
    sslArgs.push('--sslmode', sslMode);
  }
  const sslCert = parsed.searchParams.get('sslcert');
  if (sslCert) {
    sslArgs.push('--sslcert', sslCert);
  }
  const sslKey = parsed.searchParams.get('sslkey');
  if (sslKey) {
    sslArgs.push('--sslkey', sslKey);
  }
  const sslRootCert = parsed.searchParams.get('sslrootcert');
  if (sslRootCert) {
    sslArgs.push('--sslrootcert', sslRootCert);
  }

  return { host, port, user, password, dbname, sslArgs };
}

/**
 * Calculate SHA-256 checksum of a file
 */
export async function calculateChecksum(filepath: string): Promise<string> {
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
  // Clean up any stale RESTORING records before creating a new backup
  try {
    const { cleaned } = await cleanupStaleRestores(prisma);
    if (cleaned > 0) {
      console.log(`Cleaned up ${cleaned} stale RESTORING backup(s) before creating new backup`);
    }
  } catch (err) {
    console.error('Failed to clean up stale restores:', err);
    // Non-fatal — continue with backup creation
  }

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
    ...dbParams.sslArgs,
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
 * Spawn pg_restore to restore a backup.
 * Disconnects Prisma before restore to release all DB connections,
 * then reconnects after restore completes.
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
    ...dbParams.sslArgs,
    backup.filepath,
  ];

  // Set PGPASSWORD environment variable
  const env = { ...process.env, PGPASSWORD: dbParams.password };

  // Disconnect Prisma to release all DB connections before restore.
  // pg_restore --clean drops and recreates tables, which fails if
  // there are active connections. Prisma will auto-reconnect on next query.
  console.log('[restore] Disconnecting Prisma to release DB connections...');
  await prisma.$disconnect();

  try {
    await execFileAsync('pg_restore', pgRestoreArgs, {
      timeout: DUMP_TIMEOUT_MS,
      env,
    });

    // Reconnect Prisma after successful restore
    console.log('[restore] pg_restore completed, reconnecting Prisma...');
    await prisma.$connect();

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
    // Reconnect Prisma even on failure
    console.log('[restore] Reconnecting Prisma after failed restore...');
    try {
      await prisma.$connect();
    } catch (reconnectErr) {
      console.error('[restore] Failed to reconnect Prisma:', reconnectErr);
    }

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
