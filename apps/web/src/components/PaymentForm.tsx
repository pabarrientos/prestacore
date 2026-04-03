'use client';

import { useState, useEffect } from 'react';
import { getTodayString } from '@/lib/datetime';

interface InstallmentOption {
  id: string;
  installmentNumber: number;
  dueDate: string;
  amount: number;
  balance: number;
  paidAmount: number;
  status: string;
  daysOverdue: number;
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
  const [installments, setInstallments] = useState<InstallmentOption[]>([]);
  const [selectedInstallmentId, setSelectedInstallmentId] = useState<string>(preselectedInstallmentId || payment?.installmentId || '');
  const [amount, setAmount] = useState<string>(payment?.amount?.toString() || '');
  const [reference, setReference] = useState<string>(payment?.reference || '');
  const [notes, setNotes] = useState<string>(payment?.notes || '');
  const [paymentDate, setPaymentDate] = useState<string>(''); // Se carga en useEffect con timezone
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [maxAmount, setMaxAmount] = useState<number>(0);

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
          // Calculate max amount (total pending + mora)
          const totalPending = data.data.totalPending || 0;
          const totalMora = data.data.totalMora || 0;
          setMaxAmount(totalPending + totalMora);
        }
      })
      .catch((err) => console.error('Error loading installments:', err));
  }, [loanId]);

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
          setSuccess('Pago registrado exitosamente');
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
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4">
        {isEditing ? 'Editar Pago' : 'Registrar Pago'}
      </h3>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-600 rounded-lg text-sm">
          {success}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Installment selector */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
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
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
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
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Monto *
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            placeholder="0.00"
            required
          />
          <p className="text-xs text-gray-500 mt-1">
            Máximo: ${maxAmount.toFixed(2)}
          </p>
        </div>

        {/* Reference */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Referencia (opcional)
          </label>
          <input
            type="text"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            placeholder="Nro. de transacción, comprobante..."
          />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Notas (opcional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            rows={2}
            placeholder="Notas adicionales..."
          />
        </div>

        {/* Payment Date */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Fecha de Pago
          </label>
          <input
            type="date"
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Registrando...' : 'Registrar Pago'}
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancelar
            </button>
          )}
        </div>
      </form>
    </div>
  );
}