'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

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

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const frequencyLabels: Record<string, { rate: string; plural: string; singular: string }> = {
  WEEKLY: { rate: 'semanal', plural: 'semanas', singular: 'semana' },
  BIWEEKLY: { rate: 'quincenal', plural: 'quincenas', singular: 'quincena' },
  MONTHLY: { rate: 'mensual', plural: 'meses', singular: 'mes' },
  DAILY: { rate: 'diario', plural: 'días', singular: 'día' },
};

const statusColors: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-400',
  ACTIVE: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-400',
  PAID: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-400',
  DEFAULTED: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-400',
  CANCELLED: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
};

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  const datePart = dateStr.split('T')[0];
  const [year, month, day] = datePart.split('-');
  return `${day}/${month}/${year}`;
}

const installmentStatusColors: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-400',
  PAID: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-400',
  OVERDUE: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-400',
  PARTIAL: 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-400',
  CANCELADA_POR_REFINANCIACION: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-400',
};

function isOverdue(dueDate: string, status: string): boolean {
  if (status === 'PAID') return false;
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today;
}

function getRowClass(status: string, dueDate: string): string {
  if (status === 'PAID') return 'bg-green-50 dark:bg-green-900/20';
  if (status === 'CANCELADA_POR_REFINANCIACION') return 'bg-purple-50 dark:bg-purple-900/20';
  if (isOverdue(dueDate, status)) return 'bg-red-50 dark:bg-red-900/20';
  return '';
}

function getPeriodicRate(annualRate: number, frequency: string): number {
  switch (frequency) {
    case 'WEEKLY':
      return Math.round((annualRate / 52) * 10000) / 10000;
    case 'BIWEEKLY':
      return Math.round((annualRate / 24) * 10000) / 10000;
    case 'DAILY':
      return Math.round((annualRate / 365) * 10000) / 10000;
    default:
      return Math.round((annualRate / 12) * 10000) / 10000;
  }
}

