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
  commission?: {
    totalGenerated: number;
    totalProjected: number;
    totalLiquidated: number;
  };
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function AdminDashboard() {
  const { token } = useAuth();
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
      <div className="flex items-center justify-center h-64 dark:bg-[#121212]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 dark:border-[#39ff14]"></div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6 dark:text-white/[.87]">Dashboard</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Préstamos */}
        <div className="bg-white rounded-lg shadow p-6 dark:bg-[#1e1e1e]">
          <p className="text-sm text-gray-500 dark:text-white/60">Total Préstamos</p>
          <p className="text-3xl font-bold text-gray-900 dark:text-white/[.87]">{metrics?.totalLoans || 0}</p>
        </div>

        {/* Préstamos Activos */}
        <div className="bg-white rounded-lg shadow p-6 dark:bg-[#1e1e1e]">
          <p className="text-sm text-gray-500 dark:text-white/60">Préstamos Activos</p>
          <p className="text-3xl font-bold text-green-600 dark:text-green-400">{metrics?.activeLoans || 0}</p>
        </div>

        {/* Pendientes de Aprobación */}
        <div className="bg-white rounded-lg shadow p-6 dark:bg-[#1e1e1e]">
          <p className="text-sm text-gray-500 dark:text-white/60">Pendientes</p>
          <p className="text-3xl font-bold text-yellow-600 dark:text-yellow-400">{metrics?.pendingApprovals || 0}</p>
        </div>

        {/* Monto a Cobrar a Futuro */}
        <div className="bg-white rounded-lg shadow p-6 dark:bg-[#1e1e1e]">
          <p className="text-sm text-gray-500 dark:text-white/60">Monto a Cobrar a Futuro</p>
          <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">
            ${(metrics?.futureCollectionAmount || 0).toLocaleString()}
          </p>
        </div>

        {/* Total Desembolsado */}
        <div className="bg-white rounded-lg shadow p-6 dark:bg-[#1e1e1e]">
          <p className="text-sm text-gray-500 dark:text-white/60">Total Desembolsado</p>
          <p className="text-3xl font-bold text-gray-900 dark:text-white/[.87]">
            ${(metrics?.totalDisbursed || 0).toLocaleString()}
          </p>
        </div>

        {/* Total Cobrado */}
        <div className="bg-white rounded-lg shadow p-6 dark:bg-[#1e1e1e]">
          <p className="text-sm text-gray-500 dark:text-white/60">Total Cobrado</p>
          <p className="text-3xl font-bold text-green-600 dark:text-green-400">
            ${(metrics?.totalCollected || 0).toLocaleString()}
          </p>
        </div>

        {/* Cuotas Vencidas */}
        <div className="bg-white rounded-lg shadow p-6 dark:bg-[#1e1e1e]">
          <p className="text-sm text-gray-500 dark:text-white/60">Cuotas Vencidas</p>
          <p className="text-3xl font-bold text-red-600 dark:text-red-400">{metrics?.totalOverdueInstallments || 0}</p>
        </div>

        {/* Total Vencido */}
        <div className="bg-white rounded-lg shadow p-6 dark:bg-[#1e1e1e]">
          <p className="text-sm text-gray-500 dark:text-white/60">Monto Vencido</p>
          <p className="text-3xl font-bold text-red-600 dark:text-red-400">
            ${(metrics?.totalOverdueAmount || 0).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Commission Summary */}
      {metrics?.commission && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
          <div className="bg-white rounded-lg shadow p-6 dark:bg-[#1e1e1e]">
            <p className="text-sm text-gray-500 dark:text-white/60">Comisión Generada</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">
              ${(metrics.commission.totalGenerated || 0).toLocaleString()}
            </p>
          </div>
          <div className="bg-white rounded-lg shadow p-6 dark:bg-[#1e1e1e]">
            <p className="text-sm text-gray-500 dark:text-white/60">Comisión Proyectada</p>
            <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">
              ${(metrics.commission.totalProjected || 0).toLocaleString()}
            </p>
          </div>
          <div className="bg-white rounded-lg shadow p-6 dark:bg-[#1e1e1e]">
            <p className="text-sm text-gray-500 dark:text-white/60">Comisión Liquidada</p>
            <p className="text-3xl font-bold text-green-600 dark:text-green-400">
              ${(metrics.commission.totalLiquidated || 0).toLocaleString()}
            </p>
          </div>
        </div>
      )}

      {/* Distribución por Antigüedad de Mora */}
      {metrics?.overdueByDays && metrics.overdueByDays.length > 0 && (
        <div className="mt-6 bg-white rounded-lg shadow p-6 dark:bg-[#1e1e1e]">
          <h2 className="text-lg font-semibold mb-4 dark:text-white/[.87]">Distribución de Mora por Antigüedad</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            {metrics.overdueByDays.map((item) => {
              const colorMap: Record<string, string> = {
                '0 días': 'text-yellow-500 dark:text-yellow-400',
                '1-7 días': 'text-orange-500 dark:text-orange-400',
                '8-14 días': 'text-orange-600 dark:text-orange-300',
                '15-30 días': 'text-red-500 dark:text-red-400',
                '31-60 días': 'text-red-600 dark:text-red-300',
                '60+ días': 'text-red-700 dark:text-red-200',
              };
              const color = colorMap[item.range] || 'text-red-600 dark:text-red-400';
              return (
              <div key={item.range} className="text-center p-4 bg-gray-50 rounded-lg dark:bg-[#1a1a1a]">
                <p className="text-sm font-medium dark:text-white/[.87]">{item.range}</p>
                <p className={`text-2xl font-bold ${color}`}>{item.count}</p>
                <p className="text-xs text-gray-500 dark:text-white/60">
                  ${item.amount.toLocaleString()}
                </p>
              </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Estado de Préstamos */}
      <div className="mt-8 bg-white rounded-lg shadow p-6 dark:bg-[#1e1e1e]">
        <h2 className="text-lg font-semibold mb-4 dark:text-white/[.87]">Estado de Préstamos</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
          {metrics?.statusBreakdown && Object.entries(metrics.statusBreakdown).map(([status, count]) => (
            <div key={status} className="text-center p-4 bg-gray-50 rounded-lg dark:bg-[#1a1a1a]">
              <p className="text-2xl font-bold dark:text-white/[.87]">{count}</p>
              <p className="text-sm text-gray-500 dark:text-white/60">{status}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-4 gap-6">
        <a
          href="/admin/loans"
          className="block p-6 bg-white rounded-lg shadow hover:shadow-md transition dark:bg-[#1e1e1e] dark:hover:shadow-[0_0_15px_rgba(57,255,20,0.15)]"
        >
          <h3 className="text-lg font-semibold mb-2 dark:text-white/[.87]">Gestionar Préstamos</h3>
          <p className="text-gray-600 dark:text-white/60">Ver y aprobar solicitudes de préstamos</p>
        </a>
        
        <a
          href="/admin/overdue"
          className="block p-6 bg-white rounded-lg shadow hover:shadow-md transition border-l-4 border-red-500 dark:bg-[#1e1e1e] dark:hover:shadow-[0_0_15px_rgba(57,255,20,0.15)] dark:border-red-500"
        >
          <h3 className="text-lg font-semibold mb-2 dark:text-white/[.87]">Cuotas Vencidas</h3>
          <p className="text-gray-600 dark:text-white/60">{metrics?.totalOverdueInstallments || 0} cuotas - ${(metrics?.totalOverdueAmount || 0).toLocaleString()}</p>
        </a>
        
        <a
          href="/admin/clients"
          className="block p-6 bg-white rounded-lg shadow hover:shadow-md transition dark:bg-[#1e1e1e] dark:hover:shadow-[0_0_15px_rgba(57,255,20,0.15)]"
        >
          <h3 className="text-lg font-semibold mb-2 dark:text-white/[.87]">Gestionar Clientes</h3>
          <p className="text-gray-600 dark:text-white/60">Administrar clientes del sistema</p>
        </a>
        
        <a
          href="/admin/payments"
          className="block p-6 bg-white rounded-lg shadow hover:shadow-md transition dark:bg-[#1e1e1e] dark:hover:shadow-[0_0_15px_rgba(57,255,20,0.15)]"
        >
          <h3 className="text-lg font-semibold mb-2 dark:text-white/[.87]">Control de Pagos</h3>
          <p className="text-gray-600 dark:text-white/60">Listar pagos realizados por fecha</p>
        </a>
      </div>
    </div>
  );
}
