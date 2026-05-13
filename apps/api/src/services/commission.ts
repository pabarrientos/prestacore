import { PrismaClient, CommissionMode, LoanStatus, InstallmentStatus } from '@prisma/client';

const prisma = new PrismaClient();

// Strategy interface for commission calculation
export interface CommissionStrategy {
  calculateInstallmentCommission(
    installment: {
      interest: number;
      paidAmount: number;
      amount: number;
      number: number;
    },
    totalInstallments: number,
    percentage: number,
    capitalRecoveredSoFar: number,
    totalPrincipal: number
  ): {
    commission: number;
    newCapitalRecovered: number;
  };
}

// Proportional Strategy: commission = interest_collected × percentage
// interest_collected = interest × min(paidAmount/amount, 1)
export class ProportionalStrategy implements CommissionStrategy {
  calculateInstallmentCommission(
    installment: { interest: number; paidAmount: number; amount: number; number: number },
    _totalInstallments: number,
    percentage: number,
    capitalRecoveredSoFar: number,
    _totalPrincipal: number
  ): { commission: number; newCapitalRecovered: number } {
    const interestCollected = installment.interest * Math.min(installment.paidAmount / installment.amount, 1);
    const commission = Math.round(interestCollected * (percentage / 100) * 100) / 100;
    const principalPaid = Math.min(installment.paidAmount, installment.amount) - interestCollected;
    
    return {
      commission,
      newCapitalRecovered: capitalRecoveredSoFar + principalPaid,
    };
  }
}

// After Capital Recovery Strategy: commission only after total capital recovered
// Returns 0 until capitalRecoveredSoFar >= totalPrincipal
export class AfterCapitalRecoveryStrategy implements CommissionStrategy {
  calculateInstallmentCommission(
    installment: { interest: number; paidAmount: number; amount: number; number: number },
    _totalInstallments: number,
    percentage: number,
    capitalRecoveredSoFar: number,
    totalPrincipal: number
  ): { commission: number; newCapitalRecovered: number } {
    const principalPaid = Math.min(installment.paidAmount, installment.amount) - 
      (installment.interest * Math.min(installment.paidAmount / installment.amount, 1));
    const newCapitalRecovered = capitalRecoveredSoFar + principalPaid;
    
    let commission = 0;
    if (capitalRecoveredSoFar >= totalPrincipal) {
      // Capital already recovered, calculate proportional commission
      const interestCollected = installment.interest * Math.min(installment.paidAmount / installment.amount, 1);
      commission = Math.round(interestCollected * (percentage / 100) * 100) / 100;
    }
    
    return {
      commission,
      newCapitalRecovered: Math.round(newCapitalRecovered * 100) / 100,
    };
  }
}

// Advanced Strategy: linear decay weight on commission
// weight = 1 - (i-1)/(n-1), early installments weighted more
export class AdvancedStrategy implements CommissionStrategy {
  calculateInstallmentCommission(
    installment: { interest: number; paidAmount: number; amount: number; number: number },
    _totalInstallments: number,
    percentage: number,
    capitalRecoveredSoFar: number,
    _totalPrincipal: number
  ): { commission: number; newCapitalRecovered: number } {
    // ADVANCED mode: full commission is considered generated from loan start.
    // Commission is calculated on total projected interest, independent of collection progress.
    const commission = Math.round(installment.interest * (percentage / 100) * 100) / 100;
    
    return {
      commission,
      newCapitalRecovered: capitalRecoveredSoFar,
    };
  }
}

// Strategy factory
export function getStrategy(mode: CommissionMode): CommissionStrategy {
  switch (mode) {
    case CommissionMode.AFTER_CAPITAL_RECOVERY:
      return new AfterCapitalRecoveryStrategy();
    case CommissionMode.ADVANCED:
      return new AdvancedStrategy();
    case CommissionMode.PROPORTIONAL:
    default:
      return new ProportionalStrategy();
  }
}

export interface LoanWithInstallments {
  id: string;
  assignedVendorId: string | null;
  commissionPercentage: number | null;
  commissionMode: CommissionMode | null;
  status: LoanStatus;
  amount: number;
  installments: Array<{
    interest: number;
    paidAmount: number;
    amount: number;
    number: number;
    status: InstallmentStatus;
    principal: number;
  }>;
}

