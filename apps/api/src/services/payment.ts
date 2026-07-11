import {
  PrismaClient,
  LoanStatus,
  InstallmentStatus,
  PaymentStatus,
  PaymentFrequency,
  Payment,
  Installment,
} from '@prisma/client';
import { MoraService } from './mora';
import { getRate } from './settings';

const prisma = new PrismaClient();

/**
 * Round a number to 2 decimal places to match Decimal(12,2) DB precision.
 * Prevents floating-point comparison bugs where 333.33 + 333.33 + 333.34
 * yields 999.9999999999998 instead of 1000.00, causing status to stay PARTIAL
 * even though the balance is effectively 0.
 */
function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface CreatePaymentInput {
  loanId: string;
  installmentId?: string;
  amount: number;
  reference?: string;
  notes?: string;
  paymentDate?: string;
}

export interface CreateInterestOnlyPaymentInput {
  loanId: string;
  installmentId: string;
  amount: number;
  reference?: string;
  notes?: string;
  paymentDate?: string;
}

export interface ProcessPaymentResult {
  success: boolean;
  payment?: Payment;
  error?: string;
  updatedInstallments?: Installment[];
}

function addPeriod(date: Date, frequency: PaymentFrequency, periods: number): Date {
  const result = new Date(date);
  switch (frequency) {
    case PaymentFrequency.WEEKLY:
      result.setUTCDate(result.getUTCDate() + periods * 7);
      break;
    case PaymentFrequency.BIWEEKLY:
      result.setUTCDate(result.getUTCDate() + periods * 14);
      break;
    case PaymentFrequency.MONTHLY: {
      const y = result.getUTCFullYear();
      const m = result.getUTCMonth();
      const d = result.getUTCDate();
      const totalMonths = m + periods;
      const targetYear = y + Math.floor(totalMonths / 12);
      const targetMonth = ((totalMonths % 12) + 12) % 12;
      const lastDayOfTarget = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
      result.setUTCFullYear(targetYear, targetMonth, Math.min(d, lastDayOfTarget));
      break;
    }
    case PaymentFrequency.DAILY:
      result.setUTCDate(result.getUTCDate() + periods);
      break;
  }
  return result;
}

export interface CalculateBalanceResult {
  loanId: string;
  totalAmount: number;
  totalPaid: number;
  totalPending: number;
  totalMora: number;
  installments: {
    id: string;
    installmentNumber: number;
    dueDate: Date;
    amount: number;
    balance: number;
    paidAmount: number;
    moraAmount: number;
    status: InstallmentStatus;
    daysOverdue: number;
  }[];
}

