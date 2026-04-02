'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';

interface DashboardMetrics {
  totalLoans: number;
  activeLoans: number;
  pendingApprovals: number;
  futureCollectionAmount: number;
  totalDisbursed: number;
  totalCollected: number;
  statusBreakdown: Record<string, number>;
  totalOverdueInstallments: number;
  totalOverdueAmount: number;
  overdueByDays: {
    range: string;
    count: number;
    amount: number;
  }[];
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function AdminDashboard() {
  const { user, token } = useAuth();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      fetch(`${API_URL}/api/dashboard`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            setMetrics(data.data);
          }
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [token]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Préstamos */}
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm text-gray-500">Total Préstamos</p>
          <p className="text-3xl font-bold text-gray-900">{metrics?.totalLoans || 0}</p>
        </div>

        {/* Préstamos Activos */}
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm text-gray-500">Préstamos Activos</p>
          <p className="text-3xl font-bold text-green-600">{metrics?.activeLoans || 0}</p>
        </div>

        {/* Pendientes de Aprobación */}
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm text-gray-500">Pendientes</p>
          <p className="text-3xl font-bold text-yellow-600">{metrics?.pendingApprovals || 0}</p>
        </div>

        {/* Monto a Cobrar a Futuro */}
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm text-gray-500">Monto a Cobrar a Futuro</p>
          <p className="text-3xl font-bold text-blue-600">
            ${(metrics?.futureCollectionAmount || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
          </p>
        </div>

        {/* Total Desembolsado */}
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm text-gray-500">Total Desembolsado</p>
          <p className="text-3xl font-bold text-gray-900">
            ${(metrics?.totalDisbursed || 0).toLocaleString()}
          </p>
        </div>

        {/* Total Cobrado */}
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm text-gray-500">Total Cobrado</p>
          <p className="text-3xl font-bold text-green-600">
            ${(metrics?.totalCollected || 0).toLocaleString()}
          </p>
        </div>

        {/* Cuotas Vencidas */}
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm text-gray-500">Cuotas Vencidas</p>
          <p className="text-3xl font-bold text-red-600">{metrics?.totalOverdueInstallments || 0}</p>
        </div>

        {/* Total Vencido */}
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm text-gray-500">Monto Vencido</p>
          <p className="text-3xl font-bold text-red-600">
            ${(metrics?.totalOverdueAmount || 0).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Distribución por Antigüedad de Mora */}
      {metrics?.overdueByDays && metrics.overdueByDays.length > 0 && (
        <div className="mt-6 bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Distribución de Mora por Antigüedad</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {metrics.overdueByDays.map((item) => (
              <div key={item.range} className="text-center p-4 bg-gray-50 rounded-lg">
                <p className="text-sm font-medium">{item.range}</p>
                <p className="text-2xl font-bold text-red-600">{item.count}</p>
                <p className="text-xs text-gray-500">
                  ${item.amount.toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Estado de Préstamos */}
      <div className="mt-8 bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Estado de Préstamos</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {metrics?.statusBreakdown && Object.entries(metrics.statusBreakdown).map(([status, count]) => (
            <div key={status} className="text-center p-4 bg-gray-50 rounded-lg">
              <p className="text-2xl font-bold">{count}</p>
              <p className="text-sm text-gray-500">{status}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-4 gap-6">
        <a
          href="/admin/loans"
          className="block p-6 bg-white rounded-lg shadow hover:shadow-md transition"
        >
          <h3 className="text-lg font-semibold mb-2">Gestionar Préstamos</h3>
          <p className="text-gray-600">Ver y aprobar solicitudes de préstamos</p>
        </a>
        
        <a
          href="/admin/overdue"
          className="block p-6 bg-white rounded-lg shadow hover:shadow-md transition border-l-4 border-red-500"
        >
          <h3 className="text-lg font-semibold mb-2">Cuotas Vencidas</h3>
          <p className="text-gray-600">{metrics?.totalOverdueInstallments || 0} cuotas - ${(metrics?.totalOverdueAmount || 0).toLocaleString()}</p>
        </a>
        
        <a
          href="/admin/clients"
          className="block p-6 bg-white rounded-lg shadow hover:shadow-md transition"
        >
          <h3 className="text-lg font-semibold mb-2">Gestionar Clientes</h3>
          <p className="text-gray-600">Administrar clientes del sistema</p>
        </a>
        
        <a
          href="/simulator"
          className="block p-6 bg-white rounded-lg shadow hover:shadow-md transition"
        >
          <h3 className="text-lg font-semibold mb-2">Simulador</h3>
          <p className="text-gray-600">Probar el simulador de préstamos</p>
        </a>
      </div>
    </div>
  );
}
