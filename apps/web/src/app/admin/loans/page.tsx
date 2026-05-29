'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api';

interface Loan {
  id: string;
  amount: number;
  interestRate: number;
  termMonths: number;
  frequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
  status: string;
  totalPayment: number;
  installmentAmount: number;
  createdAt: string;
  client: {
    user: {
      firstName: string;
      lastName: string;
    };
  };
  assignedVendor: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
}

const frequencyLabels: Record<string, { rate: string; plural: string }> = {
  WEEKLY: { rate: 'semanal', plural: 'semanas' },
  BIWEEKLY: { rate: 'quincenal', plural: 'quincenas' },
  MONTHLY: { rate: 'mensual', plural: 'meses' },
  DAILY: { rate: 'diario', plural: 'días' },
};

function getPeriodicRate(annualRate: number, frequency: string): number {
  switch (frequency) {
    case 'WEEKLY':
      return Math.round((annualRate / 48) * 100) / 100;
    case 'BIWEEKLY':
      return Math.round((annualRate / 24) * 100) / 100;
    case 'DAILY':
      return Math.round((annualRate / 360) * 100) / 100;
    default:
      return Math.round((annualRate / 12) * 100) / 100;
  }
}

const statusColors: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  ACTIVE: 'bg-green-100 text-green-800',
  PAID: 'bg-blue-100 text-blue-800',
  DEFAULTED: 'bg-red-100 text-red-800',
  CANCELLED: 'bg-gray-100 text-gray-800',
};

export default function LoansPage() {
  const { user, token } = useAuth();
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    if (!confirm('¿Está seguro de que desea eliminar este préstamo? Esta acción no se puede deshacer.')) {
      return;
    }

    setDeleting(id);
    try {
      const res = await apiFetch(`/api/loans/${id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        setLoans(loans.filter(l => l.id !== id));
      } else {
        alert(data.error || 'Error al eliminar el préstamo');
      }
    } catch (err) {
      alert('Error al eliminar el préstamo');
    } finally {
      setDeleting(null);
    }
  };

  useEffect(() => {
    if (token) {
      apiFetch('/api/loans')
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setLoans(data.data.data);
          }
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [token]);

  const filteredLoans = loans.filter((loan) => {
    const searchTerm = filter.toLowerCase();
    const clientName = `${loan.client.user.firstName} ${loan.client.user.lastName}`.toLowerCase();
    const vendorName = loan.assignedVendor 
      ? `${loan.assignedVendor.firstName} ${loan.assignedVendor.lastName}`.toLowerCase() 
      : '';
    
    return (
      loan.status.toLowerCase().includes(searchTerm) ||
      clientName.includes(searchTerm) ||
      vendorName.includes(searchTerm)
    );
  });

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
        <h1 className="text-2xl font-bold dark:text-white/[.87]">Préstamos</h1>
        {user?.role === 'ADMIN' || user?.role === 'VENDEDOR' ? (
          <a
            href="/admin/loans/new"
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 dark:bg-[#39ff14] dark:text-black dark:hover:bg-[#32e012] dark:hover:shadow-[0_0_15px_rgba(57,255,20,0.4)] transition min-h-[44px]"
          >
            Nuevo Préstamo
          </a>
        ) : null}
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 mb-4">
        <input
          type="text"
          placeholder="Filtrar por estado, cliente o vendedor..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="px-4 py-2 border rounded-lg flex-1 min-h-[44px] dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14]"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden dark:bg-[#1e1e1e]">
        <div className="overflow-x-auto -mx-4 sm:mx-0">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-[#1a1a1a]">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-white/60">
                Cliente
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-white/60">
                Vendedor
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-white/60">
                Monto
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-white/60">
                Tasa
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-white/60">
                Plazo
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-white/60">
                Cuota
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-white/60">
                Estado
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-white/60">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200 dark:bg-[#1e1e1e] dark:divide-gray-700">
            {filteredLoans.map((loan) => (
              <tr key={loan.id} className="dark:hover:bg-white/10">
                <td className="px-6 py-4 whitespace-nowrap dark:text-white/[.87]">
                  {loan.client.user.firstName} {loan.client.user.lastName}
                </td>
                <td className="px-6 py-4 whitespace-nowrap dark:text-white/[.87]">
                  {loan.assignedVendor 
                    ? `${loan.assignedVendor.firstName} ${loan.assignedVendor.lastName}` 
                    : '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap dark:text-white/[.87]">
                  ${loan.amount.toLocaleString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap dark:text-white/[.87]">
                  {getPeriodicRate(loan.interestRate, loan.frequency)}% {frequencyLabels[loan.frequency]?.rate}
                </td>
                <td className="px-6 py-4 whitespace-nowrap dark:text-white/[.87]">
                  {loan.termMonths} {frequencyLabels[loan.frequency]?.plural}
                </td>
                <td className="px-6 py-4 whitespace-nowrap dark:text-white/[.87]">
                  ${loan.installmentAmount.toLocaleString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`px-2 py-1 text-xs rounded-full ${
                      statusColors[loan.status] || 'bg-gray-100 dark:bg-gray-800'
                    }`}
                  >
                    {loan.status}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-wrap gap-1.5">
                    <a
                      href={`/admin/loans/${loan.id}`}
                      className="px-2 py-1 text-xs font-medium bg-primary-100 text-primary-700 rounded hover:bg-primary-200 dark:bg-primary-900/30 dark:text-[#39ff14] dark:hover:bg-primary-900/50"
                    >
                      Ver
                    </a>
                    {user?.role === 'ADMIN' && loan.status === 'PENDING' && (
                      <a
                        href={`/admin/loans/${loan.id}/edit`}
                        className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50"
                      >
                        Editar
                      </a>
                    )}
                    {user?.role === 'ADMIN' && (
                      <button
                        onClick={() => handleDelete(loan.id)}
                        disabled={deleting === loan.id}
                        className="px-2 py-1 text-xs font-medium bg-red-100 text-red-700 rounded hover:bg-red-200 disabled:opacity-50 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
                      >
                        {deleting === loan.id ? 'Eliminando...' : 'Eliminar'}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        
        {filteredLoans.length === 0 && (
          <p className="p-4 text-center text-gray-500 dark:text-white/60">No hay préstamos</p>
        )}
      </div>
    </div>
  );
}
