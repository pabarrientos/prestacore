'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { getTodayString } from '@/lib/datetime';
import { apiFetch } from '@/lib/api';

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
  
  const SYSTEM_OPTIONS = [
    { value: 'FRENCH', label: 'Sistema Francés', description: 'Cuota fija' },
    { value: 'GERMAN', label: 'Sistema Alemán', description: 'Capital constante' },
    { value: 'FLAT_RATE', label: 'Sistema de Tasa Plana', description: 'Interés fijo' },
  ] as const;

  const [formData, setFormData] = useState({
    amount: '',
    term: '12',
    frequency: 'MONTHLY',
    customRate: '',
    purpose: '',
    notes: '',
    startDate: '', // Se carga en useEffect con timezone
    amortizationSystem: 'FRENCH' as typeof SYSTEM_OPTIONS[number]['value'],
  });
  const [rates, setRates] = useState<RateConfig | null>(null);
  const [defaultSystem, setDefaultSystem] = useState<string>('FRENCH');
  const [simulation, setSimulation] = useState<SimulationResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [simulating, setSimulating] = useState(false);

  // Cargar tasas, fecha inicial y sistema por defecto con timezone
  useEffect(() => {
    Promise.all([
      apiFetch('/api/settings/rates').then(res => res.json()),
      apiFetch('/api/settings/default-amortization-system').then(res => res.json()),
    ])
      .then(([ratesData, systemData]) => {
        if (ratesData.success) {
          setRates(ratesData.data);
          const freq = formData.frequency;
          let defaultRate = ratesData.data.MONTHLY_BASE_RATE;
          if (freq === 'WEEKLY') defaultRate = ratesData.data.WEEKLY_BASE_RATE;
          else if (freq === 'BIWEEKLY') defaultRate = ratesData.data.BIWEEKLY_BASE_RATE;
          setFormData(prev => ({ ...prev, customRate: String(defaultRate) }));
        }
        if (systemData.success) {
          const sys = systemData.data.defaultAmortizationSystem;
          setDefaultSystem(sys);
          setFormData(prev => ({ ...prev, amortizationSystem: sys }));
        }
      })
      .catch(console.error);

    // Cargar fecha inicial
    setFormData(prev => ({ ...prev, startDate: getTodayString() }));
  }, []);

  // Buscar clientes
  useEffect(() => {
    if (clientSearch.length >= 2 && token) {
      const timeout = setTimeout(() => {
        apiFetch(`/api/clients/search?q=${encodeURIComponent(clientSearch)}`)
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
      apiFetch(`/api/clients/${clientIdParam}`)
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

  const simulateLoan = async () => {
    if (!rates) return;

    const amount = parseFloat(formData.amount);
    const term = parseInt(formData.term);
    const frequency = formData.frequency;
    const customRate = parseFloat(formData.customRate);

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

    setSimulating(true);
    setError('');

    try {
      let periodsPerYear: number;
      switch (frequency) {
        case 'WEEKLY': periodsPerYear = 48; break;
        case 'BIWEEKLY': periodsPerYear = 24; break;
        case 'DAILY': periodsPerYear = 360; break;
        default: periodsPerYear = 12;
      }

      const annualRate = customRate * periodsPerYear;

      const response = await apiFetch('/api/loans/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          interestRate: annualRate,
          termMonths: term,
          frequency,
          amortizationSystem: formData.amortizationSystem,
          startDate: formData.startDate || undefined,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        setError(data.error || 'Error al simular');
        setSimulating(false);
        return;
      }

      // Map backend response to frontend format
      setSimulation({
        installmentAmount: data.data.installmentAmount,
        totalInterest: data.data.totalInterest,
        totalPayment: data.data.totalPayment,
        annualRate: data.data.annualRate,
        schedule: data.data.schedule.map((item: any) => ({
          number: item.number,
          date: new Date(item.dueDate.replace('Z', '')).toLocaleDateString(),
          payment: item.amount,
          principal: item.principal,
          interest: item.interest,
          balance: item.balance,
        })),
      });
    } catch (err) {
      setError('Error de conexión');
    } finally {
      setSimulating(false);
    }
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
      if (formData.frequency === 'WEEKLY') periodsPerYear = 48;
      else if (formData.frequency === 'BIWEEKLY') periodsPerYear = 24;
      else if (formData.frequency === 'DAILY') periodsPerYear = 360;
      
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

      const res = await apiFetch('/api/loans', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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
          amortizationSystem: formData.amortizationSystem,
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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 dark:border-[#39ff14]"></div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6 dark:text-white/[.87]">Nuevo Préstamo</h1>

      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/50 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded-lg">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Formulario */}
        <form onSubmit={handleSubmit} className="bg-white dark:bg-[#1e1e1e] rounded-lg shadow p-4 sm:p-6 space-y-4">
          {/* Cliente con autocomplete */}
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 dark:text-[#d3d3d3] mb-1">
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
              className="w-full px-4 py-2 min-h-[44px] border rounded-lg dark:bg-[#2a2a2a] dark:border-gray-600 dark:text-white/[.87] dark:placeholder-gray-500 focus:ring-primary-500 dark:focus:ring-[#39ff14] focus:border-primary-500 dark:focus:border-[#39ff14]"
              placeholder="Buscar por nombre, apellido o DNI..."
              autoComplete="off"
            />
            {showClientDropdown && clientResults.length > 0 && (
              <div className="absolute z-10 w-full bg-white dark:bg-[#1e1e1e] border dark:border-gray-700 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {clientResults.map((client) => (
                  <button
                    key={client.id}
                    type="button"
                    onClick={() => selectClient(client)}
                    className="w-full text-left px-4 py-2 hover:bg-gray-50 dark:hover:bg-[#2a2a2a] border-b dark:border-gray-700 last:border-b-0"
                  >
                    <span className="font-medium dark:text-white/[.87]">{client.firstName} {client.lastName}</span>
                    <span className="text-gray-500 dark:text-white/38 text-sm ml-2">({client.dni})</span>
                  </button>
                ))}
              </div>
            )}
            {selectedClient && (
              <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                ✓ Cliente seleccionado
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-[#d3d3d3] mb-1">
              Fecha de Inicio
            </label>
            <input
              type="date"
              name="startDate"
              value={formData.startDate}
              onChange={handleChange}
              className="w-full px-4 py-2 min-h-[44px] border rounded-lg dark:bg-[#2a2a2a] dark:border-gray-600 dark:text-white/[.87] focus:ring-primary-500 dark:focus:ring-[#39ff14] focus:border-primary-500 dark:focus:border-[#39ff14]"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-[#d3d3d3] mb-1">
              Monto ($)
            </label>
            <input
              type="number"
              name="amount"
              value={formData.amount}
              onChange={handleChange}
              className="w-full px-4 py-2 min-h-[44px] border rounded-lg dark:bg-[#2a2a2a] dark:border-gray-600 dark:text-white/[.87] focus:ring-primary-500 dark:focus:ring-[#39ff14] focus:border-primary-500 dark:focus:border-[#39ff14]"
              min={rates.MIN_LOAN_AMOUNT}
              max={rates.MAX_LOAN_AMOUNT}
              step="any"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-[#d3d3d3] mb-1">
                Plazo ({labels.plural})
              </label>
              <input
                type="number"
                name="term"
                value={formData.term}
                onChange={handleChange}
                className="w-full px-4 py-2 min-h-[44px] border rounded-lg dark:bg-[#2a2a2a] dark:border-gray-600 dark:text-white/[.87] focus:ring-primary-500 dark:focus:ring-[#39ff14] focus:border-primary-500 dark:focus:border-[#39ff14]"
                min="1"
                max="120"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-[#d3d3d3] mb-1">
                Frecuencia
              </label>
                <select
                  name="frequency"
                  value={formData.frequency}
                  onChange={handleChange}
                  className="w-full px-4 py-2 min-h-[44px] border rounded-lg dark:bg-[#2a2a2a] dark:border-gray-600 dark:text-white/[.87]"
                >
                  <option value="WEEKLY">Semanal</option>
                  <option value="BIWEEKLY">Quincenal</option>
                  <option value="MONTHLY">Mensual</option>
                  <option value="DAILY">Diario</option>
                </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-[#d3d3d3] mb-1">
              Tasa {labels.singular} (%)
            </label>
            <input
              type="number"
              name="customRate"
              value={formData.customRate}
              onChange={handleChange}
              className="w-full px-4 py-2 min-h-[44px] border rounded-lg dark:bg-[#2a2a2a] dark:border-gray-600 dark:text-white/[.87] focus:ring-primary-500 dark:focus:ring-[#39ff14] focus:border-primary-500 dark:focus:border-[#39ff14]"
              step="0.1"
              min="0.1"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-[#d3d3d3] mb-1">
              Propósito (opcional)
            </label>
            <input
              name="purpose"
              value={formData.purpose}
              onChange={handleChange}
              className="w-full px-4 py-2 min-h-[44px] border rounded-lg dark:bg-[#2a2a2a] dark:border-gray-600 dark:text-white/[.87] dark:placeholder-gray-500"
              placeholder="Ej: Consumo, negocio, etc."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-[#d3d3d3] mb-1">
              Notas (opcional)
            </label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              className="w-full px-4 py-2 border rounded-lg dark:bg-[#2a2a2a] dark:border-gray-600 dark:text-white/[.87]"
              rows={2}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-[#d3d3d3] mb-1">
              Sistema de Amortización
            </label>
            <select
              name="amortizationSystem"
              value={formData.amortizationSystem}
              onChange={handleChange}
              className="w-full px-4 py-2 border rounded-lg dark:bg-[#2a2a2a] dark:border-gray-600 dark:text-white/[.87]"
            >
              {SYSTEM_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1 dark:text-white/38">
              {SYSTEM_OPTIONS.find(s => s.value === formData.amortizationSystem)?.description}
              {formData.amortizationSystem === defaultSystem && ' (por defecto)'}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
            <button
              type="button"
              onClick={simulateLoan}
              disabled={simulating}
              className="flex-1 py-2 min-h-[44px] border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-[#d3d3d3] rounded-lg hover:bg-gray-50 dark:hover:bg-[#2a2a2a] transition disabled:opacity-50"
            >
              {simulating ? 'Calculando...' : 'Simular'}
            </button>
            <button
              type="submit"
              disabled={loading || !simulation}
              className="flex-1 py-2 min-h-[44px] bg-primary-600 text-white rounded-lg hover:bg-primary-700 dark:bg-[#39ff14] dark:text-black dark:hover:bg-[#32e612] dark:hover:shadow-[0_0_15px_rgba(57,255,20,0.4)] transition disabled:opacity-50"
            >
              {loading ? 'Creando...' : 'Crear Préstamo'}
            </button>
          </div>
        </form>

        {/* Simulación */}
        <div className="bg-white dark:bg-[#1e1e1e] rounded-lg shadow p-4 sm:p-6">
          <h2 className="text-lg font-semibold mb-4 dark:text-white/[.87]">Simulación</h2>
          
          {simulation ? (
            <div className="space-y-4">
              <div className="p-4 bg-primary-50 dark:bg-[#2a2a2a] rounded-lg">
                <p className="text-sm text-gray-600 dark:text-[#d3d3d3]">Cuota ({labels.singular})</p>
                <p className="text-xl sm:text-2xl font-bold text-primary-700 dark:text-[#39ff14]">
                  ${simulation.installmentAmount.toLocaleString()}
                </p>
                <p className="text-xs text-gray-500 dark:text-white/38 mt-1">
                  {simulation.schedule.length} pagos {labels.plural}
                </p>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 bg-gray-50 dark:bg-[#2a2a2a] rounded-lg">
                  <p className="text-sm text-gray-600 dark:text-[#d3d3d3]">Total Intereses</p>
                  <p className="text-xl font-semibold dark:text-white/[.87]">
                    ${simulation.totalInterest.toLocaleString()}
                  </p>
                </div>
                <div className="p-4 bg-gray-50 dark:bg-[#2a2a2a] rounded-lg">
                  <p className="text-sm text-gray-600 dark:text-[#d3d3d3]">Nro. de Pagos</p>
                  <p className="text-xl font-semibold dark:text-white/[.87]">{simulation.schedule.length}</p>
                </div>
              </div>

              <div className="p-4 bg-gray-50 dark:bg-[#2a2a2a] rounded-lg">
                <p className="text-sm text-gray-600 dark:text-[#d3d3d3]">Total a Pagar</p>
                <p className="text-2xl font-bold dark:text-white/[.87]">
                  ${simulation.totalPayment.toLocaleString()}
                </p>
              </div>

              <div className="max-h-64 overflow-y-auto border dark:border-gray-700 rounded-lg">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-[#2a2a2a] sticky top-0">
                    <tr>
                      <th className="px-2 py-1 dark:text-[#d3d3d3]">#</th>
                      <th className="px-2 py-1 dark:text-[#d3d3d3]">Fecha</th>
                      <th className="px-2 py-1 dark:text-[#d3d3d3]">Cuota</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {simulation.schedule.slice(0, 12).map((item) => (
                      <tr key={item.number} className="border-t dark:border-gray-700 text-center">
                        <td className="px-2 py-1 dark:text-white/[.87]">{item.number}</td>
                        <td className="px-2 py-1 dark:text-white/[.87]">{item.date}</td>
                        <td className="px-2 py-1 dark:text-white/[.87]">${item.payment.toFixed(2)}</td>
                      </tr>
                    ))}
                    {simulation.schedule.length > 12 && (
                      <tr>
                        <td colSpan={3} className="px-2 py-1 text-center text-gray-500 dark:text-white/38">
                          ... y {simulation.schedule.length - 12} más
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="text-gray-500 dark:text-white/38 text-center py-8">
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
      <div className="flex items-center justify-center h-64 dark:bg-[#121212]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 dark:border-[#39ff14]"></div>
      </div>
    }>
      <NewLoanForm />
    </Suspense>
  );
}
