import {
  PrismaClient,
  LoanStatus,
  InstallmentStatus,
  PaymentStatus,
  PaymentMethod,
  PaymentFrequency,
  Loan,
} from '@prisma/client';
import { AmortizationService } from './amortization';
import { MoraService } from './mora';
import { getRate } from './settings';
import { getNow } from './datetime';

const prisma = new PrismaClient();

// ============================================
// Types for Refinancing
// ============================================

export interface CalculateNewCapitalResult {
  capitalPendiente: number;      // Capital balance of the first unpaid installment
  interesesVencidos: number;     // Dynamic mora (late fees) - calculated as in /admin/overdue
  pagosAtrasados: number;        // Sum of balances of OVERDUE installments (excluding mora)
  nuevoCapital: number;         // capitalPendiente + interesesVencidos + pagosAtrasados - pagoInicial
}

export interface CreateRefinancingInput {
  loanId: string;                 // The DEFAULTED loan to refinance
  newInterestRate: number;        // New interest rate (annual rate)
  newTermMonths: number;         // New term in months
  newFrequency: PaymentFrequency; // New payment frequency
  startDate?: Date;              // Optional start date for new loan
  notes?: string;                // Optional notes
  capitalExtra?: number;        // Extra payment from customer to reduce new loan amount
  interesesVencidosManual?: number; // Manual override for interesesVencidos
}

export interface ExecuteRefinancingResult {
  success: boolean;
  newLoan?: Loan;
  oldLoan?: Loan;
  error?: string;
}

// ============================================
// RefinancingService
// ============================================

export class RefinancingService {
  /**
   * Calculate the new capital for refinancing
   * Formula: capitalPendiente + interesesVencidos + pagosAtrasados - pagoInicial
   * 
   * - capitalPendiente: capitalBalance of the first unpaid installment in the schedule
   * - interesesVencidos: dynamic mora (late fees) calculated like /admin/overdue
   * - pagosAtrasados: sum of balances of OVERDUE installments (excluding mora)
   * - nuevoCapital: will be calculated in execute with pagoInicial
   */
  static async calculateNewCapital(loanId: string): Promise<CalculateNewCapitalResult | null> {
    const loan = await prisma.loan.findUnique({
      where: { id: loanId },
      include: {
        installments: {
          orderBy: { dueDate: 'asc' },
        },
      },
    });

    if (!loan || loan.installments.length === 0) {
      return null;
    }

    // Get the daily mora rate from settings
    const dailyRate = await getRate('MORA_RATE');
    const now = await getNow();

    // Find the first unpaid installment (not PAID, ordered by dueDate)
    const firstUnpaidInstallment = loan.installments.find(
      (inst) => inst.status !== InstallmentStatus.PAID
    );

    // capitalPendiente: calculate same as frontend (loan.amount - sum of principal paid so far)
    // For the first unpaid installment: loan.amount - sum(principal of all previous installments)
    let capitalPendiente = 0;
    if (firstUnpaidInstallment) {
      // Find the index of the first unpaid installment
      const firstUnpaidIndex = loan.installments.findIndex(
        (inst) => inst.id === firstUnpaidInstallment.id
      );
      
      // Sum of principal of all installments BEFORE the first unpaid
      const totalPrincipalPaid = loan.installments
        .slice(0, firstUnpaidIndex)
        .reduce((sum, inst) => sum + Number(inst.principal), 0);
      
      // capitalBalance = loan amount - principal paid so far
      capitalPendiente = Number(loan.amount) - totalPrincipalPaid;
    }

    // Get all overdue installments (not PAID, dueDate < now)
    const overdueInstallments = loan.installments.filter(
      (inst) => inst.status !== InstallmentStatus.PAID && new Date(inst.dueDate) < now
    );

    // Calculate dynamic mora for each overdue installment (like /admin/overdue)
    let interesesVencidos = 0;
    for (const inst of overdueInstallments) {
      const daysOverdue = MoraService.calculateDaysOverdue(inst.dueDate, now);
      if (daysOverdue > 0) {
        const moraResult = MoraService.calculate({
          installmentAmount: Number(inst.balance),
          dailyRate,
          daysOverdue,
        });
        interesesVencidos += moraResult.moraAmount;
      }
    }

    // pagosAtrasados: sum of balances of OVERDUE installments (excluding mora)
    const pagosAtrasados = overdueInstallments.reduce((sum, inst) => {
      return sum + Number(inst.balance);
    }, 0);

    // nuevoCapital is calculated at execution time with pagoInicial
    // For preview, we return the base amount without pagoInicial
    const nuevoCapital = Math.max(0, capitalPendiente + interesesVencidos + pagosAtrasados);

    return {
      capitalPendiente: Math.round(capitalPendiente * 100) / 100,
      interesesVencidos: Math.round(interesesVencidos * 100) / 100,
      pagosAtrasados: Math.round(pagosAtrasados * 100) / 100,
      nuevoCapital: Math.round(nuevoCapital * 100) / 100,
    };
  }

