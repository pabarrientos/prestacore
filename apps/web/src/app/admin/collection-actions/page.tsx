'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api';
import { Pagination } from '@/components/Pagination';

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
  const router = useRouter();
  const { token } = useAuth();
  const [actions, setActions] = useState<CollectionAction[]>([]);
  const [types, setTypes] = useState<CollectionActionType[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Search
  const [textFilter, setTextFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = useCallback((value: string) => {
    setTextFilter(value);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setSearchQuery(value);
      setPage(1);
    }, 400);
  }, []);

  const handleClearSearch = useCallback(() => {
    setTextFilter('');
    setSearchQuery('');
    setPage(1);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  // Default date ranges to current week (Monday to Sunday)
  const getCurrentWeek = () => {
    const toLocal = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { from: toLocal(monday), to: toLocal(sunday) };
  };

  const currentWeek = getCurrentWeek();

  // Filter states
  const [createdFrom, setCreatedFrom] = useState(currentWeek.from);
  const [createdTo, setCreatedTo] = useState(currentWeek.to);
  const [followUpFrom, setFollowUpFrom] = useState(currentWeek.from);
  const [followUpTo, setFollowUpTo] = useState(currentWeek.to);
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
    if (searchQuery) params.append('q', searchQuery);
    params.append('page', String(page));
    params.append('limit', '20');

    apiFetch(`/api/collection-actions?${params.toString()}`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setActions(data.data.data || []);
          setTotalPages(data.data.totalPages || 1);
        }
      })
      .catch(err => {
        console.error('Error loading collection actions:', err);
      })
      .finally(() => setLoading(false));
  }, [token, createdFrom, createdTo, followUpFrom, followUpTo, selectedVendor, selectedType, searchQuery, page]);

  const handleFilter = (e: React.FormEvent) => {
    e.preventDefault();
    // Filters are applied via useEffect, no need to do anything
  };

  const clearFilters = () => {
    // Reset to current week defaults instead of empty
    const wk = getCurrentWeek();
    setCreatedFrom(wk.from);
    setCreatedTo(wk.to);
    setFollowUpFrom(wk.from);
    setFollowUpTo(wk.to);
    setSelectedVendor('');
    setSelectedType('');
    handleClearSearch();
  };

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [createdFrom, createdTo, followUpFrom, followUpTo, selectedVendor, selectedType]);

  return (
    <div>
      <div className="mb-6">
        <button
          onClick={() => router.back()}
          className="text-primary-600 dark:text-[#39ff14] hover:text-primary-800 dark:hover:text-[#32e612]"
        >
          ← Atrás
        </button>
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

          {/* Client Search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-[#d3d3d3] mb-1">
              Buscar Cliente
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Nombre o apellido..."
                value={textFilter}
                onChange={(e) => handleSearchChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (debounceTimer.current) clearTimeout(debounceTimer.current);
                    setSearchQuery(textFilter);
                    setPage(1);
                  }
                }}
                className="w-full px-3 py-2 pr-8 min-h-[44px] border border-gray-300 dark:border-gray-600 dark:bg-[#2a2a2a] dark:text-white/[.87] rounded-lg"
              />
              {textFilter && (
                <button
                  onClick={handleClearSearch}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  aria-label="Limpiar búsqueda"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
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

      {/* Pagination arriba */}
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />

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

      {/* Pagination abajo */}
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
