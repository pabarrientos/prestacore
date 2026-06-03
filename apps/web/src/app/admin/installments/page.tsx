'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api';
import { getTodayString } from '@/lib/datetime';
import PaymentForm from '@/components/PaymentForm';
import CollectionActionsModal from '@/components/CollectionActionsModal';

interface Installment {
  id: string;
  loanId: string;
  installmentNumber: number;
  dueDate: string;
  amount: number;
  balance: number;
  paidAmount: number;
  moraAmount: number;
  daysOverdue: number;
  status: string;
  loan: {
    id: string;
    amount: number;
  };
  client: {
    id: string;
    name: string;
    phone: string;
  };
  vendor: string | null;
}

interface Vendor {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface ApiResponse {
  success: boolean;
  data: {
    installments: Installment[];
    totalMonto: number;
    totalMora: number;
    filtros: {
      fechaInicio: string;
      fechaFin: string;
      vendedorId: string | null;
      estado: string | null;
      cliente: string | null;
    };
  };
}

// Helper para formatear fecha YYYY-MM-DD a DD/MM/YYYY
function formatDateDisplay(fecha: string): string {
  if (!fecha) return '-';
  const datePart = fecha.includes('T') ? fecha.split('T')[0] : fecha.split(' ')[0];
  const [year, month, day] = datePart.split('-');
  return `${day}/${month}/${year}`;
}

// Helper para color de estado
function getStatusColor(status: string): string {
  switch (status) {
    case 'PAID':
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
    case 'OVERDUE':
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
    case 'PARTIAL':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
    case 'PENDING':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
    case 'INTEREST_ONLY':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
    case 'CANCELADA_POR_REFINANCIACION':
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
  }
}

// Helper para label de estado
function getStatusLabel(status: string): string {
  switch (status) {
    case 'PAID':
      return 'Pagado';
    case 'OVERDUE':
      return 'Vencido';
    case 'PARTIAL':
      return 'Parcial';
    case 'PENDING':
      return 'Pendiente';
    case 'INTEREST_ONLY':
      return 'Solo Interés';
    case 'CANCELADA_POR_REFINANCIACION':
      return 'Cancelado';
    default:
      return status;
  }
}

// Helper para color de fila según estado y overdue dinámico
function isOverdue(dueDate: string, status: string): boolean {
  if (status === 'PAID') return false;
  if (status === 'INTEREST_ONLY') return false;
  // Use date-only comparison for days overdue calculation
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  // Extract YYYY-MM-DD from dueDate
  const dueDatePart = dueDate.includes('T') ? dueDate.split('T')[0] : dueDate.split(' ')[0];
  // Parse dates safely - use YYYY-MM-DD format for reliable parsing
  const todayMs = new Date(todayStr + 'T00:00:00').getTime();
  const dueMs = new Date(dueDatePart + 'T00:00:00').getTime();
  const diffDays = Math.floor((todayMs - dueMs) / (86400 * 1000));
  return !isNaN(diffDays) && diffDays > 0;
}

function getInstallmentRowClass(dynamicStatus: string, dueDate: string): string {
  if (dynamicStatus === 'PAID') return 'bg-green-50 dark:bg-green-900/20';
  if (dynamicStatus === 'CANCELADA_POR_REFINANCIACION') return 'bg-purple-50 dark:bg-purple-900/20';
  if (isOverdue(dueDate, dynamicStatus)) return 'bg-red-50 dark:bg-red-900/20';
  return '';
}

export default function InstallmentsPage() {
  const { token, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [totalMonto, setTotalMonto] = useState(0);
  const [totalMora, setTotalMora] = useState(0);
  const [vendors, setVendors] = useState<Vendor[]>([]);

  // Filter states
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [selectedVendor, setSelectedVendor] = useState('');
  const [selectedEstado, setSelectedEstado] = useState('');
  const [selectedCliente, setSelectedCliente] = useState('');

  // Payment modal state
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedLoanId, setSelectedLoanId] = useState('');
  const [selectedInstallmentId, setSelectedInstallmentId] = useState('');

  // Collection actions modal state
  const [showCollectionModal, setShowCollectionModal] = useState(false);
  const [selectedCollectionLoanId, setSelectedCollectionLoanId] = useState('');

  // Refresh trigger to re-fetch installments after mutations
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Load initial date (today) and fetch data
  useEffect(() => {
    const today = getTodayString();
    setFechaInicio(today);
    setFechaFin(today);
  }, []);

  // Fetch vendors for filter (admin only)
  useEffect(() => {
    if (token && user?.role === 'ADMIN') {
      apiFetch('/api/users/vendors')
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            setVendors(data.data);
          }
        })
        .catch(console.error);
    }
  }, [token, user?.role]);

  // Fetch installments when filters change
  useEffect(() => {
    if (!token || !fechaInicio || !fechaFin) return;

    setLoading(true);
    const params = new URLSearchParams();
    params.append('fechaInicio', fechaInicio);
    params.append('fechaFin', fechaFin);

    if (selectedVendor) {
      params.append('vendedorId', selectedVendor);
    }
    if (selectedEstado) {
      params.append('estado', selectedEstado);
    }
    if (selectedCliente) {
      params.append('cliente', selectedCliente);
    }

    apiFetch(`/api/installments?${params.toString()}`)
      .then((res) => res.json())
      .then((data: ApiResponse) => {
        if (data.success) {
          setInstallments(data.data.installments);
          setTotalMonto(data.data.totalMonto);
          setTotalMora(data.data.totalMora);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [token, fechaInicio, fechaFin, selectedVendor, selectedEstado, selectedCliente, refreshTrigger]);

  const handleFechaChange = (field: 'inicio' | 'fin', value: string) => {
    if (field === 'inicio') {
      setFechaInicio(value);
    } else {
      setFechaFin(value);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6 dark:text-white/[.87]">Cuotas</h1>

      {/* Filters */}
      <div className="mb-6 p-4 bg-white rounded-lg shadow dark:bg-[#1e1e1e]">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Fecha Inicio */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-white/87 mb-1">
              Fecha Inicio
            </label>
            <input
              type="date"
              value={fechaInicio}
              onChange={(e) => handleFechaChange('inicio', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md dark:bg-[#2a2a2a] dark:border-[#444444] dark:text-white/[.87] focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          {/* Fecha Fin */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-white/87 mb-1">
              Fecha Fin
            </label>
            <input
              type="date"
              value={fechaFin}
              onChange={(e) => handleFechaChange('fin', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md dark:bg-[#2a2a2a] dark:border-[#444444] dark:text-white/[.87] focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          {/* Cliente */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-white/87 mb-1">
              Cliente
            </label>
            <input
              type="text"
              value={selectedCliente}
              onChange={(e) => setSelectedCliente(e.target.value)}
              placeholder="Buscar cliente..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md dark:bg-[#2a2a2a] dark:border-[#444444] dark:text-white/[.87] focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          {/* Vendedor (admin only) */}
          {user?.role === 'ADMIN' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-white/87 mb-1">
                Vendedor
              </label>
              <select
                value={selectedVendor}
                onChange={(e) => setSelectedVendor(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md dark:bg-[#2a2a2a] dark:border-[#444444] dark:text-white/[.87] focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="">Todos</option>
                {vendors.map((vendor) => (
                  <option key={vendor.id} value={vendor.id}>
                    {vendor.firstName} {vendor.lastName}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Estado */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-white/87 mb-1">
              Estado
            </label>
            <select
              value={selectedEstado}
              onChange={(e) => setSelectedEstado(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md dark:bg-[#2a2a2a] dark:border-[#444444] dark:text-white/[.87] focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="">Todos</option>
              <option value="PENDING">Pendiente</option>
              <option value="PAID">Pagado</option>
              <option value="OVERDUE">Vencido</option>
              <option value="PARTIAL">Parcial</option>
              <option value="INTEREST_ONLY">Solo Interés</option>
            </select>
          </div>
        </div>
      </div>

      {/* Totals Card */}
      <div className="mb-6 p-6 bg-white rounded-lg shadow dark:bg-[#1e1e1e]">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-gray-500 dark:text-white/60">Total Saldo</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white/[.87]">
              ${totalMonto.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-white/60">Total Mora</p>
            <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
              ${totalMora.toLocaleString()}
            </p>
          </div>
          <div className="text-right sm:text-right">
            <p className="text-sm text-gray-500 dark:text-white/60">
              {installments.length} cuota{installments.length !== 1 ? 's' : ''} encontrada
              {installments.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </div>

      {/* Installments Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden dark:bg-[#1e1e1e]">
        {loading ? (
          <div className="flex items-center justify-center h-64 dark:bg-[#1e1e1e]">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 dark:border-[#39ff14]"></div>
          </div>
        ) : installments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 dark:bg-[#1e1e1e]">
            <svg
              className="w-16 h-16 text-gray-400 dark:text-white/30 mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <p className="text-gray-500 dark:text-white/60">
              No se encontraron cuotas para los filtros seleccionados
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-[#2a2a2a]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-white/60 uppercase tracking-wider">
                    Cliente
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-white/60 uppercase tracking-wider">
                    Préstamo
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-white/60 uppercase tracking-wider">
                    Cuota #
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-white/60 uppercase tracking-wider">
                    Vencimiento
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-white/60 uppercase tracking-wider">
                    Monto
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-white/60 uppercase tracking-wider">
                    Saldo
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-white/60 uppercase tracking-wider">
                    Mora
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-white/60 uppercase tracking-wider">
                    Días Venc.
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-white/60 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-white/60 uppercase tracking-wider">
                    Acción
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200 dark:bg-[#1e1e1e] dark:divide-gray-700">
                {installments.map((inst) => {
                  // Calculate days overdue inline with safe date parsing
                  const today = new Date();
                  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                  const dueDatePart = inst.dueDate.includes('T') ? inst.dueDate.split('T')[0] : inst.dueDate.split(' ')[0];
                  const todayMs = new Date(todayStr + 'T00:00:00').getTime();
                  const dueMs = new Date(dueDatePart + 'T00:00:00').getTime();
                  const diffDays = Math.floor((todayMs - dueMs) / (86400 * 1000));
                  const daysOverdue = !isNaN(diffDays) ? Math.max(0, diffDays) : 0;
                  
                  // Only PENDING can become OVERDUE dynamically based on due date
                  const dynamicStatus = (inst.status === 'PENDING' && daysOverdue > 0) ? 'OVERDUE' : inst.status;
                  
                  return (
                  <tr key={inst.id} className={`hover:bg-gray-50 dark:hover:bg-[#2a2a2a] ${getInstallmentRowClass(dynamicStatus, inst.dueDate)}`}>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium dark:text-white/[.87]">{inst.client.name}</p>
                        <p className="text-sm text-gray-500 dark:text-white/38">
                          {inst.client.phone || 'Sin teléfono'}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={`/admin/loans/${inst.loanId}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-primary-600 hover:text-primary-900 dark:text-[#39ff14] dark:hover:text-[#32e012]"
                      >
                        {inst.loanId.slice(0, 8)}...
                      </a>
                    </td>
                    <td className="px-4 py-3 dark:text-white/[.87]">#{inst.installmentNumber}</td>
                    <td className="px-4 py-3 dark:text-white/[.87]">
                      {formatDateDisplay(inst.dueDate)}
                    </td>
                    <td className="px-4 py-3 dark:text-white/[.87]">
                      ${Number(inst.amount).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="font-medium dark:text-white/[.87]">${Number(inst.balance).toLocaleString()}</span>
                        {inst.paidAmount > 0 && (
                          <span className="text-xs text-green-600 dark:text-green-400">
                            Pagado: ${Number(inst.paidAmount).toLocaleString()}
                          </span>
                        )}
                      </div>
                    </td>
                    {dynamicStatus === 'PARTIAL' || dynamicStatus === 'OVERDUE' ? (
                      <>
                        <td className="px-4 py-3 text-orange-600 dark:text-orange-400">
                          ${inst.moraAmount.toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            daysOverdue > 30
                              ? 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-400'
                              : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-400'
                          }`}>
                            {daysOverdue}
                          </span>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 text-orange-600 dark:text-orange-400">
                          ${inst.moraAmount.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 dark:text-white/[.38]">
                          -
                        </td>
                      </>
                    )}
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(dynamicStatus)}`}
                      >
                        {getStatusLabel(dynamicStatus)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          onClick={() => {
                            setSelectedLoanId(inst.loanId);
                            setSelectedInstallmentId(inst.id);
                            setShowPaymentModal(true);
                          }}
                          className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50"
                        >
                          Pagar
                        </button>
                        <button
                          onClick={() => {
                            setSelectedCollectionLoanId(inst.loanId);
                            setShowCollectionModal(true);
                          }}
                          className="px-2 py-1 text-xs font-medium bg-orange-100 text-orange-700 rounded hover:bg-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:hover:bg-orange-900/50"
                        >
                          Cobranza
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payment Modal */}
      {showPaymentModal && selectedLoanId && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black bg-opacity-50 dark:bg-opacity-70"
            onClick={() => setShowPaymentModal(false)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-[#1e1e1e] rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto my-8">
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
                    // Refresh entire page with current filters to show updated statuses
                    setRefreshTrigger(prev => prev + 1);
                  }}
                  onCancel={() => setShowPaymentModal(false)}
                />
              </div>
            </div>
          </div>
        </>
      )}

      {/* Collection Actions Modal */}
      {showCollectionModal && selectedCollectionLoanId && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black bg-opacity-50 dark:bg-opacity-70"
            onClick={() => setShowCollectionModal(false)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-[#1e1e1e] rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto my-8">
              <div className="p-4 border-b dark:border-gray-700 flex justify-between items-center">
                <h2 className="text-lg font-semibold dark:text-white/[.87]">
                  Registrar Acción de Cobranza
                </h2>
                <button
                  onClick={() => setShowCollectionModal(false)}
                  className="text-gray-400 dark:text-white/38 hover:text-gray-600 dark:hover:text-white/87"
                >
                  ✕
                </button>
              </div>
              <div className="p-4">
                <CollectionActionsModal
                  loanId={selectedCollectionLoanId}
                  onSuccess={() => {
                    setShowCollectionModal(false);
                    // Refresh entire page with current filters to show updated statuses
                    setRefreshTrigger(prev => prev + 1);
                  }}
                  onCancel={() => setShowCollectionModal(false)}
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}