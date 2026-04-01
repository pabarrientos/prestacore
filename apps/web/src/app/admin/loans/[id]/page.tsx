'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import PaymentForm from '@/components/PaymentForm';

interface LoanDetail {
  id: string;
  amount: number;
  interestRate: number;
  termMonths: number;
  frequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
  status: string;
  totalInterest: number;
  totalPayment: number;
  installmentAmount: number;
  purpose: string | null;
  notes: string | null;
  createdAt: string;
  approvedAt: string | null;
  startedAt: string | null;
  client: {
    id: string;
    dni: string;
    user: {
      firstName: string;
      lastName: string;
      email: string;
      phone: string | null;
    };
  };
  assignedVendor: {
    firstName: string;
    lastName: string;
  } | null;
  installments: Installment[];
  payments: Payment[];
}

interface Installment {
  id: string;
  installmentNumber: number;
  dueDate: string;
  amount: number;
  principal: number;
  interest: number;
  balance: number;
  capitalBalance: number;
  paidAmount: number;
  status: string;
  paidAt: string | null;
}

interface Payment {
  id: string;
  amount: number;
  status: string;
  createdAt: string;
  paymentDate?: string;
  reference?: string;
  notes?: string;
  installmentId?: string;
  installmentNumber?: number;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const frequencyLabels: Record<string, { rate: string; plural: string; singular: string }> = {
  WEEKLY: { rate: 'semanal', plural: 'semanas', singular: 'semana' },
  BIWEEKLY: { rate: 'quincenal', plural: 'quincenas', singular: 'quincena' },
  MONTHLY: { rate: 'mensual', plural: 'meses', singular: 'mes' },
};

const statusColors: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  ACTIVE: 'bg-green-100 text-green-800',
  PAID: 'bg-blue-100 text-blue-800',
  DEFAULTED: 'bg-red-100 text-red-800',
  CANCELLED: 'bg-gray-100 text-gray-800',
};

// Helper function to format date without timezone issues
function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  // Extract just the date part (YYYY-MM-DD) from the ISO string
  const datePart = dateStr.split('T')[0];
  const [year, month, day] = datePart.split('-');
  return `${day}/${month}/${year}`;
}

const installmentStatusColors: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  PAID: 'bg-green-100 text-green-800',
  OVERDUE: 'bg-red-100 text-red-800',
  PARTIAL: 'bg-orange-100 text-orange-800',
};

