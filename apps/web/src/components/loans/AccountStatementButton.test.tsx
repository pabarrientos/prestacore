import { describe, it, expect } from 'vitest';
import { transformLoanData } from './AccountStatementButton';

// Minimum shape matching LoanDetail interface from page.tsx (lines 12-63)
interface MockLoan {
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
  installments: Array<{
    id: string;
    installmentNumber: number;
    dueDate: string;
    amount: number;
    principal: number;
    interest: number;
    balance: number;
    paidAmount: number;
    status: string;
  }>;
  payments: Array<{
    amount: number;
    status: string;
    paymentDate?: string;
    reference?: string;
    notes?: string;
    installmentId?: string;
    /** Direct field (used by some API endpoints but NOT by the main loan detail). */
    installmentNumber?: number;
    /** Actual API shape from Prisma include: { installment: { select: { installmentNumber } } } */
    installment?: { installmentNumber?: number } | null;
  }>;
  purpose: string | null;
}

function makeLoan(overrides?: Partial<MockLoan>): MockLoan {
  return {
    id: 'loan-42',
    amount: 100000,
    interestRate: 36,
    termMonths: 12,
    frequency: 'MONTHLY',
    status: 'ACTIVE',
    totalInterest: 18000,
    totalPayment: 118000,
    installmentAmount: 9833.33,
    amortizationSystem: 'FRENCH',
    startedAt: '2025-03-01T00:00:00.000Z',
    createdAt: '2025-02-25T00:00:00.000Z',
    client: {
      dni: '30123456',
      user: {
        firstName: 'Carlos',
        lastName: 'López',
        email: 'carlos@example.com',
        phone: '+5491123456789',
      },
    },
    assignedVendor: { firstName: 'María', lastName: 'García' },
    installments: [
      {
        id: 'inst-01',
        installmentNumber: 1,
        dueDate: '2025-04-01',
        amount: 9833.33,
        principal: 7000,
        interest: 2833.33,
        balance: 9833.33,
        paidAmount: 9833.33,
        status: 'PAID',
      },
      {
        id: 'inst-02',
        installmentNumber: 2,
        dueDate: '2025-05-01',
        amount: 9833.33,
        principal: 7200,
        interest: 2633.33,
        balance: 9833.33,
        paidAmount: 0,
        status: 'PENDING',
      },
    ],
    payments: [
      {
        amount: 9833.33,
        status: 'COMPLETED',
        paymentDate: '2025-03-28',
        reference: 'Cuota #1',
        notes: undefined,
        installmentId: 'inst-01',
        // Realistic API shape: installmentNumber is nested under installment (Prisma include)
        installment: { installmentNumber: 1 },
      },
    ],
    purpose: 'Compra de equipamiento',
    ...overrides,
  };
}

// ============================================================
// RED phase tests — transformLoanData does NOT exist yet
// ============================================================

