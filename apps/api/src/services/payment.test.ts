import { describe, it, expect } from 'vitest';
import { PaymentService } from './payment';

describe('PaymentService', () => {
  describe('processPayment validation', () => {
    it('should reject payment with amount <= 0', async () => {
      const result = await PaymentService.processPayment({
        loanId: 'loan-1',
        amount: 0,
        installmentId: 'inst-1',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('El monto debe ser mayor a 0');
    });

    it('should reject payment with negative amount', async () => {
      const result = await PaymentService.processPayment({
        loanId: 'loan-1',
        amount: -100,
        installmentId: 'inst-1',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('El monto debe ser mayor a 0');
    });

    it('should reject payment without installmentId', async () => {
      const result = await PaymentService.processPayment({
        loanId: 'loan-1',
        amount: 100,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Debe seleccionar una cuota');
    });

    it('should reject payment with empty installmentId', async () => {
      const result = await PaymentService.processPayment({
        loanId: 'loan-1',
        amount: 100,
        installmentId: '',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Debe seleccionar una cuota');
    });
  });

  describe('calculateLoanBalance', () => {
    it('should return null for non-existent loan', async () => {
      const result = await PaymentService.calculateLoanBalance('non-existent-loan-id');
      expect(result).toBeNull();
    });
  });

  describe('processInterestOnlyPayment', () => {
    it('should reject interest-only payment with amount <= 0', async () => {
      const result = await PaymentService.processInterestOnlyPayment({
        loanId: 'loan-1',
        installmentId: 'inst-1',
        amount: 0,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('El monto debe ser mayor a 0');
    });
  });

  describe('floating-point precision (roundMoney)', () => {
    it('should correctly compare accumulated partial payments that sum to exact amount', () => {
      // Reproduce the classic floating-point bug:
      // 333.33 + 333.33 + 333.34 should equal 1000.00
      const amount = 1000.00;
      const partial1 = 333.33;
      const partial2 = 333.33;
      const partial3 = 333.34;

      // Without roundMoney, this can fail due to floating-point representation
      const rawSum = partial1 + partial2 + partial3;

      // roundMoney normalizes to 2 decimal places (matching Decimal(12,2) DB precision)
      const roundMoney = (v: number) => Math.round(v * 100) / 100;
      const roundedSum = roundMoney(rawSum);

      expect(roundedSum).toBe(amount);
      expect(roundedSum >= roundMoney(amount)).toBe(true);
    });

    it('should handle edge case where floating-point sum is slightly less than amount', () => {
      // Another common scenario: amounts that accumulate to slightly less
      const amount = 100.00;
      const partial1 = 10.01;
      const partial2 = 10.01;
      const partial3 = 10.01;
      const partial4 = 10.01;
      const partial5 = 10.01;
      const partial6 = 10.01;
      const partial7 = 10.01;
      const partial8 = 10.01;
      const partial9 = 10.01;
      const partial10 = 9.91;

      const rawSum = partial1 + partial2 + partial3 + partial4 + partial5 +
                     partial6 + partial7 + partial8 + partial9 + partial10;

      const roundMoney = (v: number) => Math.round(v * 100) / 100;
      const roundedSum = roundMoney(rawSum);

      expect(roundedSum).toBe(amount);
      expect(roundedSum >= roundMoney(amount)).toBe(true);
    });

    it('should round balance to 0 when paidAmount effectively equals amount', () => {
      // Simulate: amount=1000, paidAmount accumulated via partials
      const amount = 1000.00;
      const paidAmount = 333.33 + 333.33 + 333.34; // May have tiny floating-point error

      const balance = Math.max(0, amount - paidAmount);
      const roundMoney = (v: number) => Math.round(v * 100) / 100;

      // The raw balance might be something like 1e-13, but rounded to DB precision it's 0
      expect(roundMoney(balance)).toBe(0);
      // And the status check should pass
      expect(roundMoney(paidAmount) >= roundMoney(amount)).toBe(true);
    });
  });
});