function isOverdue(dueDate: string, status: string): boolean {
  if (status === 'PAID') return false;
  const due = new Date(dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today;
}

function getRowClass(status: string, dueDate: string): string {
  if (status === 'PAID') return 'bg-green-50';
  if (isOverdue(dueDate, status)) return 'bg-red-50';
  return '';
}

function getPeriodicRate(annualRate: number, frequency: string): number {
  switch (frequency) {
    case 'WEEKLY':
      return Math.round((annualRate / 52) * 10000) / 10000;
    case 'BIWEEKLY':
      return Math.round((annualRate / 24) * 10000) / 10000;
    default:
      return Math.round((annualRate / 12) * 10000) / 10000;
  }
}

export default function LoanDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { token, user } = useAuth();
  const [loan, setLoan] = useState<LoanDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);

  const handleEditPayment = (payment: Payment) => {
    setEditingPayment(payment);
    setShowPaymentForm(true);
  };

  const handleDeletePayment = async (payment: Payment) => {
    if (!confirm('¿Estás seguro de eliminar este pago? Esta acción revertirá los cambios en las cuotas.')) {
      return;
    }

    if (!token) return;

    try {
      const res = await fetch(`${API_URL}/api/payments/${payment.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (data.success) {
        // Reload loan data
        const res = await fetch(`${API_URL}/api/loans/${params.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const loanData = await res.json();
        if (loanData.success) setLoan(loanData.data);
      } else {
        alert(data.error || 'Error al eliminar el pago');
      }
    } catch (err) {
      console.error('Error deleting payment:', err);
      alert('Error al conectar con el servidor');
    }
  };

  const handlePaymentSuccess = () => {
    setShowPaymentForm(false);
    setEditingPayment(null);
    // Reload loan data
    if (token && params.id) {
      fetch(`${API_URL}/api/loans/${params.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success) setLoan(data.data);
        });
    }
  };

  useEffect(() => {
    if (token && params.id) {
      fetch(`${API_URL}/api/loans/${params.id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            setLoan(data.data);
          } else {
            setError(data.error || 'Error al cargar el préstamo');
          }
        })
        .catch((err) => {
          console.error(err);
          setError('Error al cargar el préstamo');
        })
        .finally(() => setLoading(false));
    }
  }, [token, params.id]);

  const handleApprove = async () => {
    if (!token) return;
    
    try {
      const res = await fetch(`${API_URL}/api/loans/${params.id}/approve`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (data.success) {
        setLoan(data.data);
      } else {
        setError(data.error || 'Error al aprobar el préstamo');
      }
    } catch (err) {
      setError('Error al aprobar el préstamo');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error || !loan) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">{error || 'Préstamo no encontrado'}</p>
        <button
          onClick={() => router.push('/admin/loans')}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
        >
          Volver a la lista
        </button>
      </div>
    );
  }

  const freq = frequencyLabels[loan.frequency] || frequencyLabels.MONTHLY;
  const periodicRate = getPeriodicRate(loan.interestRate, loan.frequency);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <button
            onClick={() => router.push('/admin/loans')}
            className="text-primary-600 hover:text-primary-800 mb-2"
          >
            ← Volver a la lista
          </button>
          <h1 className="text-2xl font-bold">Detalle del Préstamo</h1>
        </div>
        <div className="flex gap-2">
          {loan.status === 'PENDING' && user?.role === 'ADMIN' && (
            <button
              onClick={handleApprove}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              Aprobar Préstamo
            </button>
          )}
          {loan.status === 'ACTIVE' && (
            <button
              onClick={() => setShowPaymentForm(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Registrar Pago
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg">
          {error}
        </div>
      )}

      {/* Loan Info Card */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Información del Préstamo</h2>
          <span className={`px-3 py-1 text-sm rounded-full ${statusColors[loan.status]}`}>
            {loan.status}
          </span>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-gray-500">Monto</p>
            <p className="text-xl font-bold">${Number(loan.amount).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Tasa ({freq.singular})</p>
            <p className="text-xl font-bold">{periodicRate}% {freq.rate}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Plazo</p>
            <p className="text-xl font-bold">{loan.termMonths} {freq.plural}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Cuota ({freq.singular})</p>
            <p className="text-xl font-bold">${Number(loan.installmentAmount).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Total Intereses</p>
            <p className="text-lg">${Number(loan.totalInterest).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Total a Pagar</p>
            <p className="text-lg">${Number(loan.totalPayment).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Fecha de Inicio</p>
            <p>{formatDate(loan.startedAt)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Creado</p>
            <p>{formatDate(loan.createdAt)}</p>
          </div>
          {loan.purpose && (
            <div>
              <p className="text-sm text-gray-500">Propósito</p>
              <p>{loan.purpose}</p>
            </div>
          )}
        </div>
      </div>

      {/* Client Info Card */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Información del Cliente</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-gray-500">Nombre</p>
            <p className="font-medium">{loan.client.user.firstName} {loan.client.user.lastName}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">DNI</p>
            <p>{loan.client.dni}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Email</p>
            <p>{loan.client.user.email}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Teléfono</p>
            <p>{loan.client.user.phone || 'No especificado'}</p>
          </div>
        </div>
      </div>

      {/* Installments Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">Cronograma de Pagos</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cuota</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Capital</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Interés</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Saldo Capital</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Saldo</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loan.installments.reduce((acc, inst, idx) => {
                // Calculate capital balance: starts at loan amount, decreases by principal each installment
                const prevCapitalBalance = idx === 0 ? loan.amount : acc[idx - 1].capitalBalance;
                const capitalBalance = prevCapitalBalance - inst.principal;
                
                // Calculate status dynamically: if dueDate < today and not PAID, it's OVERDUE
                const now = new Date();
                const dueDate = new Date(inst.dueDate);
                const isOverdue = dueDate < now && inst.status !== 'PAID';
                const dynamicStatus = isOverdue ? 'OVERDUE' : (inst.status === 'PAID' ? 'PAID' : 'PENDING');
                
                return [...acc, { ...inst, capitalBalance, dynamicStatus }];
              }, [] as (Installment & { capitalBalance: number; dynamicStatus: string })[]).map((inst) => (
                <tr key={inst.id} className={getRowClass(inst.dynamicStatus, inst.dueDate)}>
                  <td className="px-4 py-3">{inst.installmentNumber}</td>
                  <td className="px-4 py-3">{formatDate(inst.dueDate)}</td>
                  <td className="px-4 py-3">${Number(inst.amount).toLocaleString()}</td>
                  <td className="px-4 py-3">${Number(inst.principal).toLocaleString()}</td>
                  <td className="px-4 py-3">${Number(inst.interest).toLocaleString()}</td>
                  <td className="px-4 py-3 font-medium">${Number(inst.capitalBalance || inst.balance).toLocaleString()}</td>
                  <td className="px-4 py-3">${Number(inst.balance).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 text-xs rounded-full ${installmentStatusColors[inst.dynamicStatus]}`}>
                      {inst.dynamicStatus}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment History */}
      {loan.payments && loan.payments.length > 0 && (
        <div className="bg-white rounded-lg shadow overflow-hidden mb-6">
          <div className="p-4 border-b flex justify-between items-center">
            <h2 className="text-lg font-semibold">Historial de Pagos</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha Pago</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Monto</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cuota</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Referencia</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Notas</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {loan.payments.map((payment) => {
                  // Get installment number from the loan's installments
                  const installment = loan.installments?.find(i => i.id === payment.installmentId);
                  return (
                  <tr key={payment.id}>
                    <td className="px-4 py-3">{formatDate(payment.paymentDate)}</td>
                    <td className="px-4 py-3 font-medium">${Number(payment.amount).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      {installment ? (
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                          Cuota #{installment.installmentNumber}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">Abono a cuenta</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">{payment.reference || '-'}</td>
                    <td className="px-4 py-3 text-sm">{payment.notes || '-'}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleEditPayment(payment)}
                        className="text-blue-600 hover:text-blue-800 text-sm mr-3"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleDeletePayment(payment)}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Payment Form Modal */}
      {showPaymentForm && loan && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="max-w-lg w-full">
            <PaymentForm
              loanId={loan.id}
              payment={editingPayment || undefined}
              onSuccess={handlePaymentSuccess}
              onCancel={() => {
                setShowPaymentForm(false);
                setEditingPayment(null);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
