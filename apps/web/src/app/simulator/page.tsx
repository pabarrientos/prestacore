'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';

const LOAN_STORAGE_KEY = 'pending_loan_request';

// Amortization system options with Spanish labels
const SYSTEM_OPTIONS = [
  { value: 'FRENCH', label: 'Sistema Francés', description: 'Cuota fija, interés sobre saldo' },
  { value: 'GERMAN', label: 'Sistema Alemán', description: 'Capital constante, interés decreciente' },
  { value: 'FLAT_RATE', label: 'Sistema de Tasa Plana', description: 'Interés sobre capital original' },
] as const;

type AmortizationSystem = typeof SYSTEM_OPTIONS[number]['value'];

interface LoanRequest {
  amount: number;
  term: number;
  frequency: string;
  installmentAmount: number;
  totalInterest: number;
  totalPayment: number;
  annualRate: number;
  amortizationSystem: AmortizationSystem;
  schedule: ScheduleItem[];
}

interface RateConfig {
  WEEKLY_BASE_RATE: number;
  BIWEEKLY_BASE_RATE: number;
  MONTHLY_BASE_RATE: number;
  DAILY_BASE_RATE: number;
  MIN_LOAN_AMOUNT: number;
  MAX_LOAN_AMOUNT: number;
}

interface ScheduleItem {
  number: number;
  date: string;
  payment: number;
  principal: number;
  interest: number;
  balance: number;
  capitalBalance: number;
}

