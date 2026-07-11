import Router, { Response } from 'express';
import { z } from 'zod';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { requireVendor, requireAdmin } from '../middleware/rbac';
import { PaymentService } from '../services/payment';
import { getToday } from '../services/datetime';
import { CommissionService } from '../services/commission';
import { PrismaClient, InstallmentStatus, LoanStatus } from '@prisma/client';

const router: ReturnType<typeof Router> = Router();
const prisma = new PrismaClient();

/**
 * Round a number to 2 decimal places to match Decimal(12,2) DB precision.
 * Prevents floating-point comparison bugs where accumulated partial payments
 * yield values like 999.999... instead of 1000.00.
 */
function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

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

    // Recalculate commission after successful payment (non-blocking)
    CommissionService.recalculateLoan(loanId).catch(err => {
      console.error('Commission recalculation error:', err);
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
    const { fechaInicio, fechaFin, vendedorId, estado, cliente, page = '1', limit = '20' } = req.query;
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

    // Pagination
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const offset = (pageNum - 1) * limitNum;

    // RBAC: Vendedor only sees their own loans - handled in raw query below

    // Build common WHERE clause (used by data, count, and sum queries)
    const clienteFilter = cliente ? `AND (LOWER(u."firstName") LIKE '%${String(cliente).toLowerCase()}%' OR LOWER(u."lastName") LIKE '%${String(cliente).toLowerCase()}%')` : '';

    const rbacFilter = user.role === 'VENDEDOR' ? `AND l."assignedVendorId" = '${user.userId}'` : '';
    const vendorFilter = vendedorId && user.role === 'ADMIN' ? `AND l."assignedVendorId" = '${vendedorId}'` : '';
    const estadoFilter = estado ? `AND p.status = '${estado}'` : '';

    const fromClause = `
      FROM "Payment" p
      JOIN "Client" c ON p."clientId" = c."id"
      JOIN "User" u ON c."userId" = u."id"
      JOIN "Loan" l ON p."loanId" = l."id"
      LEFT JOIN "Installment" i ON p."installmentId" = i."id"
      LEFT JOIN "User" v ON l."assignedVendorId" = v."id"
    `;

    const whereClause = startDate === endDate
      ? `WHERE p."paymentDate"::date = $1::date`
      : `WHERE p."paymentDate"::date >= $1::date AND p."paymentDate"::date <= $2::date`;

    const filtersClause = `${rbacFilter} ${vendorFilter} ${estadoFilter} ${clienteFilter}`;
    const params = startDate === endDate ? [startDate] : [startDate, endDate];

    // Run data, count, and sum queries in parallel
    const [payments, countResult, sumResult] = await Promise.all([
      prisma.$queryRawUnsafe<any[]>(`
        SELECT p.id, p."clientId", p."loanId", p."installmentId", p.amount, p.type,
               p.status, p.reference, p.notes, p."paymentDate", p."createdAt", p."updatedAt",
               p."processedAt",
               u."firstName" as "clientFirstName", u."lastName" as "clientLastName",
               l."id" as "loanId", l."amount" as "loanAmount", l."assignedVendorId",
               i."installmentNumber",
               p."paymentDate"::text as "paymentDateLocal",
               v."firstName" as "vendorFirstName", v."lastName" as "vendorLastName"
        ${fromClause}
        ${whereClause}
          ${filtersClause}
        ORDER BY p."paymentDate" DESC, p."loanId" DESC
        LIMIT ${limitNum} OFFSET ${offset}
      `, ...params),
      prisma.$queryRawUnsafe<any[]>(`
        SELECT COUNT(*) as count
        ${fromClause}
        ${whereClause}
          ${filtersClause}
      `, ...params),
      prisma.$queryRawUnsafe<any[]>(`
        SELECT COALESCE(SUM(p.amount), 0) as "totalMonto"
        ${fromClause}
        ${whereClause}
          ${filtersClause}
      `, ...params),
    ]);

    const total = parseInt(countResult[0]?.count || '0', 10);
    const totalMonto = Number(sumResult[0]?.totalMonto || 0);

    // Format response
    const formattedPayments = payments.map((p: any) => {
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
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
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

    // Can't edit if loan is not ACTIVE (blocks REFINANCIADO, DEFAULTED/incobrable, PAID, PENDING, CANCELLED)
    if (payment.loan.status !== LoanStatus.ACTIVE) {
      let errorMsg = 'No se puede editar pagos de préstamos que no están activos';
      if (payment.loan.status === LoanStatus.REFINANCIADO) {
        errorMsg = 'No se puede editar pagos de préstamos refinanciados';
      } else if (payment.loan.status === LoanStatus.DEFAULTED) {
        errorMsg = 'No se puede editar pagos de préstamos marcados como incobrables';
      }
      res.status(400).json({
        success: false,
        error: errorMsg,
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
        // Use roundMoney() to match Decimal(12,2) DB precision and avoid
        // floating-point issues (e.g. 333.33+333.33+333.34 = 999.999... < 1000)
        let newStatus: InstallmentStatus;
        if (roundMoney(newPaidAmount) >= roundMoney(originalAmount)) {
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
            if (roundMoney(newPaidAmount) >= roundMoney(originalAmount)) {
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
              if (roundMoney(newPaidAmount) >= roundMoney(originalAmount)) {
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
        status: { notIn: [InstallmentStatus.PAID, InstallmentStatus.INTEREST_ONLY, InstallmentStatus.CANCELADA_POR_REFINANCIACION] },
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

    // Recalculate commission after payment update (non-blocking)
    CommissionService.recalculateLoan(payment.loanId).catch(err => {
      console.error('Commission recalculation error:', err);
    });

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

    if (loan.status !== LoanStatus.ACTIVE && loan.status !== LoanStatus.PAID) {
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

// Validation schema for interest-only payment
const createInterestOnlyPaymentSchema = z.object({
  loanId: z.string().cuid('Invalid loan ID'),
  installmentId: z.string().cuid('Invalid installment ID'),
  amount: z.number().positive('Amount must be greater than 0'),
  paymentDate: z.string().optional(),
  reference: z.string().max(100).optional(),
  notes: z.string().max(500).optional(),
});

// POST /api/payments/interest-only - Register an interest-only payment
router.post('/interest-only', authMiddleware, requireVendor, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const validation = createInterestOnlyPaymentSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'Validation error',
        details: validation.error.errors,
      });
      return;
    }

    const { loanId, installmentId, amount, reference, notes, paymentDate } = validation.data;

    const result = await PaymentService.processInterestOnlyPayment({
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
        amount: Number(result.payment!.amount),
        status: result.payment!.status,
        reference: result.payment!.reference,
        notes: result.payment!.notes,
        paymentDate: result.payment!.paymentDate?.toISOString() || result.payment!.createdAt.toISOString(),
        createdAt: result.payment!.createdAt.toISOString(),
      },
    });

    // Recalculate commission after interest-only payment (non-blocking)
    CommissionService.recalculateLoan(loanId).catch(err => {
      console.error('Commission recalculation error on interest-only payment:', err);
    });
  } catch (error) {
    console.error('Interest-only payment error:', error);
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

    // Can't delete if loan is CANCELLED, REFINANCIADO, or DEFAULTED (incobrable)
    if (payment.loan.status === LoanStatus.CANCELLED) {
      res.status(400).json({
        success: false,
        error: 'No se puede eliminar pagos de préstamos cancelados',
      });
      return;
    }

    if (payment.loan.status === LoanStatus.REFINANCIADO) {
      res.status(400).json({
        success: false,
        error: 'No se puede eliminar pagos de préstamos refinanciados',
      });
      return;
    }

    if (payment.loan.status === LoanStatus.DEFAULTED) {
      res.status(400).json({
        success: false,
        error: 'No se puede eliminar pagos de préstamos marcados como incobrables',
      });
      return;
    }

    const paymentAmount = Number(payment.amount);
    const installmentId = payment.installmentId;
    const loanId = payment.loanId;

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
        if (roundMoney(newPaidAmount) >= roundMoney(originalAmount)) {
          newStatus = InstallmentStatus.PAID;
        } else if (newPaidAmount > 0) {
          newStatus = InstallmentStatus.PARTIAL;
        } else {
          // Check if overdue based on due date (date-only comparison)
          const todayOnly = await getToday();
          const dueDate = new Date(installment.dueDate);
          const dueDateOnly = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
          const isOverdue = dueDateOnly < todayOnly;
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
      // Payment has no associated installmentId — two possible cases:
      //   a) Free payment (abono a cuenta): no installment to revert, just delete the record.
      //   b) Interest-only payment: needs full reversal of the INTEREST_ONLY installment
      //      and the "new" installment that was created when it was recorded.
      const isInterestOnly = payment.notes?.includes('Pago solo interés') ?? false;

      if (isInterestOnly) {
        const reverseResult = await PaymentService.reverseInterestOnlyPayment({
          paymentId: id,
          paymentAmount,
          loanId,
          notes: payment.notes,
        });

        if (!reverseResult.success) {
          res.status(400).json({
            success: false,
            error: reverseResult.error,
          });
          return;
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
        status: { notIn: [InstallmentStatus.PAID, InstallmentStatus.INTEREST_ONLY, InstallmentStatus.CANCELADA_POR_REFINANCIACION] },
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

    // Recalculate commission after payment deletion (non-blocking)
    CommissionService.recalculateLoan(loanId).catch(err => {
      console.error('Commission recalculation error:', err);
    });

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

// POST /api/payments/repair-statuses - Fix installment statuses inconsistent with balance (ADMIN only)
// Repairs cases where floating-point precision caused status=PARTIAL but balance=0 (should be PAID)
router.post('/repair-statuses', authMiddleware, requireAdmin, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    // 1. Fix installments where balance is 0 but status is still PARTIAL
    const fixedPartialToPaid = await prisma.$executeRaw`
      UPDATE "Installment"
      SET status = 'PAID', "paidAt" = NOW()
      WHERE round("balance"::numeric, 2) = 0
        AND status = 'PARTIAL'
    `;

    // 2. Fix installments where balance > 0 but status is PAID (should be PARTIAL)
    const fixedPaidToPartial = await prisma.$executeRaw`
      UPDATE "Installment"
      SET status = 'PARTIAL', "paidAt" = NULL
      WHERE round("balance"::numeric, 2) > 0
        AND status = 'PAID'
        AND "paidAmount" > 0
    `;

    res.json({
      success: true,
      data: {
        fixedPartialToPaid: Number(fixedPartialToPaid),
        fixedPaidToPartial: Number(fixedPaidToPartial),
      },
    });
  } catch (error) {
    console.error('Repair installment statuses error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

export default router;