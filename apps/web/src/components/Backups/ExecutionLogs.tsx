'use client';

import { useState, useEffect } from 'react';
import { getExecutionLogs, deleteExecutionLog, deleteAllExecutionLogs } from '@/lib/backup-api';
import type { BackupExecutionLog } from '@/lib/backup-types';

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  SCHEDULED: { label: 'Programado', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-400' },
  MANUAL: { label: 'Manual', color: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-400' },
  RETENTION: { label: 'Retención', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-400' },
};

const STATUS_COLORS: Record<string, string> = {
  SUCCESS: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-400',
  FAILED: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-400',
};

function formatDuration(ms: number | null | undefined): string {
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

export function ExecutionLogs() {
  const [logs, setLogs] = useState<BackupExecutionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  const loadLogs = () => {
    setLoading(true);
    getExecutionLogs(50)
      .then(setLogs)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este registro?')) return;
    setDeletingId(id);
    setError('');
    try {
      await deleteExecutionLog(id);
      loadLogs();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al eliminar');
    } finally {
      setDeletingId(null);
    }
  };

  const handleClearAll = async () => {
    if (!confirm('¿Eliminar TODOS los registros del historial?')) return;
    setClearing(true);
    setError('');
    try {
      const result = await deleteAllExecutionLogs();
      alert(`Se eliminaron ${result.deleted} registro(s)`);
      loadLogs();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al eliminar');
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6 dark:bg-[#1e1e1e]">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold dark:text-white">
          Historial de Ejecuciones
        </h2>
        <div className="flex gap-2">
          <button
            onClick={loadLogs}
            className="px-3 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
          >
            Actualizar
          </button>
          {logs.length > 0 && (
            <button
              onClick={handleClearAll}
              disabled={clearing}
              className="px-3 py-1 text-xs font-medium bg-red-100 text-red-700 rounded hover:bg-red-200 disabled:opacity-50 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
            >
              {clearing ? 'Eliminando...' : 'Limpiar Todo'}
            </button>
          )}
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center h-24">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600 dark:border-[#39ff14]" />
        </div>
      )}

      {!loading && error && (
        <div className="bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 p-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {!loading && !error && logs.length === 0 && (
        <p className="text-gray-500 dark:text-white/60 text-sm text-center py-4">
          No hay registros de ejecuciones aún.
        </p>
      )}

      {!loading && !error && logs.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 dark:text-white/40 border-b dark:border-[#333]">
                <th className="pb-2 font-medium">Fecha</th>
                <th className="pb-2 font-medium">Tipo</th>
                <th className="pb-2 font-medium">Estado</th>
                <th className="pb-2 font-medium">Duración</th>
                <th className="pb-2 font-medium">Mensaje</th>
                <th className="pb-2 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const typeInfo = TYPE_LABELS[log.type] || {
                  label: log.type,
                  color: 'bg-gray-100 text-gray-600',
                };
                return (
                  <tr
                    key={log.id}
                    className="border-b dark:border-[#333] last:border-0"
                  >
                    <td className="py-2 dark:text-white/60 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString('es-AR', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </td>
                    <td className="py-2">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${typeInfo.color}`}
                      >
                        {typeInfo.label}
                      </span>
                    </td>
                    <td className="py-2">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                          STATUS_COLORS[log.status] || 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {log.status === 'SUCCESS' ? 'Éxito' : 'Error'}
                      </span>
                    </td>
                    <td className="py-2 dark:text-white/60 whitespace-nowrap">
                      {formatDuration(log.durationMs)}
                    </td>
                    <td className="py-2 dark:text-white/60 text-xs truncate max-w-xs">
                      {log.message || '-'}
                    </td>
                    <td className="py-2 text-right">
                      <button
                        onClick={() => handleDelete(log.id)}
                        disabled={deletingId === log.id}
                        className="px-2 py-1 text-xs font-medium bg-red-100 text-red-700 rounded hover:bg-red-200 disabled:opacity-50 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
                      >
                        {deletingId === log.id ? '...' : 'Eliminar'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