interface SimulationResult {
  installmentAmount: number;
  totalInterest: number;
  totalPayment: number;
  annualRate: number;
  amortizationSystem: AmortizationSystem;
  schedule: ScheduleItem[];
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Labels según frecuencia
const frequencyLabels = {
  WEEKLY: { plural: 'semanales', singular: 'semanal', period: 'semanal' },
  BIWEEKLY: { plural: 'quincenales', singular: 'quincenal', period: 'quincenal' },
  MONTHLY: { plural: 'mensuales', singular: 'mensual', period: 'mensual' },
  DAILY: { plural: 'diarios', singular: 'diario', period: 'diario' },
};

export default function SimulatorPage() {
  const { user } = useAuth();
  const router = useRouter();
  
  const [formData, setFormData] = useState({
    amount: '',
    term: '12',
    frequency: 'MONTHLY',
    amortizationSystem: 'FRENCH' as AmortizationSystem,
  });
  const [rates, setRates] = useState<RateConfig | null>(null);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const handleRequestLoan = () => {
    if (!result) return;

    // Create loan request object using values from backend calculation
    const loanRequest: LoanRequest = {
      amount: parseFloat(formData.amount),
      term: parseInt(formData.term),
      frequency: formData.frequency,
      installmentAmount: result.installmentAmount,
      totalInterest: result.totalInterest,
      totalPayment: result.totalPayment,
      annualRate: result.annualRate,
      amortizationSystem: result.amortizationSystem,
      schedule: result.schedule,
    };

    // Store in sessionStorage (persists until browser closed)
    sessionStorage.setItem(LOAN_STORAGE_KEY, JSON.stringify(loanRequest));

    // Check if logged in as client
    if (user && (user.role === 'CLIENTE' || user.role === 'VENDEDOR' || user.role === 'ADMIN')) {
      // Redirect to confirmation if authenticated
      router.push('/solicitar');
    } else {
      // Redirect to register if not authenticated
      router.push('/register');
    }
  };

  // Cargar tasas y sistema por defecto al iniciar
  useEffect(() => {
    Promise.all([
      fetch(`${API_URL}/api/settings/rates`).then(res => res.json()),
      fetch(`${API_URL}/api/settings/default-amortization-system`).then(res => res.json()),
    ])
      .then(([ratesData, systemData]) => {
        if (ratesData.success) {
          setRates(ratesData.data);
        }
        if (systemData.success) {
          const sys = systemData.data.defaultAmortizationSystem as AmortizationSystem;
          setFormData(prev => ({ ...prev, amortizationSystem: sys }));
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError('');
  };

  const calculateLoan = async () => {
    if (!rates) return;

    const amount = parseFloat(formData.amount);
    const term = parseInt(formData.term);
    const frequency = formData.frequency;

    // Validaciones
    if (isNaN(amount) || amount <= 0) {
      setError('Ingrese un monto válido');
      return;
    }
    if (amount < rates.MIN_LOAN_AMOUNT || amount > rates.MAX_LOAN_AMOUNT) {
      setError(`El monto debe estar entre $${rates.MIN_LOAN_AMOUNT.toLocaleString()} y $${rates.MAX_LOAN_AMOUNT.toLocaleString()}`);
      return;
    }
    if (isNaN(term) || term <= 0) {
      setError('Ingrese un plazo válido');
      return;
    }

    // Calcular tasa anual basada en frecuencia
    let baseRate: number;
    let periodsPerYear: number;
    
    switch (frequency) {
      case 'WEEKLY':
        baseRate = rates.WEEKLY_BASE_RATE;
        periodsPerYear = 52;
        break;
      case 'BIWEEKLY':
        baseRate = rates.BIWEEKLY_BASE_RATE;
        periodsPerYear = 24;
        break;
      case 'DAILY':
        baseRate = rates.DAILY_BASE_RATE;
        periodsPerYear = 365;
        break;
      case 'MONTHLY':
      default:
        baseRate = rates.MONTHLY_BASE_RATE;
        periodsPerYear = 12;
    }

    const annualRate = baseRate * periodsPerYear;

    setLoading(true);
    setError('');

    try {
      // Call backend to calculate with the selected amortization system
      const response = await fetch(`${API_URL}/api/loans/simulate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount,
          interestRate: annualRate,
          termMonths: term,
          frequency,
          amortizationSystem: formData.amortizationSystem,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        setError(data.error || 'Error al calcular');
        return;
      }

      // Map backend response to frontend format
      const backendData = data.data;
      setResult({
        installmentAmount: backendData.installmentAmount,
        totalInterest: backendData.totalInterest,
        totalPayment: backendData.totalPayment,
        annualRate: backendData.annualRate,
        amortizationSystem: backendData.amortizationSystem,
        schedule: backendData.schedule.map((item: any) => ({
          number: item.number,
          date: new Date(item.dueDate).toLocaleDateString('es-ES'),
          payment: item.amount,
          principal: item.principal,
          interest: item.interest,
          balance: item.balance,
          capitalBalance: item.capitalBalance || item.balance,
        })),
      });
    } catch (err) {
      console.error('Simulation error:', err);
      setError('Error de conexión con el servidor');
    } finally {
      setLoading(false);
    }
  };

  const labels = frequencyLabels[formData.frequency as keyof typeof frequencyLabels] || frequencyLabels.MONTHLY;
  const baseRate = rates ? (
    formData.frequency === 'WEEKLY' ? rates.WEEKLY_BASE_RATE :
    formData.frequency === 'BIWEEKLY' ? rates.BIWEEKLY_BASE_RATE :
    formData.frequency === 'DAILY' ? rates.DAILY_BASE_RATE :
    rates.MONTHLY_BASE_RATE
  ) : 0;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center dark:bg-[#121212]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 dark:border-[#39ff14]"></div>
      </div>
    );
  }

  return (
    <main className="min-h-screen p-4 md:p-6 lg:p-8 bg-gray-50 dark:bg-[#121212]">
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-center mb-6">
          <svg width="180" height="50" viewBox="0 0 140 40" xmlns="http://www.w3.org/2000/svg">              
            <circle cx="20" cy="20" r="16" stroke="var(--logo-primary)" strokeWidth="3" fill="none"/>
              
            <path d="M12 24 L18 18 L22 22 L28 14" 
              stroke="var(--logo-primary)" strokeWidth="3" 
              fill="none" strokeLinecap="round" strokeLinejoin="round"/>

            <text x="42" y="26" fontSize="18" fontFamily="Inter, sans-serif" fontWeight="600">
              <tspan fill="var(--logo-text)">Presta</tspan>
              <tspan fill="var(--logo-primary)">Core</tspan>
            </text>
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-center mb-8 text-primary-700 dark:text-[#39ff14]">
          Simulador de Préstamos
        </h1>
        
        <div className="grid md:grid-cols-2 gap-8">
          {/* Formulario */}
          <div className="bg-white p-6 rounded-lg shadow-md dark:bg-[#1e1e1e]">
            <h2 className="text-xl font-semibold mb-4 dark:text-white/[.87]">Datos del Préstamo</h2>
            
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg dark:bg-red-950/50 dark:border-red-900 dark:text-red-400">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-white/60">
                  Monto ($)
                </label>
                <input
                  type="number"
                  name="amount"
                  value={formData.amount}
                  onChange={handleChange}
                  placeholder={rates ? `${rates.MIN_LOAN_AMOUNT} - ${rates.MAX_LOAN_AMOUNT}` : '1000'}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14]"
                  min={rates?.MIN_LOAN_AMOUNT}
                  max={rates?.MAX_LOAN_AMOUNT}
                />
                {rates && (
                  <p className="text-xs text-gray-500 mt-1 dark:text-white/60">
                    Mínimo: ${rates.MIN_LOAN_AMOUNT.toLocaleString()} - Máximo: ${rates.MAX_LOAN_AMOUNT.toLocaleString()}
                  </p>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-white/60">
                  Plazo ({labels.plural})
                </label>
                <input
                  type="number"
                  name="term"
                  value={formData.term}
                  onChange={handleChange}
                  placeholder="12"
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14]"
                  min="1"
                  max="120"
                />
                <p className="text-xs text-gray-500 mt-1 dark:text-white/60">
                  Cantidad de {labels.plural}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-white/60">
                  Frecuencia de Pago
                </label>
                <select
                  name="frequency"
                  value={formData.frequency}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14]"
                >
                  <option value="WEEKLY">Semanal</option>
                  <option value="BIWEEKLY">Quincenal</option>
                  <option value="MONTHLY">Mensual</option>
                  <option value="DAILY">Diario</option>
                </select>
                {rates && (
                  <p className="text-xs text-gray-500 mt-1 dark:text-white/60">
                    Tasa {labels.period}: <span className="font-medium">{baseRate}%</span>
                  </p>
                )}
              </div>

              <div className="p-3 bg-gray-50 rounded-lg dark:bg-[#1a1a1a]">
                <p className="text-sm text-gray-600 dark:text-white/60">Sistema de Amortización</p>
                {user?.role === 'ADMIN' || user?.role === 'VENDEDOR' ? (
                  <select
                    name="amortizationSystem"
                    value={formData.amortizationSystem}
                    onChange={handleChange}
                    className="w-full px-2 py-1 border rounded dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87]"
                  >
                    {SYSTEM_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <>
                    <p className="font-medium dark:text-white/[.87]">
                      {SYSTEM_OPTIONS.find(s => s.value === (result?.amortizationSystem || formData.amortizationSystem))?.label || 'Sistema Francés'}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-white/60">
                      {SYSTEM_OPTIONS.find(s => s.value === (result?.amortizationSystem || formData.amortizationSystem))?.description}
                    </p>
                  </>
                )}
              </div>
              
              <button
                onClick={calculateLoan}
                className="w-full py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition font-medium dark:bg-[#39ff14] dark:text-black dark:hover:bg-[#32e012] dark:hover:shadow-[0_0_15px_rgba(57,255,20,0.4)]"
              >
                Calcular
              </button>
            </div>
          </div>

          {/* Resultados */}
          <div className="bg-white p-6 rounded-lg shadow-md dark:bg-[#1e1e1e]">
            <h2 className="text-xl font-semibold mb-4 dark:text-white/[.87]">Resultado</h2>
            
            {result ? (
              <div className="space-y-4">
                <div className="p-4 bg-primary-50 rounded-lg dark:bg-[#1a1a1a]">
                  <p className="text-sm text-gray-600 dark:text-white/60">Cuota ({labels.singular})</p>
                  <p className="text-3xl font-bold text-primary-700 dark:text-[#39ff14]">
                    ${result.installmentAmount.toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-500 mt-1 dark:text-white/60">
                    {result.schedule.length} pagos {labels.plural}
                    {' '} · {SYSTEM_OPTIONS.find(s => s.value === result.amortizationSystem)?.label}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 bg-gray-50 rounded-lg dark:bg-[#1a1a1a]">
                    <p className="text-sm text-gray-600 dark:text-white/60">Total Intereses</p>
                    <p className="text-xl font-semibold dark:text-white/[.87]">${result.totalInterest.toLocaleString()}</p>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-lg dark:bg-[#1a1a1a]">
                    <p className="text-sm text-gray-600 dark:text-white/60">Nro. de Pagos</p>
                    <p className="text-xl font-semibold dark:text-white/[.87]">{result.schedule.length}</p>
                  </div>
                </div>

                <div className="p-4 bg-gray-50 rounded-lg dark:bg-[#1a1a1a]">
                  <p className="text-sm text-gray-600 dark:text-white/60">Total a Pagar</p>
                  <p className="text-2xl font-bold dark:text-white/[.87]">${result.totalPayment.toLocaleString()}</p>
                </div>
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8 dark:text-white/60">
                Ingrese los datos y haga clic en "Calcular"
              </p>
            )}
          </div>
        </div>

        {/* Tabla de Amortización */}
        {result && result.schedule.length > 0 && (
          <div className="mt-8 bg-white p-6 rounded-lg shadow-md dark:bg-[#1e1e1e]">
            <h2 className="text-xl font-semibold mb-4 dark:text-white/[.87]">Tabla de Amortización</h2>
            <p className="text-sm text-gray-500 mb-4 dark:text-white/60">
              Cronograma de {result.schedule.length} pagos {labels.plural}
              {' '} — {SYSTEM_OPTIONS.find(s => s.value === result.amortizationSystem)?.label}
            </p>
            
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 dark:bg-[#1a1a1a]">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-gray-600 dark:text-white/60">#</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-600 dark:text-white/60">Fecha</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-600 dark:text-white/60">Cuota</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-600 dark:text-white/60">Capital</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-600 dark:text-white/60">Interés</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-600 dark:text-white/60">Saldo Capital</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-600 dark:text-white/60">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {result.schedule.map((item) => (
                    <tr key={item.number} className="border-t dark:border-gray-700">
                      <td className="px-4 py-2 dark:text-white/[.87]">{item.number}</td>
                      <td className="px-4 py-2 dark:text-white/[.87]">{item.date}</td>
                      <td className="px-4 py-2 text-right dark:text-white/[.87]">${item.payment.toLocaleString()}</td>
                      <td className="px-4 py-2 text-right text-green-600 dark:text-green-400">${item.principal.toLocaleString()}</td>
                      <td className="px-4 py-2 text-right text-red-600 dark:text-red-400">${item.interest.toLocaleString()}</td>
                      <td className="px-4 py-2 text-right font-medium dark:text-white/[.87]">${item.capitalBalance.toLocaleString()}</td>
                      <td className="px-4 py-2 text-right dark:text-white/[.87]">${item.balance.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="text-center mt-6">
          <button
            onClick={handleRequestLoan}
            disabled={!result}
            className="text-primary-600 hover:underline dark:text-[#39ff14] dark:hover:text-[#32e012] disabled:text-gray-400 disabled:cursor-not-allowed disabled:no-underline"
          >
            Solicitar este préstamo →
          </button>
        </div>

        {/* Navigation links */}
        <div className="text-center mt-4 flex justify-center gap-4 text-sm">
          {user?.role === 'ADMIN' || user?.role === 'VENDEDOR' ? (
            <a
              href="/admin"
              className="text-primary-600 hover:underline dark:text-[#39ff14]"
            >
              Panel Admin →
            </a>
          ) : user?.role === 'CLIENTE' ? (
            <a
              href="/mis-prestamo"
              className="text-primary-600 hover:underline dark:text-[#39ff14]"
            >
              Mis Préstamos →
            </a>
          ) : null}
        </div>
      </div>
    </main>
  );
}
