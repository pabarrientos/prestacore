import { apiFetch } from './api';
import type {
  BackupRecord,
  BackupSchedule,
  RetentionConfig,
  RestorePreview,
} from './backup-types';

// List all backups
export async function listBackups(): Promise<BackupRecord[]> {
  const res = await apiFetch('/api/backups');
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}

// Create a manual backup
export async function createBackup(): Promise<BackupRecord> {
  const res = await apiFetch('/api/backups', { method: 'POST' });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}

// Download a backup file (returns blob)
export async function downloadBackup(id: string): Promise<Blob> {
  const res = await apiFetch(`/api/backups/${id}/download`);
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Download failed');
  }
  return res.blob();
}

// Delete a backup
export async function deleteBackup(id: string): Promise<void> {
  const res = await apiFetch(`/api/backups/${id}`, { method: 'DELETE' });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
}

// Upload external backup for restore
export async function uploadBackup(file: File): Promise<BackupRecord> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await apiFetch('/api/backups/upload', {
    method: 'POST',
    body: formData,
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}

// Preview a backup before restore
export async function previewBackup(id: string): Promise<RestorePreview> {
  const res = await apiFetch(`/api/backups/preview/${id}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}

// Execute restore
export async function restoreBackup(id: string, confirm: true): Promise<void> {
  const res = await apiFetch(`/api/backups/${id}/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirm }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
}

// Get schedule config
export async function getSchedule(): Promise<BackupSchedule | null> {
  const res = await apiFetch('/api/backups/schedule');
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}

// Update schedule config (also stores retention)
export async function updateSchedule(
  schedule: BackupSchedule,
  retention?: RetentionConfig
): Promise<void> {
  const body: Record<string, unknown> = { ...schedule };
  if (retention) {
    body.retention = retention;
  }
  const res = await apiFetch('/api/backups/schedule', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
}

// Trigger download in browser
export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}