'use client';

import { useState, useEffect } from 'react';
import { listBackups, createBackup, deleteBackup, downloadBackup, triggerDownload } from '@/lib/backup-api';
import type { BackupRecord } from '@/lib/backup-types';
import { RestoreDialog } from './RestoreDialog';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

const TYPE_COLORS: Record<string, string> = {
  MANUAL: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-400',
  SCHEDULED: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-400',
  UPLOADED: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-400',
};

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-400',
  FAILED: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-400',
  RESTORING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-400',
};

export function BackupListTable({ refreshKey }: { refreshKey?: number }) {
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' });

  // Restore dialog
  const [restoreId, setRestoreId] = useState<string | null>(null);

  const loadBackups = () => {
    setLoading(true);
    listBackups()
      .then(setBackups)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadBackups();
  }, [refreshKey]);

  const handleCreate = async () => {
    setCreating(true);
    setError('');
    try {
      await createBackup();
      setMessage({ type: 'success', text: 'Respaldo creado exitosamente' });
      loadBackups();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear respaldo');
    } finally {
      setCreating(false);
    }
  };

  const handleDownload = async (id: string, filename: string) => {
    try {
      const blob = await downloadBackup(id);
      triggerDownload(blob, filename);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al descargar');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este respaldo?')) return;
    setDeletingId(id);
    setError('');
    try {
      await deleteBackup(id);
      setMessage({ type: 'success', text: 'Respaldo eliminado' });
      loadBackups();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al eliminar');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6 dark:bg-[#1e1e1e]">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold dark:text-white">Respaldos Existentes</h2>
        <button
          onClick={handleCreate}
          disabled={creating}
          className="px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 disabled:opacity-50 dark:bg-[#39ff14] dark:text-black dark:hover:bg-[#32e012]"
        >
          {creating ? 'Creando...' : '+ Crear Respaldo'}
        </button>
      </div>

      {message.text && (
        <div
          className={`mb-4 p-3 rounded-lg text-sm ${
            message.type === 'success'
              ? 'bg-green-50 text-green-600 dark:bg-green-950/50 dark:text-green-400'
              : 'bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400'
          }`}
        >
          {message.text}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 dark:border-[#39ff14]" />
        </div>
      )}

      {!loading && error && (
        <div className="bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 p-4 rounded-lg mb-4">
          {error}
        </div>
      )}

      {!loading && backups.length === 0 && (
        <div className="text-center py-8">
          <p className="text-gray-500 dark:text-white/60">No hay respaldos aún.</p>
          <p className="text-sm text-gray-400 dark:text-white/40 mt-1">
            Haz clic en &quot;Crear Respaldo&quot; para hacer tu primera copia de seguridad.
          </p>
        </div>
      )}

      {!loading && backups.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 dark:text-white/40 border-b dark:border-[#333]">
                <th className="pb-3 font-medium">Archivo</th>
                <th className="pb-3 font-medium">Tamaño</th>
                <th className="pb-3 font-medium">Tipo</th>
                <th className="pb-3 font-medium">Estado</th>
                <th className="pb-3 font-medium">Fecha</th>
                <th className="pb-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {backups.map((backup) => (
                <tr
                  key={backup.id}
                  className="border-b dark:border-[#333] last:border-0"
                >
                  <td className="py-3 font-mono text-xs dark:text-white/87">
                    {backup.filename}
                  </td>
                  <td className="py-3 dark:text-white/60">
                    {formatBytes(backup.sizeBytes)}
                  </td>
                  <td className="py-3">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${
                        TYPE_COLORS[backup.type] || 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {backup.type}
                    </span>
                  </td>
                  <td className="py-3">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${
                        STATUS_COLORS[backup.status] || 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {backup.status}
                    </span>
                  </td>
                  <td className="py-3 dark:text-white/60">
                    {new Date(backup.createdAt).toLocaleString('es-AR', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </td>
                  <td className="py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => handleDownload(backup.id, backup.filename)}
                        className="px-2 py-1 text-xs border rounded hover:bg-gray-50 dark:border-[#333] dark:text-white/60 dark:hover:bg-white/5"
                      >
                        Descargar
                      </button>
                      <button
                        onClick={() => setRestoreId(backup.id)}
                        className="px-2 py-1 text-xs border border-yellow-500 text-yellow-600 rounded hover:bg-yellow-50 dark:border-yellow-500/50 dark:text-yellow-400 dark:hover:bg-yellow-900/20"
                      >
                        Restaurar
                      </button>
                      <button
                        onClick={() => handleDelete(backup.id)}
                        disabled={deletingId === backup.id}
                        className="px-2 py-1 text-xs border border-red-500 text-red-600 rounded hover:bg-red-50 disabled:opacity-50 dark:border-red-500/50 dark:text-red-400 dark:hover:bg-red-900/20"
                      >
                        {deletingId === backup.id ? '...' : 'Eliminar'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <RestoreDialog
        backupId={restoreId ?? ''}
        open={restoreId !== null}
        onClose={() => setRestoreId(null)}
        onRestored={() => {
          setMessage({ type: 'success', text: 'Restauración completada' });
          loadBackups();
        }}
      />
    </div>
  );
}