'use client';

import { useState, useCallback } from 'react';
import { generateAccountStatementPDF } from '@/lib/pdf/accountStatementPDF';
import type { AccountStatementPDFData } from '@/lib/pdf/types';
import { apiFetch } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types — mirror the LoanDetail shape from page.tsx so the button integrates
// without coupling the page to a shared type file.
// ---------------------------------------------------------------------------

export interface LoanDataForPDF {
  id: string;
  amount: number;
  interestRate: number;
  termMonths: number;
  frequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
  status: string;
  totalInterest: number;
  totalPayment: number;
  installmentAmount: number;
  amortizationSystem: string;
  startedAt: string | null;
  createdAt: string;
  client: {
    dni: string;
    user: {
      firstName: string;
      lastName: string;
      email: string;
      phone: string | null;
    };
  };
  assignedVendor: { firstName: string; lastName: string } | null;
  installments: InstallmentForPDF[];
  payments: PaymentForPDF[];
  purpose: string | null;
}

export interface InstallmentForPDF {
  id: string;
  installmentNumber: number;
  dueDate: string;
  amount: number;
  principal: number;
  interest: number;
  balance: number;
  paidAmount: number;
  status: string;
}

export interface PaymentForPDF {
  amount: number;
  status: string;
  paymentDate?: string;
  reference?: string;
  notes?: string;
  installmentId?: string;
  /** Direct field (used by some API endpoints). */
  installmentNumber?: number;
  /** Nested from Prisma include: { installment: { select: { installmentNumber: true } } } */
  installment?: { installmentNumber?: number } | null;
}

// ---------------------------------------------------------------------------
// Pure transformation — exported for unit testing
// ---------------------------------------------------------------------------

/**
 * Convert the API loan-detail shape into the DTO expected by
 * generateAccountStatementPDF.  Applies Number() to all monetary fields
 * so that Prisma Decimal values become plain numbers.
 */
export function transformLoanData(loan: LoanDataForPDF): AccountStatementPDFData {
  return {
    id: loan.id,
    amount: Number(loan.amount),
    interestRate: Number(loan.interestRate),
    termMonths: Number(loan.termMonths),
    frequency: loan.frequency,
    status: loan.status,
    totalInterest: Number(loan.totalInterest),
    totalPayment: Number(loan.totalPayment),
    installmentAmount: Number(loan.installmentAmount),
    amortizationSystem: loan.amortizationSystem,
    startedAt: loan.startedAt,
    createdAt: loan.createdAt,
    client: {
      dni: loan.client.dni,
      user: {
        firstName: loan.client.user.firstName,
        lastName: loan.client.user.lastName,
        email: loan.client.user.email,
        phone: loan.client.user.phone,
      },
    },
    assignedVendor: loan.assignedVendor
      ? {
          firstName: loan.assignedVendor.firstName,
          lastName: loan.assignedVendor.lastName,
        }
      : null,
    installments: loan.installments.map((inst) => ({
      id: inst.id,
      installmentNumber: inst.installmentNumber,
      dueDate: inst.dueDate,
      amount: Number(inst.amount),
      principal: Number(inst.principal),
      interest: Number(inst.interest),
      balance: Number(inst.balance),
      paidAmount: Number(inst.paidAmount),
      status: inst.status,
    })),
    payments: loan.payments.map((p) => ({
      amount: Number(p.amount),
      status: p.status,
      paymentDate: p.paymentDate,
      reference: p.reference,
      notes: p.notes,
      installmentId: p.installmentId,
      // API returns Prisma include → installment is a nested object.
      // Prefer the nested path (actual API shape) and fall back to direct
      // property for test payloads or flattened responses.
      installmentNumber:
        p.installment?.installmentNumber ?? p.installmentNumber,
    })),
    purpose: loan.purpose,
  };
}

// ---------------------------------------------------------------------------
// Button component
// ---------------------------------------------------------------------------

interface AccountStatementButtonProps {
  loanData: LoanDataForPDF;
  disabled?: boolean;
}

export function AccountStatementButton({
  loanData,
  disabled = false,
}: AccountStatementButtonProps) {
  const [loading, setLoading] = useState(false);

  const isDisabled = disabled || loading;

  const handleClick = useCallback(async () => {
    if (isDisabled || !loanData) return;

    setLoading(true);

    try {
      let roundingUnit = 1000;
      let moraRate = 0.0005;

      try {
        const [settingsRes, ratesRes] = await Promise.all([
          apiFetch('/api/settings'),
          apiFetch('/api/settings/rates'),
        ]);

        const settingsData = await settingsRes.json();
        if (settingsData.success && settingsData.data && settingsData.data.ROUNDING_UNIT) {
          roundingUnit = parseFloat(settingsData.data.ROUNDING_UNIT.value) || 1000;
        }

        const ratesData = await ratesRes.json();
        if (ratesData.success && ratesData.data && ratesData.data.MORA_RATE) {
          moraRate = ratesData.data.MORA_RATE;
        }
      } catch {
        // Fallback to seed defaults on network / parse errors
      }

      // Transform and generate
      const pdfData = transformLoanData(loanData);
      generateAccountStatementPDF(pdfData, roundingUnit, moraRate);
    } catch (err) {
      console.error('Error generating account statement PDF:', err);
    } finally {
      setLoading(false);
    }
  }, [loanData, isDisabled]);

  return (
    <button
      onClick={handleClick}
      disabled={isDisabled}
      className={`
        flex items-center justify-center gap-2 px-3 py-2 min-h-[44px] text-sm rounded-lg font-medium
        transition-all duration-200 ease-in-out
        ${
          isDisabled
            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
            : 'bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-700 dark:hover:bg-indigo-600'
        }
      `}
      aria-label="Descargar resumen de cuenta en PDF"
    >
      {loading ? (
        <>
          <svg
            className="animate-spin h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span>Generando PDF...</span>
        </>
      ) : (
        <>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <span>Descargar Resumen</span>
        </>
      )}
    </button>
  );
}
