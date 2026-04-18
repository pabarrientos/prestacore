'use client';

import { useState, useEffect } from 'react';
import { getTodayString } from '@/lib/datetime';
import { useAuth } from '@/lib/auth-context';

interface InstallmentOption {
  id: string;
  installmentNumber: number;
  dueDate: string;
  amount: number;
  balance: number;
  paidAmount: number;
  status: string;
  daysOverdue: number;
  moraAmount?: number;
}

interface PaymentData {
  id?: string;
  amount: number;
  reference?: string;
  notes?: string;
  installmentId?: string;
  paymentDate?: string;
}

interface PaymentFormProps {
  loanId: string;
  payment?: PaymentData;
  preselectedInstallmentId?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function PaymentForm({ loanId, payment, preselectedInstallmentId, onSuccess, onCancel }: PaymentFormProps) {
  const { user } = useAuth();
  const [installments, setInstallments] = useState<InstallmentOption[]>([]);
  const [selectedInstallmentId, setSelectedInstallmentId] = useState<string>(preselectedInstallmentId || payment?.installmentId || '');
  const [amount, setAmount] = useState<string>(payment?.amount?.toString() || '');
  const [reference, setReference] = useState<string>(payment?.reference || '');
  const [notes, setNotes] = useState<string>(payment?.notes || '');
  const [paymentDate, setPaymentDate] = useState<string>(''); // Se carga en useEffect con timezone
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  
  // Mora state
  const [moraAmount, setMoraAmount] = useState<number>(0);
  const [originalMoraAmount, setOriginalMoraAmount] = useState<number>(0);
  const [originalDaysOverdue, setOriginalDaysOverdue] = useState<number>(0);
  const [moraCalculatedAt, setMoraCalculatedAt] = useState<string>('');
  const [moraLoading, setMoraLoading] = useState(false);

  // Rounding unit (configurable from settings)
  const [roundingUnit, setRoundingUnit] = useState<number>(1000);

  const isEditing = !!payment?.id;

  useEffect(() => {
    if (preselectedInstallmentId) {
      setSelectedInstallmentId(preselectedInstallmentId);
    }
  }, [preselectedInstallmentId]);

  // Cargar fecha de pago con timezone (para nuevos pagos) o usar la fecha del pago existente
  useEffect(() => {
    if (payment?.paymentDate) {
      // Si es edición, usar la fecha del pago
      setPaymentDate(payment.paymentDate.split('T')[0]);
    } else {
      // Si es nuevo pago, usar la fecha de hoy en la timezone configurada
      getTodayString().then((dateStr: string) => {
        setPaymentDate(dateStr);
      });
    }
  }, [payment]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    // Fetch loan balance to get installments
    fetch(`${API_URL}/api/payments/balance/${loanId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          const pending = data.data.installments.filter(
            (inst: InstallmentOption) => inst.status !== 'PAID'
          );
          setInstallments(pending);
        }
      })
      .catch((err) => console.error('Error loading installments:', err));
  }, [loanId]);

  // Cargar configuración de redondeo
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    fetch(`${API_URL}/api/settings`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data.ROUNDING_UNIT) {
          setRoundingUnit(parseInt(data.data.ROUNDING_UNIT.value, 10) || 1000);
        }
      })
      .catch((err) => console.error('Error loading rounding unit:', err));
  }, []);

  // Función para recalcular mora cuando cambia la fecha de pago
  const recalculateMora = async (date: string) => {
    if (!loanId || !selectedInstallmentId) return;
    
    const token = localStorage.getItem('token');
    if (!token) return;

    setMoraLoading(true);
    try {
      const res = await fetch(
        `${API_URL}/api/payments/balance/${loanId}/at?date=${date}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      
      if (data.success) {
        const inst = data.data.installments.find(
          (i: InstallmentOption) => i.id === selectedInstallmentId
        );
        if (inst) {
          setMoraAmount(inst.moraAmount);
          setOriginalMoraAmount(inst.moraAmount);
          setOriginalDaysOverdue(inst.daysOverdue);
          setMoraCalculatedAt(data.data.calculatedAt);
        }
      }
    } catch (err) {
      console.error('Error recalculating mora:', err);
    } finally {
      setMoraLoading(false);
    }
  };

  // Effect para cargar mora Y monto cuando se selecciona una cuota
  useEffect(() => {
    if (selectedInstallmentId && installments.length > 0) {
      const inst = installments.find(i => i.id === selectedInstallmentId);
      if (inst) {
        // Settear el monto con el balance de la cuota (precarga el amount)
        setAmount(inst.balance ? Number(inst.balance).toString() : '');
        // Settear la mora desde los datos locales
        setMoraAmount(inst.moraAmount || 0);
        setOriginalMoraAmount(inst.moraAmount || 0);
        setOriginalDaysOverdue(inst.daysOverdue || 0);
        // Usar la fecha actual para el cálculo
        getTodayString().then((dateStr: string) => {
          setMoraCalculatedAt(dateStr);
        });
      }
    }
  }, [selectedInstallmentId, installments]);

  // Effect para recalcular mora cuando cambia la fecha de pago
  useEffect(() => {
    if (paymentDate && selectedInstallmentId) {
      recalculateMora(paymentDate);
    }
  }, [paymentDate, selectedInstallmentId]);

  // Control de acceso por rol
  const canEditMora = user?.role === 'ADMIN' || user?.role === 'VENDEDOR';
  const canEditPaymentDate = user?.role === 'ADMIN';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const token = localStorage.getItem('token');
    if (!token) {
      setError('No hay token de autenticación');
      return;
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setError('El monto debe ser mayor a 0');
      return;
    }

    // Validate installment is selected
    if (!selectedInstallmentId) {
      setError('Debe seleccionar una cuota');
      return;
    }

    // Validate mora amount is not negative
    if (moraAmount < 0) {
      setError('El monto de mora no puede ser negativo');
      return;
    }

    // Get selected installment to validate amount
    const selectedInst = installments.find(i => i.id === selectedInstallmentId);
    if (selectedInst && amountNum > Number(selectedInst.balance)) {
      setError(`El monto no puede exceder el saldo de la cuota ($${Number(selectedInst.balance).toFixed(2)})`);
      return;
    }

    setLoading(true);

    try {
      let res;
      let data;

      if (isEditing && payment?.id) {
        // Edit existing payment
        res = await fetch(`${API_URL}/api/payments/${payment.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            amount: amountNum,
            reference: reference || undefined,
            notes: notes || undefined,
            paymentDate: paymentDate || undefined,
          }),
        });
        data = await res.json();

        if (data.success) {
          setSuccess('Pago actualizado exitosamente');
        } else {
          setError(data.error || 'Error al actualizar el pago');
        }
      } else {
        // Create new payment
        res = await fetch(`${API_URL}/api/payments`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            loanId,
            installmentId: selectedInstallmentId || undefined,
            amount: amountNum,
            reference: reference || undefined,
            notes: notes || undefined,
            paymentDate: paymentDate || undefined,
          }),
        });
        data = await res.json();

        if (data.success) {
          // Si hay mora y se debe registrar (incluso $0 para tracking)
          if (moraAmount >= 0) {
            try {
              const moraRes = await fetch(`${API_URL}/api/payments/mora`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                  loanId,
                  installmentId: selectedInstallmentId,
                  amount: moraAmount,
                  paymentDate: paymentDate || undefined,
                  originalMoraAmount,
                  originalDaysOverdue,
                }),
              });
              const moraData = await moraRes.json();
              
              if (moraData.success) {
                setSuccess(moraAmount === 0 
                  ? 'Pago registrado. Mora perdonada ($0)' 
                  : 'Pago de cuota y mora registrados');
              } else {
                // Si falla la mora pero la cuota se pagó, warning
                setSuccess('Pago de cuota registrado. Error en pago de mora: ' + moraData.error);
              }
            } catch (moraErr) {
              setSuccess('Pago de cuota registrado. Error en mora');
            }
          }
          
          setAmount('');
          setReference('');
          setNotes('');
          setSelectedInstallmentId('');
        } else {
          setError(data.error || 'Error al registrar el pago');
        }
      }

      if (data.success && onSuccess) {
        onSuccess();
      }
    } catch (err) {
      setError('Error al conectar con el servidor');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6 dark:bg-[#1e1e1e]">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold dark:text-white/[.87]">
          {isEditing ? 'Editar Pago' : 'Registrar Pago'}
        </h3>
        {amount && !isNaN(parseFloat(amount)) && parseFloat(amount) > 0 && (
          <span className="text-xl font-bold text-primary-600 dark:text-[#39ff14]">
            ${(parseFloat(amount) + moraAmount).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
          </span>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm dark:bg-red-950/50 dark:border-red-900 dark:text-red-400">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-600 rounded-lg text-sm dark:bg-green-950/50 dark:border-green-900 dark:text-green-400">
          {success}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Installment selector */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-white/60">
            Cuota *
          </label>
          <select
            value={selectedInstallmentId}
            onChange={(e) => {
              setSelectedInstallmentId(e.target.value);
              // Reset amount when changing installment
              const inst = installments.find(i => i.id === e.target.value);
              if (inst) {
                setAmount(Number(inst.balance).toString());
              }
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14]"
            required
          >
            <option value="">Seleccionar cuota...</option>
            {installments.map((inst) => (
              <option key={inst.id} value={inst.id}>
                Cuota #{inst.installmentNumber} - ${Number(inst.balance).toLocaleString()} 
                {inst.status === 'OVERDUE' && ` (Vencida ${inst.daysOverdue} días)`}
                {inst.status === 'PARTIAL' && ' (Parcial)'}
              </option>
            ))}
          </select>
        </div>

        {/* Amount */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-white/60">
            Monto *
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14]"
            placeholder="0.00"
            required
          />
          <p className="text-xs text-gray-500 mt-1 dark:text-white/60">
            {amount && !isNaN(parseFloat(amount)) && parseFloat(amount) > 0 && (() => {
              const currentAmount = parseFloat(amount);
              const rounded = Math.ceil(currentAmount / roundingUnit) * roundingUnit;
              const diferencia = parseFloat((rounded - currentAmount).toFixed(2));
              return (
                <>
                  <button
                    type="button"
                    onClick={() => setMoraAmount(parseFloat((moraAmount + diferencia).toFixed(2)))}
                    className="text-primary-600 dark:text-[#39ff14] hover:underline cursor-pointer"
                    title="Sumar diferencia a mora"
                  >
                    Diferencia: ${diferencia.toFixed(2)}
                  </button>
                  <span className="mx-2 text-gray-400">|</span>
                  <span className="text-gray-400">
                    Redondeado: ${rounded}
                  </span>
                </>
              );
            })()}
          </p>
        </div>

        {/* Mora Amount */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-white/60">
            Monto de Mora
          </label>
          <div className="relative">
            <input
              type="number"
              step="0.01"
              min="0"
              value={moraAmount}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setMoraAmount(isNaN(val) ? 0 : val);
              }}
              disabled={!canEditMora}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14] ${
                !canEditMora ? 'bg-gray-100 dark:bg-gray-800 cursor-not-allowed' : ''
              }`}
              placeholder="0.00"
            />
            {moraLoading && (
              <span className="absolute right-3 top-2 text-xs text-gray-500">
                Calculando...
              </span>
            )}
          {moraCalculatedAt && !moraLoading && (
            <p className="text-xs text-gray-400 mt-1">
              Calculado para fecha: {moraCalculatedAt}
            </p>
          )}
          </div>
          {originalMoraAmount > 0 && moraAmount !== originalMoraAmount && (
            <p className="text-xs text-amber-600 mt-1 dark:text-amber-400">
              Original: ${originalMoraAmount.toFixed(2)} • Días: {originalDaysOverdue}
            </p>
          )}
          {!canEditMora && (
            <p className="text-xs text-gray-500 mt-1 dark:text-white/60">
              Solo ADMIN o VENDEDOR pueden modificar
            </p>
          )}
        </div>

        {/* Reference */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-white/60">
            Referencia (opcional)
          </label>
          <input
            type="text"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14]"
            placeholder="Nro. de transacción, comprobante..."
          />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-white/60">
            Notas (opcional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14]"
            rows={2}
            placeholder="Notas adicionales..."
          />
        </div>

        {/* Payment Date */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-white/60">
            Fecha de Pago {canEditPaymentDate && <span className="text-xs text-gray-400">(Editable solo ADMIN)</span>}
          </label>
          <input
            type="date"
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
            disabled={!canEditPaymentDate}
            className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14] ${
              !canEditPaymentDate ? 'bg-gray-100 dark:bg-gray-800 cursor-not-allowed' : ''
            }`}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-[#39ff14] dark:text-black dark:hover:bg-[#32e012] dark:hover:shadow-[0_0_15px_rgba(57,255,20,0.4)]"
          >
            {loading ? 'Registrando...' : 'Registrar Pago'}
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 dark:border-gray-700 dark:text-white/60 dark:hover:bg-white/10"
            >
              Cancelar
            </button>
          )}
        </div>
      </form>
    </div>
  );
}