  /**
   * Calculate overdue interest (simplified - just sum of original interest from overdue installments)
   * Does NOT include mora (late fees)
   */
  static async calculateOverdueInterest(loanId: string): Promise<number | null> {
    const loan = await prisma.loan.findUnique({
      where: { id: loanId },
      include: {
        installments: {
          where: {
            status: InstallmentStatus.OVERDUE,
          },
        },
      },
    });

    if (!loan) {
      return null;
    }

    // Sum original interest from overdue installments
    const totalInterest = loan.installments.reduce(
      (sum, inst) => sum + Number(inst.interest),
      0
    );

    return Math.round(totalInterest * 100) / 100;
  }

  /**
    * Validate that a loan can be refinanced
    * Allowed: DEFAULTED or ACTIVE loans with overdue installments
    * Rule: No installment can be partially paid (balance must equal full amount)
    */
  static async validateRefinancingEligibility(loanId: string): Promise<{
    eligible: boolean;
    error?: string;
  }> {
    const loan = await prisma.loan.findUnique({
      where: { id: loanId },
      include: {
        installments: {
          where: {
            status: { in: [InstallmentStatus.OVERDUE, InstallmentStatus.PENDING, InstallmentStatus.PARTIAL] },
          },
        },
      },
    });

    if (!loan) {
      return { eligible: false, error: 'Préstamo no encontrado' };
    }

    // Check for partially paid installments - cannot refinance if any is partially paid
    const partiallyPaidInstallments = loan.installments.filter(
      inst => inst.status === InstallmentStatus.PARTIAL || 
              (inst.status === InstallmentStatus.PENDING && Number(inst.balance) !== Number(inst.amount))
    );

    if (partiallyPaidInstallments.length > 0) {
      return {
        eligible: false,
        error: `No se puede refinanciar: el préstamo tiene ${partiallyPaidInstallments.length} cuota(s) parcialmente pagada(s). Complete los pagos antes de refinanciar.`,
      };
    }

    // Allow DEFAULTED or ACTIVE with overdue installments
    const now = await getNow();
    const hasOverdueInstallments = loan.installments.some(inst => {
      const dueDate = new Date(inst.dueDate);
      return dueDate < now && inst.status !== InstallmentStatus.PAID;
    });
    
    if (loan.status === LoanStatus.DEFAULTED) {
      return { eligible: true };
    }
    
    if (loan.status === LoanStatus.ACTIVE && hasOverdueInstallments) {
      return { eligible: true };
    }

    return {
      eligible: false,
      error: `Para refinanciar el préstamo debe estar en DEFAULTED o tener cuotas vencidas. Estado actual: ${loan.status}`,
    };
  }

