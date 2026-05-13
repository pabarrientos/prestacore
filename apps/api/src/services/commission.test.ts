import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CommissionService } from './commission';
import { CommissionStrategy } from './commission';
import { ProportionalStrategy } from './commission';
import { AfterCapitalRecoveryStrategy } from './commission';
import { AdvancedStrategy } from './commission';
import { PrismaClient, CommissionMode, LoanStatus, InstallmentStatus } from '@prisma/client';

// Mock PrismaClient
vi.mock('@prisma/client', () => {
  const mockPrisma = {
    loan: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    installment: {
      findMany: vi.fn(),
    },
  };
  return {
    PrismaClient: vi.fn(() => mockPrisma),
    CommissionMode: {
      PROPORTIONAL: 'PROPORTIONAL',
      AFTER_CAPITAL_RECOVERY: 'AFTER_CAPITAL_RECOVERY',
      ADVANCED: 'ADVANCED',
    },
    LoanStatus: {
      PENDING: 'PENDING',
      ACTIVE: 'ACTIVE',
      PAID: 'PAID',
      DEFAULTED: 'DEFAULTED',
      CANCELLED: 'CANCELLED',
    },
    InstallmentStatus: {
      PENDING: 'PENDING',
      PAID: 'PAID',
      OVERDUE: 'OVERDUE',
      PARTIAL: 'PARTIAL',
    },
  };
});

