import {
  PrismaClient,
  LoanStatus,
  InstallmentStatus,
  PaymentStatus,
  Payment,
  Installment,
} from '@prisma/client';
import { MoraService } from './mora';
import { getRate } from './settings';

const prisma = new PrismaClient();

export interface CreatePaymentInput {
  loanId: string;
  installmentId?: string;
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

      // Calculate total pending balance (usando amount - paidAmount)
      const pendingInstallments = loan.installments.filter(
        (inst) => inst.status !== InstallmentStatus.PAID
      );
      const totalPending = pendingInstallments.reduce((sum, inst) => {
        const pendingForThisInst = Number(inst.amount) - Number(inst.paidAmount);
        return sum + Math.max(0, pendingForThisInst);
      }, 0);

      if (amount > totalPending) {
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

          // El 'amount' es el monto ORIGINAL de la cuota (constante)
          // El 'balance' pendiente se calcula como: amount - paidAmount
          // paidAmount es lo que se ha pagado hasta ahora
          const originalAmount = Number(installment.amount);
          const currentPaidAmount = Number(installment.paidAmount);
          const newPaidAmount = currentPaidAmount + amount;
          
          // El balance es la diferencia entre el monto original y lo pagado
          const newBalance = Math.max(0, originalAmount - newPaidAmount);

          // Determinar nuevo status basado en cuánto se ha pagado
          let newStatus: InstallmentStatus;
          if (newPaidAmount >= originalAmount) {
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
            if (newPaidAmount >= originalAmount) {
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

        // Check if loan is fully paid
        const remainingPending = await tx.installment.count({
          where: {
            loanId,
            status: { not: InstallmentStatus.PAID },
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
   * Calculate the balance of a loan (total pending + mora)
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
      const daysOverdue = MoraService.calculateDaysOverdue(inst.dueDate);
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