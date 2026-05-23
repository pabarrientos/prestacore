'use client';

import { useState, useEffect } from 'react';
import { previewBackup, restoreBackup } from '@/lib/backup-api';
import type { RestorePreview } from '@/lib/backup-types';

interface RestoreDialogProps {
  backupId: string;
  open: boolean;
  onClose: () => void;
  onRestored?: () => void;
}

export function RestoreDialog({
  backupId,
  open,
  onClose,
  onRestored,
}: RestoreDialogProps) {
  const [preview, setPreview] = useState<RestorePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    if (!open || !backupId) return;
    setError('');
    setConfirmed(false);
    setRestoring(false);
    setLoading(true);
    previewBackup(backupId)
      .then(setPreview)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [open, backupId]);

  const handleRestore = async () => {
    if (!confirmed) return;
    setRestoring(true);
    setError('');
    try {
      await restoreBackup(backupId, true);
      onRestored?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Restore failed');
    } finally {
      setRestoring(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-[#1e1e1e] rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
        <div className="p-6 border-b dark:border-[#333]">
          <h3 className="text-lg font-semibold dark:text-white">
            Restaurar Respaldo
          </h3>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {loading && (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 dark:border-[#39ff14]" />
            </div>
          )}

          {error && !loading && (
            <div className="bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 p-4 rounded-lg">
              {error}
            </div>
          )}

          {!loading && preview && (
            <>
              <div className="mb-4">
                <p className="text-sm text-gray-600 dark:text-white/60 mb-2">
                  Este respaldo contiene las siguientes tablas y filas:
                </p>
                <div className="bg-gray-50 dark:bg-[#2a2a2a] rounded-lg p-3 max-h-48 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 dark:text-white/40">
                        <th className="pb-2">Tabla</th>
                        <th className="pb-2 text-right">Filas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.tables.map((t) => (
                        <tr
                          key={t.name}
                          className="border-t dark:border-[#333]"
                        >
                          <td className="py-1.5 font-mono text-xs dark:text-white/87">
                            {t.name}
                          </td>
                          <td className="py-1.5 text-right dark:text-white/60">
                            {t.rowCount.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-gray-500 dark:text-white/40 mt-2">
                  {preview.totalTables} tablas,{' '}
                  {preview.tables.reduce((sum, t) => sum + t.rowCount, 0).toLocaleString()} filas en total
                </p>
              </div>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="mt-1 rounded border-gray-300 dark:border-[#333] text-primary-600 focus:ring-primary-600 dark:bg-[#2a2a2a]"
                />
                <span className="text-sm text-gray-700 dark:text-white/87">
                  Entiendo que esto sobreescribirá <strong>todos los datos actuales</strong> con la información de este respaldo.
                </span>
              </label>
            </>
          )}
        </div>

        <div className="p-6 border-t dark:border-[#333] flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border rounded-lg dark:border-[#333] dark:text-white/87 hover:bg-gray-50 dark:hover:bg-white/5"
          >
            Cancelar
          </button>
          <button
            onClick={handleRestore}
            disabled={!confirmed || restoring || loading}
            className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 dark:bg-red-600 dark:hover:bg-red-700"
          >
            {restoring ? 'Restaurando...' : 'Restaurar'}
          </button>
        </div>
      </div>
    </div>
  );
}