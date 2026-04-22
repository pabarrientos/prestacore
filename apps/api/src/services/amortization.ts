import { PaymentFrequency } from '@prisma/client';

// Define enum locally - use Prisma.AmortizationSystemType when available
// This avoids module resolution issues in test environment
export const AmortizationSystemType = {
  FRENCH: 'FRENCH',
  GERMAN: 'GERMAN',
  FLAT_RATE: 'FLAT_RATE',
} as const;
export type AmortizationSystemType = (typeof AmortizationSystemType)[keyof typeof AmortizationSystemType];

export interface AmortizationInput {
  amount: number;         // Principal amount (P)
  interestRate: number;   // Annual interest rate (e.g., 0.15 for 15%)
  termMonths: number;     // Term in months (n)
  frequency: PaymentFrequency;
  startDate?: Date;
  amortizationSystem?: AmortizationSystemType;  // Optional: defaults to FRENCH
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
  amortizationSystem: AmortizationSystemType;
  annualRate: number;
  installmentAmount: number;
  totalInterest: number;
  totalPayment: number;
  schedule: AmortizationScheduleItem[];
}

export class AmortizationService {
  /**
   * Main entry point for amortization calculation
   * Dispatches to the appropriate calculation method based on the system type
   */
  static calculate(input: AmortizationInput): AmortizationResult {
    const { amount, interestRate, termMonths, frequency, startDate = new Date() } = input;
    
    // Default to FRENCH if not specified
    const system = input.amortizationSystem ?? AmortizationSystemType.FRENCH;
    
    // Calculate number of payments per year based on frequency
    const paymentsPerYear = this.getPaymentsPerYear(frequency);
    const totalPayments = this.getTotalPayments(termMonths, frequency);
    
    // Calculate periodic interest rate
    const periodicRate = interestRate / paymentsPerYear;

    // Get the result from the appropriate calculation method
    let result: AmortizationResult;
    switch (system) {
      case AmortizationSystemType.FRENCH:
        result = this.calculateFrench(amount, periodicRate, totalPayments, frequency, startDate);
        break;
      case AmortizationSystemType.GERMAN:
        result = this.calculateGerman(amount, periodicRate, totalPayments, frequency, startDate);
        break;
      case AmortizationSystemType.FLAT_RATE:
        result = this.calculateFlatRate(amount, periodicRate, totalPayments, frequency, startDate);
        break;
      default:
        // Fallback to French for unknown systems
        result = this.calculateFrench(amount, periodicRate, totalPayments, frequency, startDate);
    }
    
    // Add common fields (use annualRate as percentage, e.g., 36 for 36%)
    result.annualRate = Math.round(interestRate * 10000) / 10000;
    
    // Return result with amortizationSystem for frontend compatibility
    return result;
  }

  /**
   * Calculate French amortization (System of Equal Payments)
   * Formula: C = P * [r(1+r)^n] / [(1+r)^n - 1]
   * Where:
   * - C = Constant installment
   * - P = Principal
   * - r = Periodic interest rate
   * - n = Total number of payments
   */
  private static calculateFrench(
    principal: number,
    periodicRate: number,
    totalPayments: number,
    frequency: PaymentFrequency,
    startDate: Date
  ): AmortizationResult {
    // Calculate installment amount using French formula
    let installmentAmount: number;
    
    if (periodicRate === 0) {
      // No interest - simple division
      installmentAmount = principal / totalPayments;
    } else {
      // French formula: C = P * [r(1+r)^n] / [(1+r)^n - 1]
      const factor = Math.pow(1 + periodicRate, totalPayments);
      installmentAmount = principal * (periodicRate * factor) / (factor - 1);
    }

    // Round to 2 decimal places
    installmentAmount = Math.round(installmentAmount * 100) / 100;
    
    // Generate payment schedule (French-style: interest on remaining balance)
    const schedule = this.generateScheduleWithInterestOnBalance(
      principal,
      installmentAmount,
      periodicRate,
      totalPayments,
      frequency,
      startDate
    );

    const totalPayment = installmentAmount * totalPayments;
    const totalInterest = totalPayment - principal;

    return {
      amortizationSystem: AmortizationSystemType.FRENCH,
      annualRate: 0, // Will be set by caller
      installmentAmount,
      totalInterest: Math.round(totalInterest * 100) / 100,
      totalPayment: Math.round(totalPayment * 100) / 100,
      schedule,
    };
  }

  /**
   * Calculate German amortization (System of Constant Principal)
   * - Principal payment = P / n (constant each period)
   * - Interest = remaining balance * r (decreasing)
   * - Total payment decreases each period
   */
  private static calculateGerman(
    principal: number,
    periodicRate: number,
    totalPayments: number,
    frequency: PaymentFrequency,
    startDate: Date
  ): AmortizationResult {
    // Constant principal payment = P / n
    const principalPayment = Math.round((principal / totalPayments) * 100) / 100;
    
    // Generate schedule
    const schedule = this.generateGermanSchedule(
      principal,
      principalPayment,
      periodicRate,
      totalPayments,
      frequency,
      startDate
    );

    // Calculate totals
    let totalPayment = 0;
    let totalInterest = 0;
    for (const row of schedule) {
      totalPayment += row.amount;
      totalInterest += row.interest;
    }

    // First payment amount is what client pays
    const firstPayment = schedule.length > 0 ? schedule[0].amount : principal;

    return {
      amortizationSystem: AmortizationSystemType.GERMAN,
      annualRate: 0, // Will be set by caller
      installmentAmount: firstPayment,
      totalInterest: Math.round(totalInterest * 100) / 100,
      totalPayment: Math.round(totalPayment * 100) / 100,
      schedule,
    };
  }

