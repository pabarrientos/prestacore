'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api';
import { Pagination } from '@/components/Pagination';
import Link from 'next/link';

interface Client {
  id: string;
  dni: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  city: string | null;
  monthlyIncome: number;
  createdAt: string;
}

export default function ClientsPage() {
  const { token, user } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [textFilter, setTextFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = useCallback((value: string) => {
    setTextFilter(value);
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    debounceTimer.current = setTimeout(() => {
      setSearchQuery(value);
      setPage(1);
    }, 400);
  }, []);

  const handleClearSearch = useCallback(() => {
    setTextFilter('');
    setSearchQuery('');
    setPage(1);
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('¿Está seguro de que desea eliminar este cliente? Esta acción no se puede deshacer.')) {
      return;
    }

    setDeleting(id);
    try {
      const res = await apiFetch(`/api/clients/${id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        if (clients.length === 1 && page > 1) {
          setPage(p => p - 1);
        } else {
          setClients(clients.filter(c => c.id !== id));
        }
      } else {
        alert(data.error || 'Error al eliminar el cliente');
      }
    } catch (err) {
      alert('Error al eliminar el cliente');
    } finally {
      setDeleting(null);
    }
  };

  useEffect(() => {
    if (token) {
      setLoading(true);
      setError('');
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '20');
      if (searchQuery) {
        params.set('q', searchQuery);
      }
      apiFetch(`/api/clients?${params.toString()}`)
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setClients(data.data.data || []);
            setTotal(data.data.total || 0);
            setTotalPages(data.data.totalPages || 1);
          } else {
            setError(data.error || 'Error al cargar los clientes');
          }
        })
        .catch(err => {
          console.error(err);
          setError('Error al cargar los clientes');
        })
        .finally(() => setLoading(false));
    }
  }, [token, page, searchQuery]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 dark:bg-[#121212]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 dark:border-[#39ff14]"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold dark:text-white/[.87]">Clientes</h1>
        {(user?.role === 'ADMIN' || user?.role === 'VENDEDOR') && (
          <Link
            href="/admin/clients/new"
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 dark:bg-[#39ff14] dark:text-black dark:hover:bg-[#32e012] dark:hover:shadow-[0_0_15px_rgba(57,255,20,0.4)] transition min-h-[44px]"
          >
            Nuevo Cliente
          </Link>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg dark:bg-red-900/20 dark:border-red-800">
          <div className="flex items-center justify-between">
            <span className="text-red-700 dark:text-red-400">{error}</span>
            <button
              onClick={() => {
                setError('');
                setPage(1);
              }}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600"
            >
              Reintentar
            </button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="mb-4">
        <div className="relative w-full md:w-80">
          <input
            type="text"
            placeholder="Buscar por DNI, nombre, apellido o email..."
            value={textFilter}
            onChange={(e) => handleSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (debounceTimer.current) clearTimeout(debounceTimer.current);
                setSearchQuery(textFilter);
                setPage(1);
              }
            }}
            className="w-full px-4 py-2 pr-10 border rounded-lg min-h-[44px] dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14]"
          />
          {textFilter && (
            <button
              onClick={handleClearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              aria-label="Limpiar búsqueda"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Total count */}
      {!error && (
        <p className="mb-4 text-sm text-gray-600 dark:text-white/60">
          Mostrando {clients.length} de {total} clientes
        </p>
      )}

      {/* Pagination above table */}
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden dark:bg-[#1e1e1e]">
        <div className="overflow-x-auto -mx-4 sm:mx-0">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-[#1a1a1a]">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-white/60">
                DNI
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-white/60">
                Nombre
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-white/60">
                Email
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-white/60">
                Teléfono
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-white/60">
                Ciudad
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-white/60">
                Ingreso Mensual
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-white/60">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200 dark:bg-[#1e1e1e] dark:divide-gray-700">
            {clients.map((client) => (
              <tr key={client.id} className="dark:hover:bg-white/10">
                <td className="px-6 py-4 whitespace-nowrap dark:text-white/[.87]">{client.dni}</td>
                <td className="px-6 py-4 whitespace-nowrap dark:text-white/[.87]">
                  {client.firstName} {client.lastName}
                </td>
                <td className="px-6 py-4 whitespace-nowrap dark:text-white/[.87]">{client.email}</td>
                <td className="px-6 py-4 whitespace-nowrap dark:text-white/[.87]">{client.phone || '-'}</td>
                <td className="px-6 py-4 whitespace-nowrap dark:text-white/[.87]">{client.city || '-'}</td>
                <td className="px-6 py-4 whitespace-nowrap dark:text-white/[.87]">
                  ${client.monthlyIncome.toLocaleString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex flex-wrap gap-1.5">
                    <a
                      href={`/admin/loans/new?clientId=${client.id}`}
                      className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50"
                    >
                      Crear Préstamo
                    </a>
                    {user?.role === 'ADMIN' && (
                      <>
                        <a
                          href={`/admin/clients/${client.id}`}
                          className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50"
                        >
                          Editar
                        </a>
                        <button
                          onClick={() => handleDelete(client.id)}
                          disabled={deleting === client.id}
                          className="px-2 py-1 text-xs font-medium bg-red-100 text-red-700 rounded hover:bg-red-200 disabled:opacity-50 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
                        >
                          {deleting === client.id ? 'Eliminando...' : 'Eliminar'}
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>

        {clients.length === 0 && !error && (
          <p className="p-4 text-center text-gray-500 dark:text-white/60">No hay clientes</p>
        )}
      </div>

      {/* Pagination below table */}
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
