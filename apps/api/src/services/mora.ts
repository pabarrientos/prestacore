export interface MoraInput {
  installmentAmount: number;
  dailyRate: number;  // Daily mora rate (e.g., 0.0005 for 0.05% daily)
  daysOverdue: number;
}

export interface MoraResult {
  moraAmount: number;
  totalPayable: number;
  daysOverdue: number;
  appliedRate: number;
}

export class MoraService {
  /**
   * Calculate mora (late interest) for overdue installments
   * Formula: mora = installmentAmount * dailyRate * daysOverdue
   * 
   * @param input - installment amount, daily rate, days overdue
   * @returns mora calculation result
   */
  static calculate(input: MoraInput): MoraResult {
    const { installmentAmount, dailyRate, daysOverdue } = input;

    if (daysOverdue <= 0) {
      return {
        moraAmount: 0,
        totalPayable: installmentAmount,
        daysOverdue: 0,
        appliedRate: dailyRate,
      };
    }

    // Calculate mora: installment * daily_rate * days_overdue
    const moraAmount = Math.round(
      installmentAmount * dailyRate * daysOverdue * 100
    ) / 100;

    const totalPayable = installmentAmount + moraAmount;

    return {
      moraAmount,
      totalPayable,
      daysOverdue,
      appliedRate: dailyRate,
    };
  }

  /**
   * Calculate mora with monthly cap (commonly used in some jurisdictions)
   * Most systems cap mora at the installment amount or a percentage
   */
  static calculateWithCap(input: MoraInput, capMultiplier: number = 1): MoraResult {
    const result = this.calculate(input);
    
    const maxMora = input.installmentAmount * capMultiplier;
    
    if (result.moraAmount > maxMora) {
      return {
        moraAmount: maxMora,
        totalPayable: input.installmentAmount + maxMora,
        daysOverdue: result.daysOverdue,
        appliedRate: result.appliedRate,
      };
    }
    
    return result;
  }

  /**
   * Calculate days overdue from due date
   */
  static calculateDaysOverdue(dueDate: Date, referenceDate: Date = new Date()): number {
    const diffTime = referenceDate.getTime() - dueDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  }

  /**
   * Check if an installment is overdue
   */
  static isOverdue(dueDate: Date, referenceDate: Date = new Date()): boolean {
    return this.calculateDaysOverdue(dueDate, referenceDate) > 0;
  }

  /**
   * Calculate mora for multiple installments
   */
  static calculateBulk(
    installments: Array<{
      amount: number;
      dueDate: Date;
    }>,
    dailyRate: number,
    referenceDate: Date = new Date()
  ): MoraResult {
    let totalMora = 0;
    let totalPayable = 0;
    let maxDaysOverdue = 0;

    for (const inst of installments) {
      const daysOverdue = this.calculateDaysOverdue(inst.dueDate, referenceDate);
      
      if (daysOverdue > 0) {
        const result = this.calculate({
          installmentAmount: inst.amount,
          dailyRate,
          daysOverdue,
        });
        
        totalMora += result.moraAmount;
        totalPayable += result.totalPayable;
        maxDaysOverdue = Math.max(maxDaysOverdue, daysOverdue);
      } else {
        totalPayable += inst.amount;
      }
    }

    return {
      moraAmount: Math.round(totalMora * 100) / 100,
      totalPayable: Math.round(totalPayable * 100) / 100,
      daysOverdue: maxDaysOverdue,
      appliedRate: dailyRate,
    };
  }
}

export default MoraService;
