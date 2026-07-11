import {
  PrismaClient,
  LoanStatus,
  InstallmentStatus,
  PaymentStatus,
  PaymentMethod,
  Loan,
  Payment,
} from '@prisma/client';
import { MoraService } from './mora';
import { getRate } from './settings';
import { getToday } from './datetime';

const prisma = new PrismaClient();

// ============================================
// Types for Cancelación Anticipada
// ============================================

export interface DebtBreakdown {
  capitalPendiente: number;      // Capital balance of the first unpaid installment
  interesesVencidos: number;      // Dynamic mora (late fees) - calculated as in /admin/overdue
  pagosAtrasados: number;        // Sum of balances of OVERDUE installments (excluding mora)
  totalCancelar: number;         // capitalPendiente + interesesVencidos + pagosAtrasados
}

export interface ExecuteCancellationResult {
  success: boolean;
  loan?: Loan;
  paymentMora?: Payment | null;
  payment?: Payment;
  error?: string;
}

// ============================================
// CancelacionAnticipadaService
// ============================================

export class CancelacionAnticipadaService {
  /**
   * Calculate the debt breakdown for early cancellation
   * Formula: capitalPendiente + interesesVencidos + pagosAtrasados = totalCancelar
   * 
   * - capitalPendiente: capitalBalance of the first unpaid installment in the schedule
   * - interesesVencidos: dynamic mora (late fees) calculated like /admin/overdue
   * - pagosAtrasados: sum of balances of OVERDUE installments (excluding mora)
   * - totalCancelar: sum of all the above
   */
  static async calculateDebtBreakdown(loanId: string, referenceDate?: Date): Promise<DebtBreakdown | null> {
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

    // Get the daily mora rate from settings and reference date (date-only)
    const dailyRate = await getRate('MORA_RATE');
    const todayOnly = referenceDate
      ? new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate())
      : await getToday();

    // Find the first unpaid installment (not PAID, not INTEREST_ONLY, ordered by dueDate)
    const firstUnpaidInstallment = loan.installments.find(
      (inst) => inst.status !== InstallmentStatus.PAID && inst.status !== InstallmentStatus.INTEREST_ONLY
    );

    // capitalPendiente: calculate same as refinancing (loan.amount - sum of principal paid so far)
    // For the first unpaid installment: loan.amount - sum(principal of all previous installments)
    // Skip INTEREST_ONLY installments — their principal was NOT paid, it was deferred to a new installment
    let capitalPendiente = 0;
    if (firstUnpaidInstallment) {
      // Find the index of the first unpaid installment
      const firstUnpaidIndex = loan.installments.findIndex(
        (inst) => inst.id === firstUnpaidInstallment.id
      );
      
      // Sum of principal of all installments BEFORE the first unpaid
      const totalPrincipalPaid = loan.installments
        .slice(0, firstUnpaidIndex)
        .filter((inst) => inst.status !== InstallmentStatus.INTEREST_ONLY)
        .reduce((sum, inst) => sum + Number(inst.principal), 0);
      
      // capitalBalance = loan amount - principal paid so far
      capitalPendiente = Number(loan.amount) - totalPrincipalPaid;
    }

    // Get all overdue installments (not PAID, not INTEREST_ONLY, dueDate <= referenceDate)
    // Use UTC methods for date-only comparison — pg driver returns naive timestamps as UTC
    const todayOnlyUTC = Date.UTC(todayOnly.getUTCFullYear(), todayOnly.getUTCMonth(), todayOnly.getUTCDate());
    const overdueInstallments = loan.installments.filter(
      (inst) => {
        if (inst.status === InstallmentStatus.PAID || inst.status === InstallmentStatus.INTEREST_ONLY) return false;
        const dueDateObj = new Date(inst.dueDate);
        const dueDateOnly = Date.UTC(dueDateObj.getUTCFullYear(), dueDateObj.getUTCMonth(), dueDateObj.getUTCDate());
        return dueDateOnly <= todayOnlyUTC;
      }
    );

    // Calculate dynamic mora for each overdue installment (like /admin/overdue)
    let interesesVencidos = 0;
    for (const inst of overdueInstallments) {
      const daysOverdue = await MoraService.calculateDaysOverdue(inst.dueDate, todayOnly);
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

    const totalCancelar = capitalPendiente + interesesVencidos + pagosAtrasados;

    return {
      capitalPendiente: Math.round(capitalPendiente * 100) / 100,
      interesesVencidos: Math.round(interesesVencidos * 100) / 100,
      pagosAtrasados: Math.round(pagosAtrasados * 100) / 100,
      totalCancelar: Math.round(totalCancelar * 100) / 100,
    };
  }