export class PaymentService {
  /**
   * Process a payment - validates loan status, applies payment to installment(s)
   * Uses Prisma transaction for atomicity
   */
  static async processPayment(input: CreatePaymentInput): Promise<ProcessPaymentResult> {
    const { loanId, installmentId, amount, reference, notes, paymentDate } = input;

    try {
      // Validate amount
      if (amount <= 0) {
        return { success: false, error: 'El monto debe ser mayor a 0' };
      }

      // Validate installmentId is required
      if (!installmentId) {
        return { success: false, error: 'Debe seleccionar una cuota' };
      }

      // Get loan with installments
      const loan = await prisma.loan.findUnique({
        where: { id: loanId },
        include: {
          installments: {
            orderBy: [{ dueDate: 'asc' }, { installmentNumber: 'asc' }],
          },
          client: true,
        },
      });

      if (!loan) {
        return { success: false, error: 'Préstamo no encontrado' };
      }

      // Validate loan status
      if (loan.status !== LoanStatus.ACTIVE) {
        return {
          success: false,
          error: `No se pueden registrar pagos en préstamos con estado ${loan.status}`,
        };
      }

      // Calculate total pending balance (using amount - paidAmount)
      // Exclude PAID and INTEREST_ONLY (closed historically)
      const pendingInstallments = loan.installments.filter(
        (inst) => inst.status !== InstallmentStatus.PAID && inst.status !== InstallmentStatus.INTEREST_ONLY
      );
      const totalPending = pendingInstallments.reduce((sum, inst) => {
        const pendingForThisInst = Number(inst.amount) - Number(inst.paidAmount);
        return sum + Math.max(0, pendingForThisInst);
      }, 0);

      if (Number(amount) > Number(totalPending.toFixed(2))) {
        return {
          success: false,
          error: `El monto debe ser mayor a 0 y menor o igual al saldo pendiente (${totalPending.toFixed(2)})`,
        };
      }

      // Process payment in transaction
      const result = await prisma.$transaction(async (tx) => {
        let payment: Payment;
        let updatedInstallments: Installment[] = [];
        let remainingAmount = amount;

        if (installmentId) {
          // Payment for specific installment
          const installment = await tx.installment.findUnique({
            where: { id: installmentId },
          });

          if (!installment) {
            throw new Error('Cuota no encontrada');
          }

          if (installment.loanId !== loanId) {
            throw new Error('La cuota no pertenece a este préstamo');
          }

          if (installment.status === InstallmentStatus.INTEREST_ONLY) {
            throw new Error('No se puede pagar una cuota marcada como solo interés');
          }

          // El 'amount' es el monto ORIGINAL de la cuota (constante)
          // El 'balance' pendiente se calcula como: amount - paidAmount
          // paidAmount es lo que se ha pagado hasta ahora
          const originalAmount = Number(installment.amount);
          const currentPaidAmount = Number(installment.paidAmount);
          const newPaidAmount = currentPaidAmount + amount;
          
          // El balance es la diferencia entre el monto original y lo pagado
          const newBalance = Math.max(0, originalAmount - newPaidAmount);

          // Determinar nuevo status basado en cuánto se ha pagado
          // Use roundMoney() to match Decimal(12,2) DB precision and avoid
          // floating-point issues (e.g. 333.33+333.33+333.34 = 999.999... < 1000)
          let newStatus: InstallmentStatus;
          if (roundMoney(newPaidAmount) >= roundMoney(originalAmount)) {
            newStatus = InstallmentStatus.PAID;
          } else if (newPaidAmount > 0) {
            newStatus = InstallmentStatus.PARTIAL;
          } else {
            newStatus = installment.status;
          }

          // Create payment
          payment = await tx.payment.create({
            data: {
              clientId: loan.clientId,
              loanId: loanId,
              installmentId,
              amount,
              type: 'MANUAL',
              status: PaymentStatus.COMPLETED,
              reference,
              notes,
              paymentDate: paymentDate ? new Date(paymentDate) : undefined,
              processedAt: new Date(),
            },
          });

          // Update installment - solo paidAmount, el balance se calcula
          const updatedInstallment = await tx.installment.update({
            where: { id: installmentId },
            data: {
              paidAmount: newPaidAmount,
              balance: newBalance,
              status: newStatus,
              paidAt: newStatus === InstallmentStatus.PAID ? new Date() : undefined,
            },
          });
          updatedInstallments.push(updatedInstallment);

        } else {
          // Free payment (abono a cuenta) - apply to oldest overdue first, then pending
          const pending = await tx.installment.findMany({
            where: {
              loanId,
              status: { in: [InstallmentStatus.PENDING, InstallmentStatus.OVERDUE, InstallmentStatus.PARTIAL] },
            },
            orderBy: [{ dueDate: 'asc' }, { installmentNumber: 'asc' }],
          });

          if (pending.length === 0) {
            throw new Error('No hay cuotas pendientes');
          }

          // Create payment without specific installment (free payment)
          payment = await tx.payment.create({
            data: {
              clientId: loan.clientId,
              loanId: loanId,
              amount,
              type: 'MANUAL',
              status: PaymentStatus.COMPLETED,
              reference,
              notes,
              processedAt: new Date(),
            },
          });

          // Apply payment to installments in FIFO order
          for (const inst of pending) {
            if (remainingAmount <= 0) break;

            // Usar amount (monto original de la cuota) para cálculos
            const originalAmount = Number(inst.amount);
            const currentPaidAmount = Number(inst.paidAmount);
            const availableForThisInst = Math.min(remainingAmount, originalAmount - currentPaidAmount);

            if (availableForThisInst <= 0) continue;

            const newPaidAmount = currentPaidAmount + availableForThisInst;
            const newBalance = Math.max(0, originalAmount - newPaidAmount);

            let newStatus = inst.status;
            if (roundMoney(newPaidAmount) >= roundMoney(originalAmount)) {
              newStatus = InstallmentStatus.PAID;
            } else if (newPaidAmount > 0) {
              newStatus = InstallmentStatus.PARTIAL;
            }

            const updated = await tx.installment.update({
              where: { id: inst.id },
              data: {
                paidAmount: newPaidAmount,
                balance: newBalance,
                status: newStatus,
                paidAt: newStatus === InstallmentStatus.PAID ? new Date() : inst.paidAt,
              },
            });

            updatedInstallments.push(updated);
            remainingAmount -= availableForThisInst;
          }
        }

        // Check if loan is fully paid (exclude INTEREST_ONLY and CANCELADA_POR_REFINANCIACION)
        const remainingPending = await tx.installment.count({
          where: {
            loanId,
            status: {
              notIn: [InstallmentStatus.PAID, InstallmentStatus.INTEREST_ONLY, InstallmentStatus.CANCELADA_POR_REFINANCIACION],
            },
          },
        });

        if (remainingPending === 0) {
          await tx.loan.update({
            where: { id: loanId },
            data: {
              status: LoanStatus.PAID,
              completedAt: new Date(),
            },
          });
        }

        return { payment, updatedInstallments };
      });

      return {
        success: true,
        payment: result.payment,
        updatedInstallments: result.updatedInstallments,
      };

    } catch (error) {
      console.error('Payment processing error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Error al procesar el pago',
      };
    }
  }

