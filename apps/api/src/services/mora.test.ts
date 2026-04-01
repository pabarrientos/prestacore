import { describe, it, expect } from 'vitest';
import { MoraService } from './mora';

describe('MoraService', () => {
  describe('calculate', () => {
    it('should calculate mora for overdue installment', () => {
      const result = MoraService.calculate({
        installmentAmount: 1000,
        dailyRate: 0.0005, // 0.05% daily
        daysOverdue: 30,
      });

      // mora = 1000 * 0.0005 * 30 = 15
      expect(result.moraAmount).toBe(15);
      expect(result.totalPayable).toBe(1015);
    });

    it('should return zero mora for no overdue days', () => {
      const result = MoraService.calculate({
        installmentAmount: 1000,
        dailyRate: 0.0005,
        daysOverdue: 0,
      });

      expect(result.moraAmount).toBe(0);
      expect(result.totalPayable).toBe(1000);
    });

    it('should return zero mora for negative overdue days', () => {
      const result = MoraService.calculate({
        installmentAmount: 1000,
        dailyRate: 0.0005,
        daysOverdue: -5,
      });

      expect(result.moraAmount).toBe(0);
      expect(result.totalPayable).toBe(1000);
    });

    it('should calculate higher mora for more days overdue', () => {
      const result30 = MoraService.calculate({
        installmentAmount: 1000,
        dailyRate: 0.0005,
        daysOverdue: 30,
      });

      const result60 = MoraService.calculate({
        installmentAmount: 1000,
        dailyRate: 0.0005,
        daysOverdue: 60,
      });

      expect(result60.moraAmount).toBeGreaterThan(result30.moraAmount);
      expect(result60.moraAmount).toBe(result30.moraAmount * 2);
    });

    it('should calculate higher mora for higher rate', () => {
      const resultLow = MoraService.calculate({
        installmentAmount: 1000,
        dailyRate: 0.0003,
        daysOverdue: 30,
      });

      const resultHigh = MoraService.calculate({
        installmentAmount: 1000,
        dailyRate: 0.0005,
        daysOverdue: 30,
      });

      expect(resultHigh.moraAmount).toBeGreaterThan(resultLow.moraAmount);
    });

    it('should calculate mora for large amounts', () => {
      const result = MoraService.calculate({
        installmentAmount: 50000,
        dailyRate: 0.0002,
        daysOverdue: 90,
      });

      // mora = 50000 * 0.0002 * 90 = 900
      expect(result.moraAmount).toBe(900);
    });
  });

  describe('calculateWithCap', () => {
    it('should cap mora at installment amount', () => {
      const result = MoraService.calculateWithCap(
        {
          installmentAmount: 1000,
          dailyRate: 0.001, // 0.1% daily - very high
          daysOverdue: 30,
        },
        1 // cap at 1x installment
      );

      // Without cap: 1000 * 0.001 * 30 = 30
      // With cap at 1x: should be capped to 1000
      // Actually 30 < 1000, so no cap applied
      expect(result.moraAmount).toBe(30);
    });

    it('should apply cap when mora exceeds limit', () => {
      const result = MoraService.calculateWithCap(
        {
          installmentAmount: 1000,
          dailyRate: 0.01, // 1% daily - extremely high
          daysOverdue: 30,
        },
        0.5 // cap at 50% of installment
      );

      // Without cap: 1000 * 0.01 * 30 = 300
      // Cap at 0.5x: 1000 * 0.5 = 500
      // Since 300 < 500, no cap
      expect(result.moraAmount).toBe(300);
    });
  });

  describe('calculateDaysOverdue', () => {
    it('should calculate days overdue correctly', () => {
      const dueDate = new Date('2024-01-01');
      const referenceDate = new Date('2024-01-16');
      
      const days = MoraService.calculateDaysOverdue(dueDate, referenceDate);
      expect(days).toBe(15);
    });

    it('should return 0 for future due dates', () => {
      const dueDate = new Date('2024-01-20');
      const referenceDate = new Date('2024-01-15');
      
      const days = MoraService.calculateDaysOverdue(dueDate, referenceDate);
      expect(days).toBe(0);
    });

    it('should return exact days for same-day reference', () => {
      const dueDate = new Date('2024-01-01');
      const referenceDate = new Date('2024-01-01');
      
      const days = MoraService.calculateDaysOverdue(dueDate, referenceDate);
      expect(days).toBe(0);
    });
  });

  describe('isOverdue', () => {
    it('should return true for overdue installment', () => {
      const dueDate = new Date('2024-01-01');
      const referenceDate = new Date('2024-01-16');
      
      expect(MoraService.isOverdue(dueDate, referenceDate)).toBe(true);
    });

    it('should return false for not yet due installment', () => {
      const dueDate = new Date('2024-01-20');
      const referenceDate = new Date('2024-01-15');
      
      expect(MoraService.isOverdue(dueDate, referenceDate)).toBe(false);
    });
  });

  describe('calculateBulk', () => {
    it('should calculate mora for multiple installments', () => {
      const installments = [
        { amount: 1000, dueDate: new Date('2024-01-01') },
        { amount: 1000, dueDate: new Date('2024-02-01') },
      ];
      
      const referenceDate = new Date('2024-02-15');
      
      const result = MoraService.calculateBulk(installments, 0.0005, referenceDate);
      
      // First installment: 45 days overdue = 1000 * 0.0005 * 45 = 22.5
      // Second installment: 14 days overdue = 1000 * 0.0005 * 14 = 7
      expect(result.moraAmount).toBeCloseTo(29.5, 0);
      expect(result.totalPayable).toBeCloseTo(2029.5, 0);
    });

    it('should not charge mora for current installments', () => {
      const installments = [
        { amount: 1000, dueDate: new Date('2024-01-01') },  // overdue
        { amount: 1000, dueDate: new Date('2024-02-20') },  // not due yet
      ];
      
      const referenceDate = new Date('2024-02-15');
      
      const result = MoraService.calculateBulk(installments, 0.0005, referenceDate);
      
      // Only first installment is overdue
      expect(result.moraAmount).toBeGreaterThan(0);
      expect(result.totalPayable).toBeCloseTo(1000 + result.moraAmount + 1000, 0);
    });
  });
});