export class CommissionService {
  /**
   * Project commission at loan creation time
   * Uses total interest from amortization to estimate commission
   */
  static projectCommission(
    principal: number,
    _annualInterestRate: number,
    termMonths: number,
    commissionPercentage: number,
    mode: CommissionMode,
    installmentAmount: number
  ): number {
    // Calculate total interest based on the loan terms
    // For simplicity, we use a simplified calculation
    // totalPayment = installmentAmount × termMonths
    // totalInterest = totalPayment - principal
    const totalPayment = installmentAmount * termMonths;
    const totalInterest = totalPayment - principal;
    
    if (totalInterest <= 0) {
      return 0;
    }
    
    const percentage = commissionPercentage / 100;
    
    switch (mode) {
      case CommissionMode.PROPORTIONAL:
        // Projected = totalInterest × percentage
        return Math.round(totalInterest * percentage * 100) / 100;
        
      case CommissionMode.AFTER_CAPITAL_RECOVERY:
        // For projection, assume capital will be recovered evenly
        // Commission only on interest after capital is recovered
        // Simplified: use proportional as approximation
        return Math.round(totalInterest * percentage * 100) / 100;
        
      case CommissionMode.ADVANCED:
        // For ADVANCED, projected = totalInterest × percentage
        // (actual distribution happens during recalculation)
        return Math.round(totalInterest * percentage * 100) / 100;
        
      default:
        return Math.round(totalInterest * percentage * 100) / 100;
    }
  }

  /**
   * Recalculate commission for a loan
   * Fetches loan with installments, calculates commission based on mode
   * Idempotent: always recalculates from scratch using current installment states
   */
  static async recalculateLoan(loanId: string): Promise<number | null> {
    const loan = await prisma.loan.findUnique({
      where: { id: loanId },
      include: {
        installments: {
          orderBy: { installmentNumber: 'asc' },
        },
      },
    }) as LoanWithInstallments | null;
    
    if (!loan) {
      return null;
    }
    
    // Skip if no seller assigned or no commission percentage set
    if (!loan.assignedVendorId || loan.commissionPercentage === null) {
      return null;
    }
    
    // Skip for inactive or paid loans
    if (loan.status === LoanStatus.PAID || loan.status === LoanStatus.CANCELLED) {
      return null;
    }
    
    const mode = loan.commissionMode ?? CommissionMode.PROPORTIONAL;
    const percentage = loan.commissionPercentage;
    const strategy = getStrategy(mode);
    
    // Get only paid or partially paid installments for commission calculation
    const activeInstallments = loan.installments.filter(
      (inst) => inst.status !== InstallmentStatus.PENDING
    );
    
    if (activeInstallments.length === 0) {
      // No payments made yet, commission is 0
      await prisma.loan.update({
        where: { id: loanId },
        data: { commissionGenerated: 0 },
      });
      return 0;
    }
    
    // Calculate commission using strategy
    let totalCommission = 0;
    let capitalRecoveredSoFar = 0;
    const totalPrincipal = Number(loan.amount);
    
    for (const installment of activeInstallments) {
      const result = strategy.calculateInstallmentCommission(
        {
          interest: Number(installment.interest),
          paidAmount: Number(installment.paidAmount),
          amount: Number(installment.amount),
          number: installment.number,
        },
        loan.installments.length,
        percentage,
        capitalRecoveredSoFar,
        totalPrincipal
      );
      
      totalCommission += result.commission;
      capitalRecoveredSoFar = result.newCapitalRecovered;
    }
    
    // Round to 2 decimal places
    totalCommission = Math.round(totalCommission * 100) / 100;
    
    // Calculate projected commission (based on ALL installments, not just paid ones)
    const totalInterest = loan.installments.reduce(
      (sum, inst) => sum + Number(inst.interest), 0
    );
    const projectedCommission = Math.round(totalInterest * (percentage / 100) * 100) / 100;
    
    // ADVANCED mode: full commission is generated from start, equal to projected
    if (mode === CommissionMode.ADVANCED) {
      totalCommission = projectedCommission;
    }
    
    // Update loan with calculated commission
    await prisma.loan.update({
      where: { id: loanId },
      data: { 
        commissionGenerated: totalCommission,
        commissionProjected: projectedCommission,
      },
    });
    
    return totalCommission;
  }

  /**
   * Recalculate commissions for all loans of a vendor
   */
  static async recalculateVendorLoans(vendorId: string): Promise<number> {
    const loans = await prisma.loan.findMany({
      where: {
        assignedVendorId: vendorId,
        status: { in: [LoanStatus.ACTIVE, LoanStatus.PENDING, LoanStatus.DEFAULTED] },
      },
    });
    
    let updatedCount = 0;
    for (const loan of loans) {
      const result = await CommissionService.recalculateLoan(loan.id);
      if (result !== null) {
        updatedCount++;
      }
    }
    
    return updatedCount;
  }
}

export default CommissionService;
