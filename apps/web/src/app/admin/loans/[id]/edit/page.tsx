'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

interface Loan {
  id: string;
  amount: number;
  interestRate: number;
  termMonths: number;
  frequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
  status: string;
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

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const frequencyLabels: Record<string, { plural: string; singular: string }> = {
  WEEKLY: { plural: 'semanales', singular: 'semanal' },
  BIWEEKLY: { plural: 'quincenales', singular: 'quincenal' },
  MONTHLY: { plural: 'mensuales', singular: 'mensual' },
};

export default function EditLoanPage() {
  const params = useParams();
  const router = useRouter();
  const { token, user } = useAuth();
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
    purpose: '',
    notes: '',
    startDate: '',
  });

  const [simulation, setSimulation] = useState<SimulationResult | null>(null);

  useEffect(() => {
    if (token && params.id) {
      fetch(`${API_URL}/api/loans/${params.id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            setLoan(data.data);
            const l = data.data;
            let periodsPerYear = 12;
            if (l.frequency === 'WEEKLY') periodsPerYear = 52;
            else if (l.frequency === 'BIWEEKLY') periodsPerYear = 24;
            
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setError('');
    setSuccess('');
    // Clear simulation when form changes
    setSimulation(null);
  };

  const simulateLoan = () => {
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
      if (formData.frequency === 'WEEKLY') periodsPerYear = 52;
      else if (formData.frequency === 'BIWEEKLY') periodsPerYear = 24;
      
      const annualRate = periodicRate * periodsPerYear;

      // Prepare schedule data from simulation
      const scheduleData = simulation ? simulation.schedule.map(item => ({
        number: item.number,
        dueDate: item.date.split('/').reverse().join('-'), // Convert DD/MM/YYYY to YYYY-MM-DD
        amount: item.payment,
        principal: item.principal,
        interest: item.interest,
        balance: item.balance,
      })) : [];

      const res = await fetch(`${API_URL}/api/loans/${params.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          amount,
          interestRate: annualRate,
          termMonths: term,
          frequency: formData.frequency,
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
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error && !loan) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">{error || 'Préstamo no encontrado'}</p>
        <button
          onClick={() => router.push('/admin/loans')}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
        >
          Volver a la lista
        </button>
      </div>
    );
  }

  const labels = frequencyLabels[formData.frequency] || frequencyLabels.MONTHLY;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <button
            onClick={() => router.push(`/admin/loans/${params.id}`)}
            className="text-primary-600 hover:text-primary-800 mb-2"
          >
            ← Volver al detalle
          </button>
          <h1 className="text-2xl font-bold">Editar Préstamo</h1>
          {loan && (
            <p className="text-gray-500">
              Cliente: {loan.client.user.firstName} {loan.client.user.lastName}
            </p>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-600 rounded-lg">
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Formulario */}
        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-4">
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

          <div className="grid grid-cols-2 gap-4">
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
                min="100"
                step="0.01"
                required
              />
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
                className="w-full px-4 py-2 border rounded-lg"
                min="1"
                max="120"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
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
              </select>
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
                step="0.0001"
                min="0"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Propósito
            </label>
            <input
              type="text"
              name="purpose"
              value={formData.purpose}
              onChange={handleChange}
              className="w-full px-4 py-2 border rounded-lg"
              placeholder="Ej: Consumo, negocio, etc."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notas
            </label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              className="w-full px-4 py-2 border rounded-lg"
              rows={3}
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
              disabled={saving || !simulation}
              className="flex-1 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Guardar Cambios'}
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
                      <tr key={item.number} className="border-t">
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
