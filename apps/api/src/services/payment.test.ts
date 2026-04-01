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
});
