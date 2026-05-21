'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api';

interface CollectionActionType {
  code: string;
  label: string;
}

interface CollectionAction {
  id: string;
  type: string;
  typeLabel: string;
  description: string;
  result?: string;
  nextAction?: string;
  followUpDate?: string;
  createdAt: string;
  createdBy?: string;
}

interface CollectionActionsPanelProps {
  loanId: string;
}

const TYPE_COLORS: Record<string, { light: string; dark: string }> = {
  CALL: { light: 'bg-blue-100 text-blue-800', dark: 'dark:bg-blue-900/50 dark:text-blue-400' },
  VISIT: { light: 'bg-green-100 text-green-800', dark: 'dark:bg-green-900/50 dark:text-green-400' },
  AGREEMENT: { light: 'bg-purple-100 text-purple-800', dark: 'dark:bg-purple-900/50 dark:text-purple-400' },
  REFINANCING: { light: 'bg-orange-100 text-orange-800', dark: 'dark:bg-orange-900/50 dark:text-orange-400' },
  LEGAL: { light: 'bg-red-100 text-red-800', dark: 'dark:bg-red-900/50 dark:text-red-400' },
  PROMISE: { light: 'bg-yellow-100 text-yellow-800', dark: 'dark:bg-yellow-900/50 dark:text-yellow-400' },
};

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  const datePart = dateStr.split('T')[0];
  const [year, month, day] = datePart.split('-');
  return `${day}/${month}/${year}`;
}

export default function CollectionActionsPanel({ loanId }: CollectionActionsPanelProps) {
  const { user } = useAuth();
  const [actions, setActions] = useState<CollectionAction[]>([]);
  const [types, setTypes] = useState<CollectionActionType[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [selectedType, setSelectedType] = useState('');
  const [description, setDescription] = useState('');
  const [result, setResult] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');

  // Fetch types from settings
  useEffect(() => {
    apiFetch('/api/settings/collection-action-types')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data.types) {
          setTypes(data.data.types);
        }
      })
      .catch(err => console.error('Error loading types:', err));
  }, []);

  // Fetch collection actions
  useEffect(() => {
    apiFetch(`/api/collection-actions/${loanId}`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setActions(data.data);
        } else {
          console.error('Error loading collection actions:', data.error);
        }
      })
      .catch(err => {
        console.error('Error loading collection actions:', err);
      })
      .finally(() => setLoading(false));
  }, [loanId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedType || !description.trim()) {
      setFormError('Type and description are required');
      return;
    }

    setFormLoading(true);
    setFormError('');

    try {
      const res = await apiFetch(`/api/collection-actions/${loanId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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
        // Add new action to list
        setActions([data.data, ...actions]);
        // Reset form
        setSelectedType('');
        setDescription('');
        setResult('');
        setNextAction('');
        setFollowUpDate('');
        setShowForm(false);
      } else {
        setFormError(data.error || 'Error creating collection action');
      }
    } catch (err) {
      console.error('Error creating collection action:', err);
      setFormError('Error connecting to server');
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (actionId: string) => {
    if (!confirm('¿Estás seguro de eliminar esta acción?')) return;

    try {
      const res = await apiFetch(`/api/collection-actions/${actionId}`, {
        method: 'DELETE',
      });

      const data = await res.json();

      if (data.success) {
        setActions(actions.filter(a => a.id !== actionId));
      } else {
        alert(data.error || 'Error deleting collection action');
      }
    } catch (err) {
      console.error('Error deleting collection action:', err);
      alert('Error connecting to server');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32 dark:bg-[#1e1e1e]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 dark:border-[#39ff14]"></div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-[#1e1e1e] rounded-lg shadow overflow-hidden">
      <div className="p-4 border-b dark:border-gray-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h2 className="text-lg font-semibold dark:text-white/[.87]">Acciones de Cobranza</h2>
        {(user?.role === 'ADMIN' || user?.role === 'VENDEDOR') && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-3 py-2 min-h-[44px] text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 dark:bg-[#39ff14] dark:text-black dark:hover:bg-[#32e612]"
          >
            {showForm ? 'Cancelar' : '+ Nueva Acción'}
          </button>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <div className="p-4 border-b dark:border-gray-700 bg-gray-50 dark:bg-[#2a2a2a]">
          <form onSubmit={handleSubmit} className="space-y-4">
            {formError && (
              <div className="p-3 bg-red-50 dark:bg-red-900/50 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded-lg text-sm">
                {formError}
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
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm text-gray-600 dark:text-white/60 hover:text-gray-800 dark:hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={formLoading}
                className="px-4 py-2 min-h-[44px] text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 dark:bg-[#39ff14] dark:text-black dark:hover:bg-[#32e612]"
              >
                {formLoading ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Empty State */}
      {actions.length === 0 && !showForm && (
        <div className="p-8 text-center">
          <p className="text-gray-500 dark:text-white/60">
            No hay acciones de cobranza registradas.
          </p>
          {types.length === 0 && (
            <p className="text-gray-400 dark:text-white/40 text-sm mt-1">
              Los tipos de acción deben ser configurados por un administrador.
            </p>
          )}
        </div>
      )}

      {/* Actions List */}
      {actions.length > 0 && (
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {actions.map((action) => {
            const colorClasses = TYPE_COLORS[action.type] || TYPE_COLORS.CALL;
            return (
              <div key={action.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${colorClasses.light} ${colorClasses.dark}`}>
                        {action.typeLabel || action.type}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-white/60">
                        {formatDate(action.createdAt)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-900 dark:text-white/[.87] mb-1">
                      {action.description}
                    </p>
                    {action.result && (
                      <p className="text-xs text-gray-600 dark:text-white/60">
                        <span className="font-medium">Resultado:</span> {action.result}
                      </p>
                    )}
                    {action.nextAction && (
                      <p className="text-xs text-gray-600 dark:text-white/60">
                        <span className="font-medium">Próxima acción:</span> {action.nextAction}
                      </p>
                    )}
                    {action.followUpDate && (
                      <p className="text-xs text-gray-600 dark:text-white/60">
                        <span className="font-medium">Seguimiento:</span> {formatDate(action.followUpDate)}
                      </p>
                    )}
                  </div>
                  {user?.role === 'ADMIN' && (
                    <button
                      onClick={() => handleDelete(action.id)}
                      className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 text-sm px-2 py-1"
                    >
                      Eliminar
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