  /**
   * Calculate Flat Rate amortization (System of Fixed Interest)
   * - Interest = P * r (constant, calculated on original principal)
   * - Principal = P / n (constant)
   * - Total payment remains constant throughout
   */
  private static calculateFlatRate(
    principal: number,
    periodicRate: number,
    totalPayments: number,
    frequency: PaymentFrequency,
    startDate: Date
  ): AmortizationResult {
    // Generate schedule
    const schedule = this.generateFlatRateSchedule(
      principal,
      periodicRate,
      totalPayments,
      frequency,
      startDate
    );

    // Calculate totals
    let totalPayment = 0;
    let totalInterest = 0;
    for (const row of schedule) {
      totalPayment += row.amount;
      totalInterest += row.interest;
    }

    // First payment amount
    const firstPayment = schedule.length > 0 ? schedule[0].amount : principal;

    return {
      amortizationSystem: AmortizationSystemType.FLAT_RATE,
      annualRate: 0, // Will be set by caller
      installmentAmount: firstPayment,
      totalInterest: Math.round(totalInterest * 100) / 100,
      totalPayment: Math.round(totalPayment * 100) / 100,
      schedule,
    };
  }

  /**
   * Generate schedule with interest calculated on remaining balance (French)
   */
  private static generateScheduleWithInterestOnBalance(
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
      // Interest calculated on remaining balance
      const interest = Math.round(balance * periodicRate * 100) / 100;
      
      // Principal portion
      let principalPayment = installmentAmount - interest;
      
      // Adjust last payment for rounding
      if (i === totalPayments) {
        principalPayment = balance;
      }
      
      principalPayment = Math.round(principalPayment * 100) / 100;
      balance = Math.round((balance - principalPayment) * 100) / 100;
      
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
   * Generate German schedule (constant principal, decreasing interest)
   */
  private static generateGermanSchedule(
    principal: number,
    principalPayment: number,
    periodicRate: number,
    totalPayments: number,
    frequency: PaymentFrequency,
    startDate: Date
  ): AmortizationScheduleItem[] {
    const schedule: AmortizationScheduleItem[] = [];
    let balance = principal;
    let currentDate = new Date(startDate);

    for (let i = 1; i <= totalPayments; i++) {
      // Interest on remaining balance
      const interest = Math.round(balance * periodicRate * 100) / 100;
      
      // Adjust last principal payment for rounding
      let actualPrincipalPayment = principalPayment;
      if (i === totalPayments) {
        actualPrincipalPayment = balance;
      }
      actualPrincipalPayment = Math.round(actualPrincipalPayment * 100) / 100;
      
      balance = Math.round((balance - actualPrincipalPayment) * 100) / 100;
      
      const dueDate = this.addPeriod(currentDate, frequency, i);
      
      schedule.push({
        number: i,
        dueDate,
        amount: Math.round((actualPrincipalPayment + interest) * 100) / 100,
        principal: actualPrincipalPayment,
        interest,
        balance: Math.max(0, balance),
        capitalBalance: Math.max(0, balance),
      });
    }

    return schedule;
  }

  /**
   * Generate Flat Rate schedule (interest on original principal)
   */
  private static generateFlatRateSchedule(
    principal: number,
    periodicRate: number,
    totalPayments: number,
    frequency: PaymentFrequency,
    startDate: Date
  ): AmortizationScheduleItem[] {
    const schedule: AmortizationScheduleItem[] = [];
    let balance = principal;
    let currentDate = new Date(startDate);

    // Interest is constant - calculated on original principal
    const interestPayment = Math.round(principal * periodicRate * 100) / 100;
    // Principal is constant
    const principalPayment = Math.round((principal / totalPayments) * 100) / 100;

    for (let i = 1; i <= totalPayments; i++) {
      // Adjust last principal payment for rounding
      let actualPrincipalPayment = principalPayment;
      if (i === totalPayments) {
        actualPrincipalPayment = balance;
      }
      actualPrincipalPayment = Math.round(actualPrincipalPayment * 100) / 100;
      
      balance = Math.round((balance - actualPrincipalPayment) * 100) / 100;
      
      const dueDate = this.addPeriod(currentDate, frequency, i);
      
      schedule.push({
        number: i,
        dueDate,
        amount: Math.round((actualPrincipalPayment + interestPayment) * 100) / 100,
        principal: actualPrincipalPayment,
        interest: interestPayment,
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
      case PaymentFrequency.DAILY:
        result.setDate(result.getDate() + periods);
        break;
      default:
        // Fallback: treat as daily (handles cases where enum not fully loaded)
        result.setDate(result.getDate() + periods);
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
      case PaymentFrequency.DAILY:
        return 365;
    }
  }

  /**
   * Get total number of payments based on term and frequency
   * The term is now treated as the actual number of periods (weeks/biweeks/months)
   */
  private static getTotalPayments(term: number, _frequency: PaymentFrequency): number {
    return term;
  }

  /**
   * Calculate remaining balance after certain payments (uses French system for backward compatibility)
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