describe('CommissionStrategy', () => {
  describe('ProportionalStrategy', () => {
    it('should calculate commission as interest_collected × percentage', () => {
      const strategy = new ProportionalStrategy();
      
      // Installment with full payment, interest = 100
      const result = strategy.calculateInstallmentCommission(
        { interest: 100, paidAmount: 1000, amount: 1000, number: 1 },
        12,
        5, // 5%
        0,
        10000
      );
      
      // interest_collected = 100 × min(1000/1000, 1) = 100
      // commission = 100 × 0.05 = 5
      expect(result.commission).toBe(5);
    });

    it('should handle partial payments correctly', () => {
      const strategy = new ProportionalStrategy();
      
      // Paid 600 out of 1000, interest = 100
      const result = strategy.calculateInstallmentCommission(
        { interest: 100, paidAmount: 600, amount: 1000, number: 1 },
        12,
        10, // 10%
        0,
        10000
      );
      
      // interest_collected = 100 × min(600/1000, 1) = 100 × 0.6 = 60
      // commission = 60 × 0.10 = 6
      expect(result.commission).toBe(6);
    });

    it('should return 0 for zero interest', () => {
      const strategy = new ProportionalStrategy();
      
      const result = strategy.calculateInstallmentCommission(
        { interest: 0, paidAmount: 1000, amount: 1000, number: 1 },
        12,
        5,
        0,
        10000
      );
      
      expect(result.commission).toBe(0);
    });

    it('should track principal paid in capitalRecoveredSoFar', () => {
      const strategy = new ProportionalStrategy();
      
      const result = strategy.calculateInstallmentCommission(
        { interest: 100, paidAmount: 1000, amount: 1000, number: 1 },
        12,
        5,
        5000,
        10000
      );
      
      // Principal paid = 1000 - 100 = 900
      expect(result.newCapitalRecovered).toBe(5900);
    });
  });

  describe('AfterCapitalRecoveryStrategy', () => {
    it('should return 0 commission until capital is recovered', () => {
      const strategy = new AfterCapitalRecoveryStrategy();
      
      // Capital recovered = 5000, total = 10000 (50% recovered)
      const result = strategy.calculateInstallmentCommission(
        { interest: 100, paidAmount: 1000, amount: 1000, number: 5 },
        12,
        10,
        5000,
        10000
      );
      
      expect(result.commission).toBe(0);
      // Principal paid = 1000 - 100 = 900
      expect(result.newCapitalRecovered).toBe(5900);
    });

    it('should calculate proportional commission after capital fully recovered', () => {
      const strategy = new AfterCapitalRecoveryStrategy();
      
      // Capital recovered = 10000, total = 10000 (100% recovered)
      const result = strategy.calculateInstallmentCommission(
        { interest: 100, paidAmount: 1000, amount: 1000, number: 12 },
        12,
        10,
        10000,
        10000
      );
      
      expect(result.commission).toBe(10); // 100 × 0.10
    });

    it('should track cumulative capital recovery', () => {
      const strategy = new AfterCapitalRecoveryStrategy();
      
      // First installment: principal paid = 1000 - 100 = 900
      const r1 = strategy.calculateInstallmentCommission(
        { interest: 100, paidAmount: 1000, amount: 1000, number: 1 },
        12,
        10,
        0,
        10000
      );
      expect(r1.commission).toBe(0);
      expect(r1.newCapitalRecovered).toBe(900);
      
      // Second installment: principal paid = 1000 - 100 = 900
      const r2 = strategy.calculateInstallmentCommission(
        { interest: 100, paidAmount: 1001, amount: 1000, number: 2 },
        12,
        10,
        r1.newCapitalRecovered,
        10000
      );
      // Still not fully recovered (900 + 900 = 1800 < 10000)
      expect(r2.commission).toBe(0);
      expect(r2.newCapitalRecovered).toBe(1800);
    });
  });

  describe('AdvancedStrategy', () => {
    it('should apply higher weight to early installments', () => {
      const strategy = new AdvancedStrategy();
      
      // Installment 1 of 10: weight = 1 - (1-1)/(10-1) = 1
      const r1 = strategy.calculateInstallmentCommission(
        { interest: 100, paidAmount: 1000, amount: 1000, number: 1 },
        10,
        10,
        0,
        10000
      );
      
      // Installment 10 of 10: weight = 1 - (10-1)/(10-1) = 0
      const r10 = strategy.calculateInstallmentCommission(
        { interest: 100, paidAmount: 1000, amount: 1000, number: 10 },
        10,
        10,
        0,
        10000
      );
      
      expect(r1.commission).toBe(10); // 100 × 1.0 × 0.10
      expect(r10.commission).toBe(0); // 100 × 0 × 0.10
    });

    it('should calculate correct weights for middle installments', () => {
      const strategy = new AdvancedStrategy();
      
      // Installment 5 of 10: weight = 1 - (5-1)/(10-1) = 1 - 4/9 ≈ 0.556
      const r5 = strategy.calculateInstallmentCommission(
        { interest: 100, paidAmount: 1000, amount: 1000, number: 5 },
        10,
        10,
        0,
        10000
      );
      
      // 100 × 0.555... × 0.10 ≈ 5.56
      expect(r5.commission).toBeCloseTo(5.56, 1);
    });

    it('should handle single installment (n=1) with weight 1', () => {
      const strategy = new AdvancedStrategy();
      
      const result = strategy.calculateInstallmentCommission(
        { interest: 100, paidAmount: 1000, amount: 1000, number: 1 },
        1,
        10,
        0,
        10000
      );
      
      // weight = 1 - (1-1)/(1-1) = 1 - 0/0 = 1 (by convention for n=1)
      expect(result.commission).toBe(10);
    });
  });
});

