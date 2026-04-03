'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';

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
}

const frequencyLabels: Record<string, { rate: string; plural: string }> = {
  WEEKLY: { rate: 'semanal', plural: 'semanas' },
  BIWEEKLY: { rate: 'quincenal', plural: 'quincenas' },
  MONTHLY: { rate: 'mensual', plural: 'meses' },
};

function getPeriodicRate(annualRate: number, frequency: string): number {
  switch (frequency) {
    case 'WEEKLY':
      return Math.round((annualRate / 52) * 100) / 100;
    case 'BIWEEKLY':
      return Math.round((annualRate / 24) * 100) / 100;
    default:
      return Math.round((annualRate / 12) * 100) / 100;
  }
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

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
      const res = await fetch(`${API_URL}/api/loans/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
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
      fetch(`${API_URL}/api/loans`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
        .then((res) => res.json())
        .then((data) => {
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
    
    return (
      loan.status.toLowerCase().includes(searchTerm) ||
      clientName.includes(searchTerm)
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Préstamos</h1>
        {user?.role === 'ADMIN' || user?.role === 'VENDEDOR' ? (
          <a
            href="/admin/loans/new"
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition"
          >
            Nuevo Préstamo
          </a>
        ) : null}
      </div>

      {/* Filters */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Filtrar por estado o cliente..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="px-4 py-2 border rounded-lg w-full md:w-64"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Cliente
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Monto
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Tasa
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Plazo
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Cuota
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Estado
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredLoans.map((loan) => (
              <tr key={loan.id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  {loan.client.user.firstName} {loan.client.user.lastName}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  ${loan.amount.toLocaleString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {getPeriodicRate(loan.interestRate, loan.frequency)}% {frequencyLabels[loan.frequency]?.rate}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {loan.termMonths} {frequencyLabels[loan.frequency]?.plural}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  ${loan.installmentAmount.toLocaleString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`px-2 py-1 text-xs rounded-full ${
                      statusColors[loan.status] || 'bg-gray-100'
                    }`}
                  >
                    {loan.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex gap-3">
                    <a
                      href={`/admin/loans/${loan.id}`}
                      className="text-primary-600 hover:text-primary-900"
                    >
                      Ver
                    </a>
                    {user?.role === 'ADMIN' && loan.status === 'PENDING' && (
                      <a
                        href={`/admin/loans/${loan.id}/edit`}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        Editar
                      </a>
                    )}
                    {user?.role === 'ADMIN' && (
                      <button
                        onClick={() => handleDelete(loan.id)}
                        disabled={deleting === loan.id}
                        className="text-red-600 hover:text-red-900 disabled:opacity-50"
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
        
        {filteredLoans.length === 0 && (
          <p className="p-4 text-center text-gray-500">No hay préstamos</p>
        )}
      </div>
    </div>
  );
}
