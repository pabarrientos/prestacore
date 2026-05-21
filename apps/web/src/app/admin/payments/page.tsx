'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api';
import { getTodayString } from '@/lib/datetime';

interface Payment {
  id: string;
  fecha: string;
  cliente: string;
  vendedor: string | null;
  prestamoId: string;
  cuota: number | null;
  monto: number;
  estado: string;
  referencia?: string;
  notas?: string;
  fechaPago: string;
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
    payments: Payment[];
    totalMonto: number;
    filtros: {
      fechaInicio: string;
      fechaFin: string;
      vendedorId: string | null;
      estado: string | null;
    };
  };
}

// Helper para formatear fecha YYYY-MM-DD a DD/MM/YYYY
function formatDateDisplay(fecha: string): string {
  if (!fecha) return '-';
  const datePart = fecha.split(' ')[0];
  const [year, month, day] = datePart.split('-');
  return `${day}/${month}/${year}`;
}

// Helper para color de estado
function getStatusColor(estado: string): string {
  switch (estado) {
    case 'COMPLETED':
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
    case 'PENDING':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
    case 'FAILED':
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
    case 'REFUNDED':
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
  }
}

export default function PagosPage() {
  const { token, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [totalMonto, setTotalMonto] = useState(0);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  
  // Filter states
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [selectedVendor, setSelectedVendor] = useState('');
  const [selectedEstado, setSelectedEstado] = useState('');
  const [selectedCliente, setSelectedCliente] = useState('');

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

  // Fetch payments when filters change
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

    apiFetch(`/api/payments/by-date?${params.toString()}`)
      .then((res) => res.json())
      .then((data: ApiResponse) => {
        if (data.success) {
          setPayments(data.data.payments);
          setTotalMonto(data.data.totalMonto);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [token, fechaInicio, fechaFin, selectedVendor, selectedEstado, selectedCliente]);

  const handleFechaChange = (field: 'inicio' | 'fin', value: string) => {
    if (field === 'inicio') {
      setFechaInicio(value);
    } else {
      setFechaFin(value);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6 dark:text-white/[.87]">Control de Pagos</h1>

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
              <option value="COMPLETED">Completado</option>
              <option value="FAILED">Fallido</option>
              <option value="REFUNDED">Reembolsado</option>
            </select>
          </div>
        </div>
      </div>

      {/* Totals Card */}
      <div className="mb-6 p-6 bg-white rounded-lg shadow dark:bg-[#1e1e1e]">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500 dark:text-white/60">Total Pagos</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white/[.87]">
              ${totalMonto.toLocaleString()}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500 dark:text-white/60">
              {payments.length} pago{payments.length !== 1 ? 's' : ''} encontrado{payments.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </div>

      {/* Payments Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden dark:bg-[#1e1e1e]">
        {loading ? (
          <div className="flex items-center justify-center h-64 dark:bg-[#1e1e1e]">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 dark:border-[#39ff14]"></div>
          </div>
        ) : payments.length === 0 ? (
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
            <p className="text-gray-500 dark:text-white/60">No se encontraron pagos para los filtros seleccionados</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-[#2a2a2a]">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-white/60 uppercase tracking-wider">
                    Fecha
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-white/60 uppercase tracking-wider">
                    Cliente
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-white/60 uppercase tracking-wider">
                    Vendedor
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-white/60 uppercase tracking-wider">
                    Préstamo
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-white/60 uppercase tracking-wider">
                    Cuota
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-white/60 uppercase tracking-wider">
                    Monto
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-white/60 uppercase tracking-wider">
                    Estado
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200 dark:bg-[#1e1e1e] dark:divide-gray-700">
                {payments.map((payment) => (
                  <tr 
                    key={payment.id} 
                    className="hover:bg-gray-50 dark:hover:bg-[#2a2a2a] cursor-pointer"
                    onClick={() => setSelectedPayment(payment)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm dark:text-white/[.87]">
                      {formatDateDisplay(payment.fecha)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm dark:text-white/[.87]">
                      {payment.cliente}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm dark:text-white/[.87]">
                      {payment.vendedor || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm dark:text-white/[.87]">
                      <a href={`/admin/loans/${payment.prestamoId}`} onClick={(e) => e.stopPropagation()} className="text-primary-600 hover:text-primary-900 dark:text-[#39ff14] dark:hover:text-[#2ecc71]">
                        {payment.prestamoId.slice(0, 8)}...
                      </a>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm dark:text-white/[.87]">
                      {payment.cuota ? `#${payment.cuota}` : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium dark:text-white/[.87]">
                      ${payment.monto.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(payment.estado)}`}>
                        {payment.estado === 'COMPLETED' && 'Completado'}
                        {payment.estado === 'PENDING' && 'Pendiente'}
                        {payment.estado === 'FAILED' && 'Fallido'}
                        {payment.estado === 'REFUNDED' && 'Reembolsado'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Payment Detail Modal */}
        {selectedPayment && (
          <div className="fixed inset-0 z-50" onClick={() => setSelectedPayment(null)}>
            <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
              <div className="fixed inset-0 bg-black/50 dark:bg-black/70"></div>
              
              <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
              
              <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg w-full dark:bg-[#1e1e1e]" onClick={(e) => e.stopPropagation()}>
                <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4 dark:bg-[#1e1e1e]">
                  <div className="sm:flex sm:items-start">
                    <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                      <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white mb-4">
                        Detalle del Pago
                      </h3>
                      <div className="mt-2 space-y-3">
                        <div>
                          <p className="text-sm font-medium text-gray-500 dark:text-white/60">Fecha</p>
                          <p className="text-sm text-gray-900 dark:text-white/[.87]">{formatDateDisplay(selectedPayment.fecha)}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-500 dark:text-white/60">Cliente</p>
                          <p className="text-sm text-gray-900 dark:text-white/[.87]">{selectedPayment.cliente}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-500 dark:text-white/60">Vendedor</p>
                          <p className="text-sm text-gray-900 dark:text-white/[.87]">{selectedPayment.vendedor || '-'}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-500 dark:text-white/60">Monto</p>
                          <p className="text-sm text-gray-900 dark:text-white/[.87]">${(selectedPayment.monto).toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-500 dark:text-white/60">Estado</p>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(selectedPayment.estado)}`}>
                            {selectedPayment.estado === 'COMPLETED' && 'Completado'}
                            {selectedPayment.estado === 'PENDING' && 'Pendiente'}
                            {selectedPayment.estado === 'FAILED' && 'Fallido'}
                            {selectedPayment.estado === 'REFUNDED' && 'Reembolsado'}
                          </span>
                        </div>
                        {selectedPayment.referencia && (
                          <div>
                            <p className="text-sm font-medium text-gray-500 dark:text-white/60">Referencia</p>
                            <p className="text-sm text-gray-900 dark:text-white/[.87]">{selectedPayment.referencia}</p>
                          </div>
                        )}
                        {selectedPayment.notas && (
                          <div>
                            <p className="text-sm font-medium text-gray-500 dark:text-white/60">Notas</p>
                            <p className="text-sm text-gray-900 dark:text-white/[.87]">{selectedPayment.notas}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse dark:bg-[#2a2a2a]">
                  <button
                    type="button"
                    className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-primary-600 text-base font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 sm:ml-3 sm:w-auto sm:text-sm"
                    onClick={() => setSelectedPayment(null)}
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}