  /**
   * Process an interest-only payment.
   * When a client can't pay the full installment, they pay only the interest component.
   * 
   * Flow:
   * 1. Create a payment record (like mora — without installmentId) with tracking in notes
   * 2. Mark the original installment as INTEREST_ONLY (balance=0, closed historically)
   * 3. Insert a new installment with the same structure, due date shifted +1 period
   * 4. Shift all subsequent installments' due dates +1 period
   * 5. Recalculate capitalBalance for all affected installments
   * 6. Renumber all installmentNumbers
   */
  static async processInterestOnlyPayment(
    input: CreateInterestOnlyPaymentInput
  ): Promise<ProcessPaymentResult> {
    const { loanId, installmentId, amount, reference, notes, paymentDate } = input;

    try {
      if (amount <= 0) {
        return { success: false, error: 'El monto debe ser mayor a 0' };
      }

      const loan = await prisma.loan.findUnique({
        where: { id: loanId },
        include: {
          installments: {
            orderBy: [{ dueDate: 'asc' }, { installmentNumber: 'asc' }],
          },
        },
      });

      if (!loan) {
        return { success: false, error: 'Préstamo no encontrado' };
      }

      if (loan.status !== LoanStatus.ACTIVE && loan.status !== LoanStatus.DEFAULTED) {
        return {
          success: false,
          error: `No se pueden registrar pagos en préstamos con estado ${loan.status}`,
        };
      }

      const targetInstallment = loan.installments.find(
        (inst) => inst.id === installmentId
      );

      if (!targetInstallment) {
        return { success: false, error: 'Cuota no encontrada' };
      }

      if (targetInstallment.loanId !== loanId) {
        return { success: false, error: 'La cuota no pertenece a este préstamo' };
      }

      if (
        targetInstallment.status === InstallmentStatus.PAID ||
        targetInstallment.status === InstallmentStatus.INTEREST_ONLY ||
        targetInstallment.status === InstallmentStatus.CANCELADA_POR_REFINANCIACION
      ) {
        return {
          success: false,
          error: `No se puede aplicar pago de solo interés a una cuota con estado ${targetInstallment.status}`,
        };
      }

      const originalInterest = Number(targetInstallment.interest);
      const originalPrincipal = Number(targetInstallment.principal);
      const originalAmount = Number(targetInstallment.amount);
      const wasModified = amount !== originalInterest;

      const modifiedText = wasModified
        ? ` (Interés original: $${originalInterest.toFixed(2)}, Monto pagado: $${amount.toFixed(2)})`
        : '';

      // Include installment ID in notes as a stable identifier (installmentNumber and dueDate can change after renumbering/shifts)
      let autoNotes = `Pago solo interés cuota #${targetInstallment.installmentNumber} (id: ${targetInstallment.id})${modifiedText}`;
      const finalNotes = notes ? `${autoNotes}. ${notes}` : autoNotes;

      const result = await prisma.$transaction(async (tx) => {
        const installmentIndex = loan.installments.findIndex(
          (inst) => inst.id === installmentId
        );

        const payment = await tx.payment.create({
          data: {
            clientId: loan.clientId,
            loanId,
            installmentId: null,
            amount,
            type: 'MANUAL',
            status: PaymentStatus.COMPLETED,
            reference,
            notes: finalNotes,
            paymentDate: paymentDate ? new Date(paymentDate) : undefined,
            processedAt: new Date(),
          },
        });

        await tx.installment.update({
          where: { id: installmentId },
          data: {
            balance: 0,
            status: InstallmentStatus.INTEREST_ONLY,
            // Track actual interest collected for commission calculation (rule 1)
            // Separate from paidAmount because principal is deferred, not paid — and the
            // mora calculation must not see this as a PARTIAL payment.
            interestCollected: { increment: amount },
          },
        });

        const newDueDate = addPeriod(
          targetInstallment.dueDate,
          loan.frequency,
          1
        );

        const createdInstallment = await tx.installment.create({
          data: {
            loanId,
            installmentNumber: targetInstallment.installmentNumber,
            dueDate: newDueDate,
            amount: originalAmount,
            principal: originalPrincipal,
            interest: originalInterest,
            balance: originalAmount,
            capitalBalance: 0,
            status: InstallmentStatus.PENDING,
          },
        });

        const subsequentInstallments = loan.installments.slice(installmentIndex + 1);
        for (const inst of subsequentInstallments) {
          const shiftedDueDate = addPeriod(inst.dueDate, loan.frequency, 1);
          await tx.installment.update({
            where: { id: inst.id },
            data: {
              dueDate: shiftedDueDate,
            },
          });
        }

        const allInstallments = await tx.installment.findMany({
          where: { loanId },
          orderBy: [{ dueDate: 'asc' }, { installmentNumber: 'asc' }],
        });

        let runningCapital = Number(loan.amount);
        let installmentNum = 0;
        for (const inst of allInstallments) {
          installmentNum++;
          if (inst.status !== InstallmentStatus.INTEREST_ONLY) {
            runningCapital -= Number(inst.principal);
          }
          await tx.installment.update({
            where: { id: inst.id },
            data: {
              capitalBalance: Math.max(0, runningCapital),
              installmentNumber: installmentNum,
            },
          });
        }

        const updatedInstallments = await tx.installment.findMany({
          where: { loanId },
          orderBy: [{ dueDate: 'asc' }, { installmentNumber: 'asc' }],
        });

        return { payment, updatedInstallments, createdInstallment };
      });

      return {
        success: true,
        payment: result.payment,
        updatedInstallments: result.updatedInstallments,
      };

    } catch (error) {
      console.error('Interest-only payment processing error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Error al procesar el pago de solo interés',
      };
    }
  }

