import { PrismaClient } from '@prisma/client';
import { readdir, stat } from 'fs/promises';
import { join, extname } from 'path';

const ALLOWED_EXTENSIONS = ['.dump', '.sql', '.tar'];
const BACKUPS_DIR = process.env.BACKUPS_DIR || '/app/backups';

/**
 * Reconcile backup files on disk with database records.
 * - Scans /app/backups/ for dump files
 * - Creates Backup records for files without DB entries
 * - Removes DB records for entries whose files no longer exist on disk
 */
export async function reconcileBackups(prisma: PrismaClient): Promise<{ created: number; removed: number }> {
  let created = 0;
  let removed = 0;

  try {
    // 1. Scan disk for backup files
    const files = await readdir(BACKUPS_DIR);
    const dumpFiles = files.filter(f => ALLOWED_EXTENSIONS.includes(extname(f).toLowerCase()));

    // 2. Get all Backup records from DB
    const dbBackups = await prisma.backup.findMany();
    const dbFilepaths = new Set(dbBackups.map(b => b.filepath));

    // 3. Create records for files missing from DB
    for (const filename of dumpFiles) {
      const filepath = join(BACKUPS_DIR, filename);

      if (!dbFilepaths.has(filepath)) {
        try {
          const fileStats = await stat(filepath);

          await prisma.backup.create({
            data: {
              filename,
              filepath,
              sizeBytes: fileStats.size,
              type: 'UPLOADED', // Default type for orphaned files
              status: 'COMPLETED',
            },
          });
          created++;
        } catch (err) {
          console.error(`Failed to create backup record for orphaned file ${filename}:`, err);
        }
      }
    }

    // 4. Remove DB records whose files no longer exist on disk
    const diskPaths = new Set(dumpFiles.map(f => join(BACKUPS_DIR, f)));

    for (const backup of dbBackups) {
      if (!diskPaths.has(backup.filepath)) {
        try {
          await prisma.backup.delete({ where: { id: backup.id } });
          removed++;
        } catch (err) {
          console.error(`Failed to remove stale backup record ${backup.id}:`, err);
        }
      }
    }
  } catch (err) {
    console.error('Reconcile backups error:', err);
  }

  return { created, removed };
}
