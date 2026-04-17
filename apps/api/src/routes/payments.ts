import Router, { Response } from 'express';
import { z } from 'zod';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { requireVendor, requireAdmin } from '../middleware/rbac';
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

// GET /api/payments/by-date - Get payments by date range with filters
router.get('/by-date', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { fechaInicio, fechaFin, vendedorId, estado, cliente } = req.query;
    const user = req.user;

    if (!user) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
      return;
    }

    // Validate date params
    let startDate: string;
    let endDate: string;
    const { getToday } = await import('../services/datetime');

    if (fechaInicio && fechaFin) {
      const startStr = String(fechaInicio);
      const endStr = String(fechaFin);

      // Validate YYYY-MM-DD format
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startStr) || !/^\d{4}-\d{2}-\d{2}$/.test(endStr)) {
        res.status(400).json({
          success: false,
          error: 'Invalid date format. Use YYYY-MM-DD',
        });
        return;
      }

      startDate = startStr;
      endDate = endStr;

      if (startDate > endDate) {
        res.status(400).json({
          success: false,
          error: 'fechaInicio cannot be after fechaFin',
        });
        return;
      }
    } else {
      // Default: today's date using getToday() which respects timezone
      const today = await getToday();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      startDate = `${year}-${month}-${day}`;
      endDate = startDate;
    }

    // RBAC: Vendedor only sees their own loans - handled in raw query below

    // Fetch payments with related data - use raw SQL for date filtering
    // Build WHERE clause with filters
    const clienteFilter = cliente ? `AND (LOWER(u."firstName") LIKE '%${String(cliente).toLowerCase()}%' OR LOWER(u."lastName") LIKE '%${String(cliente).toLowerCase()}%')` : '';

    let payments;
    if (startDate === endDate) {
        // Single day query - use ::date cast for proper comparison
        // Also cast paymentDate to date in SELECT to avoid timezone conversion issues
        payments = await prisma.$queryRawUnsafe<any[]>(`
          SELECT p.id, p."clientId", p."loanId", p."installmentId", p.amount, p.type, 
                 p.status, p.reference, p.notes, p."paymentDate", p."createdAt", p."updatedAt",
                 p."processedAt",
                 u."firstName" as "clientFirstName", u."lastName" as "clientLastName",
                 l."id" as "loanId", l."amount" as "loanAmount", l."assignedVendorId",
                 i."installmentNumber",
                 p."paymentDate"::text as "paymentDateLocal",
                 v."firstName" as "vendorFirstName", v."lastName" as "vendorLastName"
          FROM "Payment" p
          JOIN "Client" c ON p."clientId" = c."id"
          JOIN "User" u ON c."userId" = u."id"
          JOIN "Loan" l ON p."loanId" = l."id"
          LEFT JOIN "Installment" i ON p."installmentId" = i."id"
          LEFT JOIN "User" v ON l."assignedVendorId" = v."id"
          WHERE p."paymentDate"::date = $1::date
            ${user.role === 'VENDEDOR' ? `AND l."assignedVendorId" = '${user.userId}'` : ''}
            ${vendedorId && user.role === 'ADMIN' ? `AND l."assignedVendorId" = '${vendedorId}'` : ''}
            ${estado ? `AND p.status = '${estado}'` : ''}
            ${clienteFilter}
          ORDER BY p."paymentDate" DESC
        `, startDate);
      } else {
        // Date range query
        payments = await prisma.$queryRawUnsafe<any[]>(`
          SELECT p.id, p."clientId", p."loanId", p."installmentId", p.amount, p.type, 
                 p.status, p.reference, p.notes, p."paymentDate", p."createdAt", p."updatedAt",
                 p."processedAt",
                 u."firstName" as "clientFirstName", u."lastName" as "clientLastName",
                 l."id" as "loanId", l."amount" as "loanAmount", l."assignedVendorId",
                 i."installmentNumber",
                 p."paymentDate"::text as "paymentDateLocal",
                 v."firstName" as "vendorFirstName", v."lastName" as "vendorLastName"
          FROM "Payment" p
          JOIN "Client" c ON p."clientId" = c."id"
          JOIN "User" u ON c."userId" = u."id"
          JOIN "Loan" l ON p."loanId" = l."id"
          LEFT JOIN "Installment" i ON p."installmentId" = i."id"
          LEFT JOIN "User" v ON l."assignedVendorId" = v."id"
          WHERE p."paymentDate"::date >= $1::date AND p."paymentDate"::date <= $2::date
            ${user.role === 'VENDEDOR' ? `AND l."assignedVendorId" = '${user.userId}'` : ''}
            ${vendedorId && user.role === 'ADMIN' ? `AND l."assignedVendorId" = '${vendedorId}'` : ''}
            ${estado ? `AND p.status = '${estado}'` : ''}
            ${clienteFilter}
          ORDER BY p."paymentDate" DESC
        `, startDate, endDate);
      }

      // Calculate total amount
      const totalMonto = payments.reduce((sum: number, p: any) => sum + Number(p.amount), 0);

      // Format response - use paymentDateLocal which is already formatted as YYYY-MM-DD from DB
      const formattedPayments = payments.map((p: any) => {
        // paymentDateLocal is already in YYYY-MM-DD format from DB
        const fechaLocal = p.paymentDateLocal || '';
        
        return {
          id: p.id,
          fecha: fechaLocal,
          cliente: (p.clientFirstName || '') + ' ' + (p.clientLastName || ''),
          prestamoId: p.loanId,
          cuota: p.installmentNumber || null,
          monto: Number(p.amount),
          estado: p.status,
          referencia: p.reference,
          notas: p.notes,
          fechaPago: p.paymentDate || p.createdAt,
          vendedor: p.vendorFirstName && p.vendorLastName 
            ? `${p.vendorFirstName} ${p.vendorLastName}` 
            : null,
        };
      });

      res.json({
        success: true,
        data: {
          payments: formattedPayments,
          totalMonto,
          filtros: {
            fechaInicio: startDate,
            fechaFin: endDate,
            vendedorId: vendedorId || null,
            estado: estado || null,
          },
        },
      });
    } catch (error) {
      console.error('Get payments by date error:', error);
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

// PUT /api/payments/:id - Edit a payment (ADMIN only)
router.put('/:id', authMiddleware, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
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

// Validation schema for mora payment (no installmentId - abelian account)
const createMoraPaymentSchema = z.object({
  loanId: z.string().cuid('Invalid loan ID'),
  installmentId: z.string().cuid('Invalid installment ID'),
  amount: z.number().min(0, 'Amount cannot be negative'),
  paymentDate: z.string().optional(),
  reference: z.string().max(100).optional(),
  notes: z.string().max(500).optional(),
  originalMoraAmount: z.number().min(0).optional(),
  originalDaysOverdue: z.number().int().min(0).optional(),
});

// POST /api/payments/mora - Register a mora payment (abono a cuenta, no associated to any installment)
router.post('/mora', authMiddleware, requireVendor, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Validate request
    const validation = createMoraPaymentSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'Validation error',
        details: validation.error.errors,
      });
      return;
    }

    const { 
      loanId, 
      installmentId, 
      amount, 
      paymentDate, 
      reference, 
      notes,
      originalMoraAmount,
      originalDaysOverdue 
    } = validation.data;

    // Get installment to build notes
    const installment = await prisma.installment.findUnique({
      where: { id: installmentId },
    });

    if (!installment) {
      res.status(400).json({
        success: false,
        error: 'Installment not found',
      });
      return;
    }

    // Get loan to validate and get client
    const loan = await prisma.loan.findUnique({
      where: { id: loanId },
      include: { client: true },
    });

    if (!loan) {
      res.status(404).json({
        success: false,
        error: 'Loan not found',
      });
      return;
    }

    if (loan.status !== LoanStatus.ACTIVE) {
      res.status(400).json({
        success: false,
        error: `Cannot register payment on loan with status ${loan.status}`,
      });
      return;
    }

    // Build notes with tracking information
    const installmentNumber = installment.installmentNumber;
    const wasModified = originalMoraAmount !== undefined && amount !== originalMoraAmount;
    const forgivenText = amount === 0 && wasModified ? ' (PERDONADA)' : '';
    const modifiedText = wasModified && amount > 0 ? ` MODIFICADO a $${amount.toFixed(2)}` : '';
    
    let autoNotes = `Mora cuota #${installmentNumber}`;
    if (originalMoraAmount !== undefined) {
      autoNotes += `. Original: $${originalMoraAmount.toFixed(2)}`;
    }
    if (originalDaysOverdue !== undefined) {
      autoNotes += `, Días: ${originalDaysOverdue}`;
    }
    if (wasModified) {
      autoNotes += `.${modifiedText}`;
    }
    if (forgivenText) {
      autoNotes += forgivenText;
    }

    // Combine autoNotes with manual notes if provided
    const finalNotes = notes ? `${autoNotes}. ${notes}` : autoNotes;

    // Create payment WITHOUT installmentId (abono a cuenta)
    const payment = await prisma.payment.create({
      data: {
        clientId: loan.clientId,
        loanId: loanId,
        installmentId: null, // Key: NO associated installment
        amount: amount,
        type: 'MANUAL',
        status: 'COMPLETED',
        reference,
        notes: finalNotes,
        paymentDate: paymentDate ? new Date(paymentDate) : undefined,
        processedAt: new Date(),
      },
    });

    res.status(201).json({
      success: true,
      data: {
        id: payment.id,
        loanId: payment.loanId,
        installmentId: payment.installmentId, // Will be null
        amount: Number(payment.amount),
        status: payment.status,
        reference: payment.reference,
        notes: payment.notes,
        paymentDate: payment.paymentDate?.toISOString() || payment.createdAt.toISOString(),
        createdAt: payment.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Mora payment error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// GET /api/payments/balance/:loanId/at?date=YYYY-MM-DD - Get balance with mora calculated at specific date
router.get('/balance/:loanId/at', authMiddleware, requireVendor, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { loanId } = req.params;
    const { date } = req.query;

    // Validate date query param
    let referenceDate: Date;
    if (date) {
      const dateStr = String(date);
      // Parse YYYY-MM-DD as local date (not UTC to avoid timezone shift)
      const [year, month, day] = dateStr.split('-').map(Number);
      if (isNaN(year) || isNaN(month) || isNaN(day)) {
        res.status(400).json({
          success: false,
          error: 'Invalid date format. Use YYYY-MM-DD',
        });
        return;
      }
      // Create date in local time (midnight)
      referenceDate = new Date(year, month - 1, day);
    } else {
      // Use getNow() from datetime service to use configured timezone
      const { getNow } = await import('../services/datetime');
      referenceDate = await getNow();
    }

    const balance = await PaymentService.calculateLoanBalanceAt(loanId, referenceDate);

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
        // Return as YYYY-MM-DD to avoid timezone shift when displaying
        calculatedAt: `${referenceDate.getFullYear()}-${String(referenceDate.getMonth() + 1).padStart(2, '0')}-${String(referenceDate.getDate()).padStart(2, '0')}`,
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
    console.error('Get balance at date error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// DELETE /api/payments/:id - Delete a payment (ADMIN only)
router.delete('/:id', authMiddleware, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
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
      // Free payment (abono a cuenta) - no associated to any installment
      // When deleted, should NOT affect installment status because it's not clear which installment it belongs to
      // Only delete the payment record, keep installment states unchanged
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