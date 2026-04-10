'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { getNow } from '@/lib/datetime';
import PaymentForm from '@/components/PaymentForm';
import RefinancingModal from '@/components/RefinancingModal';
import CancelacionAnticipadaModal from '@/components/CancelacionAnticipadaModal';

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
    id?: string;
    firstName: string;
    lastName: string;
  } | null;
  installments: Installment[];
  payments: Payment[];
  // Refinancing links
  prestamo_origen?: {
    id: string;
    amount: number;
    status: string;
  } | null;
  prestamo_nuevo?: {
    id: string;
    amount: number;
    status: string;
  } | null;
  prestamo_nuevo_id?: string | null;
  prestamo_origen_id?: string | null;
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
  moraAmount?: number;
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
  DAILY: { rate: 'diario', plural: 'días', singular: 'día' },
};

const statusColors: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-400',
  ACTIVE: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-400',
  PAID: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-400',
  DEFAULTED: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-400',
  CANCELLED: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
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
  PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-400',
  PAID: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-400',
  OVERDUE: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-400',
  PARTIAL: 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-400',
  CANCELADA_POR_REFINANCIACION: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-400',
};

function isOverdue(dueDate: string, status: string): boolean {
  if (status === 'PAID') return false;
  // Para comparar fechas correctamente, necesitamos la timezone del sistema
  // Usamos una comparación simple: si la fecha de vencimiento es anterior a hoy
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

export default function LoanDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { token, user } = useAuth();
  const [loan, setLoan] = useState<LoanDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [showRefinancing, setShowRefinancing] = useState(false);
  const [showCancelacionAnticipada, setShowCancelacionAnticipada] = useState(false);
  const [moraRate, setMoraRate] = useState(0.0005); // Default fallback
  const [currentDate, setCurrentDate] = useState<Date | null>(null);
  const [showVendorSelect, setShowVendorSelect] = useState(false);
  const [vendors, setVendors] = useState<{ id: string; firstName: string; lastName: string }[]>([]);
  const [reassigning, setReassigning] = useState(false);

  // Fetch mora rate and current date in timezone on mount
  useEffect(() => {
    Promise.all([
      fetch(`${API_URL}/api/settings/rates`).then(res => res.json()),
      getNow(), // Get current date in configured timezone
    ])
      .then(([ratesData, nowDate]) => {
        if (ratesData.success && ratesData.data.MORA_RATE) {
          setMoraRate(ratesData.data.MORA_RATE);
        }
        setCurrentDate(nowDate);
      })
      .catch(console.error);
  }, []);

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
      Promise.all([
        fetch(`${API_URL}/api/loans/${params.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_URL}/api/users/vendors`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ])
        .then(([loanRes, vendorsRes]) => Promise.all([loanRes.json(), vendorsRes.json()]))
        .then(([loanData, vendorsData]) => {
          if (loanData.success) {
            setLoan(loanData.data);
          } else {
            setError(loanData.error || 'Error al cargar el préstamo');
          }
          if (vendorsData.success) {
            setVendors(vendorsData.data);
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

  const handleReassignVendor = async (vendorId: string | null) => {
    if (!token) return;
    setReassigning(true);
    try {
      // First update the vendor
      const res = await fetch(`${API_URL}/api/loans/${params.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ assignedVendorId: vendorId }),
      });
      const data = await res.json();
      if (data.success) {
        // Reload full loan data to get installments
        const loanRes = await fetch(`${API_URL}/api/loans/${params.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const loanData = await loanRes.json();
        if (loanData.success) {
          setLoan(loanData.data);
        }
        setShowVendorSelect(false);
      } else {
        setError(data.error || 'Error al reasignar el vendedor');
      }
    } catch (err) {
      setError('Error al reasignar el vendedor');
    } finally {
      setReassigning(false);
    }
  };

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
          onClick={() => router.push('/admin/loans')}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 dark:bg-[#39ff14] dark:text-black dark:hover:bg-[#32e612] dark:hover:shadow-[0_0_15px_rgba(57,255,20,0.4)]"
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
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div>
          <button
            onClick={() => router.push('/admin/loans')}
            className="text-primary-600 dark:text-[#39ff14] hover:text-primary-800 dark:hover:text-[#32e612] mb-2"
          >
            ← Volver a la lista
          </button>
          <h1 className="text-2xl font-bold dark:text-white/[.87]">Detalle del Préstamo</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {loan.status === 'PENDING' && user?.role === 'ADMIN' && (
            <button
              onClick={handleApprove}
              className="px-3 py-2 min-h-[44px] text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              Aprobar Préstamo
            </button>
          )}
          {loan.status === 'ACTIVE' && (
            <button
              onClick={() => setShowPaymentForm(true)}
              className="px-3 py-2 min-h-[44px] text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Registrar Pago
            </button>
          )}
          {loan.status === 'DEFAULTED' && user?.role === 'ADMIN' && (
            <button
              onClick={() => setShowRefinancing(true)}
              className="px-3 py-2 min-h-[44px] text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700"
            >
              Refinanciar
            </button>
          )}
          {/* Also show refinancing for ACTIVE loans with overdue installments */}
          {loan.status === 'ACTIVE' && user?.role === 'ADMIN' && loan.installments?.some(i => {
            const now = new Date();
            const due = new Date(i.dueDate);
            return due < now && i.status !== 'PAID';
          }) && (
            <button
              onClick={() => setShowRefinancing(true)}
              className="px-3 py-2 min-h-[44px] text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700"
            >
              Refinanciar
            </button>
          )}
          {/* Cancelación Anticipada button - only for ACTIVE or DEFAULTED loans */}
          {(loan.status === 'ACTIVE' || loan.status === 'DEFAULTED') && (user?.role === 'ADMIN' || user?.role === 'VENDEDOR') && (
            <button
              onClick={() => setShowCancelacionAnticipada(true)}
              className="px-3 py-2 min-h-[44px] text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              Cancelación Anticipada
            </button>
          )}
          {/* Mark as DEFAULTED button for ACTIVE loans (admin only) */}
          {loan.status === 'ACTIVE' && user?.role === 'ADMIN' && (
            <button
              onClick={async () => {
                if (!confirm('¿Marcar este préstamo como DEFAULTED (en mora)?')) return;
                try {
                  const res = await fetch(`${API_URL}/api/loans/${params.id}`, {
                    method: 'PATCH',
                    headers: { 
                      Authorization: `Bearer ${token}`,
                      'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ status: 'DEFAULTED' })
                  });
                  const data = await res.json();
                  if (data.success) {
                    setLoan({ ...loan, status: 'DEFAULTED' });
                  } else {
                    alert(data.error || 'Error al marcar como DEFAULTED');
                  }
                } catch (err) {
                  alert('Error al conectar con el servidor');
                }
              }}
              className="px-3 py-2 min-h-[44px] text-sm bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              Marcar Incobrable
            </button>
          )}
          {/* Reactivar button for DEFAULTED loans (admin only) */}
          {loan.status === 'DEFAULTED' && user?.role === 'ADMIN' && (
            <button
              onClick={async () => {
                if (!confirm('¿Reactivar este préstamo (volver a ACTIVE)?')) return;
                try {
                  const res = await fetch(`${API_URL}/api/loans/${params.id}`, {
                    method: 'PATCH',
                    headers: { 
                      Authorization: `Bearer ${token}`,
                      'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ status: 'ACTIVE' })
                  });
                  const data = await res.json();
                  if (data.success) {
                    setLoan({ ...loan, status: 'ACTIVE' });
                  } else {
                    alert(data.error || 'Error al reactivar el préstamo');
                  }
                } catch (err) {
                  alert('Error al conectar con el servidor');
                }
              }}
              className="px-3 py-2 min-h-[44px] text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              Reactivar
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/50 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded-lg">
          {error}
        </div>
      )}

      {/* Loan Info Card */}
      <div className="bg-white dark:bg-[#1e1e1e] rounded-lg shadow p-4 sm:p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold dark:text-white/[.87]">Información del Préstamo</h2>
          <div className="flex items-center gap-2">
            {/* Link to original loan - only for NEW loans from refinancing (not REFINANCIADO) */}
            {(loan.prestamo_origen?.id || loan.prestamo_origen_id) && (
              <a 
                href={`/admin/loans/${loan.prestamo_origen?.id || loan.prestamo_origen_id}`}
                className="text-xs text-blue-600 hover:underline"
              >
                Ver Préstamo Original
              </a>
            )}
            {/* Link to new loan - only for REFINANCIADO loans */}
            {(loan.prestamo_nuevo?.id || loan.prestamo_nuevo_id) && (
              <a 
                href={`/admin/loans/${loan.prestamo_nuevo?.id || loan.prestamo_nuevo_id}`}
                className="text-xs text-blue-600 hover:underline"
              >
                Ver Nuevo Préstamo
              </a>
            )}
            <span className={`px-3 py-1 text-sm rounded-full ${statusColors[loan.status]}`}>
              {loan.status}
            </span>
          </div>
        </div>
        
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
          <div>
            <p className="text-sm text-gray-500 dark:text-white/38">Vendedor</p>
            {showVendorSelect ? (
              <div className="flex gap-2 flex-wrap">
                <select
                  value={loan.assignedVendor?.id || ''}
                  onChange={(e) => handleReassignVendor(e.target.value || null)}
                  disabled={reassigning}
                  className="px-2 py-1 text-sm border rounded dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87]"
                >
                  <option value="">Sin vendedor</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>{v.firstName} {v.lastName}</option>
                  ))}
                </select>
                <button
                  onClick={() => setShowVendorSelect(false)}
                  className="px-2 py-1 text-sm text-gray-500 hover:text-gray-700 dark:text-white/60"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <p className="dark:text-white/[.87]">
                  {loan.assignedVendor 
                    ? `${loan.assignedVendor.firstName} ${loan.assignedVendor.lastName}` 
                    : 'Sin asignar'}
                </p>
                {user?.role === 'ADMIN' && (
                  <button
                    onClick={() => setShowVendorSelect(true)}
                    className="text-xs text-blue-600 hover:underline dark:text-blue-400"
                  >
                    Cambiar
                  </button>
                )}
              </div>
            )}
          </div>
          {loan.purpose && (
            <div>
              <p className="text-sm text-gray-500 dark:text-white/38">Propósito</p>
              <p className="dark:text-white/[.87]">{loan.purpose}</p>
            </div>
          )}
        </div>
      </div>

      {/* Client Info Card */}
      <div className="bg-white dark:bg-[#1e1e1e] rounded-lg shadow p-4 sm:p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4 dark:text-white/[.87]">Información del Cliente</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-gray-500 dark:text-white/38">Nombre</p>
            <p className="font-medium dark:text-white/[.87]">{loan.client.user.firstName} {loan.client.user.lastName}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-white/38">DNI</p>
            <p className="dark:text-white/[.87]">{loan.client.dni}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-white/38">Email</p>
            <p className="dark:text-white/[.87]">{loan.client.user.email}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-white/38">Teléfono</p>
            <p className="dark:text-white/[.87]">{loan.client.user.phone || 'No especificado'}</p>
          </div>
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
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-white/38 uppercase">Mora</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-white/38 uppercase">Días Venc.</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-white/38 uppercase">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {loan.installments.reduce((acc, inst, idx) => {
                // Calculate capital balance: starts at loan amount, decreases by principal each installment
                const prevCapitalBalance = idx === 0 ? loan.amount : acc[idx - 1].capitalBalance;
                const capitalBalance = prevCapitalBalance - inst.principal;
                
                // Calculate status dynamically based on actual payments AND loan status
                const isRefinanced = loan.status === 'REFINANCIADO';
                const isPaidLoan = loan.status === 'PAID';
                
                // Calculate payments for this installment
                const paymentsForInstallment = loan.payments?.filter(p => p.installmentId === inst.id) || [];
                const totalPaidForInstallment = paymentsForInstallment.reduce((sum, p) => sum + Number(p.amount), 0);
                
                // Calculate days overdue using timezone-aware current date
                // Use currentDate from state (fetched with timezone from settings)
                const nowDate = currentDate || new Date();
                const dueDate = new Date(inst.dueDate);
                const daysOverdue = Math.floor((nowDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
                const calculatedMora = daysOverdue > 0 
                  ? Math.round(Number(inst.balance) * moraRate * daysOverdue * 100) / 100 
                  : 0;
                
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
                
                return [...acc, { ...inst, capitalBalance, dynamicStatus, totalPaid: totalPaidForInstallment, calculatedMora, daysOverdue }];
              }, [] as (Installment & { capitalBalance: number; dynamicStatus: string; totalPaid: number; calculatedMora: number; daysOverdue: number })[]).map((inst) => (
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
                  {(inst.dynamicStatus === 'PARTIAL' || inst.dynamicStatus === 'OVERDUE') ? (
                    <>
                      <td className="px-4 py-3 text-orange-600 dark:text-orange-400">
                        ${inst.calculatedMora.toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          inst.daysOverdue > 30
                            ? 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-400' 
                            : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-400'
                        }`}>
                          {inst.daysOverdue}
                        </span>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3 dark:text-white/[.38]">-</td>
                      <td className="px-4 py-3 dark:text-white/[.38]">-</td>
                    </>
                  )}
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
          <div className="p-4 border-b dark:border-gray-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
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
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-white/38 uppercase">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {loan.payments.map((payment) => {
                  // Get installment number from the loan's installments
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
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleEditPayment(payment)}
                        className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm mr-3"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleDeletePayment(payment)}
                        className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 text-sm"
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
        <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-50 p-4">
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

      {/* Refinancing Modal */}
      {showRefinancing && loan && (
        <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-lg sm:max-w-2xl md:max-w-4xl">
            <RefinancingModal
              loanId={loan.id}
              onSuccess={() => {
                setShowRefinancing(false);
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
              }}
              onCancel={() => setShowRefinancing(false)}
            />
          </div>
        </div>
      )}

      {/* Cancelacion Anticipada Modal */}
      {showCancelacionAnticipada && loan && (
        <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-lg md:max-w-2xl">
            <CancelacionAnticipadaModal
              loanId={loan.id}
              onSuccess={() => {
                setShowCancelacionAnticipada(false);
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
              }}
              onCancel={() => setShowCancelacionAnticipada(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