export default function MisPrestamosDetallePage() {
  const params = useParams();
  const router = useRouter();
  const { token } = useAuth();
  const [loan, setLoan] = useState<LoanDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 dark:bg-[#121212]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 dark:border-[#39ff14]"></div>
      </div>
    );
  }

  if (error || !loan) {
    return (
      <div className="text-center py-12 dark:bg-[#121212]">
        <p className="text-red-600 dark:text-red-400 mb-4">{error || 'Préstamo no encontrado'}</p>
        <button
          onClick={() => router.push('/mis-prestamo')}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 dark:bg-[#39ff14] dark:text-black dark:hover:bg-[#32e612] dark:hover:shadow-[0_0_15px_rgba(57,255,20,0.4)]"
        >
          Volver a Mis Préstamos
        </button>
      </div>
    );
  }

  const freq = frequencyLabels[loan.frequency] || frequencyLabels.MONTHLY;
  const periodicRate = getPeriodicRate(loan.interestRate, loan.frequency);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div>
          <button
            onClick={() => router.push('/mis-prestamo')}
            className="text-primary-600 dark:text-[#39ff14] hover:text-primary-800 dark:hover:text-[#32e612] mb-2"
          >
            ← Volver a Mis Préstamos
          </button>
          <h1 className="text-2xl font-bold dark:text-white/[.87]">Detalle del Préstamo</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-3 py-1 text-sm rounded-full ${statusColors[loan.status]}`}>
            {loan.status}
          </span>
        </div>
      </div>

      {/* Loan Info Card */}
      <div className="bg-white dark:bg-[#1e1e1e] rounded-lg shadow p-4 sm:p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4 dark:text-white/[.87]">Información del Préstamo</h2>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-gray-500 dark:text-white/38">Monto</p>
            <p className="text-lg sm:text-xl font-bold dark:text-white/[.87]">${Number(loan.amount).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-white/38">Tasa ({freq.singular})</p>
            <p className="text-lg sm:text-xl font-bold dark:text-white/[.87]">{periodicRate}% {freq.rate}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-white/38">Plazo</p>
            <p className="text-lg sm:text-xl font-bold dark:text-white/[.87]">{loan.termMonths} {freq.plural}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-white/38">Cuota ({freq.singular})</p>
            <p className="text-lg sm:text-xl font-bold dark:text-white/[.87]">${Number(loan.installmentAmount).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-white/38">Total Intereses</p>
            <p className="text-base sm:text-lg dark:text-white/[.87]">${Number(loan.totalInterest).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-white/38">Total a Pagar</p>
            <p className="text-base sm:text-lg dark:text-white/[.87]">${Number(loan.totalPayment).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-white/38">Fecha de Inicio</p>
            <p className="dark:text-white/[.87]">{formatDate(loan.startedAt)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-white/38">Creado</p>
            <p className="dark:text-white/[.87]">{formatDate(loan.createdAt)}</p>
          </div>
          {loan.purpose && (
            <div>
              <p className="text-sm text-gray-500 dark:text-white/38">Propósito</p>
              <p className="dark:text-white/[.87]">{loan.purpose}</p>
            </div>
          )}
        </div>
      </div>

      {/* Installments Table */}
      <div className="bg-white dark:bg-[#1e1e1e] rounded-lg shadow overflow-hidden">
        <div className="p-4 border-b dark:border-gray-700">
          <h2 className="text-lg font-semibold dark:text-white/[.87]">Cronograma de Pagos</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-[#2a2a2a]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-white/38 uppercase">#</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-white/38 uppercase">Fecha</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-white/38 uppercase">Cuota</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-white/38 uppercase">Capital</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-white/38 uppercase">Interés</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-white/38 uppercase">Saldo Capital</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-white/38 uppercase">Saldo</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-white/38 uppercase">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {loan.installments.reduce((acc, inst, idx) => {
                const prevCapitalBalance = idx === 0 ? loan.amount : acc[idx - 1].capitalBalance;
                const capitalBalance = prevCapitalBalance - inst.principal;
                
                // Calculate status dynamically based on actual payments AND loan status
                const isRefinanced = loan.status === 'REFINANCIADO';
                const isPaidLoan = loan.status === 'PAID';
                
                // Calculate payments for this installment
                const paymentsForInstallment = loan.payments?.filter(p => p.installmentId === inst.id) || [];
                const totalPaidForInstallment = paymentsForInstallment.reduce((sum, p) => sum + Number(p.amount), 0);
                
                // Determine real status based on payments and loan status
                let dynamicStatus: string;
                
                // First check: if loan is PAID -> all installments are PAID
                if (isPaidLoan) {
                  dynamicStatus = 'PAID';
                }
                // Second check: if payment covers the full amount -> PAID (even if loan is refinanced)
                else if (totalPaidForInstallment >= Number(inst.amount)) {
                  dynamicStatus = 'PAID';
                } 
                // Third check: if partial payment -> PARTIAL
                else if (totalPaidForInstallment > 0) {
                  dynamicStatus = 'PARTIAL';
                }
                // Fourth check: if loan is refinanced and installment was cancelled -> show cancelled
                else if (isRefinanced && inst.status === 'CANCELADA_POR_REFINANCIACION') {
                  dynamicStatus = 'CANCELADA_POR_REFINANCIACION';
                }
                // Fifth check: no payment - check if overdue based on date
                else {
                  const now = new Date();
                  const dueDate = new Date(inst.dueDate);
                  dynamicStatus = dueDate < now ? 'OVERDUE' : 'PENDING';
                }
                
                return [...acc, { ...inst, capitalBalance, dynamicStatus, totalPaid: totalPaidForInstallment }];
              }, [] as (Installment & { capitalBalance: number; dynamicStatus: string; totalPaid: number })[]).map((inst) => (
                <tr key={inst.id} className={getRowClass(inst.dynamicStatus, inst.dueDate)}>
                  <td className="px-4 py-3 dark:text-white/[.87]">{inst.installmentNumber}</td>
                  <td className="px-4 py-3 dark:text-white/[.87]">{formatDate(inst.dueDate)}</td>
                  <td className="px-4 py-3 dark:text-white/[.87]">${Number(inst.amount).toLocaleString()}</td>
                  <td className="px-4 py-3 dark:text-white/[.87]">${Number(inst.principal).toLocaleString()}</td>
                  <td className="px-4 py-3 dark:text-white/[.87]">${Number(inst.interest).toLocaleString()}</td>
                  <td className="px-4 py-3 font-medium dark:text-white/[.87]">${Number(inst.capitalBalance || inst.balance).toLocaleString()}</td>
                  <td className="px-4 py-3 dark:text-white/[.87]">
                    <div className="flex flex-col">
                      <span>${(Number(inst.balance)).toLocaleString()}</span>
                      {inst.totalPaid > 0 && (
                        <span className="text-xs text-green-600 dark:text-green-400">
                          Pagado: ${inst.totalPaid.toLocaleString()}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 text-xs rounded-full ${installmentStatusColors[inst.dynamicStatus]}`}>
                      {inst.dynamicStatus === 'PARTIAL' ? 'PARCIAL' : 
                       inst.dynamicStatus === 'CANCELADA_POR_REFINANCIACION' ? 'REFINANCIADA' : 
                       inst.dynamicStatus}
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
        <div className="bg-white dark:bg-[#1e1e1e] rounded-lg shadow overflow-hidden mb-6">
          <div className="p-4 border-b dark:border-gray-700">
            <h2 className="text-lg font-semibold dark:text-white/[.87]">Historial de Pagos</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-[#2a2a2a]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-white/38 uppercase">Fecha Pago</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-white/38 uppercase">Monto</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-white/38 uppercase">Cuota</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-white/38 uppercase">Referencia</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-white/38 uppercase">Notas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {loan.payments.map((payment) => {
                  const installment = loan.installments?.find(i => i.id === payment.installmentId);
                  return (
                  <tr key={payment.id}>
                    <td className="px-4 py-3 dark:text-white/[.87]">{formatDate(payment.paymentDate)}</td>
                    <td className="px-4 py-3 font-medium dark:text-white/[.87]">${Number(payment.amount).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      {installment ? (
                        <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-400 rounded text-xs">
                          Cuota #{installment.installmentNumber}
                        </span>
                      ) : (
                        <span className="text-gray-400 dark:text-white/38 text-xs">Abono a cuenta</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm dark:text-white/[.87]">{payment.reference || '-'}</td>
                    <td className="px-4 py-3 text-sm dark:text-white/[.87]">{payment.notes || '-'}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}