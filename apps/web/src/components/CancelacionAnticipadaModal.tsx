'use client';

import { useState, useEffect } from 'react';

interface DebtBreakdown {
  capitalPendiente: number;
  interesesVencidos: number;
  pagosAtrasados: number;
  totalCancelar: number;
}

interface CancelacionAnticipadaPreview {
  loanId: string;
  loanStatus: string;
  breakdown: DebtBreakdown;
}

interface CancelacionAnticipadaModalProps {
  loanId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function CancelacionAnticipadaModal({ loanId, onSuccess, onCancel }: CancelacionAnticipadaModalProps) {
  const [preview, setPreview] = useState<CancelacionAnticipadaPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Editable field for interesesVencidos
  const [interesesVencidosManual, setInteresesVencidosManual] = useState<string>('');
  const [interesesVencidosModificado, setInteresesVencidosModificado] = useState(false);
  
  const [executeLoading, setExecuteLoading] = useState(false);
  const [confirmStep, setConfirmStep] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  // Fetch initial preview
  useEffect(() => {
    fetch(`${API_URL}/api/loans/${loanId}/preview-cancelacion-anticipada`, {
      headers: { 'Content-Type': 'application/json' },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setPreview(data.data);
        } else {
          setError(data.error || 'Error al cargar la previsualización');
        }
      })
      .catch((err) => {
        console.error('Error loading preview:', err);
        setError('Error al conectar con el servidor');
      })
      .finally(() => setLoading(false));
  }, [loanId]);

  // Calculate total with current interesesVencidos
  const getCurrentTotal = (): number => {
    if (!preview) return 0;
    const intereses = interesesVencidosModificado 
      ? (parseFloat(interesesVencidosManual) || 0)
      : preview.breakdown.interesesVencidos;
    return preview.breakdown.capitalPendiente + intereses + preview.breakdown.pagosAtrasados;
  };

  const handleExecute = async () => {
    if (!confirmStep) {
      setConfirmStep(true);
      return;
    }

    setExecuteLoading(true);
    setError('');

    const token = localStorage.getItem('token');
    if (!token) {
      setError('No hay token de autenticación');
      setExecuteLoading(false);
      return;
    }

    try {
      const body: { interesesVencidosManual?: number } = {};
      if (interesesVencidosModificado) {
        body.interesesVencidosManual = parseFloat(interesesVencidosManual) || 0;
      }

      const res = await fetch(`${API_URL}/api/loans/${loanId}/execute-cancelacion-anticipada`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (data.success) {
        setSuccessMessage('Cancelación anticipada ejecutada exitosamente');
        // Don't disable loading - keep button disabled until modal closes
        setTimeout(() => {
          onSuccess();
        }, 1500);
      } else {
        setError(data.error || 'Error al ejecutar la cancelación anticipada');
        setConfirmStep(false);
        setExecuteLoading(false);
      }
    } catch (err) {
      setError('Error al conectar con el servidor');
      setConfirmStep(false);
      setExecuteLoading(false);
    }
  };

  const formatCurrency = (amount: number): string => {
    return `$${Number(amount).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>
      </div>
    );
  }

  if (error && !preview) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="text-center py-8">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  if (!preview || !preview.breakdown) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="text-center py-8">
          <p className="text-red-600 mb-4">No se pudo cargar el desglose de deuda</p>
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  const currentTotal = getCurrentTotal();

  return (
    <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full">
      <div className="p-6 border-b">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-green-800">Cancelación Anticipada</h2>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 text-2xl"
          >
            ×
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm">
            {error}
          </div>
        )}

        {successMessage && (
          <div className="p-3 bg-green-50 border border-green-200 text-green-600 rounded-lg text-sm">
            {successMessage}
          </div>
        )}

        {/* Debt Breakdown Section */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <h3 className="font-semibold text-green-800 mb-3">Desglose de Deuda</h3>
          <div className="grid grid-cols-2 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-green-700">Capital Pendiente</p>
              <p className="text-xl font-bold text-green-900">
                {formatCurrency(preview.breakdown.capitalPendiente)}
              </p>
              <p className="text-xs text-green-600 mt-1">Saldo capital 1ra cuota impaga</p>
            </div>
            <div>
              <p className="text-sm text-green-700">Intereses Vencidos</p>
              {interesesVencidosModificado ? (
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={interesesVencidosManual}
                    onChange={(e) => {
                      setInteresesVencidosManual(e.target.value);
                    }}
                    className="w-28 px-2 py-1 text-xl font-bold text-green-900 border border-green-300 rounded focus:ring-2 focus:ring-green-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setInteresesVencidosModificado(false);
                      setInteresesVencidosManual('');
                    }}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-xl font-bold text-green-900">
                    {formatCurrency(preview.breakdown.interesesVencidos)}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setInteresesVencidosModificado(true);
                      setInteresesVencidosManual(preview.breakdown.interesesVencidos.toString());
                    }}
                    className="text-xs text-green-600 hover:text-green-800 mt-1"
                  >
                    Editar
                  </button>
                </>
              )}
              <p className="text-xs text-green-600 mt-1">Mora dinámica</p>
            </div>
            <div>
              <p className="text-sm text-green-700">Pagos Atrasados</p>
              <p className="text-xl font-bold text-green-900">
                {formatCurrency(preview.breakdown.pagosAtrasados)}
              </p>
              <p className="text-xs text-green-600 mt-1">Suma balances cuotas vencidas</p>
            </div>
            <div className="bg-green-600 text-white rounded-lg p-3">
              <p className="text-sm font-semibold">Total a Cancelar</p>
              <p className="text-2xl font-bold">
                {formatCurrency(currentTotal)}
              </p>
              <p className="text-xs text-green-200 mt-1">Cap + Int + Atrasados</p>
            </div>
          </div>
        </div>

        {/* Info message */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-sm text-blue-700">
            <strong>Nota:</strong> Esta acción cancelará completamente el préstamo. 
            Se creará un pago extraordinario por el total y el estado del préstamo cambiará a "Pagado".
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="p-6 border-t bg-gray-50 flex gap-3">
        <button
          onClick={handleExecute}
          disabled={executeLoading}
          className={`flex-1 px-4 py-3 rounded-lg font-semibold text-white transition flex items-center justify-center gap-2 ${
            confirmStep
              ? 'bg-red-600 hover:bg-red-700'
              : 'bg-green-600 hover:bg-green-700'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {executeLoading ? (
            <>
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Procesando...
            </>
          ) : confirmStep ? (
            'CONFIRMAR Cancelación'
          ) : (
            'Cancelación Anticipada'
          )}
        </button>
        <button
          onClick={onCancel}
          disabled={executeLoading}
          className="px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Cancelar
        </button>
      </div>

      {confirmStep && (
        <div className="px-6 pb-4">
          <p className="text-red-600 text-sm text-center">
            Está a punto de ejecutar la cancelación anticipada. Esta acción no se puede deshacer.
          </p>
        </div>
      )}
    </div>
  );
}