describe('transformLoanData', () => {
  describe('top-level scalar fields', () => {
    it('maps id, amount, interestRate, termMonths, frequency, status', () => {
      const loan = makeLoan();
      const result = transformLoanData(loan);

      expect(result.id).toBe('loan-42');
      expect(result.amount).toBe(100000);
      expect(result.interestRate).toBe(36);
      expect(result.termMonths).toBe(12);
      expect(result.frequency).toBe('MONTHLY');
      expect(result.status).toBe('ACTIVE');
    });

    it('maps totalInterest, totalPayment, installmentAmount, amortizationSystem', () => {
      const loan = makeLoan();
      const result = transformLoanData(loan);

      expect(result.totalInterest).toBe(18000);
      expect(result.totalPayment).toBe(118000);
      expect(result.installmentAmount).toBe(9833.33);
      expect(result.amortizationSystem).toBe('FRENCH');
    });

    it('maps date fields: startedAt, createdAt', () => {
      const loan = makeLoan();
      const result = transformLoanData(loan);

      expect(result.startedAt).toBe('2025-03-01T00:00:00.000Z');
      expect(result.createdAt).toBe('2025-02-25T00:00:00.000Z');
    });

    it('maps purpose', () => {
      const loan = makeLoan();
      const result = transformLoanData(loan);

      expect(result.purpose).toBe('Compra de equipamiento');
    });

    it('handles null startedAt and purpose', () => {
      const loan = makeLoan({ startedAt: null, purpose: null });
      const result = transformLoanData(loan);

      expect(result.startedAt).toBeNull();
      expect(result.purpose).toBeNull();
    });
  });

  describe('client info', () => {
    it('maps all client nested fields', () => {
      const loan = makeLoan();
      const result = transformLoanData(loan);

      expect(result.client.dni).toBe('30123456');
      expect(result.client.user.firstName).toBe('Carlos');
      expect(result.client.user.lastName).toBe('López');
      expect(result.client.user.email).toBe('carlos@example.com');
      expect(result.client.user.phone).toBe('+5491123456789');
    });

    it('handles null phone in client user', () => {
      const loan = makeLoan();
      loan.client.user.phone = null;
      const result = transformLoanData(loan);

      expect(result.client.user.phone).toBeNull();
    });
  });

  describe('assigned vendor', () => {
    it('maps vendor fields when present', () => {
      const loan = makeLoan();
      const result = transformLoanData(loan);

      expect(result.assignedVendor).not.toBeNull();
      expect(result.assignedVendor!.firstName).toBe('María');
      expect(result.assignedVendor!.lastName).toBe('García');
    });

    it('returns null when vendor is absent', () => {
      const loan = makeLoan({ assignedVendor: null });
      const result = transformLoanData(loan);

      expect(result.assignedVendor).toBeNull();
    });
  });

  describe('installments', () => {
    it('maps all installment fields with Number() casts', () => {
      const loan = makeLoan();
      const result = transformLoanData(loan);

      expect(result.installments).toHaveLength(2);

      const first = result.installments[0];
      expect(first.id).toBe('inst-01');
      expect(first.installmentNumber).toBe(1);
      expect(first.dueDate).toBe('2025-04-01');
      expect(first.amount).toBe(9833.33);
      expect(first.principal).toBe(7000);
      expect(first.interest).toBe(2833.33);
      expect(first.balance).toBe(9833.33);
      expect(first.paidAmount).toBe(9833.33);
      expect(first.status).toBe('PAID');
    });

    it('handles empty installments array', () => {
      const loan = makeLoan({ installments: [] });
      const result = transformLoanData(loan);

      expect(result.installments).toHaveLength(0);
    });
  });

  describe('payments', () => {
    it('maps all payment fields including optional ones', () => {
      const loan = makeLoan();
      const result = transformLoanData(loan);

      expect(result.payments).toHaveLength(1);

      const pay = result.payments[0];
      expect(pay.amount).toBe(9833.33);
      expect(pay.status).toBe('COMPLETED');
      expect(pay.paymentDate).toBe('2025-03-28');
      expect(pay.reference).toBe('Cuota #1');
      expect(pay.notes).toBeUndefined();
      expect(pay.installmentId).toBe('inst-01');
      expect(pay.installmentNumber).toBe(1);
    });

    it('handles payment with only required fields (no optionals)', () => {
      const loan = makeLoan({
        payments: [{ amount: 5000, status: 'COMPLETED' }],
      });
      const result = transformLoanData(loan);

      const pay = result.payments[0];
      expect(pay.amount).toBe(5000);
      expect(pay.status).toBe('COMPLETED');
      expect(pay.paymentDate).toBeUndefined();
      expect(pay.reference).toBeUndefined();
      expect(pay.notes).toBeUndefined();
      expect(pay.installmentId).toBeUndefined();
      expect(pay.installmentNumber).toBeUndefined();
    });

    it('handles empty payments array', () => {
      const loan = makeLoan({ payments: [] });
      const result = transformLoanData(loan);

      expect(result.payments).toHaveLength(0);
    });

    it('maps installmentNumber from nested installment object (API-realistic Prisma include shape)', () => {
      const loan = makeLoan({
        payments: [
          {
            amount: 5000,
            status: 'COMPLETED',
            installmentId: 'inst-3',
            // API shape: installmentNumber is nested, NOT a direct property
            installment: { installmentNumber: 3 },
          },
        ],
      });
      const result = transformLoanData(loan);

      expect(result.payments).toHaveLength(1);
      expect(result.payments[0].installmentNumber).toBe(3);
    });

    it('handles mora payment (nested installment null, notes with cuota number, NO installmentNumber)', () => {
      const loan = makeLoan({
        payments: [
          {
            amount: 200,
            status: 'COMPLETED',
            paymentDate: '2026-04-15',
            notes: 'Mora cuota #3',
            // Mora payments have installmentId: null and no installment relation in API
          },
        ],
      });
      const result = transformLoanData(loan);

      expect(result.payments).toHaveLength(1);
      expect(result.payments[0].notes).toBe('Mora cuota #3');
      expect(result.payments[0].installmentNumber).toBeUndefined(); // parsed from notes by mergePayments
      expect(result.payments[0].installmentId).toBeUndefined();
    });

    it('prefers nested installment.installmentNumber over direct property when both present', () => {
      const loan = makeLoan({
        payments: [
          {
            amount: 5000,
            status: 'COMPLETED',
            installmentId: 'inst-x',
            // BOTH present; nested should win
            installmentNumber: 99,
            installment: { installmentNumber: 3 },
          },
        ],
      });
      const result = transformLoanData(loan);

      expect(result.payments[0].installmentNumber).toBe(3);
    });
  });

  describe('DEFAULTED loan status', () => {
    it('maps DEFAULTED status correctly', () => {
      const loan = makeLoan({ status: 'DEFAULTED' });
      const result = transformLoanData(loan);

      expect(result.status).toBe('DEFAULTED');
    });
  });

  describe('REFINANCIADO loan status', () => {
    it('maps REFINANCIADO status correctly', () => {
      const loan = makeLoan({ status: 'REFINANCIADO' });
      const result = transformLoanData(loan);

      expect(result.status).toBe('REFINANCIADO');
    });
  });
});