  /**
   * Execute the refinancing transaction
   * 
   * Steps in transaction:
   * 1. Mark old loan as REFINANCIADO
   * 2. Create all internal payments for each installment (MOVIMIENTO_REFINANCIACION)
   * 3. Mark all installments as CANCELADA_POR_REFINANCIACION
   * 4. Create new loan with calculated capital
   * 5. Link: new.prestamo_origen_id = old.id, old.prestamo_refinanciado_id = new.id
   */
  static async executeRefinancing(input: CreateRefinancingInput): Promise<ExecuteRefinancingResult> {
    const { loanId, newInterestRate, newTermMonths, newFrequency, startDate, notes, capitalExtra, interesesVencidosManual } = input;

    try {
      // Validate eligibility first
      const validation = await this.validateRefinancingEligibility(loanId);
      if (!validation.eligible) {
        return { success: false, error: validation.error };
      }

      // Calculate new capital
      const calculation = await this.calculateNewCapital(loanId);
      if (!calculation) {
        return { success: false, error: 'Error al calcular el nuevo capital' };
      }

      // Use manual override if provided, otherwise use calculated value
      const effectiveInteresesVencidos = interesesVencidosManual !== undefined 
        ? interesesVencidosManual 
        : calculation.interesesVencidos;

      // Adjust nuevoCapital with capitalExtra and manual interesesVencidos
      const adjustedNuevoCapital = Math.max(0, 
        calculation.capitalPendiente + effectiveInteresesVencidos + calculation.pagosAtrasados - (capitalExtra || 0)
      );

      if (adjustedNuevoCapital <= 0 && (!capitalExtra || capitalExtra <= 0)) {
        return { success: false, error: 'El capital a refinanciar debe ser mayor a 0' };
      }

      // Get old loan with all data
      const oldLoan = await prisma.loan.findUnique({
        where: { id: loanId },
        include: {
          client: true,
          installments: true,
        },
      });

      if (!oldLoan) {
        return { success: false, error: 'Préstamo no encontrado' };
      }

      // Idempotency check: prevent double execution
      if (oldLoan.status === LoanStatus.REFINANCIADO) {
        return { success: false, error: 'El préstamo ya ha sido refinanciado anteriormente' };
      }
      if (oldLoan.status === LoanStatus.PAID) {
        return { success: false, error: 'El préstamo ya está cancelado' };
      }

      const loanStartDate = startDate || new Date();

      // Execute atomic transaction
      const result = await prisma.$transaction(async (tx) => {
        // Step 1: Mark old loan as REFINANCIADO
        const updatedOldLoan = await tx.loan.update({
          where: { id: loanId },
          data: {
            status: LoanStatus.REFINANCIADO,
          },
        });

        // Step 2: Mark all installments as CANCELADA_POR_REFINANCIACION (no payments created per installment)
        for (const inst of oldLoan.installments) {
          // Mark installment as cancelled
          await tx.installment.update({
            where: { id: inst.id },
            data: {
              status: InstallmentStatus.CANCELADA_POR_REFINANCIACION,
            },
          });
        }

        // Step 2b: If capitalExtra provided, record it as a regular payment on the old loan
        if (capitalExtra && capitalExtra > 0) {
          await tx.payment.create({
            data: {
              clientId: oldLoan.clientId,
              loanId: loanId,
              amount: capitalExtra,
              type: 'MANUAL',
              method: PaymentMethod.EFECTIVO,
              status: PaymentStatus.COMPLETED,
              notes: `Pago excepcional por refinanciación - reduce nuevo capital`,
              processedAt: new Date(),
            },
          });
        }

        // Step 4: Create new loan with calculated capital
        // Calculate amortization for the new loan
        // newInterestRate is annual percentage (e.g., 36), convert to decimal (0.36)
        const annualRateDecimal = newInterestRate / 100;
        
        const amortization = AmortizationService.calculate({
          amount: adjustedNuevoCapital,
          interestRate: annualRateDecimal,
          termMonths: newTermMonths,
          frequency: newFrequency,
          startDate: loanStartDate,
        });

        // Create the new loan
        const newLoan = await tx.loan.create({
          data: {
            clientId: oldLoan.clientId,
            assignedVendorId: oldLoan.assignedVendorId,
            amount: adjustedNuevoCapital,
            interestRate: newInterestRate, // Store as percentage (e.g., 36)
            termMonths: newTermMonths,
            frequency: newFrequency,
            status: LoanStatus.ACTIVE,
            purpose: `Refinanciación del préstamo ${loanId.substring(0, 8)}...`,
            notes: notes || `Refinanciación de préstamo original ID: ${loanId}`,
            approvedAt: new Date(),
            startedAt: loanStartDate,  // Use the start date from the form
            // Refinancing link
            prestamo_origen_id: loanId,
            // Calculated fields
            totalInterest: amortization.totalInterest,
            totalPayment: amortization.totalPayment,
            installmentAmount: amortization.installmentAmount,
          },
        });

        // Step 5: Create installments for the new loan
        for (const scheduleItem of amortization.schedule) {
          // balance = amount (pending payment = full amount since no payments made yet)
          await tx.installment.create({
            data: {
              loanId: newLoan.id,
              installmentNumber: scheduleItem.number,
              dueDate: scheduleItem.dueDate,
              amount: scheduleItem.amount,
              principal: scheduleItem.principal,
              interest: scheduleItem.interest,
              balance: scheduleItem.amount,  // Full amount pending (no payments made)
              capitalBalance: scheduleItem.capitalBalance,
              status: InstallmentStatus.PENDING,
            },
          });
        }

        // Update old loan with reference to new loan using prestamo_nuevo_id
        await tx.loan.update({
          where: { id: loanId },
          data: {
            prestamo_nuevo_id: newLoan.id,
          },
        });

        return {
          oldLoan: updatedOldLoan,
          newLoan,
        };
      });

      return {
        success: true,
        oldLoan: result.oldLoan,
        newLoan: result.newLoan,
      };

    } catch (error) {
      console.error('Refinancing execution error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Error al ejecutar la refinanciación',
      };
    }
  }

  /**
   * Get refinancing details (preview before executing)
   */
  static async getRefinancingPreview(loanId: string): Promise<{
    loanId: string;
    loanStatus: LoanStatus;
    eligible: boolean;
    calculation?: CalculateNewCapitalResult;
    error?: string;
  } | null> {
    const loan = await prisma.loan.findUnique({
      where: { id: loanId },
      select: {
        id: true,
        status: true,
      },
    });

    if (!loan) {
      return null;
    }

    const validation = await this.validateRefinancingEligibility(loanId);
    const calculation = await this.calculateNewCapital(loanId);

    return {
      loanId: loan.id,
      loanStatus: loan.status,
      eligible: validation.eligible,
      calculation: validation.eligible ? calculation || undefined : undefined,
      error: !validation.eligible ? validation.error : undefined,
    };
  }
}

export default RefinancingService;