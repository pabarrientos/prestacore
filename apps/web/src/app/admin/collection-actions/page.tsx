'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
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
  nextActionLabel?: string;
  followUpDate?: string;
  createdAt: string;
  createdBy?: string;
  loan?: {
    id: string;
    amount: number;
    status: string;
  };
  client?: {
    id: string;
    name: string;
    phone?: string;
    dni: string;
  };
}

interface Vendor {
  id: string;
  firstName: string;
  lastName: string;
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
  const datePart = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr.split(' ')[0];
  const [year, month, day] = datePart.split('-');
  return `${day}/${month}/${year}`;
}

function isOverdue(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  const today = new Date().toISOString().split('T')[0];
  return dateStr < today;
}

export default function CollectionActionsPage() {
  const { token } = useAuth();
  const [actions, setActions] = useState<CollectionAction[]>([]);
  const [types, setTypes] = useState<CollectionActionType[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter states
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  const [followUpFrom, setFollowUpFrom] = useState('');
  const [followUpTo, setFollowUpTo] = useState('');
  const [selectedVendor, setSelectedVendor] = useState('');
  const [selectedType, setSelectedType] = useState('');

  // Fetch types and vendors on mount
  useEffect(() => {
    // Fetch types
    apiFetch('/api/settings/collection-action-types')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data.types) {
          setTypes(data.data.types);
        }
      })
      .catch(err => console.error('Error loading types:', err));

    // Fetch vendors
    if (token) {
      apiFetch('/api/users/vendors')
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setVendors(data.data);
          }
        })
        .catch(err => console.error('Error loading vendors:', err));
    }
  }, [token]);

  // Fetch actions
  useEffect(() => {
    if (!token) return;

    setLoading(true);
    const params = new URLSearchParams();
    if (createdFrom) params.append('createdFrom', createdFrom);
    if (createdTo) params.append('createdTo', createdTo);
    if (followUpFrom) params.append('followUpFrom', followUpFrom);
    if (followUpTo) params.append('followUpTo', followUpTo);
    if (selectedVendor) params.append('createdBy', selectedVendor);
    if (selectedType) params.append('type', selectedType);

    apiFetch(`/api/collection-actions?${params.toString()}`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setActions(data.data);
        }
      })
      .catch(err => {
        console.error('Error loading collection actions:', err);
      })
      .finally(() => setLoading(false));
  }, [token, createdFrom, createdTo, followUpFrom, followUpTo, selectedVendor, selectedType]);

  const handleFilter = (e: React.FormEvent) => {
    e.preventDefault();
    // Filters are applied via useEffect, no need to do anything
  };

  const clearFilters = () => {
    setCreatedFrom('');
    setCreatedTo('');
    setFollowUpFrom('');
    setFollowUpTo('');
    setSelectedVendor('');
    setSelectedType('');
  };

  return (
    <div>
      <div className="mb-6">
        <Link href="/admin" className="text-primary-600 dark:text-[#39ff14] hover:text-primary-800 dark:hover:text-[#32e612]">
          ← Volver al Dashboard
        </Link>
        <h1 className="text-2xl font-bold mt-2 dark:text-white/[.87]">Agenda de Cobranzas</h1>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-[#1e1e1e] rounded-lg shadow p-4 mb-6">
        <form onSubmit={handleFilter} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Created Date Range */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-[#d3d3d3] mb-1">
              Fecha Creación (Desde)
            </label>
            <input
              type="date"
              value={createdFrom}
              onChange={(e) => setCreatedFrom(e.target.value)}
              className="w-full px-3 py-2 min-h-[44px] border border-gray-300 dark:border-gray-600 dark:bg-[#2a2a2a] dark:text-white/[.87] rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-[#d3d3d3] mb-1">
              Fecha Creación (Hasta)
            </label>
            <input
              type="date"
              value={createdTo}
              onChange={(e) => setCreatedTo(e.target.value)}
              className="w-full px-3 py-2 min-h-[44px] border border-gray-300 dark:border-gray-600 dark:bg-[#2a2a2a] dark:text-white/[.87] rounded-lg"
            />
          </div>

          {/* Follow-up Date Range */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-[#d3d3d3] mb-1">
              Fecha Seguimiento (Desde)
            </label>
            <input
              type="date"
              value={followUpFrom}
              onChange={(e) => setFollowUpFrom(e.target.value)}
              className="w-full px-3 py-2 min-h-[44px] border border-gray-300 dark:border-gray-600 dark:bg-[#2a2a2a] dark:text-white/[.87] rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-[#d3d3d3] mb-1">
              Fecha Seguimiento (Hasta)
            </label>
            <input
              type="date"
              value={followUpTo}
              onChange={(e) => setFollowUpTo(e.target.value)}
              className="w-full px-3 py-2 min-h-[44px] border border-gray-300 dark:border-gray-600 dark:bg-[#2a2a2a] dark:text-white/[.87] rounded-lg"
            />
          </div>

          {/* Vendor Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-[#d3d3d3] mb-1">
              Vendedor
            </label>
            <select
              value={selectedVendor}
              onChange={(e) => setSelectedVendor(e.target.value)}
              className="w-full px-3 py-2 min-h-[44px] border border-gray-300 dark:border-gray-600 dark:bg-[#2a2a2a] dark:text-white/[.87] rounded-lg"
            >
              <option value="">Todos</option>
              {vendors.map(v => (
                <option key={v.id} value={v.id}>
                  {v.firstName} {v.lastName}
                </option>
              ))}
            </select>
          </div>

          {/* Type Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-[#d3d3d3] mb-1">
              Tipo de Acción
            </label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="w-full px-3 py-2 min-h-[44px] border border-gray-300 dark:border-gray-600 dark:bg-[#2a2a2a] dark:text-white/[.87] rounded-lg"
            >
              <option value="">Todos</option>
              {types.map(t => (
                <option key={t.code} value={t.code}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Clear Filters */}
          <div className="flex items-end">
            <button
              type="button"
              onClick={clearFilters}
              className="px-4 py-2 min-h-[44px] border border-gray-300 dark:border-gray-600 dark:text-[#d3d3d3] rounded-lg hover:bg-gray-50 dark:hover:bg-[#2a2a2a]"
            >
              Limpiar Filtros
            </button>
          </div>
        </form>
      </div>

      {/* Actions Table */}
      <div className="bg-white dark:bg-[#1e1e1e] rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 dark:border-[#39ff14]"></div>
          </div>
        ) : actions.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-gray-500 dark:text-white/60">
              No hay acciones de cobranza para los filtros seleccionados.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-[#2a2a2a]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-white/38 uppercase">
                    Cliente
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-white/38 uppercase">
                    Préstamo
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-white/38 uppercase">
                    Tipo
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-white/38 uppercase">
                    Descripción
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-white/38 uppercase">
                    Resultado
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-white/38 uppercase">
                    Próxima Acción
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-white/38 uppercase">
                    Fecha Seg.
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-white/38 uppercase">
                    Creación
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {actions.map((action) => {
                  const colorClasses = TYPE_COLORS[action.type] || TYPE_COLORS.CALL;
                  const overdue = isOverdue(action.followUpDate);
                  return (
                    <tr key={action.id} className="hover:bg-gray-50 dark:hover:bg-[#2a2a2a]">
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium dark:text-white/[.87]">
                            {action.client?.name || '-'}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-white/38">
                            {action.client?.phone || action.client?.dni || ''}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {action.loan ? (
                          <Link
                            href={`/admin/loans/${action.loan.id}`}
                            className="text-primary-600 dark:text-[#39ff14] hover:underline"
                          >
                            ${Number(action.loan.amount).toLocaleString()}
                          </Link>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${colorClasses.light} ${colorClasses.dark}`}>
                          {action.typeLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm dark:text-white/[.87] max-w-xs truncate" title={action.description}>
                          {action.description}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm dark:text-white/[.87]">
                          {action.result || '-'}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        {action.nextAction && action.nextActionLabel ? (
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${TYPE_COLORS[action.nextAction]?.light || ''} ${TYPE_COLORS[action.nextAction]?.dark || ''}`}>
                            {action.nextActionLabel}
                          </span>
                        ) : (
                          <span className="text-gray-400 dark:text-white/38">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {action.followUpDate ? (
                          <span className={`text-sm ${overdue ? 'text-red-600 dark:text-red-400 font-medium' : 'dark:text-white/[.87]'}`}>
                            {formatDate(action.followUpDate)}
                            {overdue && ' (vencida)'}
                          </span>
                        ) : (
                          <span className="text-gray-400 dark:text-white/38">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm dark:text-white/[.87]">
                          {formatDate(action.createdAt)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