  /**
   * Reverse an interest-only payment — inverse of processInterestOnlyPayment.
   *
   * Undo the side-effects of a solo-interés payment:
   *   1. Delete the "new" installment that was created with due date shifted +1 period
   *   2. Restore the INTEREST_ONLY installment to PENDING/OVERDUE (re-open it)
   *   3. Shift all later installments' due dates back -1 period
   *   4. Recalculate capitalBalance and installmentNumber for every installment
   *
   * When a loan has multiple interest-only payments, uses the payment's notes
   * (pattern: "Pago solo interés cuota #N") to identify which INTEREST_ONLY
   * installment to reverse.
   *
   * Refuses if the new installment already has payments attached — caller must
   * delete those payments first.
   */
  static async reverseInterestOnlyPayment(opts: {
    paymentId: string;
    paymentAmount: number;
    loanId: string;
    notes: string | null;
  }): Promise<{ success: boolean; error?: string }> {
    const { paymentAmount, loanId, notes } = opts;

    try {
      // 1. Find the loan with all installments
      const loan = await prisma.loan.findUnique({
        where: { id: loanId },
        include: {
          installments: {
            orderBy: [{ dueDate: 'asc' }, { installmentNumber: 'asc' }],
          },
        },
      });

      if (!loan) {
        return { success: false, error: 'Préstamo no encontrado' };
      }

      // 2. Extract stable identifier from payment notes to find the INTEREST_ONLY installment to reverse.
      //    Prefer ID (completely stable). Fall back to installmentNumber (legacy payments).
      //    Patterns:
      //      - New: "Pago solo interés cuota #N (id: cuid) ..."
      //      - Legacy: "Pago solo interés cuota #N ..."
      let targetInstallmentId: string | null = null;
      let targetInstallmentNumber: number | null = null;

      if (notes) {
        // Try to extract ID first
        const idMatch = notes.match(/id: ([a-z0-9]+)/i);
        if (idMatch) {
          targetInstallmentId = idMatch[1];
        } else {
          // Fall back to installmentNumber for legacy payments
          const match = notes.match(/cuota #(\d+)/);
          if (match) {
            targetInstallmentNumber = parseInt(match[1], 10);
          }
        }
      }

      // 3. Find the INTEREST_ONLY installment to reverse
      const interestOnlyInst = loan.installments.find((inst) => {
        if (inst.status !== InstallmentStatus.INTEREST_ONLY) return false;

        if (targetInstallmentId) {
          return inst.id === targetInstallmentId;
        }

        if (targetInstallmentNumber !== null) {
          return inst.installmentNumber === targetInstallmentNumber;
        }

        return true; // No identifier in notes, use any INTEREST_ONLY
      });

      if (!interestOnlyInst) {
        return {
          success: false,
          error: 'No se encontró la cuota de solo interés para revertir',
        };
      }

      // 4. Identify the "new" installment created by the interest-only payment:
      //    It was created with dueDate = interestOnlyInst.dueDate + 1 period (exact match
      //    using the same addPeriod call used in processInterestOnlyPayment). This is the
      //    only reliable discriminator — in fixed-amount systems (French, Flat Rate) every
      //    installment shares the same amount/principal/interest, so matching on those alone
      //    is ambiguous.
      const expectedNewDueDate = addPeriod(interestOnlyInst.dueDate, loan.frequency, 1);
      const EXPECTED_DATE_TOLERANCE_MS = 60_000; // 1 minute — covers DST / millis rounding

      const newInstallment = loan.installments.find(
        (inst) =>
          inst.id !== interestOnlyInst.id &&
          Math.abs(new Date(inst.dueDate).getTime() - expectedNewDueDate.getTime()) <
            EXPECTED_DATE_TOLERANCE_MS &&
          Number(inst.amount) === Number(interestOnlyInst.amount) &&
          Number(inst.principal) === Number(interestOnlyInst.principal) &&
          Number(inst.interest) === Number(interestOnlyInst.interest),
      );

      if (!newInstallment) {
        return {
          success: false,
          error: 'No se encontró la cuota generada por el pago de solo interés',
        };
      }

      // 5. Safety: refuse if the new installment already has payments OR is INTEREST_ONLY
      //    (indicating it was used for another interest-only payment)
      const newPaymentsCount = await prisma.payment.count({
        where: { installmentId: newInstallment.id },
      });

      if (newPaymentsCount > 0) {
        return {
          success: false,
          error:
            'No se puede eliminar el pago de solo interés porque la cuota generada ya tiene pagos registrados. Debe eliminar primero esos pagos.',
        };
      }

      if (newInstallment.status === InstallmentStatus.INTEREST_ONLY) {
        return {
          success: false,
          error:
            'No se puede eliminar el pago de solo interés porque la cuota generada ya fue usada para otro pago de solo interés. Debe eliminar primero ese pago.',
        };
      }

      // 6. Reverse in a transaction
      await prisma.$transaction(async (tx) => {
        // 6a. Delete the new installment
        await tx.installment.delete({ where: { id: newInstallment.id } });

        // 6b. Restore the INTEREST_ONLY installment
        const prevCollected = Number(interestOnlyInst.interestCollected);
        const newCollected = Math.max(0, prevCollected - paymentAmount);

        if (newCollected === 0) {
          // Fully reverting — reopen the installment
          const todayOnly = await (await import('./datetime')).getToday();
          const dueDate = new Date(interestOnlyInst.dueDate);
          const dueDateOnly = new Date(
            dueDate.getFullYear(),
            dueDate.getMonth(),
            dueDate.getDate(),
          );
          const isOverdue = dueDateOnly < todayOnly;

          await tx.installment.update({
            where: { id: interestOnlyInst.id },
            data: {
              balance: interestOnlyInst.amount,
              paidAmount: 0,
              status: isOverdue ? InstallmentStatus.OVERDUE : InstallmentStatus.PENDING,
              interestCollected: 0,
              paidAt: null,
            },
          });
        } else {
          // Only decrement interestCollected — keep the INTEREST_ONLY state
          // (this branch handles theoretical multi-payment scenarios)
          await tx.installment.update({
            where: { id: interestOnlyInst.id },
            data: {
              interestCollected: newCollected,
            },
          });
        }

        // 6c. Shift due dates of all later installments back -1 period
        const subsequentInstallments = loan.installments.filter(
          (inst) =>
            inst.id !== newInstallment.id &&
            inst.dueDate > interestOnlyInst.dueDate,
        );

        for (const inst of subsequentInstallments) {
          const shiftedDueDate = addPeriod(inst.dueDate, loan.frequency, -1);
          await tx.installment.update({
            where: { id: inst.id },
            data: { dueDate: shiftedDueDate },
          });
        }

        // 6d. Renumber all installments and recalculate capitalBalance
        const updatedAll = await tx.installment.findMany({
          where: { loanId },
          orderBy: [{ dueDate: 'asc' }, { installmentNumber: 'asc' }],
        });

        let runningCapital = Number(loan.amount);
        let instNum = 0;
        for (const inst of updatedAll) {
          instNum++;
          if (inst.status !== InstallmentStatus.INTEREST_ONLY) {
            runningCapital -= Number(inst.principal);
          }
          await tx.installment.update({
            where: { id: inst.id },
            data: {
              capitalBalance: Math.max(0, runningCapital),
              installmentNumber: instNum,
            },
          });
        }
      });

      return { success: true };
    } catch (error) {
      console.error('Interest-only payment reversal error:', error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Error al revertir el pago de solo interés',
      };
    }
  }

  /**
   * Calculate the balance of a loan (total pending + mora) at a specific date
   * Used for recalculating mora when payment date changes
   */
  static async calculateLoanBalanceAt(loanId: string, referenceDate: Date): Promise<CalculateBalanceResult | null> {
    const loan = await prisma.loan.findUnique({
      where: { id: loanId },
      include: {
        installments: {
          orderBy: [{ dueDate: 'asc' }, { installmentNumber: 'asc' }],
        },
      },
    });

    if (!loan) {
      return null;
    }

    let totalAmount = 0;
    let totalPaid = 0;
    let totalMora = 0;
    const installments: CalculateBalanceResult['installments'] = [];
    const dailyRate = await getRate('MORA_RATE');

    for (const inst of loan.installments) {
      const daysOverdue = await MoraService.calculateDaysOverdue(inst.dueDate, referenceDate);
      const moraAmount = daysOverdue > 0
        ? MoraService.calculate({
            installmentAmount: Number(inst.balance),
            dailyRate,
            daysOverdue,
          }).moraAmount
        : 0;

      totalAmount += Number(inst.amount);
      totalPaid += Number(inst.paidAmount);
      totalMora += moraAmount;

      installments.push({
        id: inst.id,
        installmentNumber: inst.installmentNumber,
        dueDate: inst.dueDate,
        amount: Number(inst.amount),
        balance: Number(inst.balance),
        paidAmount: Number(inst.paidAmount),
        moraAmount,
        status: inst.status,
        daysOverdue,
      });
    }

    const totalPending = totalAmount - totalPaid + totalMora;

    return {
      loanId,
      totalAmount,
      totalPaid,
      totalPending,
      totalMora,
      installments,
    };
  }

  /**
   * Calculate the balance of a loan (total pending + mora) - uses current date
   */
  static async calculateLoanBalance(loanId: string): Promise<CalculateBalanceResult | null> {
    const loan = await prisma.loan.findUnique({
      where: { id: loanId },
      include: {
        installments: {
          orderBy: [{ dueDate: 'asc' }, { installmentNumber: 'asc' }],
        },
      },
    });

    if (!loan) {
      return null;
    }

    let totalAmount = 0;
    let totalPaid = 0;
    let totalMora = 0;
    const installments: CalculateBalanceResult['installments'] = [];
    const dailyRate = await getRate('MORA_RATE');

    for (const inst of loan.installments) {
      const daysOverdue = await MoraService.calculateDaysOverdue(inst.dueDate);
      const moraAmount = daysOverdue > 0
        ? MoraService.calculate({
            installmentAmount: Number(inst.balance),
            dailyRate,
            daysOverdue,
          }).moraAmount
        : 0;

      totalAmount += Number(inst.amount);
      totalPaid += Number(inst.paidAmount);
      totalMora += moraAmount;

      installments.push({
        id: inst.id,
        installmentNumber: inst.installmentNumber,
        dueDate: inst.dueDate,
        amount: Number(inst.amount),
        balance: Number(inst.balance),
        paidAmount: Number(inst.paidAmount),
        moraAmount,
        status: inst.status,
        daysOverdue,
      });
    }

    const totalPending = totalAmount - totalPaid + totalMora;

    return {
      loanId,
      totalAmount,
      totalPaid,
      totalPending,
      totalMora,
      installments,
    };
  }
}

export default PaymentService;