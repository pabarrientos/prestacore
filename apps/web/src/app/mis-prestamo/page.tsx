'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';

interface Loan {
  id: string;
  amount: number;
  interestRate: number;
  termMonths: number;
  frequency: string;
  status: string;
  totalPayment: number;
  installmentAmount: number;
  createdAt: string;
  startedAt: string | null;
  client: {
    user: {
      firstName: string;
      lastName: string;
      email: string;
    };
  };
  assignedVendor: {
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
      return Math.round((annualRate / 52) * 100) / 100;
    case 'BIWEEKLY':
      return Math.round((annualRate / 24) * 100) / 100;
    case 'DAILY':
      return Math.round((annualRate / 365) * 100) / 100;
    default:
      return Math.round((annualRate / 12) * 100) / 100;
  }
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const statusColors: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-400',
  ACTIVE: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-400',
  PAID: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-400',
  DEFAULTED: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-400',
  CANCELLED: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
};

export default function MisPrestamosPage() {
  const { token } = useAuth();
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);

  useEffect(() => {
    if (token) {
      fetch(`${API_URL}/api/loans/mine?page=${page}&limit=${limit}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            setLoans(data.data.loans);
            setTotal(data.data.total);
          }
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [token, page, limit]);

  const totalPages = Math.ceil(total / limit);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 dark:bg-[#121212]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 dark:border-[#39ff14]"></div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6 dark:text-white/[.87]">Mis Préstamos</h1>

      {loans.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center dark:bg-[#1e1e1e]">
          <p className="text-gray-600 dark:text-white/60 mb-4">
            No tienes préstamos activos en este momento.
          </p>
          <a
            href="/simulator"
            className="inline-block px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 dark:bg-[#39ff14] dark:text-black dark:hover:bg-[#32e012]"
          >
            Solicitar un Préstamo
          </a>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-lg shadow overflow-hidden dark:bg-[#1e1e1e]">
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-[#1a1a1a]">
                  <tr>
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
                      Fecha de Inicio
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200 dark:bg-[#1e1e1e] dark:divide-gray-700">
                  {loans.map((loan) => (
                    <tr key={loan.id} className="dark:hover:bg-white/10">
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
                      <td className="px-6 py-4 whitespace-nowrap dark:text-white/[.87]">
                        {loan.startedAt ? new Date(loan.startedAt).toLocaleDateString('es-AR') : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-2 mt-6">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed dark:border-[#333333] dark:text-white/[.87] dark:hover:bg-white/10"
              >
                Anterior
              </button>
              <span className="text-sm text-gray-600 dark:text-white/60">
                Página {page} de {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed dark:border-[#333333] dark:text-white/[.87] dark:hover:bg-white/10"
              >
                Siguiente
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
