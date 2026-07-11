'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api';

interface Loan {
  id: string;
  amount: number;
  interestRate: number;
  termMonths: number;
  frequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'DAILY';
  status: string;
  amortizationSystem: string;
  purpose: string | null;
  notes: string | null;
  startedAt: string | null;
  client: {
    id: string;
    user: {
      firstName: string;
      lastName: string;
    };
  };
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

const SYSTEM_OPTIONS = [
  { value: 'FRENCH', label: 'Sistema Francés', description: 'Cuota fija' },
  { value: 'GERMAN', label: 'Sistema Alemán', description: 'Capital constante' },
  { value: 'FLAT_RATE', label: 'Sistema de Tasa Plana', description: 'Interés fijo' },
] as const;

export default function EditLoanPage() {
  const params = useParams();
  const router = useRouter();
  const { token } = useAuth();
  const [loan, setLoan] = useState<Loan | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [formData, setFormData] = useState({
    amount: '',
    term: '',
    frequency: 'MONTHLY',
    customRate: '',
    amortizationSystem: 'FRENCH' as typeof SYSTEM_OPTIONS[number]['value'],
    purpose: '',
    notes: '',
    startDate: '',
  });

  const [simulation, setSimulation] = useState<SimulationResult | null>(null);

  useEffect(() => {
    if (token && params.id) {
      apiFetch(`/api/loans/${params.id}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            setLoan(data.data);
            const l = data.data;
            let periodsPerYear = 12;
            if (l.frequency === 'WEEKLY') periodsPerYear = 48;
            else if (l.frequency === 'BIWEEKLY') periodsPerYear = 24;
            else if (l.frequency === 'DAILY') periodsPerYear = 360;
            
            const periodicRate = l.interestRate / periodsPerYear;
            
            // Format start date for input - use startedAt from the loan
            let startDate = new Date().toISOString().split('T')[0];
            if (l.startedAt) {
              // Extract YYYY-MM-DD from ISO string (e.g., "2026-03-01T00:00:00.000Z" -> "2026-03-01")
              const dateStr = String(l.startedAt);
              if (dateStr && dateStr !== 'null') {
                startDate = dateStr.substring(0, 10);
              }
            }
            
            setFormData({
              amount: String(l.amount),
              term: String(l.termMonths),
              frequency: l.frequency,
              customRate: periodicRate.toFixed(4),
              amortizationSystem: (l.amortizationSystem as typeof SYSTEM_OPTIONS[number]['value']) || 'FRENCH',
              purpose: l.purpose || '',
              notes: l.notes || '',
              startDate,
            });
          } else {
            setError(data.error || 'Error al cargar el préstamo');
          }
        })
        .catch((err) => {
          console.error(err);
          setError('Error al cargar el préstamo');
        })
        .finally(() => setLoading(false));
    }
  }, [token, params.id]);

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    
    // Si cambia la frecuencia, cargar la tasa correspondiente
    if (name === 'frequency') {
      const ratesRes = await apiFetch('/api/settings/rates');
      const ratesData = await ratesRes.json();
      if (ratesData.success) {
        const baseRates = ratesData.data;
        let newRate = baseRates.MONTHLY_BASE_RATE;
        if (value === 'WEEKLY') newRate = baseRates.WEEKLY_BASE_RATE;
        else if (value === 'BIWEEKLY') newRate = baseRates.BIWEEKLY_BASE_RATE;
        else if (value === 'DAILY') newRate = baseRates.DAILY_BASE_RATE;
        
        setFormData(prev => ({ ...prev, [name]: value, customRate: String(newRate) }));
        setSimulation(null);
        setError('');
        setSuccess('');
        return;
      }
    }
    
    setFormData(prev => ({ ...prev, [name]: value }));
    setError('');
    setSuccess('');
    // Clear simulation when form changes
    setSimulation(null);
  };

  const simulateLoan = async () => {
    const amount = parseFloat(formData.amount);
    const term = parseInt(formData.term);
    const frequency = formData.frequency;
    const customRate = parseFloat(formData.customRate);

    if (isNaN(amount) || amount <= 0) {
      setError('Ingrese un monto válido');
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
          date: item.dueDate.substring(0, 10), // Extract YYYY-MM-DD directly
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
    
    if (!simulation) {
      setError('Primero haga clic en "Simular" para ver el cronograma de pagos');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const amount = parseFloat(formData.amount);
      const term = parseInt(formData.term);
      const periodicRate = parseFloat(formData.customRate);
      
      let periodsPerYear = 12;
      if (formData.frequency === 'WEEKLY') periodsPerYear = 48;
      else if (formData.frequency === 'BIWEEKLY') periodsPerYear = 24;
      else if (formData.frequency === 'DAILY') periodsPerYear = 360;
      
      const annualRate = periodicRate * periodsPerYear;

      // Prepare schedule data from simulation
      const scheduleData = simulation ? simulation.schedule.map(item => ({
        number: item.number,
        dueDate: item.date, // Already YYYY-MM-DD
        amount: item.payment,
        principal: item.principal,
        interest: item.interest,
        balance: item.balance,
      })) : [];

      const res = await apiFetch(`/api/loans/${params.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount,
          interestRate: annualRate,
          termMonths: term,
          frequency: formData.frequency,
          amortizationSystem: formData.amortizationSystem,
          purpose: formData.purpose || null,
          notes: formData.notes || null,
          startDate: formData.startDate,
          schedule: scheduleData,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setSuccess('Préstamo actualizado correctamente');
        setTimeout(() => {
          router.push(`/admin/loans/${params.id}`);
        }, 1500);
      } else {
        setError(data.error || 'Error al actualizar el préstamo');
      }
    } catch (err) {
      setError('Error al actualizar el préstamo');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 dark:bg-[#121212]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 dark:border-[#39ff14]"></div>
      </div>
    );
  }

  if (error && !loan) {
    return (
      <div className="text-center py-12 dark:bg-[#121212]">
        <p className="text-red-600 dark:text-red-400 mb-4">{error || 'Préstamo no encontrado'}</p>
        <button
          onClick={() => router.push('/admin/loans')}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 dark:bg-[#39ff14] dark:text-black dark:hover:bg-[#32e612] dark:hover:shadow-[0_0_15px_rgba(57,255,20,0.4)]"
        >
          Volver a la lista
        </button>
      </div>
    );
  }

  const labels = frequencyLabels[formData.frequency] || frequencyLabels.MONTHLY;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div>
          <button
            onClick={() => router.push(`/admin/loans/${params.id}`)}
            className="text-primary-600 dark:text-[#39ff14] hover:text-primary-800 dark:hover:text-[#32e612] mb-2"
          >
            ← Volver al detalle
          </button>
          <h1 className="text-2xl font-bold dark:text-white/[.87]">Editar Préstamo</h1>
          {loan && (
            <p className="text-gray-500 dark:text-white/38">
              Cliente: {loan.client.user.firstName} {loan.client.user.lastName}
            </p>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/50 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded-lg">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/50 border border-green-200 dark:border-green-800 text-green-600 dark:text-green-400 rounded-lg">
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Formulario */}
        <form onSubmit={handleSubmit} className="bg-white dark:bg-[#1e1e1e] rounded-lg shadow p-4 sm:p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-[#d3d3d3] mb-1">
              Fecha de Inicio
            </label>
            <input
              type="date"
              name="startDate"
              value={formData.startDate}
              onChange={handleChange}
              className="w-full px-4 py-2 border rounded-lg dark:bg-[#2a2a2a] dark:border-gray-600 dark:text-white/[.87] focus:ring-primary-500 dark:focus:ring-[#39ff14] focus:border-primary-500 dark:focus:border-[#39ff14]"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-[#d3d3d3] mb-1">
                Monto ($)
              </label>
              <input
                type="number"
                name="amount"
                value={formData.amount}
                onChange={handleChange}
                className="w-full px-4 py-2 border rounded-lg dark:bg-[#2a2a2a] dark:border-gray-600 dark:text-white/[.87] focus:ring-primary-500 dark:focus:ring-[#39ff14] focus:border-primary-500 dark:focus:border-[#39ff14]"
                min="100"
                step="0.01"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-[#d3d3d3] mb-1">
                Plazo ({labels.plural})
              </label>
              <input
                type="number"
                name="term"
                value={formData.term}
                onChange={handleChange}
                className="w-full px-4 py-2 border rounded-lg dark:bg-[#2a2a2a] dark:border-gray-600 dark:text-white/[.87] focus:ring-primary-500 dark:focus:ring-[#39ff14] focus:border-primary-500 dark:focus:border-[#39ff14]"
                min="1"
                max="120"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-[#d3d3d3] mb-1">
                Frecuencia
              </label>
              <select
                name="frequency"
                value={formData.frequency}
                onChange={handleChange}
                className="w-full px-4 py-2 border rounded-lg dark:bg-[#2a2a2a] dark:border-gray-600 dark:text-white/[.87]"
              >
                <option value="WEEKLY">Semanal</option>
                <option value="BIWEEKLY">Quincenal</option>
                <option value="MONTHLY">Mensual</option>
                <option value="DAILY">Diario</option>
              </select>
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
                className="w-full px-4 py-2 border rounded-lg dark:bg-[#2a2a2a] dark:border-gray-600 dark:text-white/[.87] focus:ring-primary-500 dark:focus:ring-[#39ff14] focus:border-primary-500 dark:focus:border-[#39ff14]"
                step="0.0001"
                min="0"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-[#d3d3d3] mb-1">
              Propósito
            </label>
            <input
              type="text"
              name="purpose"
              value={formData.purpose}
              onChange={handleChange}
              className="w-full px-4 py-2 border rounded-lg dark:bg-[#2a2a2a] dark:border-gray-600 dark:text-white/[.87] dark:placeholder-gray-500"
              placeholder="Ej: Consumo, negocio, etc."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-[#d3d3d3] mb-1">
              Notas
            </label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              className="w-full px-4 py-2 border rounded-lg dark:bg-[#2a2a2a] dark:border-gray-600 dark:text-white/[.87]"
              rows={3}
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
            </p>
          </div>

          <div className="flex gap-4">
            <button
              type="button"
              onClick={simulateLoan}
              disabled={simulating}
              className="flex-1 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-[#d3d3d3] rounded-lg hover:bg-gray-50 dark:hover:bg-[#2a2a2a] transition disabled:opacity-50"
            >
              {simulating ? 'Calculando...' : 'Simular'}
            </button>
            <button
              type="submit"
              disabled={saving || !simulation}
              className="flex-1 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 dark:bg-[#39ff14] dark:text-black dark:hover:bg-[#32e612] dark:hover:shadow-[0_0_15px_rgba(57,255,20,0.4)] transition disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </form>

        {/* Simulación */}
        <div className="bg-white dark:bg-[#1e1e1e] rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4 dark:text-white/[.87]">Simulación</h2>
          
          {simulation ? (
            <div className="space-y-4">
              <div className="p-4 bg-primary-50 dark:bg-[#2a2a2a] rounded-lg">
                <p className="text-sm text-gray-600 dark:text-[#d3d3d3]">Cuota ({labels.singular})</p>
                <p className="text-2xl font-bold text-primary-700 dark:text-[#39ff14]">
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
                        <td className="px-2 py-1 dark:text-white/[.87]">{new Date(item.date + 'T00:00:00').toLocaleDateString()}</td>
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
