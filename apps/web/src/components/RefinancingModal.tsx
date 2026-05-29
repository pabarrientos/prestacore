'use client';

import { useState, useEffect } from 'react';
import { getTodayString } from '@/lib/datetime';
import { apiFetch } from '@/lib/api';

interface RefinancingBreakdown {
  capitalPendiente: number;
  interesesVencidos: number;
  pagosAtrasados: number;
  nuevoCapital: number;
}

interface PreviewAmortizationItem {
  installmentNumber: number;
  dueDate: string;
  amount: number;
  principal: number;
  interest: number;
  balance: number;
}

interface RefinancingPreview {
  loanId: string;
  eligible: boolean;
  breakdown: RefinancingBreakdown;
  previewAmortization?: {
    nuevoCapital: number;
    nuevaTasaInteres: number;
    nuevaFrecuencia: string;
    cantidadCuotas: number;
    installmentAmount: number;
    totalInterest: number;
    totalPayment: number;
    schedule: PreviewAmortizationItem[];
  };
}

interface RefinancingModalProps {
  loanId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

const frequencyOptions = [
  { value: 'WEEKLY', label: 'Semanal', periodsPerYear: 48 },
  { value: 'BIWEEKLY', label: 'Quincenal', periodsPerYear: 24 },
  { value: 'MONTHLY', label: 'Mensual', periodsPerYear: 12 },
  { value: 'DAILY', label: 'Diario', periodsPerYear: 360 },
];

const systemOptions = [
  { value: 'FRENCH', label: 'Sistema Francés' },
  { value: 'GERMAN', label: 'Sistema Alemán' },
  { value: 'FLAT_RATE', label: 'Sistema de Tasa Plana' },
] as const;

// Default annual rate to use as base (fallback if settings not available)
const DEFAULT_ANNUAL_RATE = 0.36;

interface RateConfig {
  WEEKLY_BASE_RATE: number;
  BIWEEKLY_BASE_RATE: number;
  MONTHLY_BASE_RATE: number;
  DAILY_BASE_RATE: number;
  MIN_LOAN_AMOUNT: number;
  MAX_LOAN_AMOUNT: number;
}

export default function RefinancingModal({ loanId, onSuccess, onCancel }: RefinancingModalProps) {
  const [preview, setPreview] = useState<RefinancingPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rates, setRates] = useState<RateConfig | null>(null);
  
  // Form fields
  const [nuevaFrecuencia, setNuevaFrecuencia] = useState<string>('MONTHLY');
  const [cantidadCuotas, setCantidadCuotas] = useState<string>('12');
  const [tasaManual, setTasaManual] = useState<boolean>(false);
  const [nuevaTasaInteres, setNuevaTasaInteres] = useState<string>('');
  const [fechaInicio, setFechaInicio] = useState<string>(''); // Se carga en useEffect con timezone
  const [pagoInicial, setPagoInicial] = useState<string>('0');
  const [nuevoSistema, setNuevoSistema] = useState<string>('FRENCH');
  
  // Manual override for interesesVencidos
  const [interesesVencidosManual, setInteresesVencidosManual] = useState<string>('');
  const [interesesVencidosModificado, setInteresesVencidosModificado] = useState<boolean>(false);
  
