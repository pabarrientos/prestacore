'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { getTodayString } from '@/lib/datetime';

interface Client {
  id: string;
  dni: string;
  firstName: string;
  lastName: string;
  email: string;
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
}

interface SimulationResult {
  installmentAmount: number;
  totalInterest: number;
  totalPayment: number;
  annualRate: number;
  schedule: ScheduleItem[];
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const frequencyLabels: Record<string, { plural: string; singular: string }> = {
  WEEKLY: { plural: 'semanales', singular: 'semanal' },
  BIWEEKLY: { plural: 'quincenales', singular: 'quincenal' },
  MONTHLY: { plural: 'mensuales', singular: 'mensual' },
  DAILY: { plural: 'diarios', singular: 'diario' },
};

function NewLoanForm() {
  const { token } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const clientIdParam = searchParams?.get('clientId') || '';
  
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [clientSearch, setClientSearch] = useState('');
  const [clientResults, setClientResults] = useState<Client[]>([]);
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  
  const [formData, setFormData] = useState({
    amount: '',
    term: '12',
    frequency: 'MONTHLY',
    customRate: '',
    purpose: '',
    notes: '',
    startDate: '', // Se carga en useEffect con timezone
  });
  const [rates, setRates] = useState<RateConfig | null>(null);
  const [simulation, setSimulation] = useState<SimulationResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [simulating, setSimulating] = useState(false);

  // Cargar tasas y fecha inicial con timezone
  useEffect(() => {
    fetch(`${API_URL}/api/settings/rates`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setRates(data.data);
          const freq = formData.frequency;
          let defaultRate = data.data.MONTHLY_BASE_RATE;
          if (freq === 'WEEKLY') defaultRate = data.data.WEEKLY_BASE_RATE;
          else if (freq === 'BIWEEKLY') defaultRate = data.data.BIWEEKLY_BASE_RATE;
          setFormData(prev => ({ ...prev, customRate: String(defaultRate) }));
        }
      })
      .catch(console.error);

    // Cargar fecha inicial con timezone
    getTodayString().then((dateStr: string) => {
      setFormData(prev => ({ ...prev, startDate: dateStr }));
    });
  }, []);

  // Buscar clientes
  useEffect(() => {
    if (clientSearch.length >= 2 && token) {
      const timeout = setTimeout(() => {
        fetch(`${API_URL}/api/clients/search?q=${encodeURIComponent(clientSearch)}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then(res => res.json())
          .then(data => {
            if (data.success) {
              setClientResults(data.data);
              setShowClientDropdown(true);
            }
          })
          .catch(console.error);
      }, 300);
      return () => clearTimeout(timeout);
    } else {
      setClientResults([]);
      setShowClientDropdown(false);
    }
  }, [clientSearch, token]);

  // Setear client desde URL
  useEffect(() => {
    if (clientIdParam && token) {
      fetch(`${API_URL}/api/clients/${clientIdParam}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(res => res.json())
        .then(data => {
          if (data.success && data.data) {
            const c = data.data;
            setSelectedClient({
              id: c.id,
              dni: c.dni,
              firstName: c.user.firstName,
              lastName: c.user.lastName,
              email: c.user.email,
            });
            setClientSearch(`${c.user.firstName} ${c.user.lastName} (${c.dni})`);
          }
        })
        .catch(console.error);
    }
  }, [clientIdParam, token]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setError('');
    // Clear simulation when form changes
    setSimulation(null);
    
    if (name === 'frequency' && rates) {
      let defaultRate = rates.MONTHLY_BASE_RATE;
      if (value === 'WEEKLY') defaultRate = rates.WEEKLY_BASE_RATE;
      else if (value === 'BIWEEKLY') defaultRate = rates.BIWEEKLY_BASE_RATE;
      else if (value === 'DAILY') defaultRate = rates.DAILY_BASE_RATE;
      setFormData(prev => ({ ...prev, customRate: String(defaultRate) }));
    }
  };

  const selectClient = (client: Client) => {
    setSelectedClient(client);
    setClientSearch(`${client.firstName} ${client.lastName} (${client.dni})`);
    setShowClientDropdown(false);
    setClientResults([]);
  };

  const simulateLoan = () => {
    if (!rates) return;

    const amount = parseFloat(formData.amount);
    const term = parseInt(formData.term);
    const frequency = formData.frequency;
    const customRate = parseFloat(formData.customRate);
    
    // Parse date without timezone issues
    const [year, month, day] = formData.startDate.split('-').map(Number);
    const startDate = new Date(year, month - 1, day);

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
    if (isNaN(customRate) || customRate <= 0) {
      setError('Ingrese una tasa válida');
      return;
    }
    if (isNaN(startDate.getTime())) {
      setError('Ingrese una fecha de inicio válida');
      return;
    }

    setSimulating(true);

    let periodsPerYear: number;
    switch (frequency) {
      case 'WEEKLY': periodsPerYear = 52; break;
      case 'BIWEEKLY': periodsPerYear = 24; break;
      case 'DAILY': periodsPerYear = 365; break;
      default: periodsPerYear = 12;
    }

    const annualRate = customRate * periodsPerYear / 100;
    const periodicRate = annualRate / periodsPerYear;
    const totalPeriods = term;

    let installmentAmount: number;
    if (periodicRate === 0) {
      installmentAmount = amount / totalPeriods;
    } else {
      const factor = Math.pow(1 + periodicRate, totalPeriods);
      installmentAmount = amount * (periodicRate * factor) / (factor - 1);
    }
    installmentAmount = Math.round(installmentAmount * 100) / 100;

    // Calculate schedule and totals correctly
    const schedule: ScheduleItem[] = [];
    let balance = amount;
    let totalPaymentCalculated = 0;

    for (let i = 1; i <= totalPeriods; i++) {
      const interest = Math.round(balance * periodicRate * 100) / 100;
      let principal = installmentAmount - interest;
      
      if (i === totalPeriods) {
        principal = balance;
      }
      
      principal = Math.round(principal * 100) / 100;
      balance = Math.round((balance - principal) * 100) / 100;
      if (balance < 0) balance = 0;

      const paymentAmount = principal + interest;
      totalPaymentCalculated += paymentAmount;

      // Calculate date correctly
      const paymentDate = new Date(startDate);
      if (frequency === 'WEEKLY') {
        paymentDate.setDate(startDate.getDate() + i * 7);
      } else if (frequency === 'BIWEEKLY') {
        paymentDate.setDate(startDate.getDate() + i * 14);
      } else if (frequency === 'DAILY') {
        paymentDate.setDate(startDate.getDate() + i);
      } else {
        paymentDate.setMonth(startDate.getMonth() + i);
      }

      schedule.push({
        number: i,
        date: `${String(paymentDate.getDate()).padStart(2, '0')}/${String(paymentDate.getMonth() + 1).padStart(2, '0')}/${paymentDate.getFullYear()}`,
        payment: Math.round(paymentAmount * 100) / 100,
        principal,
        interest,
        balance,
      });
    }

    const totalInterest = totalPaymentCalculated - amount;

    setSimulation({
      installmentAmount,
      totalInterest: Math.round(totalInterest * 100) / 100,
      totalPayment: Math.round(totalPaymentCalculated * 100) / 100,
      annualRate: Math.round(annualRate * 10000) / 10000,
      schedule,
    });
    setSimulating(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!selectedClient) {
      setError('Seleccione un cliente');
      setLoading(false);
      return;
    }

    if (!simulation) {
      setError('Primero haga clic en "Simular" para ver el cronograma');
      setLoading(false);
      return;
    }

    try {
      let periodsPerYear = 12;
      if (formData.frequency === 'WEEKLY') periodsPerYear = 52;
      else if (formData.frequency === 'BIWEEKLY') periodsPerYear = 24;
      else if (formData.frequency === 'DAILY') periodsPerYear = 365;
      
      const customRate = parseFloat(formData.customRate);
      const annualRate = customRate * periodsPerYear;

      // Prepare schedule data from simulation
      const scheduleData = simulation ? simulation.schedule.map(item => ({
        number: item.number,
        dueDate: item.date.split('/').reverse().join('-'), // Convert DD/MM/YYYY to YYYY-MM-DD
        amount: item.payment,
        principal: item.principal,
        interest: item.interest,
        balance: item.balance,
      })) : [];

      const res = await fetch(`${API_URL}/api/loans`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          clientId: selectedClient.id,
          amount: parseFloat(formData.amount),
          interestRate: annualRate,
          termMonths: parseInt(formData.term),
          frequency: formData.frequency,
          purpose: formData.purpose,
          notes: formData.notes,
          startDate: formData.startDate,
          schedule: scheduleData,
        }),
      });

      const data = await res.json();

      if (data.success) {
        router.push('/admin/loans');
      } else {
        setError(data.error || 'Error al crear el préstamo');
      }
    } catch (err) {
      setError('Error al crear el préstamo');
    } finally {
      setLoading(false);
    }
  };

  const labels = frequencyLabels[formData.frequency] || frequencyLabels.MONTHLY;

  if (!rates) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Nuevo Préstamo</h1>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Formulario */}
        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-4">
          {/* Cliente con autocomplete */}
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Cliente
            </label>
            <input
              type="text"
              value={clientSearch}
              onChange={(e) => {
                setClientSearch(e.target.value);
                setSelectedClient(null);
              }}
              onFocus={() => clientResults.length > 0 && setShowClientDropdown(true)}
              className="w-full px-4 py-2 border rounded-lg"
              placeholder="Buscar por nombre, apellido o DNI..."
              autoComplete="off"
            />
            {showClientDropdown && clientResults.length > 0 && (
              <div className="absolute z-10 w-full bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {clientResults.map((client) => (
                  <button
                    key={client.id}
                    type="button"
                    onClick={() => selectClient(client)}
                    className="w-full text-left px-4 py-2 hover:bg-gray-50 border-b last:border-b-0"
                  >
                    <span className="font-medium">{client.firstName} {client.lastName}</span>
                    <span className="text-gray-500 text-sm ml-2">({client.dni})</span>
                  </button>
                ))}
              </div>
            )}
            {selectedClient && (
              <p className="text-xs text-green-600 mt-1">
                ✓ Cliente seleccionado
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Fecha de Inicio
            </label>
            <input
              type="date"
              name="startDate"
              value={formData.startDate}
              onChange={handleChange}
              className="w-full px-4 py-2 border rounded-lg"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Monto ($)
            </label>
            <input
              type="number"
              name="amount"
              value={formData.amount}
              onChange={handleChange}
              className="w-full px-4 py-2 border rounded-lg"
              min={rates.MIN_LOAN_AMOUNT}
              max={rates.MAX_LOAN_AMOUNT}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Plazo ({labels.plural})
              </label>
              <input
                type="number"
                name="term"
                value={formData.term}
                onChange={handleChange}
                className="w-full px-4 py-2 border rounded-lg"
                min="1"
                max="120"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Frecuencia
              </label>
                <select
                  name="frequency"
                  value={formData.frequency}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border rounded-lg"
                >
                  <option value="WEEKLY">Semanal</option>
                  <option value="BIWEEKLY">Quincenal</option>
                  <option value="MONTHLY">Mensual</option>
                  <option value="DAILY">Diario</option>
                </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tasa {labels.singular} (%)
            </label>
            <input
              type="number"
              name="customRate"
              value={formData.customRate}
              onChange={handleChange}
              className="w-full px-4 py-2 border rounded-lg"
              step="0.1"
              min="0.1"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Propósito (opcional)
            </label>
            <input
              name="purpose"
              value={formData.purpose}
              onChange={handleChange}
              className="w-full px-4 py-2 border rounded-lg"
              placeholder="Ej: Consumo, negocio, etc."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notas (opcional)
            </label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              className="w-full px-4 py-2 border rounded-lg"
              rows={2}
            />
          </div>

          <div className="flex gap-4">
            <button
              type="button"
              onClick={simulateLoan}
              disabled={simulating}
              className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
            >
              {simulating ? 'Calculando...' : 'Simular'}
            </button>
            <button
              type="submit"
              disabled={loading || !simulation}
              className="flex-1 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition disabled:opacity-50"
            >
              {loading ? 'Creando...' : 'Crear Préstamo'}
            </button>
          </div>
        </form>

        {/* Simulación */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Simulación</h2>
          
          {simulation ? (
            <div className="space-y-4">
              <div className="p-4 bg-primary-50 rounded-lg">
                <p className="text-sm text-gray-600">Cuota ({labels.singular})</p>
                <p className="text-2xl font-bold text-primary-700">
                  ${simulation.installmentAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {simulation.schedule.length} pagos {labels.plural}
                </p>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600">Total Intereses</p>
                  <p className="text-xl font-semibold">
                    ${simulation.totalInterest.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600">Nro. de Pagos</p>
                  <p className="text-xl font-semibold">{simulation.schedule.length}</p>
                </div>
              </div>

              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600">Total a Pagar</p>
                <p className="text-2xl font-bold">
                  ${simulation.totalPayment.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
              </div>

              <div className="max-h-64 overflow-y-auto border rounded-lg">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-2 py-1">#</th>
                      <th className="px-2 py-1">Fecha</th>
                      <th className="px-2 py-1">Cuota</th>
                    </tr>
                  </thead>
                  <tbody>
                    {simulation.schedule.slice(0, 12).map((item) => (
                      <tr key={item.number} className="border-t text-center">
                        <td className="px-2 py-1">{item.number}</td>
                        <td className="px-2 py-1">{item.date}</td>
                        <td className="px-2 py-1">${item.payment.toFixed(2)}</td>
                      </tr>
                    ))}
                    {simulation.schedule.length > 12 && (
                      <tr>
                        <td colSpan={3} className="px-2 py-1 text-center text-gray-500">
                          ... y {simulation.schedule.length - 12} más
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="text-gray-500 text-center py-8">
              Configure los parámetros y haga clic en "Simular"
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function NewLoanPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    }>
      <NewLoanForm />
    </Suspense>
  );
}
