'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface CollectionActionType {
  code: string;
  label: string;
}

interface CollectionActionsModalProps {
  loanId: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export default function CollectionActionsModal({ loanId, onSuccess, onCancel }: CollectionActionsModalProps) {
  const { token } = useAuth();
  const [types, setTypes] = useState<CollectionActionType[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [selectedType, setSelectedType] = useState('');
  const [description, setDescription] = useState('');
  const [result, setResult] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [error, setError] = useState('');

  // Fetch types from settings
  useEffect(() => {
    fetch(`${API_URL}/api/settings/collection-action-types`)
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data.types) {
          setTypes(data.data.types);
        }
      })
      .catch(err => console.error('Error loading types:', err))
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedType || !description.trim()) {
      setError('Tipo y descripción son requeridos');
      return;
    }

    setFormLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_URL}/api/collection-actions/${loanId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          type: selectedType,
          description: description.trim(),
          result: result.trim() || undefined,
          nextAction: nextAction.trim() || undefined,
          followUpDate: followUpDate || undefined,
        }),
      });

      const data = await res.json();

      if (data.success) {
        onSuccess?.();
      } else {
        setError(data.error || 'Error al crear la acción');
      }
    } catch (err) {
      console.error('Error creating collection action:', err);
      setError('Error al conectar con el servidor');
    } finally {
      setFormLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 dark:border-[#39ff14]"></div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/50 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Type Select */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-white/87 mb-1">
          Tipo de Acción *
        </label>
        <select
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md dark:bg-[#2a2a2a] dark:border-[#444444] dark:text-white/[.87] focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          required
        >
          <option value="">Seleccionar tipo...</option>
          {types.map(type => (
            <option key={type.code} value={type.code}>
              {type.label}
            </option>
          ))}
        </select>
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-white/87 mb-1">
          Descripción *
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-md dark:bg-[#2a2a2a] dark:border-[#444444] dark:text-white/[.87] focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          placeholder="Describe la acción realizada..."
          required
        />
      </div>

      {/* Result */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-white/87 mb-1">
          Resultado
        </label>
        <input
          type="text"
          value={result}
          onChange={(e) => setResult(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md dark:bg-[#2a2a2a] dark:border-[#444444] dark:text-white/[.87] focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          placeholder="Resultado de la gestión"
        />
      </div>

      {/* Next Action */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-white/87 mb-1">
          Próxima Acción
        </label>
        <select
          value={nextAction}
          onChange={(e) => setNextAction(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md dark:bg-[#2a2a2a] dark:border-[#444444] dark:text-white/[.87] focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        >
          <option value="">Sin acción siguiente</option>
          {types.map(type => (
            <option key={type.code} value={type.code}>
              {type.label}
            </option>
          ))}
        </select>
      </div>

      {/* Follow Up Date */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-white/87 mb-1">
          Fecha de Seguimiento
        </label>
        <input
          type="date"
          value={followUpDate}
          onChange={(e) => setFollowUpDate(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md dark:bg-[#2a2a2a] dark:border-[#444444] dark:text-white/[.87] focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
      </div>

      {/* Submit */}
      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm text-gray-600 dark:text-white/60 hover:text-gray-800 dark:hover:text-white"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={formLoading}
          className="px-4 py-2 min-h-[44px] text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 dark:bg-[#39ff14] dark:text-black dark:hover:bg-[#32e612]"
        >
          {formLoading ? 'Guardando...' : 'Guardar Acción'}
        </button>
      </div>
    </form>
  );
}
