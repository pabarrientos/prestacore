'use client';

import { useState, useEffect } from 'react';

interface RateConfig {
  WEEKLY_BASE_RATE: number;
  BIWEEKLY_BASE_RATE: number;
  MONTHLY_BASE_RATE: number;
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
  schedule: ScheduleItem[];
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Labels según frecuencia
const frequencyLabels = {
  WEEKLY: { plural: 'semanales', singular: 'semanal', period: 'semanal' },
  BIWEEKLY: { plural: 'quincenales', singular: 'quincenal', period: 'quincenal' },
  MONTHLY: { plural: 'mensuales', singular: 'mensual', period: 'mensual' },
};

export default function SimulatorPage() {
  const [formData, setFormData] = useState({
    amount: '',
    term: '12',
    frequency: 'MONTHLY',
  });
  const [rates, setRates] = useState<RateConfig | null>(null);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Cargar tasas al iniciar
  useEffect(() => {
    fetch(`${API_URL}/api/settings/rates`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setRates(data.data);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError('');
  };

  const calculateLoan = () => {
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
      case 'MONTHLY':
      default:
        baseRate = rates.MONTHLY_BASE_RATE;
        periodsPerYear = 12;
    }

    const annualRate = baseRate * periodsPerYear / 100;
    const periodicRate = annualRate / periodsPerYear;
    
    // El plazo "term" ahora representa directamente la cantidad de cuotas
    // 1 semana = 1 cuota semanal, 1 quincena = 1 cuota quincenal, etc.
    const totalPeriods = term;

    // French amortization formula: C = P * [r(1+r)^n] / [(1+r)^n - 1]
    let installmentAmount: number;
    if (periodicRate === 0) {
      installmentAmount = amount / totalPeriods;
    } else {
      const factor = Math.pow(1 + periodicRate, totalPeriods);
      installmentAmount = amount * (periodicRate * factor) / (factor - 1);
    }
    installmentAmount = Math.round(installmentAmount * 100) / 100;

    const totalPayment = installmentAmount * totalPeriods;
    const totalInterest = totalPayment - amount;

    // Generar cronograma
    const schedule: ScheduleItem[] = [];
    let balance = amount;
    const today = new Date();

    for (let i = 1; i <= totalPeriods; i++) {
      // Saldo capital ANTES de pagar esta cuota
      const capitalBalanceBefore = balance;
      
      const interest = Math.round(balance * periodicRate * 100) / 100;
      let principal = installmentAmount - interest;
      
      // Ajuste para el último pago
      if (i === totalPeriods) {
        principal = balance;
      }
      
      principal = Math.round(principal * 100) / 100;
      balance = Math.round((balance - principal) * 100) / 100;
      if (balance < 0) balance = 0;

      // Calcular fecha según frecuencia
      const paymentDate = new Date(today);
      if (frequency === 'WEEKLY') {
        paymentDate.setDate(today.getDate() + i * 7);
      } else if (frequency === 'BIWEEKLY') {
        paymentDate.setDate(today.getDate() + i * 14);
      } else {
        paymentDate.setMonth(today.getMonth() + i);
      }

      schedule.push({
        number: i,
        date: paymentDate.toLocaleDateString('es-ES'),
        payment: Math.round((principal + interest) * 100) / 100,
        principal,
        interest,
        balance,
        capitalBalance: capitalBalanceBefore,
      });
    }

    setResult({
      installmentAmount,
      totalInterest: Math.round(totalInterest * 100) / 100,
      totalPayment: Math.round(totalPayment * 100) / 100,
      annualRate: Math.round(annualRate * 10000) / 10000,
      schedule,
    });
  };

  const labels = frequencyLabels[formData.frequency as keyof typeof frequencyLabels] || frequencyLabels.MONTHLY;
  const baseRate = rates ? (
    formData.frequency === 'WEEKLY' ? rates.WEEKLY_BASE_RATE :
    formData.frequency === 'BIWEEKLY' ? rates.BIWEEKLY_BASE_RATE :
    rates.MONTHLY_BASE_RATE
  ) : 0;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold text-center mb-8 text-primary-700">
          Simulador de Préstamos
        </h1>
        
        <div className="grid md:grid-cols-2 gap-8">
          {/* Formulario */}
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-xl font-semibold mb-4">Datos del Préstamo</h2>
            
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Monto ($)
                </label>
                <input
                  type="number"
                  name="amount"
                  value={formData.amount}
                  onChange={handleChange}
                  placeholder={rates ? `${rates.MIN_LOAN_AMOUNT} - ${rates.MAX_LOAN_AMOUNT}` : '1000'}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                  min={rates?.MIN_LOAN_AMOUNT}
                  max={rates?.MAX_LOAN_AMOUNT}
                />
                {rates && (
                  <p className="text-xs text-gray-500 mt-1">
                    Mínimo: ${rates.MIN_LOAN_AMOUNT.toLocaleString()} - Máximo: ${rates.MAX_LOAN_AMOUNT.toLocaleString()}
                  </p>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Plazo ({labels.plural})
                </label>
                <input
                  type="number"
                  name="term"
                  value={formData.term}
                  onChange={handleChange}
                  placeholder="12"
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                  min="1"
                  max="120"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Cantidad de {labels.plural}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Frecuencia de Pago
                </label>
                <select
                  name="frequency"
                  value={formData.frequency}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                >
                  <option value="WEEKLY">Semanal</option>
                  <option value="BIWEEKLY">Quincenal</option>
                  <option value="MONTHLY">Mensual</option>
                </select>
                {rates && (
                  <p className="text-xs text-gray-500 mt-1">
                    Tasa {labels.period}: <span className="font-medium">{baseRate}%</span>
                  </p>
                )}
              </div>
              
              <button
                onClick={calculateLoan}
                className="w-full py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition font-medium"
              >
                Calcular
              </button>
            </div>
          </div>

          {/* Resultados */}
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-xl font-semibold mb-4">Resultado</h2>
            
            {result ? (
              <div className="space-y-4">
                <div className="p-4 bg-primary-50 rounded-lg">
                  <p className="text-sm text-gray-600">Cuota ({labels.singular})</p>
                  <p className="text-3xl font-bold text-primary-700">
                    ${result.installmentAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {result.schedule.length} pagos {labels.plural}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-600">Total Intereses</p>
                    <p className="text-xl font-semibold">${result.totalInterest.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-600">Nro. de Pagos</p>
                    <p className="text-xl font-semibold">{result.schedule.length}</p>
                  </div>
                </div>

                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600">Total a Pagar</p>
                  <p className="text-2xl font-bold">${result.totalPayment.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                </div>
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8">
                Ingrese los datos y haga clic en "Calcular"
              </p>
            )}
          </div>
        </div>

        {/* Tabla de Amortización */}
        {result && result.schedule.length > 0 && (
          <div className="mt-8 bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-xl font-semibold mb-4">Tabla de Amortización</h2>
            <p className="text-sm text-gray-500 mb-4">
              Cronograma de {result.schedule.length} pagos {labels.plural}
            </p>
            
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">#</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">Fecha</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-600">Cuota</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-600">Capital</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-600">Interés</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-600">Saldo Capital</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-600">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {result.schedule.map((item) => (
                    <tr key={item.number} className="border-t">
                      <td className="px-4 py-2">{item.number}</td>
                      <td className="px-4 py-2">{item.date}</td>
                      <td className="px-4 py-2 text-right">${item.payment.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                      <td className="px-4 py-2 text-right text-green-600">${item.principal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                      <td className="px-4 py-2 text-right text-red-600">${item.interest.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                      <td className="px-4 py-2 text-right font-medium">${item.capitalBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                      <td className="px-4 py-2 text-right">${item.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="text-center mt-6">
          <a href="/register" className="text-primary-600 hover:underline">
            Solicitar este préstamo →
          </a>
        </div>
      </div>
    </main>
  );
}
