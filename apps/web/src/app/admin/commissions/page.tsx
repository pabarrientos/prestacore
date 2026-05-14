'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface VendorSummary {
  vendor: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    commissionPercentage: number | null;
    commissionMode: string | null;
  };
  summary: {
    totalGenerated: number;
    totalLiquidated: number;
    totalProjected: number;
    pending: number;
    loansCount: number;
  };
}

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}

export default function CommissionsPage() {
  const { user, token } = useAuth();
  const [vendors, setVendors] = useState<VendorSummary[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token || user?.role !== 'ADMIN') return;

    // Fetch all vendors (users with role VENDEDOR)
    fetch(`${API_URL}/api/users`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          const vendorUsers = data.data.filter((u: User) => u.role === 'VENDEDOR');
          setUsers(vendorUsers);
          
          // Fetch commission summary for each vendor
          Promise.all(
            vendorUsers.map((vendor: User) =>
              fetch(`${API_URL}/api/commissions/vendor/${vendor.id}`, {
                headers: { Authorization: `Bearer ${token}` },
              })
                .then(res => res.json())
                .then(data => data.success ? data.data : null)
                .catch(() => null)
            )
          ).then(summaries => {
            const withSummaries = vendorUsers.map((vendor: User, i: number) => ({
              vendor,
              summary: summaries[i]?.summary || {
                totalGenerated: 0,
                totalLiquidated: 0,
                totalProjected: 0,
                pending: 0,
                loansCount: 0,
              },
            }));
            setVendors(withSummaries);
          });
        }
      })
      .catch(err => {
        console.error(err);
        setError('Error al cargar vendedores');
      })
      .finally(() => setLoading(false));
  }, [token, user]);

  if (user?.role !== 'ADMIN') {
    return (
      <div className="text-center py-8">
        <p className="text-red-600">Acceso denegado. Solo administradores.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 dark:border-[#39ff14]"></div>
      </div>
    );
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
    }).format(amount);
  };

  const getModeBadge = (mode: string | null) => {
    const styles: Record<string, string> = {
      PROPORTIONAL: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-400',
      AFTER_CAPITAL_RECOVERY: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-400',
      ADVANCED: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-400',
    };
    const labels: Record<string, string> = {
      PROPORTIONAL: 'Proporcional',
      AFTER_CAPITAL_RECOVERY: 'Después Capital',
      ADVANCED: 'Adelantado',
    };
    if (!mode) return null;
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded ${styles[mode] || 'bg-gray-100 text-gray-800'}`}>
        {labels[mode] || mode}
      </span>
    );
  };

  return (
    <div>
      <h1 className="text-2xl md:text-3xl font-bold mb-6 dark:text-white/[.87]">Comisiones de Vendedores</h1>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="bg-white rounded-lg shadow dark:bg-[#1e1e1e] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-[#2a2a2a]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-white/60">
                  Vendedor
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-white/60">
                  Generada
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-white/60">
                  Proyectada
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-white/60">
                  Liquidada
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-white/60">
                  Pendiente
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-white/60">
                  Préstamos
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-white/60">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-[#333]">
              {vendors.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500 dark:text-white/60">
                    No hay vendedores registrados
                  </td>
                </tr>
              ) : (
                vendors.map(({ vendor, summary }) => (
                  <tr key={vendor.id} className="hover:bg-gray-50 dark:hover:bg-[#2a2a2a]">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 dark:text-white">
                        {vendor.firstName} {vendor.lastName}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-white/60">{vendor.email}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">
                      {formatCurrency(summary.totalGenerated)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-blue-600 dark:text-blue-400">
                      {formatCurrency(summary.totalProjected)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-green-600 dark:text-green-400">
                      {formatCurrency(summary.totalLiquidated)}
                    </td>
                    <td className={`px-4 py-3 text-right font-medium ${summary.pending < 0 ? 'text-red-600 dark:text-red-400' : 'text-yellow-600 dark:text-yellow-400'}`}>
                      {formatCurrency(summary.pending)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500 dark:text-white/60">
                      {summary.loansCount}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Link
                        href={`/admin/commissions/${vendor.id}`}
                        className="text-primary-600 hover:text-primary-800 dark:text-[#39ff14] dark:hover:text-[#32e012] text-sm font-medium"
                      >
                        Ver detalle
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
