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

const statusColors: Record<string, string> = {
  OVERDUE: 'bg-red-100 text-red-800',
  PARTIAL: 'bg-orange-100 text-orange-800',
};

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
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <Link href="/admin" className="text-primary-600 hover:text-primary-800">
          ← Volver al Dashboard
        </Link>
        <h1 className="text-2xl font-bold mt-2">Cuotas Vencidas</h1>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg">
          {error}
        </div>
      )}

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm text-gray-500">Total Vencido</p>
            <p className="text-2xl font-bold text-red-600">
              ${summary.totalOverdue.toLocaleString()}
            </p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm text-gray-500">Total Mora</p>
            <p className="text-2xl font-bold text-orange-600">
              ${summary.totalMora.toLocaleString()}
            </p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm text-gray-500">Cuotas Vencidas</p>
            <p className="text-2xl font-bold">{installments.length}</p>
          </div>
        </div>
      )}

      {/* Distribution by Days */}
      {summary && summary.byDays.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Distribución por Antigüedad</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {summary.byDays.map((item) => (
              <div key={item.range} className="text-center p-3 bg-gray-50 rounded-lg">
                <p className="text-sm font-medium">{item.range}</p>
                <p className="text-lg font-bold">{item.count}</p>
                <p className="text-xs text-gray-500">
                  ${item.amount.toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <form onSubmit={handleFilter} className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Desde
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Hasta
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
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
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Limpiar
          </button>
        </form>
      </div>

      {/* Overdue Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Cliente
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Préstamo
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Cuota
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Vencimiento
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Monto
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Saldo
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Mora
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Días Venc.
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Estado
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Acción
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {installments.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-gray-500">
                    No hay cuotas vencidas
                  </td>
                </tr>
              ) : (
                installments.map((inst) => (
                  <tr key={inst.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium">{inst.client.name}</p>
                        <p className="text-sm text-gray-500">{inst.client.phone || 'Sin teléfono'}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p>${Number(inst.loan.amount).toLocaleString()}</p>
                      <p className="text-xs text-gray-500">
                        {inst.loan.remainingInstallments} cuotas restantes
                      </p>
                    </td>
                    <td className="px-4 py-3">#{inst.installmentNumber}</td>
                    <td className="px-4 py-3">{formatDate(inst.dueDate)}</td>
                    <td className="px-4 py-3">${Number(inst.amount).toLocaleString()}</td>
                    <td className="px-4 py-3 font-medium">${Number(inst.balance).toLocaleString()}</td>
                    <td className="px-4 py-3 text-orange-600">
                      ${inst.moraAmount.toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs rounded-full ${inst.daysOverdue > 30 ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
                        {inst.daysOverdue} días
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs rounded-full ${inst.daysOverdue > 0 ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
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
                        className="text-primary-600 hover:text-primary-800 text-sm font-medium"
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b flex justify-between items-center">
              <h2 className="text-lg font-semibold">Registrar Pago</h2>
              <button
                onClick={() => setShowPaymentModal(false)}
                className="text-gray-400 hover:text-gray-600"
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