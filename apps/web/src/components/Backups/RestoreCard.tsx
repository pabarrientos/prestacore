'use client';

import { useState, useRef } from 'react';
import { uploadBackup, previewBackup } from '@/lib/backup-api';
import type { RestorePreview } from '@/lib/backup-types';
import { RestoreDialog } from './RestoreDialog';

export function RestoreCard() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadedId, setUploadedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<RestorePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setError('');
      setMessage({ type: '', text: '' });
      setUploadedId(null);
      setPreview(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError('');
    setMessage({ type: '', text: '' });
    try {
      const record = await uploadBackup(file);
      setUploadedId(record.id);
      setMessage({ type: 'success', text: 'Archivo subido. Cargando vista previa...' });
      // Auto-preview after upload
      setPreviewLoading(true);
      previewBackup(record.id)
        .then(setPreview)
        .catch((e: Error) => setError(e.message))
        .finally(() => setPreviewLoading(false));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al subir archivo');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6 dark:bg-[#1e1e1e]">
      <h2 className="text-lg font-semibold mb-4 dark:text-white">
        Restaurar desde Archivo Externo
      </h2>

      <p className="text-sm text-gray-500 dark:text-white/60 mb-4">
        Subí un archivo de respaldo (.sql, .dump, .tar) para restaurar la base de datos.
      </p>

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

      {error && (
        <div className="mb-4 p-3 rounded-lg text-sm bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400">
          {error}
        </div>
      )}

      {/* File input */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-white/60">
          Archivo de respaldo
        </label>
        <input
          ref={fileInputRef}
          type="file"
          accept=".sql,.dump,.tar"
          onChange={handleFileChange}
          className="block w-full text-sm text-gray-500 dark:text-white/60
            file:mr-4 file:py-2 file:px-4
            file:rounded-lg file:border-0
            file:text-sm file:font-semibold
            file:bg-primary-50 file:text-primary-700
            dark:file:bg-[#2a2a2a] dark:file:text-[#39ff14]
            hover:file:bg-primary-100"
        />
        <p className="text-xs text-gray-400 dark:text-white/40 mt-1">
          Acepta archivos .sql, .dump, .tar
        </p>
      </div>

      {file && !uploadedId && (
        <button
          onClick={handleUpload}
          disabled={uploading}
          className="w-full px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 dark:bg-[#39ff14] dark:text-black dark:hover:bg-[#32e012]"
        >
          {uploading ? 'Subiendo...' : 'Subir y Previsualizar'}
        </button>
      )}

      {/* Preview */}
      {previewLoading && (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 dark:border-[#39ff14]" />
        </div>
      )}

      {preview && (
        <div className="mt-4">
          <h3 className="text-sm font-medium text-gray-700 dark:text-white/60 mb-2">
            Previsualización del Respaldo
          </h3>
          <div className="bg-gray-50 dark:bg-[#2a2a2a] rounded-lg p-3 max-h-40 overflow-y-auto mb-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 dark:text-white/40">
                  <th className="pb-2">Tabla</th>
                  <th className="pb-2 text-right">Filas</th>
                </tr>
              </thead>
              <tbody>
                {preview.tables.map((t) => (
                  <tr key={t.name} className="border-t dark:border-[#333]">
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
          <p className="text-xs text-gray-500 dark:text-white/40 mb-3">
            {preview.totalTables} tablas,{' '}
            {preview.tables.reduce((sum, t) => sum + t.rowCount, 0).toLocaleString()} filas
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => {
                setFile(null);
                setUploadedId(null);
                setPreview(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
              className="flex-1 px-4 py-2 border rounded-lg dark:border-[#333] dark:text-white/87 hover:bg-gray-50 dark:hover:bg-white/5"
            >
              Cancelar
            </button>
            <RestoreFromUploadButton backupId={uploadedId!} />
          </div>
        </div>
      )}
    </div>
  );
}

function RestoreFromUploadButton({ backupId }: { backupId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700"
      >
        Restaurar
      </button>
      {open && (
        <RestoreDialogWrapper backupId={backupId} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function RestoreDialogWrapper({
  backupId,
  onClose,
}: {
  backupId: string;
  onClose: () => void;
}) {
  return (
    <RestoreDialog
      backupId={backupId}
      open={true}
      onClose={onClose}
      onRestored={() => {
        alert('Restauración completada');
      }}
    />
  );
}