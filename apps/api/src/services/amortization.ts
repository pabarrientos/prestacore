import { PaymentFrequency } from '@prisma/client';

export interface AmortizationInput {
  amount: number;        // Principal amount (P)
  interestRate: number;  // Annual interest rate (e.g., 0.15 for 15%)
  termMonths: number;    // Term in months (n)
  frequency: PaymentFrequency;
  startDate?: Date;
}

export interface AmortizationScheduleItem {
  number: number;
  dueDate: Date;
  amount: number;
  principal: number;
  interest: number;
  balance: number;
  capitalBalance: number;
}

export interface AmortizationResult {
  installmentAmount: number;
  totalInterest: number;
  totalPayment: number;
  schedule: AmortizationScheduleItem[];
}

export class AmortizationService {
  /**
   * Calculate French amortization (System of Equal Payments)
   * Formula: C = P * [r(1+r)^n] / [(1+r)^n - 1]
   * Where:
   * - C = Constant installment
   * - P = Principal
   * - r = Periodic interest rate
   * - n = Total number of payments
   */
  static calculate(input: AmortizationInput): AmortizationResult {
    const { amount, interestRate, termMonths, frequency, startDate = new Date() } = input;

    // Calculate number of payments per year based on frequency
    const paymentsPerYear = this.getPaymentsPerYear(frequency);
    const totalPayments = this.getTotalPayments(termMonths, frequency);
    
    // Calculate periodic interest rate
    const periodicRate = interestRate / paymentsPerYear;
    
    // Calculate installment amount using French formula
    let installmentAmount: number;
    
    if (periodicRate === 0) {
      // No interest - simple division
      installmentAmount = amount / totalPayments;
    } else {
      // French formula: C = P * [r(1+r)^n] / [(1+r)^n - 1]
      const factor = Math.pow(1 + periodicRate, totalPayments);
      installmentAmount = amount * (periodicRate * factor) / (factor - 1);
    }

    // Round to 2 decimal places
    installmentAmount = Math.round(installmentAmount * 100) / 100;
    
    // Generate payment schedule
    const schedule = this.generateSchedule(
      amount,
      installmentAmount,
      periodicRate,
      totalPayments,
      frequency,
      startDate
    );

    const totalPayment = installmentAmount * totalPayments;
    const totalInterest = totalPayment - amount;

    return {
      installmentAmount,
      totalInterest: Math.round(totalInterest * 100) / 100,
      totalPayment: Math.round(totalPayment * 100) / 100,
      schedule,
    };
  }

  /**
   * Generate the amortization schedule
   */
  private static generateSchedule(
    principal: number,
    installmentAmount: number,
    periodicRate: number,
    totalPayments: number,
    frequency: PaymentFrequency,
    startDate: Date
  ): AmortizationScheduleItem[] {
    const schedule: AmortizationScheduleItem[] = [];
    let balance = principal;
    let currentDate = new Date(startDate);

    for (let i = 1; i <= totalPayments; i++) {
      // Calculate interest for this period
      const interest = Math.round(balance * periodicRate * 100) / 100;
      
      // Calculate principal portion
      let principalPayment = installmentAmount - interest;
      
      // Adjust last payment for rounding
      if (i === totalPayments) {
        principalPayment = balance;
      }
      
      // Ensure we don't go negative
      principalPayment = Math.round(principalPayment * 100) / 100;
      balance = Math.round((balance - principalPayment) * 100) / 100;
      
      // Calculate due date
      const dueDate = this.addPeriod(currentDate, frequency, i);
      
      schedule.push({
        number: i,
        dueDate,
        amount: Math.round((principalPayment + interest) * 100) / 100,
        principal: principalPayment,
        interest,
        balance: Math.max(0, balance),
        capitalBalance: Math.max(0, balance),
      });
    }

    return schedule;
  }

  /**
   * Add period to date based on frequency
   */
  private static addPeriod(date: Date, frequency: PaymentFrequency, periods: number): Date {
    const result = new Date(date);
    
    switch (frequency) {
      case PaymentFrequency.WEEKLY:
        result.setDate(result.getDate() + periods * 7);
        break;
      case PaymentFrequency.BIWEEKLY:
        result.setDate(result.getDate() + periods * 14);
        break;
      case PaymentFrequency.MONTHLY:
        result.setMonth(result.getMonth() + periods);
        break;
    }
    
    return result;
  }

  /**
   * Get payments per year based on frequency
   */
  private static getPaymentsPerYear(frequency: PaymentFrequency): number {
    switch (frequency) {
      case PaymentFrequency.WEEKLY:
        return 52;
      case PaymentFrequency.BIWEEKLY:
        return 26;
      case PaymentFrequency.MONTHLY:
        return 12;
    }
  }

  /**
   * Get total number of payments based on term and frequency
   * The term is now treated as the actual number of periods (weeks/biweeks/months)
   */
  private static getTotalPayments(term: number, _frequency: PaymentFrequency): number {
    // term is now the actual number of payments (weeks for WEEKLY, biweeks for BIWEEKLY, months for MONTHLY)
    // _frequency kept for potential future use but currently not needed
    return term;
  }

  /**
   * Calculate remaining balance after certain payments
   */
  static calculateRemainingBalance(
    principal: number,
    installmentAmount: number,
    interestRate: number,
    paymentsMade: number,
    totalPayments: number
  ): number {
    if (paymentsMade >= totalPayments) {
      return 0;
    }

    const periodicRate = interestRate / 12;
    let balance = principal;

    for (let i = 0; i < paymentsMade; i++) {
      const interest = balance * periodicRate;
      const principalPayment = installmentAmount - interest;
      balance -= principalPayment;
    }

    return Math.max(0, Math.round(balance * 100) / 100);
  }
}

export default AmortizationService;
