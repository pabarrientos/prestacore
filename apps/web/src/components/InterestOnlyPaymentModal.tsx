'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { getTodayString } from '@/lib/datetime';

interface InterestOnlyPaymentModalProps {
  loanId: string;
  installment: {
    id: string;
    installmentNumber: number;
    dueDate: string;
    amount: number;
    principal: number;
    interest: number;
  };
  onSuccess: () => void;
  onCancel: () => void;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '-';
  const datePart = dateStr.split('T')[0];
  const [year, month, day] = datePart.split('-');
  return `${day}/${month}/${year}`;
}

export default function InterestOnlyPaymentModal({
  loanId,
  installment,
  onSuccess,
  onCancel,
}: InterestOnlyPaymentModalProps) {
  const [amount, setAmount] = useState<string>(installment.interest.toString());
  const [reference, setReference] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [paymentDate, setPaymentDate] = useState<string>(getTodayString());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setError('El monto debe ser mayor a 0');
      return;
    }

    setLoading(true);

    try {
      const res = await apiFetch('/api/payments/interest-only', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loanId,
          installmentId: installment.id,
          amount: amountNum,
          paymentDate: paymentDate || undefined,
          reference: reference || undefined,
          notes: notes || undefined,
        }),
      });

      const data = await res.json();

      if (data.success) {
        onSuccess();
      } else {
        setError(data.error || 'Error al registrar el pago de solo interés');
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
          Pago Solo Interés
        </h3>
        <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-400">
          Cuota #{installment.installmentNumber}
        </span>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm dark:bg-red-950/50 dark:border-red-900 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm dark:bg-blue-950/50 dark:border-blue-900 dark:text-blue-300">
        <p className="mb-1">
          <strong>Cuota #{installment.installmentNumber}</strong> — Vence: {formatDate(installment.dueDate)}
        </p>
        <p>Capital: ${installment.principal.toLocaleString()} | Interés: ${installment.interest.toLocaleString()}</p>
        <p className="text-xs mt-2 text-gray-500 dark:text-white/38">
          Al pagar solo el interés, se creará una nueva cuota desplazando los vencimientos restantes.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-white/60">
            Monto a pagar *
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
            Interés original: ${installment.interest.toLocaleString()}
            {amount && !isNaN(parseFloat(amount)) && parseFloat(amount) !== installment.interest && (
              <span className="text-amber-600 dark:text-amber-400 ml-1">
                (Modificado — se registrará en notas)
              </span>
            )}
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-white/60">
            Fecha de Pago
          </label>
          <input
            type="date"
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14]"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-white/60">
            Referencia (opcional)
          </label>
          <input
            type="text"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14]"
            placeholder="N° comprobante, transacción..."
            maxLength={100}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-white/60">
            Notas (opcional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/[.87] dark:focus:ring-[#39ff14]"
            placeholder="Notas adicionales..."
            rows={2}
            maxLength={500}
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 px-4 py-2 min-h-[44px] bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Procesando...' : `Pagar $${parseFloat(amount || '0').toLocaleString('es-AR', { minimumFractionDigits: 2 })}`}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 min-h-[44px] border border-gray-300 rounded-lg hover:bg-gray-50 dark:border-gray-600 dark:text-white/[.87] dark:hover:bg-gray-700"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
