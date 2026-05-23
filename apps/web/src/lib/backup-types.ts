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