  /**
   * Execute early cancellation (cancelación anticipada)
   * 
   * Steps in transaction:
   * 1. Validate loan exists and is not already PAID
   * 2. Calculate debt breakdown (or use manual override for interesesVencidos)
   * 3. Create extraordinary payment (type=EXTRAORDINARY, installmentId=null, capital=total)
   * 4. Mark loan status as PAID manually
   * 5. Optionally mark all installments as CANCELADA (per business logic)
   */
  static async executeEarlyCancellation(
    loanId: string, 
    interesesVencidosManual?: number,
    referenceDate?: Date
  ): Promise<ExecuteCancellationResult> {
    try {
      // Check if loan exists
      const loan = await prisma.loan.findUnique({
        where: { id: loanId },
        include: {
          client: true,
          installments: true,
        },
      });

      if (!loan) {
        return { success: false, error: 'Préstamo no encontrado' };
      }

      // Idempotency check: prevent double execution
      if (loan.status === LoanStatus.PAID) {
        return { success: false, error: 'El préstamo ya está cancelado' };
      }

      // Check if loan is PENDING - cannot cancel before it's approved
      if (loan.status === LoanStatus.PENDING) {
        return { success: false, error: 'No se puede cancelar un préstamo que está pendiente de aprobación' };
      }

      // Check if loan is REFINANCIADO - already refinanced, cannot cancel
      if (loan.status === LoanStatus.REFINANCIADO) {
        return { success: false, error: 'No se puede cancelar un préstamo que ya ha sido refinanciado' };
      }

      // Calculate debt breakdown
      const calculation = await this.calculateDebtBreakdown(loanId, referenceDate);
      if (!calculation) {
        return { success: false, error: 'Error al calcular el desglose de deuda' };
      }

      // Use manual override if provided, otherwise use calculated value
      const effectiveInteresesVencidos = interesesVencidosManual !== undefined 
        ? interesesVencidosManual 
        : calculation.interesesVencidos;

      // Recalculate total with override
      const totalCancelar = calculation.capitalPendiente + effectiveInteresesVencidos + calculation.pagosAtrasados;

      if (totalCancelar <= 0) {
        return { success: false, error: 'El total a cancelar debe ser mayor a 0' };
      }

      // Execute atomic transaction
      const result = await prisma.$transaction(async (tx) => {
        let paymentMora;
        
        // Step 1a: If mora was modified manually, create separate mora payment with tracking info
        // Check if user explicitly modified the mora (different from calculated)
        if (interesesVencidosManual !== undefined && interesesVencidosManual !== calculation.interesesVencidos) {
          const originalMora = calculation.interesesVencidos;
          const modifiedMora = interesesVencidosManual;
          
          paymentMora = await tx.payment.create({
            data: {
              clientId: loan.clientId,
              loanId: loanId,
              amount: modifiedMora,
              type: 'MANUAL',
              method: PaymentMethod.EFECTIVO,
              status: PaymentStatus.COMPLETED,
              notes: `Mora cancelación anticipada. Original: $${originalMora.toFixed(2)}. Modificado a: $${modifiedMora.toFixed(2)}`,
              paymentDate: new Date(),
              processedAt: new Date(),
            },
          });
        } else if (effectiveInteresesVencidos > 0) {
          // Mora calculated (not modified) - track with original value
          paymentMora = await tx.payment.create({
            data: {
              clientId: loan.clientId,
              loanId: loanId,
              amount: effectiveInteresesVencidos,
              type: 'MANUAL',
              method: PaymentMethod.EFECTIVO,
              status: PaymentStatus.COMPLETED,
              notes: `Mora cancelación anticipada. Original: $${effectiveInteresesVencidos.toFixed(2)}`,
              paymentDate: new Date(),
              processedAt: new Date(),
            },
          });
        }

        // Step 1b: Create payment for the remaining amount (capital + atrasados)
        const remainingAmount = calculation.capitalPendiente + calculation.pagosAtrasados;
        const payment = await tx.payment.create({
          data: {
            clientId: loan.clientId,
            loanId: loanId,
            amount: remainingAmount,
            type: 'EXTRAORDINARY',
            method: PaymentMethod.EFECTIVO,
            status: PaymentStatus.COMPLETED,
            notes: 'Cancelación anticipada - pago único por todo el saldo',
            paymentDate: new Date(),
            processedAt: new Date(),
          },
        });

        // Step 2: DO NOT mark installments as cancelled - per user requirement "no es necesario"
        // This keeps the original payment history intact

        // Step 3: Mark loan as PAID manually (not via PaymentService)
        const updatedLoan = await tx.loan.update({
          where: { id: loanId },
          data: {
            status: LoanStatus.PAID,
            completedAt: new Date(),
          },
        });

        return {
          paymentMora,
          payment,
          loan: updatedLoan,
        };
      });

      return {
        success: true,
        loan: result.loan,
      };

    } catch (error) {
      console.error('Early cancellation execution error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Error al ejecutar la cancelación anticipada',
      };
    }
  }

  /**
   * Get early cancellation preview (for modal display)
   */
  static async getCancelacionAnticipadaPreview(loanId: string, referenceDate?: Date): Promise<{
    loanId: string;
    loanStatus: LoanStatus;
    breakdown?: DebtBreakdown;
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

    // Check if loan cannot be cancelled (PAID, PENDING, or REFINANCIADO)
    if (loan.status === LoanStatus.PAID) {
      return {
        loanId: loan.id,
        loanStatus: loan.status,
        error: 'El préstamo ya está cancelado',
      };
    }

    if (loan.status === LoanStatus.PENDING) {
      return {
        loanId: loan.id,
        loanStatus: loan.status,
        error: 'No se puede cancelar un préstamo que está pendiente de aprobación',
      };
    }

    if (loan.status === LoanStatus.REFINANCIADO) {
      return {
        loanId: loan.id,
        loanStatus: loan.status,
        error: 'No se puede cancelar un préstamo que ya ha sido refinanciado',
      };
    }

    const breakdown = await this.calculateDebtBreakdown(loanId, referenceDate);

    return {
      loanId: loan.id,
      loanStatus: loan.status,
      breakdown: breakdown || undefined,
    };
  }
}

export default CancelacionAnticipadaService;