describe('CommissionService', () => {
  let mockPrisma: any;
  let commissionService: CommissionService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma = new PrismaClient();
  });

  describe('projectCommission', () => {
    it('should calculate projected commission at loan creation', () => {
      // This is a pure calculation test - no DB needed
      // PROPORTIONAL mode: sum of all installment interests × percentage
      const projected = CommissionService.projectCommission(
        10000, // principal
        0.36, // 36% annual rate
        12, // 12 months
        5, // 5% commission
        CommissionMode.PROPORTIONAL,
        1000 // monthly payment amount (from amortization)
      );
      
      // For a loan with 36% annual rate, 12k total interest over 12 months
      // Projected = totalInterest × 5% = 12000 × 0.05 = 600
      expect(projected).toBeGreaterThan(0);
    });
  });

  describe('recalculateLoan', () => {
    it('should skip recalculation if loan has no seller', async () => {
      mockPrisma.loan.findUnique.mockResolvedValue({
        id: 'loan-1',
        assignedVendorId: null,
        commissionPercentage: null,
        installments: [
          { interest: 100, paidAmount: 1000, amount: 1000, number: 1, status: InstallmentStatus.PAID },
        ],
      });

      const result = await CommissionService.recalculateLoan('loan-1');
      
      expect(result).toBeNull();
      expect(mockPrisma.loan.update).not.toHaveBeenCalled();
    });

    it('should recalculate and update commissionGenerated', async () => {
      mockPrisma.loan.findUnique.mockResolvedValue({
        id: 'loan-1',
        assignedVendorId: 'vendor-1',
        commissionPercentage: 5,
        commissionMode: CommissionMode.PROPORTIONAL,
        status: LoanStatus.ACTIVE,
        amount: 10000,
        installments: [
          { 
            interest: 100, 
            paidAmount: 1000, 
            amount: 1000, 
            number: 1, 
            status: InstallmentStatus.PAID,
            principal: 900,
          },
          { 
            interest: 100, 
            paidAmount: 500, 
            amount: 1000, 
            number: 2, 
            status: InstallmentStatus.PARTIAL,
            principal: 500,
          },
        ],
      });

      mockPrisma.loan.update.mockResolvedValue({});

      const result = await CommissionService.recalculateLoan('loan-1');
      
      expect(mockPrisma.loan.update).toHaveBeenCalledWith({
        where: { id: 'loan-1' },
        data: expect.objectContaining({
          commissionGenerated: expect.any(Number),
        }),
      });
    });

    it('should be idempotent - same input yields same output', async () => {
      const loanData = {
        id: 'loan-1',
        assignedVendorId: 'vendor-1',
        commissionPercentage: 5,
        commissionMode: CommissionMode.PROPORTIONAL,
        status: LoanStatus.ACTIVE,
        amount: 10000,
        installments: [
          { 
            interest: 100, 
            paidAmount: 1000, 
            amount: 1000, 
            number: 1, 
            status: InstallmentStatus.PAID,
            principal: 900,
          },
        ],
      };

      mockPrisma.loan.findUnique.mockResolvedValue(loanData);
      mockPrisma.loan.update.mockResolvedValue({});

      // Run twice
      await CommissionService.recalculateLoan('loan-1');
      const firstCall = mockPrisma.loan.update.mock.calls[0];
      
      await CommissionService.recalculateLoan('loan-1');
      const secondCall = mockPrisma.loan.update.mock.calls[1];
      
      // Both calls should have same commissionGenerated value
      expect(firstCall[0].data.commissionGenerated).toBe(secondCall[0].data.commissionGenerated);
    });

    it('should calculate zero commission for zero-interest loan', async () => {
      mockPrisma.loan.findUnique.mockResolvedValue({
        id: 'loan-1',
        assignedVendorId: 'vendor-1',
        commissionPercentage: 5,
        commissionMode: CommissionMode.PROPORTIONAL,
        status: LoanStatus.ACTIVE,
        amount: 10000,
        installments: [
          { 
            interest: 0, 
            paidAmount: 1000, 
            amount: 1000, 
            number: 1, 
            status: InstallmentStatus.PAID,
            principal: 1000,
          },
        ],
      });

      mockPrisma.loan.update.mockResolvedValue({});

      await CommissionService.recalculateLoan('loan-1');
      
      expect(mockPrisma.loan.update).toHaveBeenCalledWith({
        where: { id: 'loan-1' },
        data: {
          commissionGenerated: 0,
        },
      });
    });
  });
});
