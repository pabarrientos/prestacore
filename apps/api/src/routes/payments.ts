import Router, { Response } from 'express';
import { z } from 'zod';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { requireVendor } from '../middleware/rbac';
import { PaymentService } from '../services/payment';
import { PrismaClient, InstallmentStatus, LoanStatus } from '@prisma/client';

const router: ReturnType<typeof Router> = Router();
const prisma = new PrismaClient();

// Validation schema for payment creation
const createPaymentSchema = z.object({
  loanId: z.string().cuid('Invalid loan ID'),
  installmentId: z.string().cuid().optional(),
  amount: z.number().positive('Amount must be greater than 0'),
  reference: z.string().max(100).optional(),
  notes: z.string().max(500).optional(),
  paymentDate: z.string().optional(),
});

// POST /api/payments - Register a payment
router.post('/', authMiddleware, requireVendor, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Validate request
    const validation = createPaymentSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'Validation error',
        details: validation.error.errors,
      });
      return;
    }

    const { loanId, installmentId, amount, reference, notes, paymentDate } = validation.data;

    // Process payment
    const result = await PaymentService.processPayment({
      loanId,
      installmentId,
      amount,
      reference,
      notes,
      paymentDate,
    });

    if (!result.success) {
      res.status(400).json({
        success: false,
        error: result.error,
      });
      return;
    }

    res.status(201).json({
      success: true,
      data: {
        id: result.payment!.id,
        loanId: result.payment!.loanId,
        installmentId: result.payment!.installmentId,
        amount: Number(result.payment!.amount),
        status: result.payment!.status,
        reference: result.payment!.reference,
        processedAt: result.payment!.processedAt?.toISOString(),
        createdAt: result.payment!.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Payment error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// GET /api/payments/loan/:loanId - Get payment history for a loan
router.get('/loan/:loanId', authMiddleware, requireVendor, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { loanId } = req.params;

    const payments = await prisma.payment.findMany({
      where: { loanId },
      orderBy: { createdAt: 'desc' },
      include: {
        installment: true,
        client: {
          include: {
            user: {
              select: { firstName: true, lastName: true },
            },
          },
        },
      },
    });

    res.json({
      success: true,
      data: payments.map((p) => ({
        id: p.id,
        loanId: p.loanId,
        installmentId: p.installmentId,
        installmentNumber: p.installment?.installmentNumber,
        amount: Number(p.amount),
        status: p.status,
        reference: p.reference,
        notes: p.notes,
        paymentDate: p.paymentDate?.toISOString() || p.createdAt.toISOString(),
        processedAt: p.processedAt?.toISOString(),
        createdAt: p.createdAt.toISOString(),
        clientName: p.client.user.firstName + ' ' + p.client.user.lastName,
      })),
    });
  } catch (error) {
    console.error('Get payments error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// GET /api/payments/balance/:loanId - Get loan balance with installments
router.get('/balance/:loanId', authMiddleware, requireVendor, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { loanId } = req.params;

    const balance = await PaymentService.calculateLoanBalance(loanId);

    if (!balance) {
      res.status(404).json({
        success: false,
        error: 'Loan not found',
      });
      return;
    }

    res.json({
      success: true,
      data: {
        loanId: balance.loanId,
        totalAmount: balance.totalAmount,
        totalPaid: balance.totalPaid,
        totalPending: balance.totalPending,
        totalMora: balance.totalMora,
        installments: balance.installments.map((inst) => ({
          id: inst.id,
          installmentNumber: inst.installmentNumber,
          dueDate: inst.dueDate.toISOString(),
          amount: inst.amount,
          balance: inst.balance,
          paidAmount: inst.paidAmount,
          moraAmount: inst.moraAmount,
          status: inst.status,
          daysOverdue: inst.daysOverdue,
        })),
      },
    });
  } catch (error) {
    console.error('Get balance error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// PUT /api/payments/:id - Edit a payment
router.put('/:id', authMiddleware, requireVendor, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { amount, reference, notes, paymentDate } = req.body;

    // Get existing payment
    const payment = await prisma.payment.findUnique({
      where: { id },
      include: {
        installment: true,
        loan: true,
      },
    });

    if (!payment) {
      res.status(404).json({
        success: false,
        error: 'Pago no encontrado',
      });
      return;
    }

    // Can't edit if loan is not ACTIVE
    if (payment.loan.status !== LoanStatus.ACTIVE) {
      res.status(400).json({
        success: false,
        error: 'No se puede editar pagos de préstamos que no están activos',
      });
      return;
    }

    // Calculate the difference in amount
    const oldAmount = Number(payment.amount);
    const newAmount = amount || oldAmount;
    const difference = newAmount - oldAmount;

    // Get the associated installment if exists
    let installmentId = payment.installmentId;
    if (installmentId) {
      const installment = await prisma.installment.findUnique({
        where: { id: installmentId },
      });

      if (installment) {
        // Update installment: adjust paidAmount and recalculate balance
        const originalAmount = Number(installment.amount);
        const currentPaidAmount = Number(installment.paidAmount);
        
        // New paid amount is: currentPaidAmount - oldAmount + newAmount
        const newPaidAmount = currentPaidAmount - oldAmount + newAmount;
        const newBalance = Math.max(0, originalAmount - newPaidAmount);
        
        // Determine new status
        let newStatus: InstallmentStatus;
        if (newPaidAmount >= originalAmount) {
          newStatus = InstallmentStatus.PAID;
        } else if (newPaidAmount > 0) {
          newStatus = InstallmentStatus.PARTIAL;
        } else {
          newStatus = InstallmentStatus.PENDING;
        }

        await prisma.installment.update({
          where: { id: installmentId },
          data: {
            paidAmount: newPaidAmount,
            balance: newBalance,
            status: newStatus,
            paidAt: newStatus === InstallmentStatus.PAID ? new Date() : undefined,
          },
        });
      }
    } else {
      // Free payment - distribute difference across installments
      if (difference !== 0) {
        const pending = await prisma.installment.findMany({
          where: {
            loanId: payment.loanId,
            status: { in: [InstallmentStatus.PENDING, InstallmentStatus.OVERDUE, InstallmentStatus.PARTIAL] },
          },
          orderBy: [{ dueDate: 'asc' }, { installmentNumber: 'asc' }],
        });

        let remainingDiff = difference;
        for (const inst of pending) {
          if (remainingDiff === 0) break;
          if (remainingDiff < 0) {
            // Reducing payment - add back to balance
            const originalAmount = Number(inst.amount);
            const currentPaidAmount = Number(inst.paidAmount);
            const newPaidAmount = Math.max(0, currentPaidAmount + remainingDiff); // remainingDiff is negative
            const newBalance = originalAmount - newPaidAmount;
            
            let newStatus: InstallmentStatus;
            if (newPaidAmount >= originalAmount) {
              newStatus = InstallmentStatus.PAID;
            } else if (newPaidAmount > 0) {
              newStatus = InstallmentStatus.PARTIAL;
            } else {
              newStatus = InstallmentStatus.PENDING;
            }

            await prisma.installment.update({
              where: { id: inst.id },
              data: {
                paidAmount: newPaidAmount,
                balance: newBalance,
                status: newStatus,
                paidAt: newStatus === InstallmentStatus.PAID ? new Date() : null,
              },
            });
            remainingDiff += Math.abs(remainingDiff);
          } else {
            // Increasing payment - deduct from balance
            const originalAmount = Number(inst.amount);
            const currentPaidAmount = Number(inst.paidAmount);
            const availableToAdd = originalAmount - currentPaidAmount;
            const addAmount = Math.min(remainingDiff, availableToAdd);
            
            if (addAmount > 0) {
              const newPaidAmount = currentPaidAmount + addAmount;
              const newBalance = Math.max(0, originalAmount - newPaidAmount);
              
              let newStatus: InstallmentStatus;
              if (newPaidAmount >= originalAmount) {
                newStatus = InstallmentStatus.PAID;
              } else if (newPaidAmount > 0) {
                newStatus = InstallmentStatus.PARTIAL;
              } else {
                newStatus = InstallmentStatus.PENDING;
              }

              await prisma.installment.update({
                where: { id: inst.id },
                data: {
                  paidAmount: newPaidAmount,
                  balance: newBalance,
                  status: newStatus,
                  paidAt: newStatus === InstallmentStatus.PAID ? new Date() : inst.paidAt,
                },
              });
              remainingDiff -= addAmount;
            }
          }
        }
      }
    }

    // Update the payment
    const updatedPayment = await prisma.payment.update({
      where: { id },
      data: {
        amount: newAmount,
        reference: reference !== undefined ? reference : payment.reference,
        notes: notes !== undefined ? notes : payment.notes,
        paymentDate: paymentDate ? new Date(paymentDate) : payment.paymentDate,
      },
    });

    // Check if loan is fully paid or has pending
    const remainingPending = await prisma.installment.count({
      where: {
        loanId: payment.loanId,
        status: { not: InstallmentStatus.PAID },
      },
    });

    if (remainingPending === 0) {
      await prisma.loan.update({
        where: { id: payment.loanId },
        data: { status: LoanStatus.PAID, completedAt: new Date() },
      });
    } else {
      // If loan was PAID but now has pending, revert to ACTIVE
      const loan = await prisma.loan.findUnique({ where: { id: payment.loanId } });
      if (loan?.status === LoanStatus.PAID) {
        await prisma.loan.update({
          where: { id: payment.loanId },
          data: { status: LoanStatus.ACTIVE, completedAt: null },
        });
      }
    }

    res.json({
      success: true,
      data: {
        id: updatedPayment.id,
        amount: Number(updatedPayment.amount),
        reference: updatedPayment.reference,
        notes: updatedPayment.notes,
        updatedAt: updatedPayment.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Update payment error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// DELETE /api/payments/:id - Delete a payment (revert its effects)
router.delete('/:id', authMiddleware, requireVendor, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Get existing payment
    const payment = await prisma.payment.findUnique({
      where: { id },
      include: {
        installment: true,
        loan: true,
      },
    });

    if (!payment) {
      res.status(404).json({
        success: false,
        error: 'Pago no encontrado',
      });
      return;
    }

    // Can't delete if loan is not ACTIVE
    if (payment.loan.status !== LoanStatus.ACTIVE) {
      res.status(400).json({
        success: false,
        error: 'No se puede eliminar pagos de préstamos que no están activos',
      });
      return;
    }

    const paymentAmount = Number(payment.amount);
    const installmentId = payment.installmentId;

    if (installmentId) {
      // Revert specific installment payment
      const installment = await prisma.installment.findUnique({
        where: { id: installmentId },
      });

      if (installment) {
        const originalAmount = Number(installment.amount);
        const currentPaidAmount = Number(installment.paidAmount);
        const newPaidAmount = Math.max(0, currentPaidAmount - paymentAmount);
        const newBalance = Math.max(0, originalAmount - newPaidAmount);

        let newStatus: InstallmentStatus;
        if (newPaidAmount >= originalAmount) {
          newStatus = InstallmentStatus.PAID;
        } else if (newPaidAmount > 0) {
          newStatus = InstallmentStatus.PARTIAL;
        } else {
          // Check if overdue based on due date
          const now = new Date();
          const isOverdue = new Date(installment.dueDate) < now;
          newStatus = isOverdue ? InstallmentStatus.OVERDUE : InstallmentStatus.PENDING;
        }

        await prisma.installment.update({
          where: { id: installmentId },
          data: {
            paidAmount: newPaidAmount,
            balance: newBalance,
            status: newStatus,
            paidAt: newStatus === InstallmentStatus.PAID ? new Date() : null,
          },
        });
      }
    } else {
      // Free payment - reverse distribution in FIFO order (same as original distribution)
      // IMPORTANT: Must include PAID status to revert effects on already paid installments
      const allInstallments = await prisma.installment.findMany({
        where: {
          loanId: payment.loanId,
          status: { in: ['PENDING', 'OVERDUE', 'PARTIAL', 'PAID'] },
        },
        orderBy: [{ dueDate: 'asc' }, { installmentNumber: 'asc' }],
      });

      for (const inst of allInstallments) {
        // REVERT COMPLETELY each installment that has any payment (ignore paymentAmount)
        const originalAmount = Number(inst.amount);
        const currentPaidAmount = Number(inst.paidAmount);
        
        if (currentPaidAmount > 0) {
          // Always revert the FULL payment on this installment
          const newPaidAmount = 0;
          const newBalance = originalAmount;
          
          // Determine status based on due date
          const now = new Date();
          const isOverdue = new Date(inst.dueDate) < now;
          const newStatus = isOverdue ? 'OVERDUE' : 'PENDING';

          await prisma.installment.update({
            where: { id: inst.id },
            data: {
              paidAmount: newPaidAmount,
              balance: newBalance,
              status: newStatus,
              paidAt: null,
            },
          });
        }
      }
    }

    // Delete the payment
    await prisma.payment.delete({
      where: { id },
    });

    // Check loan status
    const remainingPending = await prisma.installment.count({
      where: {
        loanId: payment.loanId,
        status: { not: InstallmentStatus.PAID },
      },
    });

    if (remainingPending === 0) {
      await prisma.loan.update({
        where: { id: payment.loanId },
        data: { status: LoanStatus.PAID, completedAt: new Date() },
      });
    } else {
      const loan = await prisma.loan.findUnique({ where: { id: payment.loanId } });
      if (loan?.status === LoanStatus.PAID) {
        await prisma.loan.update({
          where: { id: payment.loanId },
          data: { status: LoanStatus.ACTIVE, completedAt: null },
        });
      }
    }

    res.json({
      success: true,
      data: { message: 'Pago eliminado correctamente' },
    });
  } catch (error) {
    console.error('Delete payment error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

export default router;