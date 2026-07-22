/**
 * Unit tests for account statement PDF generator
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type {
  AccountStatementPDFData,
  InstallmentPDFData,
  PaymentPDFData,
  InstallmentRow,
} from './types';
import type { MergedPaymentRow } from '@/lib/payments';

// Use hoisted to ensure mocks are defined at the correct scope
const { mockSetFontSize, mockText, mockSetTextColor, mockAutoTable, mockSave, mockAddPage, mockGetNumberOfPages, mockSetFillColor, mockSetDrawColor, mockSetLineWidth, mockRect, mockAddImage, mockGetCurrentPageInfo, mockSetFont, mockLine, mockSetPage } = vi.hoisted(() => ({
  mockSetFontSize: vi.fn(),
  mockText: vi.fn(),
  mockSetTextColor: vi.fn(),
  mockAutoTable: vi.fn(),
  mockSave: vi.fn(),
  mockAddPage: vi.fn(),
  mockGetNumberOfPages: vi.fn(() => 1),
  mockSetFillColor: vi.fn(),
  mockSetDrawColor: vi.fn(),
  mockSetLineWidth: vi.fn(),
  mockRect: vi.fn(),
  mockAddImage: vi.fn(),
  mockGetCurrentPageInfo: vi.fn(() => ({ pageNumber: 1 })),
  mockSetFont: vi.fn(),
  mockLine: vi.fn(),
  mockSetPage: vi.fn(),
}));

// Mock jspdf module
vi.mock('jspdf', () => {
  let lastAutoTableResult = { finalY: 100 };
  return {
    default: vi.fn(() => ({
      setFontSize: mockSetFontSize,
      text: mockText,
      setTextColor: mockSetTextColor,
      save: mockSave,
      addPage: mockAddPage,
      getNumberOfPages: mockGetNumberOfPages,
      setFillColor: mockSetFillColor,
      setDrawColor: mockSetDrawColor,
      setLineWidth: mockSetLineWidth,
      rect: mockRect,
      addImage: mockAddImage,
      getCurrentPageInfo: mockGetCurrentPageInfo,
      setFont: mockSetFont,
      line: mockLine,
      setPage: mockSetPage,
      internal: {
        pageSize: { height: 297, width: 210 },
      },
      get lastAutoTable() { return lastAutoTableResult; },
    })),
  };
});

// Mock jspdf-autotable
vi.mock('jspdf-autotable', () => {
  return {
    default: mockAutoTable,
  };
});

import { calculateInstallmentStatus, generateAccountStatementPDF, calculateMoraPagada, getPeriodRate, calculateMoraAcumulada } from './accountStatementPDF';
import { mergePayments } from '@/lib/payments';

// Test data factory
function makeMockInstallment(overrides: Partial<InstallmentPDFData> = {}): InstallmentPDFData {
  return {
    id: 'inst-1',
    installmentNumber: 1,
    dueDate: '2026-05-15',
    amount: 5000,
    principal: 4000,
    interest: 1000,
    balance: 5000,
    paidAmount: 0,
    status: 'PENDING',
    ...overrides,
  };
}

function makeMockPayment(overrides: Partial<PaymentPDFData> = {}): PaymentPDFData {
  return {
    amount: 5000,
    status: 'COMPLETED',
    paymentDate: '2026-05-15',
    reference: 'Cuota #1',
    installmentId: 'inst-1',
    installmentNumber: 1,
    ...overrides,
  };
}

function makeMockPDFData(overrides: Partial<AccountStatementPDFData> = {}): AccountStatementPDFData {
  return {
    id: '42',
    amount: 50000,
    interestRate: 25,
    termMonths: 12,
    frequency: 'MONTHLY',
    status: 'ACTIVE',
    totalInterest: 6895.44,
    totalPayment: 56895.44,
    installmentAmount: 4741.29,
    amortizationSystem: 'FRENCH',
    startedAt: '2026-01-15',
    createdAt: '2026-01-10',
    client: {
      dni: '30123456',
      user: {
        firstName: 'Juan',
        lastName: 'Pérez',
        email: 'juan@example.com',
        phone: '+549112345678',
      },
    },
    assignedVendor: {
      firstName: 'María',
      lastName: 'Gómez',
    },
    installments: [
      makeMockInstallment({ installmentNumber: 1, dueDate: '2026-05-15' }),
      makeMockInstallment({
        id: 'inst-2',
        installmentNumber: 2,
        dueDate: '2026-06-15',
        paidAmount: 3000,
        status: 'PARTIAL',
      }),
      makeMockInstallment({
        id: 'inst-3',
        installmentNumber: 3,
        dueDate: '2026-04-15',
        paidAmount: 0,
      }),
    ],
    payments: [
      makeMockPayment(),
    ],
    purpose: null,
    ...overrides,
  };
}

describe('AccountStatementPDFData type', () => {
  it('should accept valid data conforming to AccountStatementPDFData', () => {
    const data: AccountStatementPDFData = makeMockPDFData();

    expect(data.id).toBe('42');
    expect(data.amount).toBe(50000);
    expect(data.interestRate).toBe(25);
    expect(data.termMonths).toBe(12);
    expect(data.frequency).toBe('MONTHLY');
    expect(data.status).toBe('ACTIVE');
    expect(data.client.dni).toBe('30123456');
    expect(data.client.user.firstName).toBe('Juan');
    expect(data.client.user.lastName).toBe('Pérez');
    expect(data.installments).toHaveLength(3);
    expect(data.payments).toHaveLength(1);
  });
});

// ============================================================
// calculateInstallmentStatus tests
// ============================================================

describe('calculateInstallmentStatus', () => {
  const moraRate = 0.0005;

  describe('PAID scenarios', () => {
    it('should return PAID when loan.status is PAID', () => {
      const inst = makeMockInstallment({ dueDate: '2026-01-15', paidAmount: 0 });
      const payments: PaymentPDFData[] = [];
      const result = calculateInstallmentStatus(inst, payments, 'PAID', moraRate);
      expect(result.status).toBe('PAID');
    });

    it('should return PAID when paidAmount >= amount (through payments)', () => {
      const inst = makeMockInstallment({ id: 'inst-1', amount: 5000, paidAmount: 5000 });
      const payments: PaymentPDFData[] = [
        makeMockPayment({ installmentId: 'inst-1', amount: 5000 }),
      ];
      const result = calculateInstallmentStatus(inst, payments, 'ACTIVE', moraRate);
      expect(result.status).toBe('PAID');
    });

    it('should return PAID when total payments for this installment >= amount', () => {
      const inst = makeMockInstallment({ id: 'inst-1', amount: 5000, paidAmount: 0 });
      const payments: PaymentPDFData[] = [
        makeMockPayment({ installmentId: 'inst-1', amount: 3000 }),
        makeMockPayment({ installmentId: 'inst-1', amount: 2000 }),
      ];
      const result = calculateInstallmentStatus(inst, payments, 'ACTIVE', moraRate);
      expect(result.status).toBe('PAID');
    });
  });

  describe('PARTIAL scenarios', () => {
    it('should return PARTIAL when totalPaid > 0 but < amount', () => {
      const inst = makeMockInstallment({ id: 'inst-1', amount: 5000, paidAmount: 0 });
      const payments: PaymentPDFData[] = [
        makeMockPayment({ installmentId: 'inst-1', amount: 3000 }),
      ];
      const result = calculateInstallmentStatus(inst, payments, 'ACTIVE', moraRate);
      expect(result.status).toBe('PARTIAL');
    });
  });

  describe('CANCELADA_POR_REFINANCIACION scenarios', () => {
    it('should return CANCELADA_POR_REFINANCIACION when loan is REFINANCIADO and DB status matches', () => {
      const inst = makeMockInstallment({
        status: 'CANCELADA_POR_REFINANCIACION',
        paidAmount: 0,
      });
      const payments: PaymentPDFData[] = [];
      const result = calculateInstallmentStatus(inst, payments, 'REFINANCIADO', moraRate);
      expect(result.status).toBe('CANCELADA_POR_REFINANCIACION');
    });

    it('should NOT return CANCELADA if loan is not REFINANCIADO even if DB status matches', () => {
      const inst = makeMockInstallment({
        status: 'CANCELADA_POR_REFINANCIACION',
        paidAmount: 0,
        dueDate: '2026-05-15',
      });
      const payments: PaymentPDFData[] = [];
      const result = calculateInstallmentStatus(inst, payments, 'ACTIVE', moraRate);
      expect(result.status).toBe('OVERDUE'); // Would be overdue since dueDate < today
    });
  });

  describe('OVERDUE scenarios', () => {
    it('should return OVERDUE when unpaid and dueDate is in the past', () => {
      // Use a date well in the past
      const inst = makeMockInstallment({
        dueDate: '2026-01-01',
        paidAmount: 0,
      });
      const payments: PaymentPDFData[] = [];
      const result = calculateInstallmentStatus(inst, payments, 'ACTIVE', moraRate);
      expect(result.status).toBe('OVERDUE');
      expect(result.daysOverdue).toBeGreaterThan(0);
    });

    it('should calculate mora when overdue', () => {
      const inst = makeMockInstallment({
        dueDate: '2026-01-01',
        paidAmount: 0,
        balance: 5000,
      });
      const payments: PaymentPDFData[] = [];
      const result = calculateInstallmentStatus(inst, payments, 'ACTIVE', moraRate);
      expect(result.status).toBe('OVERDUE');
      expect(result.mora).toBeGreaterThan(0);
    });
  });

  describe('PENDING scenarios', () => {
    it('should return PENDING when unpaid but not yet due', () => {
      // Use a date far in the future
      const inst = makeMockInstallment({
        dueDate: '2030-12-31',
        paidAmount: 0,
      });
      const payments: PaymentPDFData[] = [];
      const result = calculateInstallmentStatus(inst, payments, 'ACTIVE', moraRate);
      expect(result.status).toBe('PENDING');
      expect(result.daysOverdue).toBe(0);
      expect(result.mora).toBe(0);
    });
  });

  describe('calculates daysOverdue correctly', () => {
    it('should return zero days for future dueDate', () => {
      const inst = makeMockInstallment({ dueDate: '2030-12-31', paidAmount: 0 });
      const result = calculateInstallmentStatus(inst, [], 'ACTIVE', moraRate);
      expect(result.daysOverdue).toBe(0);
    });

    it('should return positive days for past dueDate', () => {
      const inst = makeMockInstallment({ dueDate: '2026-01-01', paidAmount: 0 });
      const result = calculateInstallmentStatus(inst, [], 'ACTIVE', moraRate);
      expect(result.daysOverdue).toBeGreaterThan(0);
    });
  });
});

// ============================================================
// mergePayments tests
// ============================================================

describe('mergePayments', () => {
  it('should merge mora payment with matching installment payment on same date', () => {
    const payments: PaymentPDFData[] = [
      makeMockPayment({
        amount: 5000,
        paymentDate: '2026-04-15',
        reference: 'Cuota #3',
        installmentNumber: 3,
        installmentId: 'inst-3',
      }),
      makeMockPayment({
        amount: 200,
        paymentDate: '2026-04-15',
        notes: 'Mora cuota #3',
        installmentId: undefined,
        installmentNumber: undefined,
        reference: undefined,
      }),
    ];

    const result = mergePayments(payments);

    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe(5200);
    expect(result[0].reference).toBe('Cuota #3');
    expect(result[0].installmentNumber).toBe(3);
    expect(result[0].isAbonoACuenta).toBe(false);
  });

  it('should merge multiple mora payments for same installment/date', () => {
    const payments: PaymentPDFData[] = [
      makeMockPayment({
        amount: 5000,
        paymentDate: '2026-04-15',
        reference: 'Cuota #3',
        installmentNumber: 3,
        installmentId: 'inst-3',
      }),
      makeMockPayment({
        amount: 200,
        paymentDate: '2026-04-15',
        notes: 'Mora cuota #3',
      }),
      makeMockPayment({
        amount: 150,
        paymentDate: '2026-04-15',
        notes: 'Mora cuota #3',
      }),
    ];

    const result = mergePayments(payments);

    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe(5350);
    expect(result[0].reference).toBe('Cuota #3');
  });

  it('should NOT merge payments with different dates', () => {
    const payments: PaymentPDFData[] = [
      makeMockPayment({
        amount: 5000,
        paymentDate: '2026-04-15',
        reference: 'Cuota #3',
        installmentNumber: 3,
        installmentId: 'inst-3',
      }),
      makeMockPayment({
        amount: 200,
        paymentDate: '2026-04-20',
        notes: 'Mora cuota #3',
      }),
    ];

    const result = mergePayments(payments);

    expect(result).toHaveLength(2);
    const amounts = result.map((r) => r.amount);
    expect(amounts).toContain(5000);
    expect(amounts).toContain(200);
  });

  it('should show unmatched mora as "Abono a cuenta"', () => {
    const payments: PaymentPDFData[] = [
      makeMockPayment({
        amount: 200,
        paymentDate: '2026-04-15',
        notes: 'Mora cuota #5',
        installmentId: undefined,
        installmentNumber: undefined,
        reference: undefined,
      }),
    ];

    const result = mergePayments(payments);

    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe(200);
    expect(result[0].reference).toBe('Abono a cuenta');
    expect(result[0].isAbonoACuenta).toBe(true);
    expect(result[0].installmentNumber).toBe(5);
  });

  it('should not merge mora with wrong installment number', () => {
    const payments: PaymentPDFData[] = [
      makeMockPayment({
        amount: 5000,
        paymentDate: '2026-04-15',
        reference: 'Cuota #3',
        installmentNumber: 3,
        installmentId: 'inst-3',
      }),
      makeMockPayment({
        amount: 200,
        paymentDate: '2026-04-15',
        notes: 'Mora cuota #7',
        installmentId: undefined,
        installmentNumber: undefined,
        reference: undefined,
      }),
    ];

    const result = mergePayments(payments);

    expect(result).toHaveLength(2);
    // The regular payment should be alone
    const regular = result.find((r) => r.installmentNumber === 3);
    expect(regular).toBeDefined();
    expect(regular!.amount).toBe(5000);

    // The mora should be separate as "Abono a cuenta"
    const abono = result.find((r) => r.isAbonoACuenta);
    expect(abono).toBeDefined();
    expect(abono!.amount).toBe(200);
    expect(abono!.reference).toBe('Abono a cuenta');
  });

  it('should return empty array for empty payments', () => {
    const result = mergePayments([]);
    expect(result).toHaveLength(0);
  });

  it('should show regular payments without mora as-is', () => {
    const payments: PaymentPDFData[] = [
      makeMockPayment({
        amount: 5000,
        paymentDate: '2026-04-15',
        reference: 'Cuota #3',
        installmentNumber: 3,
        installmentId: 'inst-3',
      }),
      makeMockPayment({
        amount: 5000,
        paymentDate: '2026-05-15',
        reference: 'Cuota #4',
        installmentNumber: 4,
        installmentId: 'inst-4',
      }),
    ];

    const result = mergePayments(payments);

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.amount)).toEqual([5000, 5000]);
  });

  describe('Cancelación anticipada payments', () => {
    it('should appear as standalone row (NOT merged)', () => {
      const payments: PaymentPDFData[] = [
        makeMockPayment({
          amount: 15000,
          paymentDate: '2026-04-20',
          notes: 'Cancelación anticipada - pago único por todo el saldo',
          installmentId: undefined,
          installmentNumber: undefined,
          reference: undefined,
        }),
      ];

      const result = mergePayments(payments);

      expect(result).toHaveLength(1);
      expect(result[0].amount).toBe(15000);
      expect(result[0].installmentNumber).toBeNull();
      expect(result[0].reference).toBe('Cancelación anticipada - pago único por todo el saldo');
      expect(result[0].isAbonoACuenta).toBe(true);
    });

    it('should NOT merge with "Mora cuota" payments on same date', () => {
      const payments: PaymentPDFData[] = [
        makeMockPayment({
          amount: 15000,
          paymentDate: '2026-04-20',
          notes: 'Cancelación anticipada - pago único por todo el saldo',
          installmentId: undefined,
          installmentNumber: undefined,
          reference: undefined,
        }),
        makeMockPayment({
          amount: 200,
          paymentDate: '2026-04-20',
          notes: 'Mora cuota #3',
          installmentId: undefined,
          installmentNumber: undefined,
          reference: undefined,
        }),
      ];

      const result = mergePayments(payments);

      // Should produce TWO separate rows
      expect(result).toHaveLength(2);

      const cancelacion = result.find((r) => r.reference.includes('Cancelación anticipada'));
      const mora = result.find((r) => r.reference === 'Abono a cuenta');

      expect(cancelacion).toBeDefined();
      expect(cancelacion!.amount).toBe(15000);
      expect(cancelacion!.isAbonoACuenta).toBe(true);

      expect(mora).toBeDefined();
      expect(mora!.amount).toBe(200);
      expect(mora!.isAbonoACuenta).toBe(true);
    });

    it('should NOT merge with regular installment payment on same date', () => {
      const payments: PaymentPDFData[] = [
        makeMockPayment({
          amount: 15000,
          paymentDate: '2026-04-20',
          notes: 'Cancelación anticipada - pago único por todo el saldo',
          installmentId: undefined,
          installmentNumber: undefined,
          reference: undefined,
        }),
        makeMockPayment({
          amount: 5000,
          paymentDate: '2026-04-20',
          reference: 'Cuota #3',
          installmentNumber: 3,
          installmentId: 'inst-3',
        }),
      ];

      const result = mergePayments(payments);

      expect(result).toHaveLength(2);

      const cancelacion = result.find((r) => r.reference.includes('Cancelación anticipada'));
      const regular = result.find((r) => r.installmentNumber === 3);

      expect(cancelacion).toBeDefined();
      expect(cancelacion!.amount).toBe(15000);

      expect(regular).toBeDefined();
      expect(regular!.amount).toBe(5000);
    });

    it('should handle multiple cancelación anticipada payments as separate rows', () => {
      const payments: PaymentPDFData[] = [
        makeMockPayment({
          amount: 15000,
          paymentDate: '2026-04-20',
          notes: 'Cancelación anticipada - pago único por todo el saldo',
          installmentId: undefined,
          installmentNumber: undefined,
          reference: undefined,
        }),
        makeMockPayment({
          amount: 5000,
          paymentDate: '2026-04-20',
          notes: 'Cancelación anticipada - pago complementario',
          installmentId: undefined,
          installmentNumber: undefined,
          reference: undefined,
        }),
      ];

      const result = mergePayments(payments);

      // Both should appear as separate rows, NOT merged into one
      expect(result).toHaveLength(2);
      const amounts = result.map((r) => r.amount);
      expect(amounts).toContain(15000);
      expect(amounts).toContain(5000);
      // Both should be abono a cuenta
      expect(result.every((r) => r.isAbonoACuenta)).toBe(true);
    });
  });

  describe('Mora cancelación anticipada payments', () => {
    it('should appear as standalone row (NOT merged)', () => {
      const payments: PaymentPDFData[] = [
        makeMockPayment({
          amount: 3000,
          paymentDate: '2026-04-25',
          notes: 'Mora cancelación anticipada',
          installmentId: undefined,
          installmentNumber: undefined,
          reference: undefined,
        }),
      ];

      const result = mergePayments(payments);

      expect(result).toHaveLength(1);
      expect(result[0].amount).toBe(3000);
      expect(result[0].installmentNumber).toBeNull();
      expect(result[0].reference).toBe('Mora cancelación anticipada');
      expect(result[0].isAbonoACuenta).toBe(true);
    });

    it('should NOT merge with regular installment payments', () => {
      const payments: PaymentPDFData[] = [
        makeMockPayment({
          amount: 3000,
          paymentDate: '2026-04-25',
          notes: 'Mora cancelación anticipada',
          installmentId: undefined,
          installmentNumber: undefined,
          reference: undefined,
        }),
        makeMockPayment({
          amount: 5000,
          paymentDate: '2026-04-25',
          reference: 'Cuota #5',
          installmentNumber: 5,
          installmentId: 'inst-5',
        }),
      ];

      const result = mergePayments(payments);

      expect(result).toHaveLength(2);

      const moraCancel = result.find((r) => r.reference === 'Mora cancelación anticipada');
      const regular = result.find((r) => r.installmentNumber === 5);

      expect(moraCancel).toBeDefined();
      expect(moraCancel!.amount).toBe(3000);

      expect(regular).toBeDefined();
      expect(regular!.amount).toBe(5000);
    });
  });

  describe('Unassociated abono a cuenta payments', () => {
    it('should appear as standalone row with Abono a cuenta reference', () => {
      const payments: PaymentPDFData[] = [
        makeMockPayment({
          amount: 1000,
          paymentDate: '2026-04-18',
          notes: undefined,
          installmentId: undefined,
          installmentNumber: undefined,
          reference: undefined,
        }),
      ];

      const result = mergePayments(payments);

      expect(result).toHaveLength(1);
      expect(result[0].amount).toBe(1000);
      expect(result[0].installmentNumber).toBeNull();
      expect(result[0].reference).toBe('Abono a cuenta');
      expect(result[0].isAbonoACuenta).toBe(true);
    });

    it('should handle multiple unassociated payments on same date as separate rows', () => {
      const payments: PaymentPDFData[] = [
        makeMockPayment({
          amount: 1000,
          paymentDate: '2026-04-18',
          notes: undefined,
          installmentId: undefined,
          installmentNumber: undefined,
          reference: undefined,
        }),
        makeMockPayment({
          amount: 2000,
          paymentDate: '2026-04-18',
          notes: undefined,
          installmentId: undefined,
          installmentNumber: undefined,
          reference: undefined,
        }),
      ];

      const result = mergePayments(payments);

      // Both should appear as separate rows (NOT merged into one)
      expect(result).toHaveLength(2);
      const amounts = result.map((r) => r.amount);
      expect(amounts).toContain(1000);
      expect(amounts).toContain(2000);
      expect(result.every((r) => r.isAbonoACuenta)).toBe(true);
      expect(result.every((r) => r.reference === 'Abono a cuenta')).toBe(true);
    });
  });
});

// ============================================================
// calculateMoraPagada tests (Issue 3)
// ============================================================

describe('calculateMoraPagada', () => {
  it('should return 0 when total paid equals cuota for all installments', () => {
    const installments: InstallmentPDFData[] = [
      makeMockInstallment({ installmentNumber: 1, amount: 5000 }),
      makeMockInstallment({ id: 'inst-2', installmentNumber: 2, amount: 5000 }),
    ];
    const mergedPayments: MergedPaymentRow[] = [
      { date: '2026-05-15', amount: 5000, installmentNumber: 1, reference: 'Cuota #1', isAbonoACuenta: false },
      { date: '2026-06-15', amount: 5000, installmentNumber: 2, reference: 'Cuota #2', isAbonoACuenta: false },
    ];

    const result = calculateMoraPagada(installments, mergedPayments, 1000);

    expect(result).toBe(0);
  });

  it('should return 0 when total paid is less than cuota', () => {
    const installments: InstallmentPDFData[] = [
      makeMockInstallment({ installmentNumber: 1, amount: 5000 }),
    ];
    const mergedPayments: MergedPaymentRow[] = [
      { date: '2026-05-15', amount: 3000, installmentNumber: 1, reference: 'Cuota #1', isAbonoACuenta: false },
    ];

    const result = calculateMoraPagada(installments, mergedPayments, 1000);

    expect(result).toBe(0);
  });

  it('should calculate mora pagada when payment exceeds cuota', () => {
    const installments: InstallmentPDFData[] = [
      makeMockInstallment({ installmentNumber: 1, amount: 5000 }),
    ];
    // Payment includes 5000 cuota + 300 mora = 5300
    const mergedPayments: MergedPaymentRow[] = [
      { date: '2026-05-15', amount: 5300, installmentNumber: 1, reference: 'Cuota #1', isAbonoACuenta: false },
    ];

    const result = calculateMoraPagada(installments, mergedPayments, 1000);

    // 5300 - 5000 = 300 → rounded to 1000 with unit 1000
    expect(result).toBe(1000);
  });

  it('should sum mora pagada across multiple installments', () => {
    const installments: InstallmentPDFData[] = [
      makeMockInstallment({ installmentNumber: 1, amount: 5000 }),
      makeMockInstallment({ id: 'inst-2', installmentNumber: 2, amount: 5000 }),
    ];
    const mergedPayments: MergedPaymentRow[] = [
      { date: '2026-05-15', amount: 5200, installmentNumber: 1, reference: 'Cuota #1', isAbonoACuenta: false },
      { date: '2026-06-15', amount: 5100, installmentNumber: 2, reference: 'Cuota #2', isAbonoACuenta: false },
    ];

    const result = calculateMoraPagada(installments, mergedPayments, 1000);

    // Inst 1: 5200 - 5000 = 200 → 1000, Inst 2: 5100 - 5000 = 100 → 1000
    // Total: 2000
    expect(result).toBe(2000);
  });

  it('should round mora pagada correctly with different rounding units', () => {
    const installments: InstallmentPDFData[] = [
      makeMockInstallment({ installmentNumber: 1, amount: 5000 }),
    ];
    const mergedPayments: MergedPaymentRow[] = [
      { date: '2026-05-15', amount: 5476, installmentNumber: 1, reference: 'Cuota #1', isAbonoACuenta: false },
    ];

    // With unit 100: 5476 - 5000 = 476 → ceil(476/100)*100 = 500
    expect(calculateMoraPagada(installments, mergedPayments, 100)).toBe(500);
    // With unit 1000: ceil(476/1000)*1000 = 1000
    expect(calculateMoraPagada(installments, mergedPayments, 1000)).toBe(1000);
  });

  it('should ignore payments without matching installment number', () => {
    const installments: InstallmentPDFData[] = [
      makeMockInstallment({ installmentNumber: 1, amount: 5000 }),
    ];
    // "Abono a cuenta" with null installmentNumber should not match
    const mergedPayments: MergedPaymentRow[] = [
      { date: '2026-05-15', amount: 1000, installmentNumber: null, reference: 'Abono a cuenta', isAbonoACuenta: true },
    ];

    const result = calculateMoraPagada(installments, mergedPayments, 1000);

    expect(result).toBe(0);
  });

  it('should return 0 for empty installments', () => {
    const result = calculateMoraPagada([], [], 1000);
    expect(result).toBe(0);
  });

  it('should use rounded cuota value when cuota is not a multiple of rounding unit', () => {
    // Bug scenario: cuota raw=337500, ROUNDING_UNIT=1000 → roundUpInstallment=338000
    // totalPaid=403000 is already a multiple of 1000 → roundUp=403000
    // Expected excess: 403000 - 338000 = 65000
    // Buggy excess (raw): 403000-337500=65500 → roundUpInstallment(65500,1000)=66000
    const installments: InstallmentPDFData[] = [
      makeMockInstallment({ installmentNumber: 1, amount: 337500 }),
    ];
    const mergedPayments: MergedPaymentRow[] = [
      { date: '2026-05-15', amount: 403000, installmentNumber: 1, reference: 'Cuota #1', isAbonoACuenta: false },
    ];

    const result = calculateMoraPagada(installments, mergedPayments, 1000);

    expect(result).toBe(65000);
  });

  it('should round both cuota and total paid before subtraction', () => {
    // cuota=337500 → roundUp=338000, totalPaid=403400 → roundUp=404000
    // Expected: 404000 - 338000 = 66000
    const installments: InstallmentPDFData[] = [
      makeMockInstallment({ installmentNumber: 1, amount: 337500 }),
    ];
    const mergedPayments: MergedPaymentRow[] = [
      { date: '2026-05-15', amount: 403400, installmentNumber: 1, reference: 'Cuota #1', isAbonoACuenta: false },
    ];

    const result = calculateMoraPagada(installments, mergedPayments, 1000);

    expect(result).toBe(66000);
  });

  it('should return 0 when rounded total paid equals rounded cuota', () => {
    // cuota=337500 → roundUp=338000, totalPaid=338000 → roundUp=338000
    // Both round to same value, excess should be 0
    // Buggy code with raw values: 338000-337500=500 → roundUp(500,1000)=1000
    const installments: InstallmentPDFData[] = [
      makeMockInstallment({ installmentNumber: 1, amount: 337500 }),
    ];
    const mergedPayments: MergedPaymentRow[] = [
      { date: '2026-05-15', amount: 338000, installmentNumber: 1, reference: 'Cuota #1', isAbonoACuenta: false },
    ];

    const result = calculateMoraPagada(installments, mergedPayments, 1000);

    expect(result).toBe(0);
  });

  it('should return 0 when rounded total paid is less than rounded cuota', () => {
    // cuota=337500 → roundUp=338000, totalPaid=337999 → roundUp=338000
    // Both round to same value, no excess
    // Buggy code with raw: 337999-337500=499 → roundUp(499,1000)=1000
    const installments: InstallmentPDFData[] = [
      makeMockInstallment({ installmentNumber: 1, amount: 337500 }),
    ];
    const mergedPayments: MergedPaymentRow[] = [
      { date: '2026-05-15', amount: 337999, installmentNumber: 1, reference: 'Cuota #1', isAbonoACuenta: false },
    ];

    const result = calculateMoraPagada(installments, mergedPayments, 1000);

    expect(result).toBe(0);
  });

  it('should round the final sum with roundUpInstallment', () => {
    // Multiple installments where individual rounded differences need final rounding
    // inst1: cuota=337500→338000, totalPaid=403000→403000, excess=65000
    // inst2: cuota=337500→338000, totalPaid=403000→403000, excess=65000
    // Sum = 130000 (already a multiple of 1000, no extra rounding change)
    const installments: InstallmentPDFData[] = [
      makeMockInstallment({ installmentNumber: 1, amount: 337500 }),
      makeMockInstallment({ id: 'inst-2', installmentNumber: 2, amount: 337500 }),
    ];
    const mergedPayments: MergedPaymentRow[] = [
      { date: '2026-05-15', amount: 403000, installmentNumber: 1, reference: 'Cuota #1', isAbonoACuenta: false },
      { date: '2026-06-15', amount: 403000, installmentNumber: 2, reference: 'Cuota #2', isAbonoACuenta: false },
    ];

    const result = calculateMoraPagada(installments, mergedPayments, 1000);

    expect(result).toBe(130000);
  });

  it('should correctly handle mixed exact and non-multiple values (bug scenario)', () => {
    // Real-world: multiple installments, some with amounts not multiple of 1000
    // cuota #1: 337500 → 338000, totalPaid #1: 403000 → 403000, excess=65000
    // cuota #2: 5000 (exact multiple), totalPaid #2: 5000 (exact), excess=0
    // cuota #3: 337500 → 338000, totalPaid #3: 338500 → 339000, excess=1000
    const installments: InstallmentPDFData[] = [
      makeMockInstallment({ installmentNumber: 1, amount: 337500 }),
      makeMockInstallment({ id: 'inst-2', installmentNumber: 2, amount: 5000 }),
      makeMockInstallment({ id: 'inst-3', installmentNumber: 3, amount: 337500 }),
    ];
    const mergedPayments: MergedPaymentRow[] = [
      { date: '2026-05-15', amount: 403000, installmentNumber: 1, reference: 'Cuota #1', isAbonoACuenta: false },
      { date: '2026-06-15', amount: 5000, installmentNumber: 2, reference: 'Cuota #2', isAbonoACuenta: false },
      { date: '2026-07-15', amount: 338500, installmentNumber: 3, reference: 'Cuota #3', isAbonoACuenta: false },
    ];

    const result = calculateMoraPagada(installments, mergedPayments, 1000);

    expect(result).toBe(66000); // 65000 + 0 + 1000
  });

  describe('Mora cancelación anticipada', () => {
    it('should add mora cancelación anticipada payment to mora pagada total', () => {
      const installments: InstallmentPDFData[] = [
        makeMockInstallment({ installmentNumber: 1, amount: 5000 }),
      ];
      // Regular cuota payment (no excess) + mora cancelación anticipada
      const mergedPayments: MergedPaymentRow[] = [
        { date: '2026-05-15', amount: 5000, installmentNumber: 1, reference: 'Cuota #1', isAbonoACuenta: false },
        { date: '2026-05-20', amount: 5000, installmentNumber: null, reference: 'Mora cancelación anticipada', isAbonoACuenta: true },
      ];

      const result = calculateMoraPagada(installments, mergedPayments, 1000);

      // Regular excess: 5000-5000=0, plus mora cancelación: 5000
      expect(result).toBe(5000);
    });

    it('should NOT add cancelación anticipada payment to mora pagada', () => {
      const installments: InstallmentPDFData[] = [
        makeMockInstallment({ installmentNumber: 1, amount: 5000 }),
      ];
      // Regular cuota payment (no excess) + cancelación anticipada
      const mergedPayments: MergedPaymentRow[] = [
        { date: '2026-05-15', amount: 5000, installmentNumber: 1, reference: 'Cuota #1', isAbonoACuenta: false },
        { date: '2026-05-20', amount: 15000, installmentNumber: null, reference: 'Cancelación anticipada - pago único por todo el saldo', isAbonoACuenta: true },
      ];

      const result = calculateMoraPagada(installments, mergedPayments, 1000);

      // Regular excess: 0, cancelación anticipada does NOT count as mora
      expect(result).toBe(0);
    });

    it('should combine regular installment mora + mora cancelación anticipada', () => {
      const installments: InstallmentPDFData[] = [
        makeMockInstallment({ installmentNumber: 1, amount: 5000 }),
      ];
      // Payment exceeds cuota by 300 (mora) + mora cancelación anticipada
      const mergedPayments: MergedPaymentRow[] = [
        { date: '2026-05-15', amount: 5300, installmentNumber: 1, reference: 'Cuota #1', isAbonoACuenta: false },
        { date: '2026-05-20', amount: 2000, installmentNumber: null, reference: 'Mora cancelación anticipada', isAbonoACuenta: true },
      ];

      const result = calculateMoraPagada(installments, mergedPayments, 1000);

      // Regular excess: 5300-5000=300 → 1000, plus mora cancelación: 2000 → 2000
      // Total: 3000
      expect(result).toBe(3000);
    });

    it('should round mora cancelación anticipada with roundUpInstallment', () => {
      const installments: InstallmentPDFData[] = [];
      const mergedPayments: MergedPaymentRow[] = [
        { date: '2026-05-20', amount: 476, installmentNumber: null, reference: 'Mora cancelación anticipada', isAbonoACuenta: true },
      ];

      // With unit 100: ceil(476/100)*100 = 500
      expect(calculateMoraPagada(installments, mergedPayments, 100)).toBe(500);
      // With unit 1000: ceil(476/1000)*1000 = 1000
      expect(calculateMoraPagada(installments, mergedPayments, 1000)).toBe(1000);
    });
  });
});

// ============================================================
// getPeriodRate tests (Issue 2)
// ============================================================

describe('getPeriodRate', () => {
  it('should divide annual rate by 12 for MONTHLY frequency', () => {
    const result = getPeriodRate(120, 'MONTHLY');
    expect(result).toBe(10); // 120 / 12 = 10 (rounded to 4 decimals)
  });

  it('should divide annual rate by 24 for BIWEEKLY frequency', () => {
    const result = getPeriodRate(120, 'BIWEEKLY');
    expect(result).toBe(5); // 120 / 24 = 5 (rounded to 4 decimals)
  });

  it('should divide annual rate by 48 for WEEKLY frequency', () => {
    const result = getPeriodRate(120, 'WEEKLY');
    expect(result).toBe(2.5); // 120 / 48 = 2.5
  });

  it('should divide annual rate by 360 for DAILY frequency', () => {
    const result = getPeriodRate(120, 'DAILY');
    expect(result).toBeCloseTo(0.3333, 4); // 120 / 360 = 0.3333
  });

  it('should default to /12 for unknown frequency', () => {
    const result = getPeriodRate(120, 'UNKNOWN');
    expect(result).toBe(10); // 120 / 12 = 10 (rounded to 4 decimals)
  });
});

// ============================================================
// calculateMoraAcumulada tests (Mora acum. actual fix)
// ============================================================

describe('calculateMoraAcumulada', () => {
  function makeRow(overrides: Partial<InstallmentRow> = {}): InstallmentRow {
    return {
      installmentNumber: 1,
      dueDate: '2026-05-15',
      cuota: 5000,
      principal: 4000,
      interest: 1000,
      capitalBalance: 46000,
      paid: 0,
      saldo: 5000,
      mora: 0,
      daysOverdue: 0,
      status: 'PENDING',
      ...overrides,
    };
  }

  it('should return 0 for multiple PENDING installments with tiny mora values', () => {
    // Real scenario: installments not yet due, mora computed as 0
    // PENDING installments don't show mora in the table → contribute $0
    const rows: InstallmentRow[] = [
      makeRow({ installmentNumber: 1, mora: 0.50, status: 'PENDING' }),
      makeRow({ installmentNumber: 2, mora: 0.30, status: 'PENDING' }),
    ];

    const result = calculateMoraAcumulada(rows, 1000);

    // 0.50 would round to 1000, but PENDING installments are excluded
    expect(result).toBe(0);
  });

  it('should return 0 for PAID installments even if they have mora computed', () => {
    // PAID installments show "-" in the Mora column → contribute $0
    const rows: InstallmentRow[] = [
      makeRow({ installmentNumber: 1, mora: 75, status: 'PAID' }),
      makeRow({ installmentNumber: 2, mora: 0, status: 'PAID' }),
    ];

    const result = calculateMoraAcumulada(rows, 1000);

    expect(result).toBe(0);
  });

  it('should return 0 when all installments have mora 0', () => {
    const rows: InstallmentRow[] = [
      makeRow({ installmentNumber: 1, mora: 0, status: 'OVERDUE' }),
      makeRow({ installmentNumber: 2, mora: 0, status: 'OVERDUE' }),
    ];

    const result = calculateMoraAcumulada(rows, 1000);

    // roundUpInstallment(0, 1000) = 0 for each
    expect(result).toBe(0);
  });

  it('should round mora individually for OVERDUE installments', () => {
    // 1500 → ceil(1500/1000)*1000 = 2000
    const rows: InstallmentRow[] = [
      makeRow({ installmentNumber: 1, mora: 1500, status: 'OVERDUE' }),
    ];

    const result = calculateMoraAcumulada(rows, 1000);

    expect(result).toBe(2000);
  });

  it('should sum rounded mora for multiple OVERDUE installments', () => {
    const rows: InstallmentRow[] = [
      makeRow({ installmentNumber: 1, mora: 1500, status: 'OVERDUE' }),
      makeRow({ installmentNumber: 2, mora: 800, status: 'OVERDUE' }),
    ];

    const result = calculateMoraAcumulada(rows, 1000);

    // 1500 → 2000, 800 → 1000, total = 3000
    expect(result).toBe(3000);
  });

  it('should handle mixed statuses: only OVERDUE and PARTIAL contribute', () => {
    const rows: InstallmentRow[] = [
      makeRow({ installmentNumber: 1, mora: 1500, status: 'OVERDUE' }),     // → 2000
      makeRow({ installmentNumber: 2, mora: 0, status: 'PENDING' }),         // → 0 (excluded)
      makeRow({ installmentNumber: 3, mora: 75, status: 'PAID' }),           // → 0 (excluded)
      makeRow({ installmentNumber: 4, mora: 500, status: 'PARTIAL' }),       // → 1000
    ];

    const result = calculateMoraAcumulada(rows, 1000);

    expect(result).toBe(3000); // 2000 + 0 + 0 + 1000
  });

  it('should return 0 for empty rows', () => {
    const result = calculateMoraAcumulada([], 1000);
    expect(result).toBe(0);
  });

  it('should respect different rounding units', () => {
    const rows: InstallmentRow[] = [
      makeRow({ installmentNumber: 1, mora: 476, status: 'OVERDUE' }),
    ];

    // With unit 100: ceil(476/100)*100 = 500
    expect(calculateMoraAcumulada(rows, 100)).toBe(500);
    // With unit 1000: ceil(476/1000)*1000 = 1000
    expect(calculateMoraAcumulada(rows, 1000)).toBe(1000);
  });

  it('should exclude CANCELADA_POR_REFINANCIACION installments', () => {
    const rows: InstallmentRow[] = [
      makeRow({ installmentNumber: 1, mora: 500, status: 'CANCELADA_POR_REFINANCIACION' }),
    ];

    const result = calculateMoraAcumulada(rows, 1000);

    // Refinanciada installments show "-" in Mora column → contribute $0
    expect(result).toBe(0);
  });

  it('should include OVERDUE installments with mora greater than rounding unit correctly', () => {
    // Real bug scenario: 2 overdue installments, mora 0.50 and 0.30
    // Without rounding-to-display fix, roundUpInstallment(0.50, 1000)=1000, sum=2000
    // With fix, they're OVERDUE → each is included, each rounds to 1000 → sum=2000
    // But the real DB loan had 2 installments showing $0 in the table, which means
    // they were PENDING/PAID — not OVERDUE.  Test that works correctly.
    const rows: InstallmentRow[] = [
      makeRow({ installmentNumber: 1, mora: 0.50, status: 'OVERDUE' }),
      makeRow({ installmentNumber: 2, mora: 0.30, status: 'OVERDUE' }),
    ];

    const result = calculateMoraAcumulada(rows, 1000);

    // Each tiny mora rounds up to 1000 → 2000 for OVERDUE installments
    // (consistent: table would also show $1.000 per row for OVERDUE)
    expect(result).toBe(2000);
  });
});

// ============================================================
// generateAccountStatementPDF tests (mock-based)
// ============================================================

describe('generateAccountStatementPDF', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('section ordering', () => {
    it('should render client info section before loan info section', () => {
      const data = makeMockPDFData();

      generateAccountStatementPDF(data, 1000, 0.0005);

      const textCalls = mockText.mock.calls.map((c: unknown[]) => String(c[0]));
      const clientIdx = textCalls.findIndex((t: string) => t === 'DATOS DEL CLIENTE');
      const loanIdx = textCalls.findIndex((t: string) => t === 'DATOS DEL PRÉSTAMO');

      expect(clientIdx).toBeGreaterThan(-1);
      expect(loanIdx).toBeGreaterThan(-1);
      expect(clientIdx).toBeLessThan(loanIdx);
    });

    it('should render both client and loan info sections with distinct labels', () => {
      const data = makeMockPDFData();

      generateAccountStatementPDF(data, 1000, 0.0005);

      const textCalls = mockText.mock.calls.map((c: unknown[]) => String(c[0]));
      const clientLabels = textCalls.filter((t: string) => t === 'DATOS DEL CLIENTE');
      const loanLabels = textCalls.filter((t: string) => t === 'DATOS DEL PRÉSTAMO');

      // Both section titles appear exactly once each
      expect(clientLabels).toHaveLength(1);
      expect(loanLabels).toHaveLength(1);
      // Client fields (Nombre, DNI, Teléfono, Email) all appear
      expect(textCalls).toContain('NOMBRE');
      expect(textCalls).toContain('DNI');
      expect(textCalls).toContain('TELÉFONO');
      expect(textCalls).toContain('EMAIL');
      // Loan fields (Monto, Tasa, Plazo, Frecuencia, Sistema, Estado, Fecha inicio)
      expect(textCalls).toContain('MONTO');
      expect(textCalls).toContain('TASA');
      // The tasa value should include the frequency label (e.g., "mensual")
      const tasaText = textCalls.find((t: string) => t.includes('%') && t.includes('mensual'));
      expect(tasaText).toBeDefined();
    });
  });

  it('should generate PDF with correct filename', () => {
    const data = makeMockPDFData();

    generateAccountStatementPDF(data, 1000, 0.0005);

    expect(mockSave).toHaveBeenCalledWith('resumen-cuenta-42.pdf');
  });

  it('should call autoTable for installments table', () => {
    const data = makeMockPDFData();

    generateAccountStatementPDF(data, 1000, 0.0005);

    // autoTable should be called at least once (installments table)
    expect(mockAutoTable).toHaveBeenCalled();
    // Verify installments table structure by checking head
    const installmentCall = mockAutoTable.mock.calls.find(
      (call: unknown[]) => {
        const arg = call[1] as { head?: string[][] };
        return arg?.head?.[0]?.includes('N°');
      },
    );
    expect(installmentCall).toBeDefined();
  });

  it('should call autoTable for payments table', () => {
    const data = makeMockPDFData();

    generateAccountStatementPDF(data, 1000, 0.0005);

    // autoTable should be called at least twice (installments + payments)
    expect(mockAutoTable.mock.calls.length).toBeGreaterThanOrEqual(2);
    const paymentCall = mockAutoTable.mock.calls.find(
      (call: unknown[]) => {
        const arg = call[1] as { head?: string[][] };
        return arg?.head?.[0]?.includes('Fecha Pago');
      },
    );
    expect(paymentCall).toBeDefined();
  });

  it('should render header with loan id', () => {
    const data = makeMockPDFData();

    generateAccountStatementPDF(data, 1000, 0.0005);

    // Check that text was called (header renders title)
    expect(mockText).toHaveBeenCalled();
  });

  it('should render financial summary section', () => {
    const data = makeMockPDFData();

    generateAccountStatementPDF(data, 1000, 0.0005);

    // Verify text was called multiple times (various sections)
    const textCalls = mockText.mock.calls.length;
    expect(textCalls).toBeGreaterThan(5);
  });

  it('should apply rounding to installment amounts in table', () => {
    const data = makeMockPDFData({
      installments: [
        makeMockInstallment({
          installmentNumber: 1,
          dueDate: '2026-06-15',
          amount: 4741.29,
          balance: 4741.29,
        }),
      ],
    });

    generateAccountStatementPDF(data, 1000, 0.0005);

    // Find the installments autoTable call
    const installmentCall = mockAutoTable.mock.calls.find(
      (call: unknown[]) => {
        const arg = call[1] as { head?: string[][] };
        return arg?.head?.[0]?.includes('N°');
      },
    );
    expect(installmentCall).toBeDefined();

    // The body should contain rounded values (4741.29 → 5000 with unit 1000)
    const tableConfig = installmentCall![1] as { body?: string[][] };
    const body = tableConfig.body ?? [];
    expect(body.length).toBeGreaterThan(0);
    // Verify rounding: $5,000 (rounded from 4741.29 with unit 1000)
    const cuotaCell = body[0]?.[2];
    expect(cuotaCell).toContain('5.000');
  });

  it('should include "Sin pagos registrados" when no payments', () => {
    const data = makeMockPDFData({
      payments: [],
    });

    generateAccountStatementPDF(data, 1000, 0.0005);

    // Should render "Sin pagos registrados" text
    const textCallsWithSinPagos = mockText.mock.calls.filter(
      (call: unknown[]) => String(call[0]).includes('Sin pagos'),
    );
    expect(textCallsWithSinPagos.length).toBeGreaterThan(0);
  });

  describe('page breaks', () => {
    it('should add a page break before the financial summary section', () => {
      const data = makeMockPDFData();

      generateAccountStatementPDF(data, 1000, 0.0005);

      // addPage must be called at least once (page break before financial summary)
      expect(mockAddPage).toHaveBeenCalled();
    });

    it('should render financial summary on the second page after page break', () => {
      const data = makeMockPDFData();

      // Track whether RESUMEN FINANCIERO text appears AFTER an addPage call
      generateAccountStatementPDF(data, 1000, 0.0005);

      // Verify RESUMEN FINANCIERO appears in text calls
      const textCalls = mockText.mock.calls.map((c: unknown[]) => String(c[0]));
      expect(textCalls).toContain('RESUMEN FINANCIERO');

      // Verify addPage was called before RESUMEN FINANCIERO text
      // Since jsPDF mock records calls, the addPage call must exist
      expect(mockAddPage).toHaveBeenCalled();
    });

    it('should render financial summary with only the 3 required labels after page break', () => {
      const data = makeMockPDFData();

      generateAccountStatementPDF(data, 1000, 0.0005);

      const textCalls = mockText.mock.calls.map((c: unknown[]) => String(c[0]));
      // Financial summary must have its section header
      expect(textCalls).toContain('RESUMEN FINANCIERO');
      // Must contain the 4 cards (Mora acumulada actual renamed + Mora pagada added)
      expect(textCalls).toContain('TOTAL PAGADO');
      expect(textCalls).toContain('SALDO PENDIENTE');
      expect(textCalls).toContain('MORA ACUM. ACTUAL');
      expect(textCalls).toContain('MORA PAGADA');
      // Must NOT contain the 2 removed boxes or old mora label
      expect(textCalls).not.toContain('TOTAL PRESTADO');
      expect(textCalls).not.toContain('INTERESES PAGADOS');
      expect(textCalls).not.toContain('MORA ACUMULADA');
    });
  });

  describe('section headers for tables', () => {
    it('should render "PLAN DE PAGOS" section header before installments table', () => {
      const data = makeMockPDFData();

      generateAccountStatementPDF(data, 1000, 0.0005);

      const textCalls = mockText.mock.calls.map((c: unknown[]) => String(c[0]));
      expect(textCalls).toContain('PLAN DE PAGOS');
    });

    it('should render "HISTORIAL DE PAGOS" section header before payments table', () => {
      const data = makeMockPDFData();

      generateAccountStatementPDF(data, 1000, 0.0005);

      const textCalls = mockText.mock.calls.map((c: unknown[]) => String(c[0]));
      expect(textCalls).toContain('HISTORIAL DE PAGOS');
    });

    it('should set didDrawPage hook on installments table to redraw section header', () => {
      const data = makeMockPDFData();

      generateAccountStatementPDF(data, 1000, 0.0005);

      // Find installments autoTable call and verify didDrawPage is a function
      const installmentCall = mockAutoTable.mock.calls.find(
        (call: unknown[]) => {
          const arg = call[1] as { head?: string[][] };
          return arg?.head?.[0]?.includes('N°');
        },
      );
      expect(installmentCall).toBeDefined();
      const tableConfig = installmentCall![1] as { didDrawPage?: unknown };
      expect(tableConfig.didDrawPage).toBeDefined();
      expect(typeof tableConfig.didDrawPage).toBe('function');
    });

    it('should set didDrawPage hook on payments table to redraw section header', () => {
      const data = makeMockPDFData();

      generateAccountStatementPDF(data, 1000, 0.0005);

      // Find payments autoTable call and verify didDrawPage is a function
      const paymentCall = mockAutoTable.mock.calls.find(
        (call: unknown[]) => {
          const arg = call[1] as { head?: string[][] };
          return arg?.head?.[0]?.includes('Fecha Pago');
        },
      );
      expect(paymentCall).toBeDefined();
      const tableConfig = paymentCall![1] as { didDrawPage?: unknown };
      expect(tableConfig.didDrawPage).toBeDefined();
      expect(typeof tableConfig.didDrawPage).toBe('function');
    });

    it('should not use hardcoded startY: 40 for installments table on page 2+', () => {
      const data = makeMockPDFData({
        installments: Array.from({ length: 30 }, (_, i) =>
          makeMockInstallment({
            id: `inst-${i + 1}`,
            installmentNumber: i + 1,
            dueDate: '2026-01-15',
          }),
        ),
      });

      generateAccountStatementPDF(data, 1000, 0.0005);

      const installmentCall = mockAutoTable.mock.calls.find(
        (call: unknown[]) => {
          const arg = call[1] as { head?: string[][] };
          return arg?.head?.[0]?.includes('N°');
        },
      );
      expect(installmentCall).toBeDefined();
      const tableConfig = installmentCall![1] as { startY?: number };
      // startY should be greater than 40 because it's computed from
      // where the financial summary ends + section header spacing,
      // not hardcoded at 40
      if (typeof tableConfig.startY === 'number') {
        expect(tableConfig.startY).toBeGreaterThan(40);
      }
    });

    it('should NOT redraw "PLAN DE PAGOS" section header in didDrawPage (appears only once)', () => {
      const data = makeMockPDFData();

      generateAccountStatementPDF(data, 1000, 0.0005);

      // Capture the installments table's didDrawPage callback
      const installmentCall = mockAutoTable.mock.calls.find(
        (call: unknown[]) => {
          const arg = call[1] as { head?: string[][] };
          return arg?.head?.[0]?.includes('N°');
        },
      );
      expect(installmentCall).toBeDefined();
      const tableConfig = installmentCall![1] as { didDrawPage?: (hook: { cursor?: { y: number } }) => void };
      expect(tableConfig.didDrawPage).toBeDefined();

      // Clear mocks and invoke didDrawPage
      mockText.mockClear();
      mockSetFontSize.mockClear();
      mockSetTextColor.mockClear();
      mockSetDrawColor.mockClear();
      mockSetLineWidth.mockClear();
      mockLine.mockClear();
      mockSetFont.mockClear();

      tableConfig.didDrawPage!({ cursor: { y: 40 } });

      // After didDrawPage, "PLAN DE PAGOS" must NOT be redrawn
      const textCalls = mockText.mock.calls.map((c: unknown[]) => String(c[0]));
      expect(textCalls).not.toContain('PLAN DE PAGOS');
    });

    it('should render "PLAN DE PAGOS" section header exactly once in the full PDF', () => {
      const data = makeMockPDFData({
        // Single installment — should not overflow to page 2, so only 1 occurrence
        installments: [
          makeMockInstallment({ installmentNumber: 1, dueDate: '2026-06-15' }),
        ],
      });

      generateAccountStatementPDF(data, 1000, 0.0005);

      const textCalls = mockText.mock.calls.map((c: unknown[]) => String(c[0]));
      const planDePagosCalls = textCalls.filter((t: string) => t === 'PLAN DE PAGOS');
      expect(planDePagosCalls).toHaveLength(1);
    });
  });

  describe('header/footer layout', () => {
    it('should set margin.top >= 35 on installments table to clear header area', () => {
      const data = makeMockPDFData();

      generateAccountStatementPDF(data, 1000, 0.0005);

      const installmentCall = mockAutoTable.mock.calls.find(
        (call: unknown[]) => {
          const arg = call[1] as { head?: string[][] };
          return arg?.head?.[0]?.includes('N°');
        },
      );
      expect(installmentCall).toBeDefined();
      const tableConfig = installmentCall![1] as { margin?: { top: number; right: number; bottom: number; left: number } };
      expect(tableConfig.margin).toBeDefined();
      expect(tableConfig.margin!.top).toBeGreaterThanOrEqual(35);
    });

    it('should set margin.top >= 35 on payments table to clear header area', () => {
      const data = makeMockPDFData();

      generateAccountStatementPDF(data, 1000, 0.0005);

      const paymentCall = mockAutoTable.mock.calls.find(
        (call: unknown[]) => {
          const arg = call[1] as { head?: string[][] };
          return arg?.head?.[0]?.includes('Fecha Pago');
        },
      );
      expect(paymentCall).toBeDefined();
      const tableConfig = paymentCall![1] as { margin?: { top: number; right: number; bottom: number; left: number } };
      expect(tableConfig.margin).toBeDefined();
      expect(tableConfig.margin!.top).toBeGreaterThanOrEqual(35);
    });

    it('should draw footer on every page via setPage loop', () => {
      // Simulate 2-page document
      mockGetNumberOfPages.mockReturnValue(2);

      const data = makeMockPDFData();

      generateAccountStatementPDF(data, 1000, 0.0005);

      // getNumberOfPages must be called after all table rendering
      expect(mockGetNumberOfPages).toHaveBeenCalled();

      // setPage must be called for each page (page 1 and page 2)
      expect(mockSetPage).toHaveBeenCalledWith(1);
      expect(mockSetPage).toHaveBeenCalledWith(2);
      expect(mockSetPage).toHaveBeenCalledTimes(2);
    });

    it('should draw footer with date and page number on each page', () => {
      mockGetNumberOfPages.mockReturnValue(2);

      const data = makeMockPDFData();

      // Clear mocks before generation to get clean footer text calls
      mockText.mockClear();

      generateAccountStatementPDF(data, 1000, 0.0005);

      // After generation, the footer text should include "Generado:" somewhere
      const textCalls = mockText.mock.calls.map((c: unknown[]) => String(c[0]));
      const generatedCalls = textCalls.filter((t: string) => t.includes('Generado:'));
      expect(generatedCalls.length).toBeGreaterThan(0);

      // Should include page number text
      const pageCalls = textCalls.filter((t: string) => t.includes('Página'));
      expect(pageCalls.length).toBeGreaterThan(0);

      // The total page count should be in the footer
      const de2Calls = textCalls.filter((t: string) => t.includes('de 2'));
      expect(de2Calls.length).toBeGreaterThan(0);
    });

    it('should draw footer on single-page documents too', () => {
      mockGetNumberOfPages.mockReturnValue(1);

      const data = makeMockPDFData();

      generateAccountStatementPDF(data, 1000, 0.0005);

      // setPage must be called for the single page
      expect(mockSetPage).toHaveBeenCalledWith(1);
      expect(mockSetPage).toHaveBeenCalledTimes(1);
    });

    it('should draw footer with correct page numbers on 3-page document', () => {
      mockGetNumberOfPages.mockReturnValue(3);

      const data = makeMockPDFData();

      generateAccountStatementPDF(data, 1000, 0.0005);

      // setPage must be called for pages 1, 2, 3
      expect(mockSetPage).toHaveBeenCalledWith(1);
      expect(mockSetPage).toHaveBeenCalledWith(2);
      expect(mockSetPage).toHaveBeenCalledWith(3);
      expect(mockSetPage).toHaveBeenCalledTimes(3);

      // Footer text should reference "de 3"
      const textCalls = mockText.mock.calls.map((c: unknown[]) => String(c[0]));
      const de3Calls = textCalls.filter((t: string) => t.includes('de 3'));
      expect(de3Calls.length).toBeGreaterThan(0);
    });

    it('should preserve margin.top >= 35 for installments table with many rows', () => {
      const data = makeMockPDFData({
        installments: Array.from({ length: 50 }, (_, i) =>
          makeMockInstallment({
            id: `inst-${i + 1}`,
            installmentNumber: i + 1,
            dueDate: '2026-01-15',
          }),
        ),
      });

      generateAccountStatementPDF(data, 1000, 0.0005);

      const installmentCall = mockAutoTable.mock.calls.find(
        (call: unknown[]) => {
          const arg = call[1] as { head?: string[][] };
          return arg?.head?.[0]?.includes('N°');
        },
      );
      expect(installmentCall).toBeDefined();
      const tableConfig = installmentCall![1] as { margin?: { top: number } };
      expect(tableConfig.margin!.top).toBeGreaterThanOrEqual(35);
    });
  });

  describe('installment status display (Issue 1)', () => {
    it('should show Refinanciada label for CANCELADA_POR_REFINANCIACION status', () => {
      const data = makeMockPDFData({
        status: 'REFINANCIADO',
        installments: [
          makeMockInstallment({
            id: 'inst-ref-1',
            installmentNumber: 1,
            status: 'CANCELADA_POR_REFINANCIACION',
            dueDate: '2030-12-31',
            paidAmount: 0,
          }),
        ],
        payments: [],
      });

      generateAccountStatementPDF(data, 1000, 0.0005);

      const installmentCall = mockAutoTable.mock.calls.find(
        (call: unknown[]) => {
          const arg = call[1] as { head?: string[][] };
          return arg?.head?.[0]?.includes('N°');
        },
      );
      expect(installmentCall).toBeDefined();
      const tableConfig = installmentCall![1] as { body?: string[][] };
      const body = tableConfig.body ?? [];
      // Column 6 is Estado, should say "Refinanciada" not "Cancelada"
      expect(body[0][9]).toContain('Refinanciada');
    });

    it('should show "-" for mora and días de vencimiento on PAID installments', () => {
      const data = makeMockPDFData({
        status: 'ACTIVE',
        installments: [
          makeMockInstallment({
            id: 'inst-paid',
            installmentNumber: 1,
            amount: 5000,
            balance: 0,
            paidAmount: 5000,
            dueDate: '2026-01-01', // past due but paid
          }),
        ],
        payments: [
          makeMockPayment({
            installmentId: 'inst-paid',
            amount: 5000,
          }),
        ],
      });

      generateAccountStatementPDF(data, 1000, 0.0005);

      const installmentCall = mockAutoTable.mock.calls.find(
        (call: unknown[]) => {
          const arg = call[1] as { head?: string[][] };
          return arg?.head?.[0]?.includes('N°');
        },
      );
      expect(installmentCall).toBeDefined();
      const tableConfig = installmentCall![1] as { body?: string[][] };
      const body = tableConfig.body ?? [];
      // Column 7 is Mora, Column 8 is Días Venc.
      expect(body[0][7]).toBe('-');
      expect(body[0][8]).toBe('-');
    });

    it('should show mora and días de vencimiento for OVERDUE installments', () => {
      const data = makeMockPDFData({
        status: 'ACTIVE',
        installments: [
          makeMockInstallment({
            id: 'inst-overdue',
            installmentNumber: 1,
            amount: 5000,
            balance: 5000,
            paidAmount: 0,
            dueDate: '2026-01-01', // well in the past
          }),
        ],
        payments: [],
      });

      generateAccountStatementPDF(data, 1000, 0.0005);

      const installmentCall = mockAutoTable.mock.calls.find(
        (call: unknown[]) => {
          const arg = call[1] as { head?: string[][] };
          return arg?.head?.[0]?.includes('N°');
        },
      );
      expect(installmentCall).toBeDefined();
      const tableConfig = installmentCall![1] as { body?: string[][] };
      const body = tableConfig.body ?? [];
      // Column 7 is Mora — must NOT be '-' (should show currency value)
      expect(body[0][7]).not.toBe('-');
      // Column 8 is Días Venc. — must NOT be '-' (should show number)
      expect(body[0][8]).not.toBe('-');
      expect(Number(body[0][8])).toBeGreaterThan(0);
    });

    it('should show "-" for mora and días on PENDING (future) installments', () => {
      const data = makeMockPDFData({
        status: 'ACTIVE',
        installments: [
          makeMockInstallment({
            id: 'inst-pending',
            installmentNumber: 1,
            amount: 5000,
            balance: 5000,
            paidAmount: 0,
            dueDate: '2030-12-31', // far future
          }),
        ],
        payments: [],
      });

      generateAccountStatementPDF(data, 1000, 0.0005);

      const installmentCall = mockAutoTable.mock.calls.find(
        (call: unknown[]) => {
          const arg = call[1] as { head?: string[][] };
          return arg?.head?.[0]?.includes('N°');
        },
      );
      expect(installmentCall).toBeDefined();
      const tableConfig = installmentCall![1] as { body?: string[][] };
      const body = tableConfig.body ?? [];
      expect(body[0][7]).toBe('-');
      expect(body[0][8]).toBe('-');
    });
  });

  describe('saldo should use balance directly (no double-subtraction)', () => {
    it('should show balance as-is for partially paid installment (not balance - totalPaid)', () => {
      // Real scenario: cuota 2 amount=19000, payment=10000 → API balance=9000 (already reduced)
      // Bug: saldo = balance - totalPaid = 9000 - 10000 = -1000 → clamped to 0
      // Fix: saldo = balance = 9000
      const data = makeMockPDFData({
        status: 'ACTIVE',
        installments: [
          makeMockInstallment({
            id: 'inst-partial',
            installmentNumber: 2,
            amount: 19000,
            balance: 9000, // API balance already accounts for the $10.000 paid
            paidAmount: 0,
            dueDate: '2030-12-31',
          }),
        ],
        payments: [
          makeMockPayment({
            installmentId: 'inst-partial',
            installmentNumber: 2,
            amount: 10000,
          }),
        ],
      });

      generateAccountStatementPDF(data, 1000, 0.0005);

      const installmentCall = mockAutoTable.mock.calls.find(
        (call: unknown[]) => {
          const arg = call[1] as { head?: string[][] };
          return arg?.head?.[0]?.includes('N°');
        },
      );
      expect(installmentCall).toBeDefined();
      const tableConfig = installmentCall![1] as { body?: string[][] };
      const body = tableConfig.body ?? [];
      // Column 6 is Saldo. API balance=9000 → roundUpInstallment(9000,1000)=9000 → "$9.000"
      const saldoCell = body[0][6];
      expect(saldoCell).toContain('9.000');
    });

    it('should not double-subtract when totalPaid equals original amount', () => {
      // Cuota amount=5000, payment=5000 → API balance=0 (fully paid)
      // Bug: saldo = 0 - 5000 = -5000 → clamped to 0 (coincidentally correct for $0 but wrong logic)
      const data = makeMockPDFData({
        status: 'ACTIVE',
        installments: [
          makeMockInstallment({
            id: 'inst-paid',
            installmentNumber: 1,
            amount: 5000,
            balance: 0, // fully paid
            paidAmount: 0,
            dueDate: '2026-05-15',
          }),
        ],
        payments: [
          makeMockPayment({
            installmentId: 'inst-paid',
            installmentNumber: 1,
            amount: 5000,
          }),
        ],
      });

      generateAccountStatementPDF(data, 1000, 0.0005);

      const installmentCall = mockAutoTable.mock.calls.find(
        (call: unknown[]) => {
          const arg = call[1] as { head?: string[][] };
          return arg?.head?.[0]?.includes('N°');
        },
      );
      expect(installmentCall).toBeDefined();
      const tableConfig = installmentCall![1] as { body?: string[][] };
      const body = tableConfig.body ?? [];
      // Column 6 is Saldo. API balance=0 → "$0"
      expect(body[0][6]).toContain('0');
    });

    it('should show full balance when no payment has been made', () => {
      // No payments, API balance = amount = 5000
      // Bug (with subtraction): 5000 - 0 = 5000 (correct only because totalPaid=0)
      const data = makeMockPDFData({
        status: 'ACTIVE',
        installments: [
          makeMockInstallment({
            id: 'inst-pending',
            installmentNumber: 1,
            amount: 5000,
            balance: 5000,
            paidAmount: 0,
            dueDate: '2030-12-31',
          }),
        ],
        payments: [],
      });

      generateAccountStatementPDF(data, 1000, 0.0005);

      const installmentCall = mockAutoTable.mock.calls.find(
        (call: unknown[]) => {
          const arg = call[1] as { head?: string[][] };
          return arg?.head?.[0]?.includes('N°');
        },
      );
      expect(installmentCall).toBeDefined();
      const tableConfig = installmentCall![1] as { body?: string[][] };
      const body = tableConfig.body ?? [];
      // Column 6 is Saldo. API balance=5000 → "$5.000"
      expect(body[0][6]).toContain('5.000');
    });
  });

  describe('installments table column widths fit within page margins', () => {
    function getInstallmentTableConfig(): {
      margin: { left: number; right: number; top: number; bottom: number };
      columnStyles: Record<number, { cellWidth?: number }>;
    } {
      const installmentCall = mockAutoTable.mock.calls.find(
        (call: unknown[]) => {
          const arg = call[1] as { head?: string[][] };
          return arg?.head?.[0]?.includes('N°');
        },
      );
      expect(installmentCall).toBeDefined();
      return installmentCall![1] as {
        margin: { left: number; right: number; top: number; bottom: number };
        columnStyles: Record<number, { cellWidth?: number }>;
      };
    }

    it('should use left margin of 20 (aligned with document layout)', () => {
      generateAccountStatementPDF(makeMockPDFData(), 1000, 0.0005);
      const config = getInstallmentTableConfig();
      expect(config.margin.left).toBe(20);
    });

    it('should use right margin of 20 (aligned with document layout)', () => {
      generateAccountStatementPDF(makeMockPDFData(), 1000, 0.0005);
      const config = getInstallmentTableConfig();
      expect(config.margin.right).toBe(20);
    });

    it('should have column widths that sum to exactly the available page width (matching payments table)', () => {
      generateAccountStatementPDF(makeMockPDFData(), 1000, 0.0005);
      const config = getInstallmentTableConfig();
      const totalColWidth = Object.values(config.columnStyles).reduce(
        (sum, col) => sum + (col.cellWidth ?? 0),
        0,
      );
      const pageWidth = 210; // A4
      const availableWidth = pageWidth - config.margin.left - config.margin.right;
      // Both installments and payments tables should span the same 170mm total width
      expect(totalColWidth).toBe(170);
      expect(totalColWidth).toBeLessThanOrEqual(availableWidth);
    });

    it('should have the same margin settings as payments table for visual consistency', () => {
      // Verify both tables share identical margin config
      const data = makeMockPDFData();
      generateAccountStatementPDF(data, 1000, 0.0005);

      const installmentCall = mockAutoTable.mock.calls.find(
        (call: unknown[]) => {
          const arg = call[1] as { head?: string[][] };
          return arg?.head?.[0]?.includes('N°');
        },
      );
      const paymentCall = mockAutoTable.mock.calls.find(
        (call: unknown[]) => {
          const arg = call[1] as { head?: string[][] };
          return arg?.head?.[0]?.includes('Fecha Pago');
        },
      );

      expect(installmentCall).toBeDefined();
      expect(paymentCall).toBeDefined();

      const iConfig = installmentCall![1] as { margin?: { left: number; right: number } };
      const pConfig = paymentCall![1] as { margin?: { left: number; right: number } };

      expect(iConfig.margin?.left).toBe(pConfig.margin?.left);
      expect(iConfig.margin?.right).toBe(pConfig.margin?.right);
    });

    it('should have payments table column widths that sum to the same total as installments', () => {
      generateAccountStatementPDF(makeMockPDFData(), 1000, 0.0005);

      const installmentCall = mockAutoTable.mock.calls.find(
        (call: unknown[]) => {
          const arg = call[1] as { head?: string[][] };
          return arg?.head?.[0]?.includes('N°');
        },
      );
      const paymentCall = mockAutoTable.mock.calls.find(
        (call: unknown[]) => {
          const arg = call[1] as { head?: string[][] };
          return arg?.head?.[0]?.includes('Fecha Pago');
        },
      );

      expect(installmentCall).toBeDefined();
      expect(paymentCall).toBeDefined();

      const iConfig = installmentCall![1] as { columnStyles: Record<number, { cellWidth?: number }> };
      const pConfig = paymentCall![1] as { columnStyles: Record<number, { cellWidth?: number }> };

      const iTotal = Object.values(iConfig.columnStyles).reduce(
        (sum, col) => sum + (col.cellWidth ?? 0),
        0,
      );
      const pTotal = Object.values(pConfig.columnStyles).reduce(
        (sum, col) => sum + (col.cellWidth ?? 0),
        0,
      );

      expect(iTotal).toBe(pTotal);
    });
  });

  describe('total pagado includes abono a cuenta payments', () => {
    it('should include cancelación anticipada and mora cancelación anticipada in total pagado', () => {
      const data = makeMockPDFData({
        installments: [
          makeMockInstallment({
            id: 'inst-1',
            installmentNumber: 1,
            dueDate: '2030-12-31',
            amount: 5000,
            balance: 0,
          }),
        ],
        payments: [
          makeMockPayment({
            amount: 5000,
            paymentDate: '2026-04-15',
            reference: 'Cuota #1',
            installmentNumber: 1,
            installmentId: 'inst-1',
          }),
          makeMockPayment({
            amount: 15000,
            paymentDate: '2026-04-20',
            notes: 'Cancelación anticipada - pago único por todo el saldo',
            installmentId: undefined,
            installmentNumber: undefined,
            reference: undefined,
          }),
          makeMockPayment({
            amount: 3000,
            paymentDate: '2026-04-25',
            notes: 'Mora cancelación anticipada',
            installmentId: undefined,
            installmentNumber: undefined,
            reference: undefined,
          }),
        ],
      });

      generateAccountStatementPDF(data, 1000, 0.0005);

      // Find the "TOTAL PAGADO" value rendered in the PDF
      const textCalls = mockText.mock.calls.map((c: unknown[]) => String(c[0]));
      const totalPagadoIdx = textCalls.findIndex((t: string) => t === 'TOTAL PAGADO');
      expect(totalPagadoIdx).toBeGreaterThan(-1);

      // The value should appear shortly after the label
      // 5000 (cuota) + 15000 (cancelación anticipada) + 3000 (mora cancelación) = 23000
      // roundUpInstallment(23000, 1000) = 23000
      const valueText = textCalls.slice(totalPagadoIdx).find((t: string) => t.includes('23.000'));
      expect(valueText).toBeDefined();
    });
  });

  describe('moraRate parameter', () => {
    it('should use the moraRate parameter (not hardcoded) when computing installment mora', () => {
      const pastDate = '2026-04-01';
      const data = makeMockPDFData({
        status: 'ACTIVE',
        installments: [
          makeMockInstallment({
            id: 'inst-overdue',
            installmentNumber: 1,
            amount: 5000,
            balance: 5000,
            paidAmount: 0,
            dueDate: pastDate,
          }),
        ],
        payments: [],
      });

      // Generate with a high mora rate (2% daily)
      generateAccountStatementPDF(data, 1000, 0.02);

      const installmentCall = mockAutoTable.mock.calls.find(
        (call: unknown[]) => {
          const arg = call[1] as { head?: string[][] };
          return arg?.head?.[0]?.includes('N°');
        },
      );
      expect(installmentCall).toBeDefined();
      const tableConfig = installmentCall![1] as { body?: string[][] };
      const body = tableConfig.body ?? [];

      // The mora column should show a non-zero value (proving moraRate was used)
      // With balance=5000, daysOverdue≈47, moraRate=0.02 → mora ≈ 4700
      expect(body[0][7]).not.toBe('-');
      // Body uses AR locale formatting: "$1.000" = 1000, "." is thousands sep
      const moraValue = parseInt(body[0][7].replace(/\D/g, ''), 10);
      expect(moraValue).toBeGreaterThan(1000);
    });

    it('should produce different mora values for different moraRate inputs', () => {
      const pastDate = '2026-04-01';
      const baseLoan = {
        status: 'ACTIVE',
        installments: [
          makeMockInstallment({
            id: 'inst-od',
            installmentNumber: 1,
            amount: 5000,
            balance: 5000,
            paidAmount: 0,
            dueDate: pastDate,
          }),
        ],
        payments: [],
      };

      // Low mora rate
      generateAccountStatementPDF(makeMockPDFData(baseLoan), 1000, 0.0001);
      const lowCall = mockAutoTable.mock.calls.find(
        (call: unknown[]) => {
          const arg = call[1] as { head?: string[][] };
          return arg?.head?.[0]?.includes('N°');
        },
      );
      const lowBody = (lowCall![1] as { body?: string[][] }).body ?? [];
      // Body uses AR locale formatting: "$1.000" = 1000, "." is thousands sep
      const lowMora = parseInt(lowBody[0][7].replace(/\D/g, ''), 10);

      vi.clearAllMocks();

      // High mora rate
      generateAccountStatementPDF(makeMockPDFData(baseLoan), 1000, 0.02);
      const highCall = mockAutoTable.mock.calls.find(
        (call: unknown[]) => {
          const arg = call[1] as { head?: string[][] };
          return arg?.head?.[0]?.includes('N°');
        },
      );
      const highBody = (highCall![1] as { body?: string[][] }).body ?? [];
      const highMora = parseInt(highBody[0][7].replace(/\D/g, ''), 10);

      // Higher moraRate should produce strictly higher mora
      expect(highMora).toBeGreaterThan(lowMora);
    });
  });
});
