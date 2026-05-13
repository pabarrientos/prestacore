'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';

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

export default function MisComisionesPage() {
  const { user, token } = useAuth();
  const [data, setData] = useState<VendorSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token || user?.role !== 'VENDEDOR') return;

    fetch(`${API_URL}/api/commissions/vendor/${user.userId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => res.json())
      .then(result => {
        if (result.success) {
          setData(result.data);
        } else {
          setError(result.error || 'Error al cargar datos');
        }
      })
      .catch(err => {
        console.error(err);
        setError('Error de conexión');
      })
      .finally(() => setLoading(false));
  }, [token, user]);

  if (user?.role !== 'VENDEDOR') {
    return (
      <div className="text-center py-8">
        <p className="text-red-600">Acceso denegado. Solo vendedores.</p>
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

  const getModeLabel = (mode: string | null) => {
    const labels: Record<string, string> = {
      PROPORTIONAL: 'Proporcional',
      AFTER_CAPITAL_RECOVERY: 'Después de Recuperar Capital',
      ADVANCED: 'Avanzado',
    };
    return mode ? labels[mode] || mode : 'No configurada';
  };

  if (!data) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500 dark:text-white/60">{error || 'No hay datos disponibles'}</p>
      </div>
    );
  }

  const { vendor, summary } = data;

  return (
    <div>
      <h1 className="text-2xl md:text-3xl font-bold mb-6 dark:text-white/[.87]">Mis Comisiones</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-lg shadow p-6 dark:bg-[#1e1e1e]">
          <p className="text-sm text-gray-500 dark:text-white/60 mb-1">Total Generada</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatCurrency(summary.totalGenerated)}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6 dark:bg-[#1e1e1e]">
          <p className="text-sm text-gray-500 dark:text-white/60 mb-1">Total Liquidada</p>
          <p className="text-2xl font-bold text-green-600 dark:text-green-400">{formatCurrency(summary.totalLiquidated)}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6 dark:bg-[#1e1e1e]">
          <p className="text-sm text-gray-500 dark:text-white/60 mb-1">Pendiente</p>
          <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{formatCurrency(summary.pending)}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6 dark:bg-[#1e1e1e]">
          <p className="text-sm text-gray-500 dark:text-white/60 mb-1">Mi Tasa</p>
          <p className="text-2xl font-bold text-primary-600 dark:text-[#39ff14]">
            {vendor.commissionPercentage !== null ? `${vendor.commissionPercentage}%` : '-'}
          </p>
        </div>
      </div>

      {/* Commission Details */}
      <div className="bg-white rounded-lg shadow p-6 dark:bg-[#1e1e1e] mb-6">
        <h2 className="text-lg font-semibold mb-4 dark:text-white/[.87]">Configuración de Mi Comisión</h2>
        
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-500 dark:text-white/60">Porcentaje</p>
            <p className="font-medium text-gray-900 dark:text-white">
              {vendor.commissionPercentage !== null ? `${vendor.commissionPercentage}%` : 'No configurada'}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-white/60">Modalidad</p>
            <p className="font-medium text-gray-900 dark:text-white">{getModeLabel(vendor.commissionMode)}</p>
          </div>
        </div>

        {vendor.commissionPercentage === null && (
          <div className="mt-4 p-4 bg-yellow-50 text-yellow-800 rounded-lg dark:bg-yellow-950/50 dark:text-yellow-400">
            <p className="font-medium">Tu comisión aún no ha sido configurada por un administrador.</p>
            <p className="text-sm mt-1">Contacta a un administrador para configurar tu porcentaje y modalidad de comisión.</p>
          </div>
        )}
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 rounded-lg p-4 dark:bg-blue-950/50">
        <h3 className="font-medium text-blue-900 dark:text-blue-400 mb-2">¿Cómo funcionan las comisiones?</h3>
        <div className="text-sm text-blue-700 dark:text-blue-300 space-y-2">
          <p>
            <strong>Proporcional:</strong> ganas un porcentaje del interés de cada cuota pagada por tus clientes.
          </p>
          <p>
            <strong>Después de Recuperar Capital:</strong> empiezas a ganar comisión una vez que el capital prestado ha sido recuperado.
          </p>
          <p>
            <strong>Avanzado:</strong> las primeras cuotas tienen mayor peso, distribuyendo más comisión al inicio del préstamo.
          </p>
        </div>
      </div>

      <div className="mt-6 text-center text-sm text-gray-500 dark:text-white/60">
        <p>Préstamos activos con comisión: <strong>{summary.loansCount}</strong></p>
      </div>
    </div>
  );
}
