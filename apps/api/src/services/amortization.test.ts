import { describe, it, expect } from 'vitest';
import { AmortizationService } from './amortization';
import { PaymentFrequency } from '@prisma/client';

describe('AmortizationService', () => {
  describe('calculate', () => {
    it('should calculate correct monthly installment for standard loan', () => {
      const result = AmortizationService.calculate({
        amount: 10000,
        interestRate: 0.15, // 15% annual
        termMonths: 12,
        frequency: PaymentFrequency.MONTHLY,
        startDate: new Date('2024-01-01'),
      });

      // French formula: C = P * [r(1+r)^n] / [(1+r)^n - 1]
      // r = 0.15/12 = 0.0125, n = 12
      // C = 10000 * [0.0125 * (1.0125)^12] / [(1.0125)^12 - 1]
      // C ≈ 902.58
      expect(result.installmentAmount).toBeCloseTo(902.58, 0);
      expect(result.totalInterest).toBeCloseTo(830.96, 0);
      expect(result.totalPayment).toBeCloseTo(10830.96, 0);
      expect(result.schedule).toHaveLength(12);
    });

    it('should calculate zero interest loan correctly', () => {
      const result = AmortizationService.calculate({
        amount: 12000,
        interestRate: 0,
        termMonths: 12,
        frequency: PaymentFrequency.MONTHLY,
        startDate: new Date('2024-01-01'),
      });

      expect(result.installmentAmount).toBe(1000);
      expect(result.totalInterest).toBe(0);
      expect(result.totalPayment).toBe(12000);
    });

    it('should generate correct number of installments', () => {
      const result = AmortizationService.calculate({
        amount: 10000,
        interestRate: 0.12,
        termMonths: 24,
        frequency: PaymentFrequency.MONTHLY,
      });

      expect(result.schedule).toHaveLength(24);
    });

    it('should calculate weekly payments correctly', () => {
      const result = AmortizationService.calculate({
        amount: 5200,
        interestRate: 0.26, // 26% annual
        termMonths: 12, // 12 semanas = 12 pagos
        frequency: PaymentFrequency.WEEKLY,
      });

      // El sistema usa term directamente como número de pagos
      expect(result.schedule).toHaveLength(12);
    });

    it('should calculate biweekly payments correctly', () => {
      const result = AmortizationService.calculate({
        amount: 5200,
        interestRate: 0.26,
        termMonths: 12, // 12 cuotas quincenales = 12 pagos
        frequency: PaymentFrequency.BIWEEKLY,
      });

      expect(result.schedule).toHaveLength(12);
    });

    it('should have decreasing balance in schedule', () => {
      const result = AmortizationService.calculate({
        amount: 10000,
        interestRate: 0.15,
        termMonths: 12,
        frequency: PaymentFrequency.MONTHLY,
      });

      for (let i = 1; i < result.schedule.length; i++) {
        expect(result.schedule[i].balance).toBeLessThan(result.schedule[i - 1].balance);
      }
    });

    it('should have last installment with zero or near-zero balance', () => {
      const result = AmortizationService.calculate({
        amount: 10000,
        interestRate: 0.15,
        termMonths: 12,
        frequency: PaymentFrequency.MONTHLY,
      });

      const lastInstallment = result.schedule[result.schedule.length - 1];
      expect(lastInstallment.balance).toBeLessThanOrEqual(0.01);
    });

    it('should calculate higher interest for longer terms', () => {
      const shortTerm = AmortizationService.calculate({
        amount: 10000,
        interestRate: 0.15,
        termMonths: 6,
        frequency: PaymentFrequency.MONTHLY,
      });

      const longTerm = AmortizationService.calculate({
        amount: 10000,
        interestRate: 0.15,
        termMonths: 24,
        frequency: PaymentFrequency.MONTHLY,
      });

      expect(longTerm.totalInterest).toBeGreaterThan(shortTerm.totalInterest);
    });

    it('should handle small amounts correctly', () => {
      const result = AmortizationService.calculate({
        amount: 1000,
        interestRate: 0.20,
        termMonths: 3,
        frequency: PaymentFrequency.MONTHLY,
      });

      expect(result.installmentAmount).toBeGreaterThan(0);
      expect(result.totalPayment).toBeGreaterThan(1000);
      expect(result.schedule).toHaveLength(3);
    });
  });

  describe('calculateRemainingBalance', () => {
    it('should calculate remaining balance after partial payments', () => {
      const remaining = AmortizationService.calculateRemainingBalance(
        10000,    // principal
        902.58,   // installment (from earlier calc)
        0.15,     // 15% annual
        6,        // 6 payments made
        12        // total payments
      );

      // After 6 payments, roughly half should remain
      expect(remaining).toBeGreaterThan(4500);
      expect(remaining).toBeLessThan(5500);
    });

    it('should return 0 when all payments made', () => {
      const remaining = AmortizationService.calculateRemainingBalance(
        10000,
        902.58,
        0.15,
        12,
        12
      );

      expect(remaining).toBe(0);
    });

    it('should return full principal when no payments made', () => {
      const remaining = AmortizationService.calculateRemainingBalance(
        10000,
        902.58,
        0.15,
        0,
        12
      );

      expect(remaining).toBe(10000);
    });
  });
});
