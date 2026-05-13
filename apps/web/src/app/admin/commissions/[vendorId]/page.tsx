'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useParams } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface VendorDetail {
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

interface AuditEntry {
  id: string;
  field: string;
  previousValue: string;
  newValue: string;
  changedByName: string;
  createdAt: string;
}

export default function VendorCommissionPage() {
  const params = useParams();
  const vendorId = params.vendorId as string;
  const { user, token } = useAuth();
  const [data, setData] = useState<VendorDetail | null>(null);
  const [audits, setAudits] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Form state
  const [percentage, setPercentage] = useState('');
  const [mode, setMode] = useState('PROPORTIONAL');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  
  // Liquidation state
  const [liquidationAmount, setLiquidationAmount] = useState('');
  const [liquidationNotes, setLiquidationNotes] = useState('');
  const [liquidating, setLiquidating] = useState(false);
  const [liquidationMessage, setLiquidationMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    if (!token || user?.role !== 'ADMIN') return;

    // Fetch vendor commission data
    fetch(`${API_URL}/api/commissions/vendor/${vendorId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => res.json())
      .then(result => {
        if (result.success) {
          setData(result.data);
          setPercentage(result.data.vendor.commissionPercentage?.toString() || '');
          setMode(result.data.vendor.commissionMode || 'PROPORTIONAL');
        }
      })
      .catch(err => {
        console.error(err);
        setError('Error al cargar datos del vendedor');
      });

    // Fetch audit history
    fetch(`${API_URL}/api/commissions/audit/${vendorId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => res.json())
      .then(result => {
        if (result.success) {
          setAudits(result.data);
        }
      })
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, [token, user, vendorId]);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    const pct = parseFloat(percentage);
    if (isNaN(pct) || pct < 0 || pct > 100) {
      setMessage({ type: 'error', text: 'El porcentaje debe estar entre 0 y 100' });
      return;
    }

    setSaving(true);
    setMessage({ type: '', text: '' });

    try {
      const res = await fetch(`${API_URL}/api/commissions/config/${vendorId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ percentage: pct, mode }),
      });

      const result = await res.json();

      if (result.success) {
        setMessage({ type: 'success', text: 'Configuración actualizada correctamente' });
        // Refresh data
        const refreshRes = await fetch(`${API_URL}/api/commissions/vendor/${vendorId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const refreshData = await refreshRes.json();
        if (refreshData.success) {
          setData(refreshData.data);
        }
      } else {
        setMessage({ type: 'error', text: result.error || 'Error al guardar' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Error de conexión' });
    } finally {
      setSaving(false);
    }
  };

  const handleLiquidate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    const amount = parseFloat(liquidationAmount);
    if (isNaN(amount) || amount <= 0) {
      setLiquidationMessage({ type: 'error', text: 'El monto debe ser mayor a 0' });
      return;
    }

    setLiquidating(true);
    setLiquidationMessage({ type: '', text: '' });

    try {
      const res = await fetch(`${API_URL}/api/commissions/liquidate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ vendorId, amount, notes: liquidationNotes }),
      });

      const result = await res.json();

      if (result.success) {
        setLiquidationMessage({ type: 'success', text: `Liquidación de ${formatCurrency(amount)} registrada correctamente` });
        setLiquidationAmount('');
        setLiquidationNotes('');
        // Refresh data
        const refreshRes = await fetch(`${API_URL}/api/commissions/vendor/${vendorId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const refreshData = await refreshRes.json();
        if (refreshData.success) {
          setData(refreshData.data);
        }
      } else {
        setLiquidationMessage({ type: 'error', text: result.error || 'Error al liquidar' });
      }
    } catch {
      setLiquidationMessage({ type: 'error', text: 'Error de conexión' });
    } finally {
      setLiquidating(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('es-AR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

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

  if (!data) {
    return (
      <div className="text-center py-8">
        <p className="text-red-600">Vendedor no encontrado</p>
      </div>
    );
  }

  const { vendor, summary } = data;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold dark:text-white/[.87]">
          Comisiones de {vendor.firstName} {vendor.lastName}
        </h1>
        <p className="text-gray-500 dark:text-white/60">{vendor.email}</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-lg shadow p-4 dark:bg-[#1e1e1e]">
          <p className="text-sm text-gray-500 dark:text-white/60 mb-1">Total Generada</p>
          <p className="text-xl font-bold text-gray-900 dark:text-white">{formatCurrency(summary.totalGenerated)}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 dark:bg-[#1e1e1e]">
          <p className="text-sm text-gray-500 dark:text-white/60 mb-1">Total Liquidada</p>
          <p className="text-xl font-bold text-green-600 dark:text-green-400">{formatCurrency(summary.totalLiquidated)}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 dark:bg-[#1e1e1e]">
          <p className="text-sm text-gray-500 dark:text-white/60 mb-1">Pendiente</p>
          <p className="text-xl font-bold text-yellow-600 dark:text-yellow-400">{formatCurrency(summary.pending)}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 dark:bg-[#1e1e1e]">
          <p className="text-sm text-gray-500 dark:text-white/60 mb-1">Préstamos</p>
          <p className="text-xl font-bold text-gray-900 dark:text-white">{summary.loansCount}</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Config Form */}
        <div className="bg-white rounded-lg shadow p-6 dark:bg-[#1e1e1e]">
          <h2 className="text-lg font-semibold mb-4 dark:text-white/[.87]">Configuración de Comisión</h2>
          
          {message.text && (
            <div className={`mb-4 p-3 rounded-lg ${message.type === 'success' ? 'bg-green-50 text-green-600 dark:bg-green-950/50 dark:text-green-400' : 'bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400'}`}>
              {message.text}
            </div>
          )}

          <form onSubmit={handleSaveConfig}>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-white/60">
                Porcentaje de Comisión (%)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={percentage}
                onChange={(e) => setPercentage(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14]"
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-white/60">
                Modalidad
              </label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14]"
              >
                <option value="PROPORTIONAL">Proporcional</option>
                <option value="AFTER_CAPITAL_RECOVERY">Después de Recuperar Capital</option>
                <option value="ADVANCED">Avanzado</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 dark:bg-[#39ff14] dark:text-black dark:hover:bg-[#32e012]"
            >
              {saving ? 'Guardando...' : 'Guardar Configuración'}
            </button>
          </form>
        </div>

        {/* Liquidation Form */}
        <div className="bg-white rounded-lg shadow p-6 dark:bg-[#1e1e1e]">
          <h2 className="text-lg font-semibold mb-4 dark:text-white/[.87]">Registrar Liquidación</h2>
          
          {liquidationMessage.text && (
            <div className={`mb-4 p-3 rounded-lg ${liquidationMessage.type === 'success' ? 'bg-green-50 text-green-600 dark:bg-green-950/50 dark:text-green-400' : 'bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400'}`}>
              {liquidationMessage.text}
            </div>
          )}

          <form onSubmit={handleLiquidate}>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-white/60">
                Monto a Liquidar (máximo {formatCurrency(summary.pending)})
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                max={summary.pending}
                value={liquidationAmount}
                onChange={(e) => setLiquidationAmount(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14]"
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-white/60">
                Notas (opcional)
              </label>
              <textarea
                value={liquidationNotes}
                onChange={(e) => setLiquidationNotes(e.target.value)}
                rows={2}
                className="w-full px-4 py-2 border rounded-lg dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14]"
              />
            </div>

            <button
              type="submit"
              disabled={liquidating || summary.pending <= 0}
              className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 dark:bg-green-600 dark:hover:bg-green-700"
            >
              {liquidating ? 'Liquidando...' : 'Registrar Liquidación'}
            </button>
          </form>
        </div>
      </div>

      {/* Audit Log */}
      <div className="mt-6 bg-white rounded-lg shadow p-6 dark:bg-[#1e1e1e]">
        <h2 className="text-lg font-semibold mb-4 dark:text-white/[.87]">Historial de Cambios</h2>
        
        {audits.length === 0 ? (
          <p className="text-gray-500 dark:text-white/60 text-center py-4">No hay cambios registrados</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-[#2a2a2a]">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase dark:text-white/60">Fecha</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase dark:text-white/60">Campo</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase dark:text-white/60">Valor Anterior</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase dark:text-white/60">Nuevo Valor</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase dark:text-white/60">Cambiado por</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-[#333]">
                {audits.map((audit) => (
                  <tr key={audit.id}>
                    <td className="px-4 py-2 text-sm text-gray-500 dark:text-white/60">{formatDate(audit.createdAt)}</td>
                    <td className="px-4 py-2 text-sm font-medium text-gray-900 dark:text-white">
                      {audit.field === 'commissionPercentage' ? 'Porcentaje' : 'Modalidad'}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-500 dark:text-white/60">{audit.previousValue}</td>
                    <td className="px-4 py-2 text-sm text-gray-900 dark:text-white">{audit.newValue}</td>
                    <td className="px-4 py-2 text-sm text-gray-500 dark:text-white/60">{audit.changedByName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
