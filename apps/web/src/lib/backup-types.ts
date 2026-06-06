// Backup types — duplicated from @prestamos/shared to avoid workspace resolution issues in Docker builds

export interface BackupRecord {
  id: string;
  filename: string;
  sizeBytes: number;
  type: 'MANUAL' | 'SCHEDULED' | 'UPLOADED';
  status: 'COMPLETED' | 'FAILED' | 'RESTORING';
  checksum?: string;
  tablesMeta?: TableMeta[];
  error?: string;
  createdAt: string;
}

export interface TableMeta {
  name: string;
  rowCount: number;
}

export interface BackupSchedule {
  enabled: boolean;
  frequency: 'daily' | 'weekly' | 'monthly';
  hour: number;
  minute: number;
  dayOfWeek?: number;
  dayOfMonth?: number;
}

export interface RetentionConfig {
  maxCount?: number;
  maxAgeDays?: number;
}

export interface RestorePreview {
  tables: TableMeta[];
  totalTables: number;
  fileSizeBytes: number;
}

export interface BackupExecutionLog {
  id: string;
  type: 'SCHEDULED' | 'MANUAL' | 'RETENTION';
  status: 'SUCCESS' | 'FAILED';
  message?: string;
  durationMs?: number;
  backupId?: string;
  createdAt: string;
}

export interface EnforceRetentionResult {
  deleted: number;
  ids: string[];
}
