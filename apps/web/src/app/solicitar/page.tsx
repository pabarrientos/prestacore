'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

const LOAN_STORAGE_KEY = 'pending_loan_request';

interface LoanRequest {
  amount: number;
  term: number;
  frequency: string;
  installmentAmount: number;
  totalInterest: number;
  totalPayment: number;
  annualRate: number;
  amortizationSystem: string;
  schedule: Array<{
    number: number;
    date: string;
    payment: number;
    principal: number;
    interest: number;
    balance: number;
    capitalBalance: number;
  }>;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const frequencyLabels: Record<string, { label: string }> = {
  WEEKLY: { label: 'semanal' },
  BIWEEKLY: { label: 'quincenal' },
  MONTHLY: { label: 'mensual' },
  DAILY: { label: 'diario' },
};

const SYSTEM_LABELS: Record<string, string> = {
  FRENCH: 'Sistema Francés',
  GERMAN: 'Sistema Alemán',
  FLAT_RATE: 'Sistema de Tasa Plana',
};

export default function SolicitarPage() {
  const { user, token } = useAuth();
  const router = useRouter();
  const [loanRequest, setLoanRequest] = useState<LoanRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [createdLoan, setCreatedLoan] = useState<{ id: string } | null>(null);

  useEffect(() => {
    // First check if user is authenticated or redirect to login
    if (!token || !user) {
      router.push('/login');
      return;
    }

    // Check role - only CLIENTE can request loans
    if (user.role !== 'CLIENTE') {
      setError('Solo clientes pueden solicitar préstamos');
      setLoading(false);
      return;
    }

    // Get loan request from sessionStorage
    const stored = sessionStorage.getItem(LOAN_STORAGE_KEY);
    if (stored) {
      try {
        setLoanRequest(JSON.parse(stored));
      } catch {
        setError('Datos de solicitud inválidos');
      }
    }
    setLoading(false);
  }, [token, user, router]);

  const handleSubmit = async () => {
    if (!loanRequest || !token) {
      // No token or no request - redirect to simulator
      router.push('/simulator');
      return;
    }

    setSubmitting(true);
    setError('');

    console.log('Submitting loan request:', {
      amount: loanRequest.amount,
      interestRate: loanRequest.annualRate,
      termMonths: loanRequest.term,
      frequency: loanRequest.frequency,
      token: token ? 'present' : 'missing'
    });

    try {
      // Parse date to ISO string — handles both ISO and DD/MM/YYYY formats
      const parseDate = (dateStr: string): string => {
        // If already ISO format (has T or Z), return as-is
        if (dateStr.includes('T') || dateStr.includes('Z')) {
          return new Date(dateStr).toISOString();
        }
        // Spanish format: DD/MM/YYYY
        const [day, month, year] = dateStr.split('/');
        const date = new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0);
        return date.toISOString();
      };

      const requestBody = {
        amount: loanRequest.amount,
        interestRate: loanRequest.annualRate,
        termMonths: loanRequest.term,
        frequency: loanRequest.frequency,
        amortizationSystem: loanRequest.amortizationSystem,
        schedule: loanRequest.schedule.map(item => ({
          number: item.number,
          dueDate: parseDate(item.date),
          amount: item.payment,
          principal: item.principal,
          interest: item.interest,
          balance: item.balance,
        })),
      };

      console.log('Request body:', requestBody);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(`${API_URL}/api/loans/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      console.log('Response status:', response.status);

      const data = await response.json();
      console.log('Response data:', data);

      if (!response.ok) {
        const errorMsg = data.error || data.message || 'Error desconocido';
        if (errorMsg.toLowerCase().includes('pending')) {
          setError('Ya tienes una solicitud pendiente. Espera a que sea procesada.');
        } else {
          setError(errorMsg);
        }
        return;
      }

      sessionStorage.removeItem(LOAN_STORAGE_KEY);
      setSuccess(true);
      setCreatedLoan(data.data);
    } catch (err) {
      console.error('Loan request error:', err);
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(`Error: ${errorMsg}`);
    } finally {
      setSubmitting(false);
    }
  };

  const goToMisPrestamos = () => {
    router.push('/mis-prestamo');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center dark:bg-[#121212]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 dark:border-[#39ff14]"></div>
      </div>
    );
  }

  // No loan request found
  if (!loanRequest) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50 dark:bg-[#121212]">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4 dark:text-white/[.87]">
            Solicitud no encontrada
          </h1>
          <p className="text-gray-600 dark:text-white/60 mb-6">
            No tienes una solicitud de préstamo pendiente.
          </p>
          <a
            href="/simulator"
            className="inline-block px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 dark:bg-[#39ff14] dark:text-black"
          >
            Ir al Simulador
          </a>
        </div>
      </div>
    );
  }

  // Success state
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50 dark:bg-[#121212]">
        <div className="max-w-md w-full text-center">
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
          <div className="mb-6">
            <div className="w-16 h-16 mx-auto bg-green-100 rounded-full flex items-center justify-center dark:bg-green-900/50">
              <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>
          <h1 className="text-2xl font-bold mb-2 dark:text-white/[.87]">
            ¡Solicitud Enviada!
          </h1>
          <p className="text-gray-600 dark:text-white/60 mb-6">
            Tu solicitud de préstamo ha sido enviada exitosamente. Un vendedor revisará tu solicitud pronto.
          </p>
          {createdLoan && (
            <p className="text-sm text-gray-500 dark:text-white/60 mb-6">
              ID de solicitud: {createdLoan.id}
            </p>
          )}
          <button
            onClick={goToMisPrestamos}
            className="w-full py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 dark:bg-[#39ff14] dark:text-black dark:hover:bg-[#32e012]"
          >
            Ver Mis Préstamos
          </button>
        </div>
      </div>
    );
  }

  // Show confirmation form
  return (
    <div className="min-h-screen p-4 md:p-8 bg-gray-50 dark:bg-[#121212]">
      <div className="max-w-2xl mx-auto">
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
        <h1 className="text-2xl font-bold text-center mb-6 dark:text-white/[.87]">
          Confirmar Solicitud de Préstamo
        </h1>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-600 rounded-lg dark:bg-red-950/50 dark:border-red-900 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="bg-white p-6 rounded-lg shadow-md mb-6 dark:bg-[#1e1e1e]">
          <h2 className="text-lg font-semibold mb-4 dark:text-white/[.87]">
            Detalles del Préstamo
          </h2>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500 dark:text-white/60">Monto Solicitado</p>
              <p className="text-xl font-bold dark:text-white/[.87]">
                ${loanRequest.amount.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-white/60">Frecuencia</p>
              <p className="text-xl font-bold dark:text-white/[.87]">
                {frequencyLabels[loanRequest.frequency]?.label || loanRequest.frequency}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-white/60">Plazo</p>
              <p className="text-xl font-bold dark:text-white/[.87]">
                {loanRequest.term} {frequencyLabels[loanRequest.frequency]?.label || ''}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-white/60">Cuota</p>
              <p className="text-xl font-bold text-primary-600 dark:text-[#39ff14]">
                ${loanRequest.installmentAmount.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-white/60">Sistema</p>
              <p className="text-xl font-bold dark:text-white/[.87]">
                {SYSTEM_LABELS[loanRequest.amortizationSystem] || loanRequest.amortizationSystem}
              </p>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t dark:border-gray-700">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500 dark:text-white/60">Total Intereses</p>
                <p className="dark:text-white/[.87]">
                  ${loanRequest.totalInterest.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-white/60">Total a Pagar</p>
                <p className="font-semibold dark:text-white/[.87]">
                  ${loanRequest.totalPayment.toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-4">
          <button
            onClick={() => {
              sessionStorage.removeItem(LOAN_STORAGE_KEY);
              router.push('/simulator');
            }}
            className="flex-1 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 dark:border-[#333333] dark:text-white/[.87] dark:hover:bg-white/10"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 dark:bg-[#39ff14] dark:text-black dark:hover:bg-[#32e012]"
          >
            {submitting ? 'Enviando...' : 'Confirmar Solicitud'}
          </button>
        </div>
      </div>
    </div>
  );
}