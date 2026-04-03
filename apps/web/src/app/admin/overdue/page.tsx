'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import PaymentForm from '@/components/PaymentForm';

interface OverdueInstallment {
  id: string;
  installmentNumber: number;
  dueDate: string;
  amount: number;
  balance: number;
  moraAmount: number;
  daysOverdue: number;
  status: string;
  loan: {
    id: string;
    amount: number;
    remainingInstallments: number;
  };
  client: {
    id: string;
    name: string;
    phone: string;
  };
}

interface OverdueSummary {
  totalOverdue: number;
  totalMora: number;
  byDays: {
    range: string;
    count: number;
    amount: number;
  }[];
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Helper function to format date
function formatDate(dateStr: string): string {
  const datePart = dateStr.split('T')[0];
  const [year, month, day] = datePart.split('-');
  return `${day}/${month}/${year}`;
}

export default function OverduePage() {
  const [installments, setInstallments] = useState<OverdueInstallment[]>([]);
  const [summary, setSummary] = useState<OverdueSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Filters
  const [vendorId, setVendorId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Payment modal state
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedLoanId, setSelectedLoanId] = useState('');
  const [selectedInstallmentId, setSelectedInstallmentId] = useState('');

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  useEffect(() => {
    loadOverdueData();
  }, []);

  const loadOverdueData = () => {
    if (!token) return;

    setLoading(true);
    const params = new URLSearchParams();
    if (vendorId) params.append('vendorId', vendorId);
    if (fromDate) params.append('from', fromDate);
    if (toDate) params.append('to', toDate);

    fetch(`${API_URL}/api/dashboard/overdue?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setInstallments(data.data.installments);
          setSummary(data.data.summary);
        } else {
          setError(data.error || 'Error al cargar datos');
        }
      })
      .catch((err) => {
        console.error(err);
        setError('Error al conectar con el servidor');
      })
      .finally(() => setLoading(false));
  };

  const handleFilter = (e: React.FormEvent) => {
    e.preventDefault();
    loadOverdueData();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 dark:bg-[#121212]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 dark:border-[#39ff14]"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <Link href="/admin" className="text-primary-600 dark:text-[#39ff14] hover:text-primary-800 dark:hover:text-[#32e612]">
          ← Volver al Dashboard
        </Link>
        <h1 className="text-2xl font-bold mt-2 dark:text-white/[.87]">Cuotas Vencidas</h1>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/50 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded-lg">
          {error}
        </div>
      )}

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white dark:bg-[#1e1e1e] rounded-lg shadow p-6">
            <p className="text-sm text-gray-500 dark:text-white/38">Total Vencido</p>
            <p className="text-2xl font-bold text-red-600 dark:text-red-400">
              ${summary.totalOverdue.toLocaleString()}
            </p>
          </div>
          <div className="bg-white dark:bg-[#1e1e1e] rounded-lg shadow p-6">
            <p className="text-sm text-gray-500 dark:text-white/38">Total Mora</p>
            <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
              ${summary.totalMora.toLocaleString()}
            </p>
          </div>
          <div className="bg-white dark:bg-[#1e1e1e] rounded-lg shadow p-6">
            <p className="text-sm text-gray-500 dark:text-white/38">Cuotas Vencidas</p>
            <p className="text-2xl font-bold dark:text-white/[.87]">{installments.length}</p>
          </div>
        </div>
      )}

      {/* Distribution by Days */}
      {summary && summary.byDays.length > 0 && (
        <div className="bg-white dark:bg-[#1e1e1e] rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4 dark:text-white/[.87]">Distribución por Antigüedad</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {summary.byDays.map((item) => (
              <div key={item.range} className="text-center p-3 bg-gray-50 dark:bg-[#2a2a2a] rounded-lg">
                <p className="text-sm font-medium dark:text-white/[.87]">{item.range}</p>
                <p className="text-lg font-bold dark:text-white/[.87]">{item.count}</p>
                <p className="text-xs text-gray-500 dark:text-white/38">
                  ${item.amount.toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white dark:bg-[#1e1e1e] rounded-lg shadow p-4 mb-6">
        <form onSubmit={handleFilter} className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-[#d3d3d3] mb-1">
              Desde
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-[#2a2a2a] dark:text-white/[.87] rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-[#d3d3d3] mb-1">
              Hasta
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-[#2a2a2a] dark:text-white/[.87] rounded-lg"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 dark:bg-[#39ff14] dark:text-black dark:hover:bg-[#32e612] dark:hover:shadow-[0_0_15px_rgba(57,255,20,0.4)]"
          >
            Filtrar
          </button>
          <button
            type="button"
            onClick={() => {
              setVendorId('');
              setFromDate('');
              setToDate('');
              loadOverdueData();
            }}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 dark:text-[#d3d3d3] rounded-lg hover:bg-gray-50 dark:hover:bg-[#2a2a2a]"
          >
            Limpiar
          </button>
        </form>
      </div>

      {/* Overdue Table */}
      <div className="bg-white dark:bg-[#1e1e1e] rounded-lg shadow overflow-hidden">
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
                  Cuota
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-white/38 uppercase">
                  Vencimiento
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-white/38 uppercase">
                  Monto
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-white/38 uppercase">
                  Saldo
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-white/38 uppercase">
                  Mora
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-white/38 uppercase">
                  Días Venc.
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-white/38 uppercase">
                  Estado
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-white/38 uppercase">
                  Acción
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {installments.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-gray-500 dark:text-white/38">
                    No hay cuotas vencidas
                  </td>
                </tr>
              ) : (
                installments.map((inst) => (
                  <tr key={inst.id} className="hover:bg-gray-50 dark:hover:bg-[#2a2a2a]">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium dark:text-white/[.87]">{inst.client.name}</p>
                        <p className="text-sm text-gray-500 dark:text-white/38">{inst.client.phone || 'Sin teléfono'}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/loans/${inst.loan.id}`}
                        className="hover:text-primary-600 dark:hover:text-[#39ff14] hover:underline"
                      >
                        <p className="dark:text-white/[.87]">${Number(inst.loan.amount).toLocaleString()}</p>
                        <p className="text-xs text-gray-500 dark:text-white/38">
                          {inst.loan.remainingInstallments} cuotas restantes
                        </p>
                      </Link>
                    </td>
                    <td className="px-4 py-3 dark:text-white/[.87]">#{inst.installmentNumber}</td>
                    <td className="px-4 py-3 dark:text-white/[.87]">{formatDate(inst.dueDate)}</td>
                    <td className="px-4 py-3 dark:text-white/[.87]">${Number(inst.amount).toLocaleString()}</td>
                    <td className="px-4 py-3 font-medium dark:text-white/[.87]">${Number(inst.balance).toLocaleString()}</td>
                    <td className="px-4 py-3 text-orange-600 dark:text-orange-400">
                      ${inst.moraAmount.toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs rounded-full ${inst.daysOverdue > 30 ? 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-400' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-400'}`}>
                        {inst.daysOverdue} días
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs rounded-full ${inst.daysOverdue > 0 ? 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-400' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-400'}`}>
                        {inst.daysOverdue > 0 ? 'OVERDUE' : 'PENDING'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => {
                          setSelectedLoanId(inst.loan.id);
                          setSelectedInstallmentId(inst.id);
                          setShowPaymentModal(true);
                        }}
                        className="text-primary-600 dark:text-[#39ff14] hover:text-primary-800 dark:hover:text-[#32e612] text-sm font-medium"
                      >
                        Pagar →
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment Modal */}
      {showPaymentModal && selectedLoanId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#1e1e1e] rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b dark:border-gray-700 flex justify-between items-center">
              <h2 className="text-lg font-semibold dark:text-white/[.87]">Registrar Pago</h2>
              <button
                onClick={() => setShowPaymentModal(false)}
                className="text-gray-400 dark:text-white/38 hover:text-gray-600 dark:hover:text-white/87"
              >
                ✕
              </button>
            </div>
            <div className="p-4">
              <PaymentForm
                loanId={selectedLoanId}
                preselectedInstallmentId={selectedInstallmentId}
                onSuccess={() => {
                  setShowPaymentModal(false);
                  loadOverdueData();
                }}
                onCancel={() => setShowPaymentModal(false)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}