  const [previewLoading, setPreviewLoading] = useState(false);
  const [executeLoading, setExecuteLoading] = useState(false);
  const [confirmStep, setConfirmStep] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  // Calculate annual rate based on frequency using settings (like the simulator)
  // Formula: annualRate = (baseRate * periodsPerYear) / 100
  const calculateAnnualRate = (): number => {
    if (!rates) {
      // Fallback to default if settings not available
      const freq = frequencyOptions.find(f => f.value === nuevaFrecuencia);
      return (DEFAULT_ANNUAL_RATE * (freq?.periodsPerYear || 12));
    }

    let baseRate: number;
    let periodsPerYear: number;
    
    switch (nuevaFrecuencia) {
      case 'WEEKLY':
        baseRate = rates.WEEKLY_BASE_RATE;
        periodsPerYear = 48;
        break;
      case 'BIWEEKLY':
        baseRate = rates.BIWEEKLY_BASE_RATE;
        periodsPerYear = 24;
        break;
      case 'DAILY':
        baseRate = rates.DAILY_BASE_RATE;
        periodsPerYear = 360;
        break;
      case 'MONTHLY':
      default:
        baseRate = rates.MONTHLY_BASE_RATE;
        periodsPerYear = 12;
    }
    
    // Annual rate as percentage (e.g., 36 for 36%)
    return (baseRate * periodsPerYear);
  };

  // Get period rate for display (like simulator shows)
  const calculatePeriodRate = (): number => {
    const annualRate = calculateAnnualRate();
    const freq = frequencyOptions.find(f => f.value === nuevaFrecuencia);
    const periodsPerYear = freq?.periodsPerYear || 12;
    return annualRate / periodsPerYear;
  };

  // Fetch rates and initial preview
  useEffect(() => {
    apiFetch('/api/settings/rates')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setRates(data.data);
          // Set initial period rate based on frequency
          const periodRate = calculatePeriodRate();
          setNuevaTasaInteres(periodRate.toFixed(2));
        }
      })
      .catch(console.error);

    // Fetch default amortization system
    apiFetch('/api/settings/default-amortization-system')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setNuevoSistema(data.data.defaultAmortizationSystem);
        }
      })
      .catch(console.error);

    // Fetch initial debt breakdown
    apiFetch(`/api/loans/${loanId}/preview-refinancing`, {
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

    // Cargar fecha de inicio
    setFechaInicio(getTodayString());
  }, [loanId]);

  // Update rate when frequency changes (if not manually set)
  useEffect(() => {
    if (!tasaManual) {
      const periodRate = calculatePeriodRate();
      setNuevaTasaInteres(periodRate.toFixed(2));
    }
  }, [nuevaFrecuencia, tasaManual, rates]);

  // Recalculate nuevoCapital when pagoInicial changes or interesesVencidos is modified
  useEffect(() => {
    if (!preview) return;
    
    const capital = preview.breakdown.capitalPendiente;
    const atrasados = preview.breakdown.pagosAtrasados;
    const inicial = parseFloat(pagoInicial) || 0;
    
    // Use current displayed interesesVencidos (may be manually modified)
    const currentIntereses = interesesVencidosModificado 
      ? (parseFloat(interesesVencidosManual) || 0)
      : preview.breakdown.interesesVencidos;
    
    const nuevoCapital = Math.max(0, capital + currentIntereses + atrasados - inicial);
    
    setPreview({
      ...preview,
      breakdown: {
        ...preview.breakdown,
        interesesVencidos: currentIntereses,
        nuevoCapital
      }
    });
  }, [pagoInicial, interesesVencidosModificado, interesesVencidosManual]);

  // Convert period rate to annual rate for the API (backend expects annual rate)
  // Backend does: interestRate / paymentsPerYear → we need to compensate
  const convertToAnnualRate = (periodRatePercent: number): number => {
    const freq = frequencyOptions.find(f => f.value === nuevaFrecuencia);
    const periodsPerYear = freq?.periodsPerYear || 12;
    // periodRate (e.g., 3%) * periodsPerYear (e.g., 12) = annual rate (e.g., 36%)
    return periodRatePercent * periodsPerYear;
  };

  // Fetch preview on button click
  const fetchPreview = async () => {
    if (!nuevaTasaInteres || !cantidadCuotas) return;
    
    setPreviewLoading(true);
    setShowPreview(true);
    try {
      // Convert period rate to annual rate for the API (backend expects annual rate)
      const annualRate = convertToAnnualRate(parseFloat(nuevaTasaInteres));
      
      // Get current interesesVencidos (may be manually modified)
      const currentInteresesVencidos = interesesVencidosModificado 
        ? parseFloat(interesesVencidosManual) || 0
        : undefined;
      
      const params = new URLSearchParams({
        nuevaTasaInteres: annualRate.toString(),
        cantidadCuotas,
        nuevaFrecuencia,
        pagoInicial: pagoInicial || '0',
        fechaInicio,
        amortizationSystem: nuevoSistema,
      });
      
      // Add manual interesesVencidos if modified
      if (interesesVencidosModificado && currentInteresesVencidos !== undefined) {
        params.set('interesesVencidosManual', currentInteresesVencidos.toString());
      }
      
      const res = await apiFetch(
        `/api/loans/${loanId}/preview-refinancing?${params.toString()}`,
        { headers: { 'Content-Type': 'application/json' } }
      );
      const data = await res.json();
      if (data.success) {
        setPreview(data.data);
      } else {
        setError(data.error || 'Error al generar previsualización');
      }
    } catch (err) {
      console.error('Error fetching preview:', err);
      setError('Error al conectar con el servidor');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleExecute = async () => {
    if (!confirmStep) {
      setConfirmStep(true);
      return;
    }

    setExecuteLoading(true);
    setError('');

    try {
      // Convert period rate to annual rate for the API (backend expects annual rate)
      const annualRate = convertToAnnualRate(parseFloat(nuevaTasaInteres));
      
      // Get the current interesesVencidos (may be manually modified)
      const currentInteresesVencidos = interesesVencidosModificado 
        ? (parseFloat(interesesVencidosManual) || 0)
        : (preview?.breakdown.interesesVencidos || 0);
      
      const res = await apiFetch(`/api/loans/${loanId}/execute-refinancing`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          nuevaTasaInteres: annualRate,
          cantidadCuotas: parseInt(cantidadCuotas, 10),
          nuevaFrecuencia,
          fechaInicio,
          pagoInicial: parseFloat(pagoInicial) || undefined,
          interesesVencidosManual: interesesVencidosModificado ? currentInteresesVencidos : undefined,
          amortizationSystem: nuevoSistema,
        }),
      });
      const data = await res.json();

      if (data.success) {
        setSuccessMessage('Refinanciación ejecutada exitosamente');
        // Don't disable loading - keep button disabled until modal closes
        setTimeout(() => {
          onSuccess();
        }, 1500);
      } else {
        setError(data.error || 'Error al ejecutar la refinanciación');
        setConfirmStep(false);
        setExecuteLoading(false);
      }
    } catch (err) {
      setError('Error al conectar con el servidor');
      setConfirmStep(false);
      setExecuteLoading(false);
    }
  };

  const formatDate = (dateStr: string | undefined): string => {
    if (!dateStr) return '-';
    const datePart = dateStr.split('T')[0];
    const [year, month, day] = datePart.split('-');
    return `${day}/${month}/${year}`;
  };

  const formatCurrency = (amount: number): string => {
    return `$${Number(amount).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
  };

  const getFrequencyLabel = (value: string): string => {
    const freq = frequencyOptions.find(f => f.value === value);
    return freq ? freq.label : 'Mensual';
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6 dark:bg-[#1e1e1e]">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 dark:border-[#39ff14]"></div>
        </div>
      </div>
    );
  }

  if (error && !preview) {
    return (
      <div className="bg-white rounded-lg shadow p-6 dark:bg-[#1e1e1e]">
        <div className="text-center py-8">
          <p className="text-red-600 mb-4 dark:text-red-400">{error}</p>
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 dark:border-gray-700 dark:text-white/60 dark:hover:bg-white/10"
          >
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  if (!preview || !preview.eligible) {
    return (
      <div className="bg-white rounded-lg shadow p-6 dark:bg-[#1e1e1e]">
        <div className="text-center py-8">
          <p className="text-red-600 mb-4 dark:text-red-400">Este préstamo no es elegible para refinanciación</p>
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 dark:border-gray-700 dark:text-white/60 dark:hover:bg-white/10"
          >
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto dark:bg-[#1e1e1e]">
      <div className="p-6 border-b dark:border-gray-700">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold dark:text-white/[.87]">Refinanciar Préstamo</h2>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-white/87 text-2xl"
          >
            ×
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm dark:bg-red-950/50 dark:border-red-900 dark:text-red-400">
            {error}
          </div>
        )}

        {successMessage && (
          <div className="p-3 bg-green-50 border border-green-200 text-green-600 rounded-lg text-sm dark:bg-green-950/50 dark:border-green-900 dark:text-green-400">
            {successMessage}
          </div>
        )}

        {/* Debt Breakdown Section */}
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 dark:bg-orange-950/50 dark:border-orange-900">
          <h3 className="font-semibold text-orange-800 mb-3 dark:text-orange-400">Desglose de Deuda Actual</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-orange-700 dark:text-orange-500">Capital Pendiente</p>
              <p className="text-xl font-bold text-orange-900 dark:text-orange-300">
                {formatCurrency(preview.breakdown.capitalPendiente)}
              </p>
              <p className="text-xs text-orange-600 mt-1 dark:text-orange-500">Saldo capital 1ra cuota impaga</p>
            </div>
            <div>
              <p className="text-sm text-orange-700 dark:text-orange-500">Intereses Vencidos</p>
              {interesesVencidosModificado ? (
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={interesesVencidosManual}
                    onChange={(e) => {
                      setInteresesVencidosManual(e.target.value);
                      // Recalculate nuevoCapital with new value
                      const nuevosIntereses = parseFloat(e.target.value) || 0;
                      const capital = preview.breakdown.capitalPendiente;
                      const atrasados = preview.breakdown.pagosAtrasados;
                      const inicial = parseFloat(pagoInicial) || 0;
                      const nuevoCapital = Math.max(0, capital + nuevosIntereses + atrasados - inicial);
                      setPreview({
                        ...preview,
                        breakdown: {
                          ...preview.breakdown,
                          interesesVencidos: nuevosIntereses,
                          nuevoCapital
                        }
                      });
                    }}
                    className="w-24 px-2 py-1 text-xl font-bold text-orange-900 border border-orange-300 rounded focus:ring-2 focus:ring-orange-500 dark:bg-[#2a2a2a] dark:border-orange-700 dark:text-orange-300 dark:focus:ring-orange-600"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setInteresesVencidosModificado(false);
                      setInteresesVencidosManual('');
                      // Reset to original values
                      const capital = preview.breakdown.capitalPendiente;
                      const atrasados = preview.breakdown.pagosAtrasados;
                      const inicial = parseFloat(pagoInicial) || 0;
                      const originalIntereses = preview.breakdown.interesesVencidos;
                      const nuevoCapital = Math.max(0, capital + originalIntereses + atrasados - inicial);
                      setPreview({
                        ...preview,
                        breakdown: {
                          ...preview.breakdown,
                          interesesVencidos: originalIntereses,
                          nuevoCapital
                        }
                      });
                    }}
                    className="text-xs text-gray-500 hover:text-gray-700 dark:text-white/60 dark:hover:text-white/87"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-xl font-bold text-orange-900 dark:text-orange-300">
                    {formatCurrency(preview.breakdown.interesesVencidos)}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setInteresesVencidosModificado(true);
                      setInteresesVencidosManual(preview.breakdown.interesesVencidos.toString());
                    }}
                    className="px-2 py-1 text-xs font-medium bg-orange-100 text-orange-700 rounded hover:bg-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:hover:bg-orange-900/50"
                  >
                    Editar
                  </button>
                </>
              )}
              <p className="text-xs text-orange-600 mt-1 dark:text-orange-500">Mora dinámica</p>
            </div>
            <div>
              <p className="text-sm text-orange-700 dark:text-orange-500">Pagos Atrasados</p>
              <p className="text-xl font-bold text-orange-900 dark:text-orange-300">
                {formatCurrency(preview.breakdown.pagosAtrasados)}
              </p>
              <p className="text-xs text-orange-600 mt-1 dark:text-orange-500">Suma balances cuotas vencidas</p>
            </div>
            <div>
              <p className="text-sm text-orange-700 font-semibold dark:text-orange-500">Nuevo Capital</p>
              <p className="text-xl font-bold text-primary-600 dark:text-[#39ff14]">
                {formatCurrency(preview.breakdown.nuevoCapital)}
              </p>
              <p className="text-xs text-orange-600 mt-1 dark:text-orange-500">Cap + Int + Atras - Inicial</p>
            </div>
          </div>
        </div>

        {/* New Loan Configuration Form */}
        <div>
          <h3 className="font-semibold mb-4 dark:text-white/[.87]">Nueva Configuración del Préstamo</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-white/60">
                Frecuencia de Pago *
              </label>
              <select
                value={nuevaFrecuencia}
                onChange={(e) => setNuevaFrecuencia(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14]"
              >
                {frequencyOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-white/60">
                Sistema de Amortización
              </label>
              <select
                value={nuevoSistema}
                onChange={(e) => setNuevoSistema(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14]"
              >
                {systemOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-white/60">
                Cantidad de Cuotas *
              </label>
              <input
                type="number"
                min="1"
                max="60"
                value={cantidadCuotas}
                onChange={(e) => setCantidadCuotas(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-white/60">
                Tasa de Interés ({getFrequencyLabel(nuevaFrecuencia)}) *
                {tasaManual && <span className="text-xs text-gray-500 dark:text-white/60"> (manual)</span>}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={nuevaTasaInteres}
                  onChange={(e) => {
                    setTasaManual(true);
                    setNuevaTasaInteres(e.target.value);
                  }}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14]"
                />
                <span className="text-gray-500 dark:text-white/60">%</span>
              </div>
              <div className="mt-1">
                <button
                  type="button"
                  onClick={() => {
                    setTasaManual(false);
                    const periodRate = calculatePeriodRate();
                    setNuevaTasaInteres(periodRate.toFixed(2));
                  }}
                  className="text-xs text-primary-600 hover:text-primary-800 dark:text-[#39ff14] dark:hover:text-[#32e012]"
                >
                  {tasaManual ? 'Usar tasa automática' : ''}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-white/60">
                Fecha de Inicio *
              </label>
              <input
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-white/60">
                Pago Inicial (opcional)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={pagoInicial}
                onChange={(e) => setPagoInicial(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14]"
                placeholder="0.00"
              />
              <p className="text-xs text-gray-500 mt-1 dark:text-white/60">Monto que el cliente paga al inicio → reduce el capital del nuevo préstamo</p>
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={fetchPreview}
                disabled={previewLoading || !nuevaTasaInteres || !cantidadCuotas}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-blue-700 dark:hover:bg-blue-600"
              >
                {previewLoading ? 'Calculando...' : 'Previsualizar Préstamo'}
              </button>
            </div>
          </div>
        </div>

        {/* Preview Amortization Table */}
        {showPreview && preview.previewAmortization && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 dark:bg-green-950/50 dark:border-green-900">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-green-800 dark:text-green-400">Previsualización del Nuevo Préstamo</h3>
              {previewLoading && (
                <span className="text-sm text-green-600 dark:text-green-500">Actualizando...</span>
              )}
            </div>
            
            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div>
                <p className="text-sm text-green-700 dark:text-green-500">Nuevo Capital</p>
                <p className="font-bold dark:text-green-300">
                  {formatCurrency(preview.previewAmortization.nuevoCapital)}
                </p>
              </div>
              <div>
                <p className="text-sm text-green-700 dark:text-green-500">Cuota {getFrequencyLabel(preview.previewAmortization.nuevaFrecuencia)}</p>
                <p className="font-bold dark:text-green-300">
                  {formatCurrency(preview.previewAmortization.installmentAmount)}
                </p>
              </div>
              <div>
                <p className="text-sm text-green-700 dark:text-green-500">Total Intereses</p>
                <p className="font-bold dark:text-green-300">
                  {formatCurrency(preview.previewAmortization.totalInterest)}
                </p>
              </div>
              <div>
                <p className="text-sm text-green-700 dark:text-green-500">Total a Pagar</p>
                <p className="font-bold dark:text-green-300">
                  {formatCurrency(preview.previewAmortization.totalPayment)}
                </p>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-green-200 text-sm dark:divide-green-900">
                <thead className="bg-green-100 dark:bg-green-900/50">
                  <tr>
                    <th className="px-3 py-2 text-left text-green-800 font-medium dark:text-green-400">#</th>
                    <th className="px-3 py-2 text-left text-green-800 font-medium dark:text-green-400">Fecha</th>
                    <th className="px-3 py-2 text-right text-green-800 font-medium dark:text-green-400">Cuota</th>
                    <th className="px-3 py-2 text-right text-green-800 font-medium dark:text-green-400">Capital</th>
                    <th className="px-3 py-2 text-right text-green-800 font-medium dark:text-green-400">Interés</th>
                    <th className="px-3 py-2 text-right text-green-800 font-medium dark:text-green-400">Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-green-200 bg-white dark:divide-green-900 dark:bg-[#1e1e1e]">
                  {preview.previewAmortization.schedule.map((item) => (
                    <tr key={item.installmentNumber}>
                      <td className="px-3 py-2 text-green-900 dark:text-green-300">{item.installmentNumber}</td>
                      <td className="px-3 py-2 text-green-900 dark:text-green-300">{formatDate(item.dueDate)}</td>
                      <td className="px-3 py-2 text-right text-green-900 dark:text-green-300">
                        {formatCurrency(item.amount)}
                      </td>
                      <td className="px-3 py-2 text-right text-green-900 dark:text-green-300">
                        {formatCurrency(item.principal)}
                      </td>
                      <td className="px-3 py-2 text-right text-green-900 dark:text-green-300">
                        {formatCurrency(item.interest)}
                      </td>
                      <td className="px-3 py-2 text-right text-green-900 dark:text-green-300">
                        {formatCurrency(item.balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="p-6 border-t bg-gray-50 flex gap-3 dark:border-gray-700 dark:bg-[#1a1a1a]">
        <button
          onClick={handleExecute}
          disabled={executeLoading || !showPreview || !preview.previewAmortization}
          className={`flex-1 px-4 py-3 rounded-lg font-semibold text-white transition flex items-center justify-center gap-2 ${
            confirmStep
              ? 'bg-red-600 hover:bg-red-700'
              : 'bg-primary-600 hover:bg-primary-700'
          } disabled:opacity-50 disabled:cursor-not-allowed dark:bg-[#39ff14] dark:text-black dark:hover:bg-[#32e012] dark:hover:shadow-[0_0_15px_rgba(57,255,20,0.4)]`}
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
            'CONFIRMAR Refinanciación'
          ) : (
            'Refinanciar Préstamo'
          )}
        </button>
        <button
          onClick={onCancel}
          disabled={executeLoading}
          className="px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed dark:border-gray-700 dark:text-white/60 dark:hover:bg-white/10"
        >
          Cancelar
        </button>
      </div>

      {confirmStep && (
        <div className="px-6 pb-4">
          <p className="text-red-600 text-sm text-center dark:text-red-400">
            Está a punto de ejecutar la refinanciación. Esta acción no se puede deshacer.
          </p>
        </div>
      )}
    </div>
  );
}
