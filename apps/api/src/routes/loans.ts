import { Router, Response } from 'express';
import { z } from 'zod';
import { PrismaClient, Role, LoanStatus, PaymentFrequency } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { requireAdmin, requireVendor, requireClientOnly } from '../middleware/rbac';
import { AmortizationService } from '../services/amortization';
import { RefinancingService } from '../services/refinancing';
import { CancelacionAnticipadaService } from '../services/cancelacion-anticipada';
import { getNow } from '../services/datetime';

const router: ReturnType<typeof Router> = Router();
const prisma = new PrismaClient();

// Validation schemas
const simulationSchema = z.object({
  amount: z.number().positive().min(1000).max(100000),
  interestRate: z.number().positive().min(1).max(50),
  termMonths: z.number().int().positive().min(1).max(60),
  frequency: z.enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY', 'DAILY']).default('MONTHLY'),
});

const createLoanSchema = z.object({
  clientId: z.string().cuid(),
  amount: z.number().positive().min(100),
  interestRate: z.number().positive().min(0.1).max(500),
  termMonths: z.number().int().positive().min(1).max(120),
  frequency: z.enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY', 'DAILY']).default('MONTHLY'),
  purpose: z.string().optional(),
  notes: z.string().optional(),
  startDate: z.string().optional(),
  schedule: z.array(z.object({
    number: z.number(),
    dueDate: z.string(),
    amount: z.number(),
    principal: z.number(),
    interest: z.number(),
    balance: z.number(),
  })).optional(),
});

// GET /api/loans/mine - Get current CLIENTE's loans only
router.get('/mine', authMiddleware, requireClientOnly, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { page = '1', limit = '20' } = req.query;
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);

    // Get client associated with current user
    const client = await prisma.client.findUnique({
      where: { userId: req.user!.userId },
    });

    if (!client) {
      res.json({
        success: true,
        data: {
          loans: [],
          total: 0,
          page: pageNum,
          limit: limitNum,
          totalPages: 0,
        },
      });
      return;
    }

    const where = { clientId: client.id };

    const [loans, total] = await Promise.all([
      prisma.loan.findMany({
        where,
        include: {
          client: {
            include: {
              user: {
                select: {
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
            },
          },
          assignedVendor: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
      prisma.loan.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        loans,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('Get my loans error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// GET /api/loans/simulate - Public endpoint for loan simulation
router.post('/simulate', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const body = simulationSchema.parse(req.body);

    const result = AmortizationService.calculate({
      amount: body.amount,
      interestRate: body.interestRate / 100, // Convert percentage to decimal
      termMonths: body.termMonths,
      frequency: body.frequency,
    });

    // Convert dates to ISO strings for JSON serialization
    const schedule = result.schedule.map(item => ({
      ...item,
      dueDate: item.dueDate.toISOString(),
    }));

    res.json({
      success: true,
      data: {
        ...result,
        schedule,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      });
      return;
    }
    
    console.error('Simulation error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// GET /api/loans - List loans (filtered by role)
router.get('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { status, clientId, page = '1', limit = '20' } = req.query;
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);

    const where: any = {};

    // Filter by role
    if (req.user!.role === Role.CLIENTE) {
      // Client sees only their own loans
      const client = await prisma.client.findUnique({
        where: { userId: req.user!.userId },
      });
      if (client) {
        where.clientId = client.id;
      }
    } else if (req.user!.role === Role.VENDEDOR) {
      // Vendor sees only their assigned loans
      where.assignedVendorId = req.user!.userId;
    }
    // Admin sees all

    // Additional filters
    if (status) {
      where.status = status;
    }
    if (clientId && req.user!.role !== Role.CLIENTE) {
      where.clientId = clientId;
    }

    const [loans, total] = await Promise.all([
      prisma.loan.findMany({
        where,
        include: {
          client: {
            include: {
              user: {
                select: {
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
            },
          },
          assignedVendor: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
      prisma.loan.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        data: loans,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('List loans error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// GET /api/loans/:id - Get loan details
router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const loan = await prisma.loan.findUnique({
      where: { id },
      include: {
        client: {
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
              },
            },
          },
        },
          assignedVendor: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        installments: {
          orderBy: { installmentNumber: 'asc' },
          select: {
            id: true,
            installmentNumber: true,
            dueDate: true,
            amount: true,
            principal: true,
            interest: true,
            balance: true,
            capitalBalance: true,
            paidAmount: true,
            status: true,
            paidAt: true,
            moraAmount: true,
          },
        },
        payments: {
          orderBy: { createdAt: 'desc' },
          include: {
            installment: {
              select: {
                installmentNumber: true,
              },
            },
          },
        },
      },
    });

    if (!loan) {
      res.status(404).json({
        success: false,
        error: 'Loan not found',
      });
      return;
    }

    // Check access权限
    if (req.user!.role === Role.CLIENTE) {
      const client = await prisma.client.findUnique({
        where: { userId: req.user!.userId },
      });
      if (!client || loan.clientId !== client.id) {
        res.status(403).json({
          success: false,
          error: 'Access denied',
        });
        return;
      }
    } else if (req.user!.role === Role.VENDEDOR) {
      if (loan.assignedVendorId !== req.user!.userId) {
        res.status(403).json({
          success: false,
          error: 'Access denied',
        });
        return;
      }
    }

    res.json({
      success: true,
      data: loan,
    });
  } catch (error) {
    console.error('Get loan error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// POST /api/loans - Create new loan (Vendor/Admin only)
router.post('/', authMiddleware, requireVendor, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const body = createLoanSchema.parse(req.body);

    // Verify client exists
    const client = await prisma.client.findUnique({
      where: { id: body.clientId },
      include: { user: true },
    });

    if (!client) {
      res.status(404).json({
        success: false,
        error: 'Client not found',
      });
      return;
    }

    // Calculate amortization with start date - use schedule from frontend if provided
    const startDate = body.startDate ? new Date(body.startDate) : await getNow();
    
    let installmentsData: { number: number; dueDate: string; amount: number; principal: number; interest: number; balance: number; }[] = body.schedule || [];
    let installmentAmount = 0;
    let totalInterest = 0;
    let totalPayment = 0;

    if (body.schedule && body.schedule.length > 0) {
      // Use values from frontend simulation
      installmentAmount = body.schedule[0].amount;
      totalPayment = body.schedule.reduce((sum, item) => sum + item.amount, 0);
      totalInterest = totalPayment - body.amount;
    } else {
      // Calculate normally
      const amortization = AmortizationService.calculate({
        amount: body.amount,
        interestRate: body.interestRate / 100,
        termMonths: body.termMonths,
        frequency: body.frequency,
        startDate,
      });
      installmentsData = amortization.schedule.map(item => ({
        number: item.number,
        dueDate: item.dueDate.toISOString(),
        amount: item.amount,
        principal: item.principal,
        interest: item.interest,
        balance: item.amount, // Balance = amount initially (paidAmount starts at 0)
      }));
      installmentAmount = amortization.installmentAmount;
      totalInterest = amortization.totalInterest;
      totalPayment = amortization.totalPayment;
    }

    // Create loan with installments in transaction
    const loan = await prisma.$transaction(async (tx) => {
      // Create loan
      const newLoan = await tx.loan.create({
        data: {
          clientId: body.clientId,
          assignedVendorId: req.user!.role === Role.VENDEDOR ? req.user!.userId : undefined,
          amount: body.amount,
          interestRate: body.interestRate,
          termMonths: body.termMonths,
          frequency: body.frequency,
          status: LoanStatus.PENDING,
          purpose: body.purpose,
          notes: body.notes,
          startedAt: startDate,
          totalInterest,
          totalPayment,
          installmentAmount,
        },
      });

      // Create installments
      await tx.installment.createMany({
        data: installmentsData.map((item: any) => ({
          loanId: newLoan.id,
          installmentNumber: item.number,
          dueDate: new Date(item.dueDate),
          amount: item.amount,
          principal: item.principal,
          interest: item.interest,
          balance: item.amount,
          capitalBalance: item.capitalBalance || item.amount,
          status: 'PENDING',
        })),
      });

      return newLoan;
    });

    // Get the loan with installments
    const loanWithDetails = await prisma.loan.findUnique({
      where: { id: loan.id },
      include: {
        client: {
          include: { user: { select: { firstName: true, lastName: true } } },
        },
        installments: { orderBy: { installmentNumber: 'asc' } },
      },
    });

    res.status(201).json({
      success: true,
      data: loanWithDetails,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      });
      return;
    }
    
    console.error('Create loan error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// PATCH /api/loans/:id/approve - Approve loan (Admin only)
router.patch('/:id/approve', authMiddleware, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const loan = await prisma.loan.findUnique({ where: { id } });

    if (!loan) {
      res.status(404).json({
        success: false,
        error: 'Loan not found',
      });
      return;
    }

    if (loan.status !== LoanStatus.PENDING) {
      res.status(400).json({
        success: false,
        error: 'Loan cannot be approved',
      });
      return;
    }

    const updatedLoan = await prisma.loan.update({
      where: { id },
      data: {
        status: LoanStatus.ACTIVE,
        approvedAt: new Date(),
        approvedBy: req.user!.userId,
        // Keep the original startedAt from the pending loan - don't overwrite with today
      },
      include: {
        client: {
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
              },
            },
          },
        },
        installments: {
          orderBy: { installmentNumber: 'asc' },
        },
      },
    });

    res.json({
      success: true,
      data: updatedLoan,
    });
  } catch (error) {
    console.error('Approve loan error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// DELETE /api/loans/:id - Delete loan (Admin only)
router.delete('/:id', authMiddleware, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const loan = await prisma.loan.findUnique({ where: { id } });

    if (!loan) {
      res.status(404).json({
        success: false,
        error: 'Loan not found',
      });
      return;
    }

    // Check if loan has been refinanced - can only delete if the new loan was previously deleted
    if (loan.prestamo_nuevo_id) {
      const newLoanExists = await prisma.loan.findUnique({
        where: { id: loan.prestamo_nuevo_id },
      });
      
      if (newLoanExists) {
        res.status(400).json({
          success: false,
          error: 'No se puede eliminar un préstamo que ya ha sido refinanciado',
        });
        return;
      }
      // If new loan doesn't exist (was deleted), we can delete the refinanced loan
    }

    // Delete related records first
    await prisma.$transaction([
      prisma.payment.deleteMany({ where: { loanId: id } }),
      prisma.installment.deleteMany({ where: { loanId: id } }),
      prisma.collectionAction.deleteMany({ where: { loanId: id } }),
      prisma.loan.delete({ where: { id } }),
    ]);

    res.json({
      success: true,
      data: { message: 'Loan deleted successfully' },
    });
  } catch (error) {
    console.error('Delete loan error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// PATCH /api/loans/:id - Update loan (Admin only)
router.patch('/:id', authMiddleware, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { amount, interestRate, termMonths, frequency, purpose, notes, startDate, schedule, status } = req.body;

    const loan = await prisma.loan.findUnique({ where: { id } });

    if (!loan) {
      res.status(404).json({
        success: false,
        error: 'Loan not found',
      });
      return;
    }

    // Handle status change separately
    if (status) {
      // Allow status changes: PENDING -> ACTIVE, ACTIVE -> DEFAULTED, DEFAULTED -> ACTIVE
      if (status === 'DEFAULTED' && loan.status === 'ACTIVE') {
        const updated = await prisma.loan.update({
          where: { id },
          data: { status: LoanStatus.DEFAULTED },
        });
        res.json({ success: true, data: updated });
        return;
      }
      
      if (status === 'ACTIVE' && (loan.status === 'DEFAULTED' || loan.status === 'PENDING')) {
        const updated = await prisma.loan.update({
          where: { id },
          data: { status: LoanStatus.ACTIVE },
        });
        res.json({ success: true, data: updated });
        return;
      }

      if (status === 'ACTIVE' && loan.status === 'PENDING') {
        const updated = await prisma.loan.update({
          where: { id },
          data: { 
            status: LoanStatus.ACTIVE,
            approvedAt: new Date(),
          },
        });
        res.json({ success: true, data: updated });
        return;
      }

      res.status(400).json({
        success: false,
        error: `Cannot change status from ${loan.status} to ${status}`,
      });
      return;
    }

    // Original edit logic for PENDING loans
    if (loan.status !== LoanStatus.PENDING) {
      res.status(400).json({
        success: false,
        error: 'Only pending loans can be edited',
      });
      return;
    }

    // Parse start date or use existing
    const parsedStartDate = startDate ? new Date(startDate) : (loan.startedAt || await getNow());

    // Use schedule from frontend if provided, otherwise calculate
    let installmentsData = schedule;
    let installmentAmount = Number(loan.installmentAmount);
    let totalInterest = Number(loan.totalInterest);
    let totalPayment = Number(loan.totalPayment);

    if (schedule && Array.isArray(schedule) && schedule.length > 0) {
      // Use values from frontend simulation
      installmentAmount = schedule[0].amount;
      totalPayment = schedule.reduce((sum: number, item: any) => sum + item.amount, 0);
      totalInterest = totalPayment - (amount ? Number(amount) : Number(loan.amount));
    } else {
      // Recalculate amortization
      const amortization = AmortizationService.calculate({
        amount: amount || Number(loan.amount),
        interestRate: (interestRate || Number(loan.interestRate)) / 100,
        termMonths: termMonths || loan.termMonths,
        frequency: frequency || loan.frequency,
        startDate: parsedStartDate,
      });
      installmentsData = amortization.schedule.map(item => ({
        number: item.number,
        dueDate: item.dueDate,
        amount: item.amount,
        principal: item.principal,
        interest: item.interest,
        balance: item.amount, // Balance = amount initially
      }));
      installmentAmount = amortization.installmentAmount;
      totalInterest = amortization.totalInterest;
      totalPayment = amortization.totalPayment;
    }

    await prisma.$transaction(async (tx) => {
      // Update loan
      await tx.loan.update({
        where: { id },
        data: {
          amount: amount ? Number(amount) : undefined,
          interestRate: interestRate ? Number(interestRate) : undefined,
          termMonths: termMonths || undefined,
          frequency: frequency || undefined,
          purpose: purpose !== undefined ? purpose : undefined,
          notes: notes !== undefined ? notes : undefined,
          totalInterest,
          totalPayment,
          installmentAmount,
          startedAt: parsedStartDate,
        },
      });

      // Delete old installments and create new ones
      await tx.installment.deleteMany({ where: { loanId: id } });
      
      await tx.installment.createMany({
        data: installmentsData.map((item: any) => ({
          loanId: id,
          installmentNumber: item.number,
          dueDate: new Date(item.dueDate),
          amount: item.amount,
          principal: item.principal,
          interest: item.interest,
          balance: item.amount,
          capitalBalance: item.capitalBalance || item.amount,
          status: 'PENDING',
        })),
      });
    });

    const loanWithDetails = await prisma.loan.findUnique({
      where: { id },
      include: {
        client: {
          include: { user: { select: { firstName: true, lastName: true } } },
        },
        installments: { orderBy: { installmentNumber: 'asc' } },
      },
    });

    res.json({
      success: true,
      data: loanWithDetails,
    });
  } catch (error) {
    console.error('Update loan error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// GET /api/loans/:id/schedule - Get loan payment schedule
router.get('/:id/schedule', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const installments = await prisma.installment.findMany({
      where: { loanId: id },
      orderBy: { installmentNumber: 'asc' },
    });

    if (installments.length === 0) {
      res.status(404).json({
        success: false,
        error: 'Loan not found or no installments',
      });
      return;
    }

    res.json({
      success: true,
      data: installments,
    });
  } catch (error) {
    console.error('Get schedule error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// ============================================
// Refinancing Endpoints
// ============================================

// Validation schema for execute refinancing
const executeRefinancingSchema = z.object({
  nuevaTasaInteres: z.number().min(0),
  cantidadCuotas: z.number().int().min(1).max(60),
  nuevaFrecuencia: z.enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY', 'DAILY']),
  fechaInicio: z.string(),
  pagoInicial: z.number().min(0).optional(),
  interesesVencidosManual: z.number().min(0).optional(),
});

// GET /api/loans/:id/preview-refinancing - Preview refinancing (PUBLIC - no auth)
router.get('/:id/preview-refinancing', async (req, res): Promise<void> => {
  try {
    const { id } = req.params;
    const { nuevaTasaInteres, cantidadCuotas, nuevaFrecuencia, pagoInicial, interesesVencidosManual, fechaInicio } = req.query;

    // Calculate debt breakdown
    const calculation = await RefinancingService.calculateNewCapital(id);

    if (!calculation) {
      res.status(404).json({
        success: false,
        error: 'Loan not found',
      });
      return;
    }

    // Check eligibility
    const validation = await RefinancingService.validateRefinancingEligibility(id);
    if (!validation.eligible) {
      res.status(400).json({
        success: false,
        error: validation.error,
      });
      return;
    }

    // Use manual override if provided
    const manualInteresesVencidos = interesesVencidosManual 
      ? parseFloat(interesesVencidosManual as string) 
      : undefined;
    
    const effectiveInteresesVencidos = manualInteresesVencidos !== undefined 
      ? manualInteresesVencidos 
      : calculation.interesesVencidos;

    // Calculate adjusted capital with initial payment and manual interesesVencidos
    const initialPayment = pagoInicial ? parseFloat(pagoInicial as string) : 0;
    const adjustedCapital = Math.max(0, 
      calculation.capitalPendiente + effectiveInteresesVencidos + calculation.pagosAtrasados - initialPayment
    );

    // Parse start date (fechaInicio) or use current date in timezone
    const startDate = fechaInicio ? new Date(fechaInicio as string) : await getNow();

    const response: any = {
      success: true,
      data: {
        loanId: id,
        eligible: true,
        breakdown: {
          capitalPendiente: calculation.capitalPendiente,
          interesesVencidos: effectiveInteresesVencidos,
          pagosAtrasados: calculation.pagosAtrasados,
          nuevoCapital: adjustedCapital,
        },
      },
    };

    // If query params provided, generate preview amortization table
    if (nuevaTasaInteres && cantidadCuotas) {
      const rate = parseFloat(nuevaTasaInteres as string) / 100;
      const term = parseInt(cantidadCuotas as string, 10);
      const frequency = (nuevaFrecuencia as string) as PaymentFrequency || PaymentFrequency.MONTHLY;

      const amortization = AmortizationService.calculate({
        amount: adjustedCapital,
        interestRate: rate,
        termMonths: term,
        frequency: frequency,
        startDate: startDate,
      });

      response.data.previewAmortization = {
        nuevoCapital: adjustedCapital,
        nuevaTasaInteres: parseFloat(nuevaTasaInteres as string),
        nuevaFrecuencia: frequency,
        cantidadCuotas: term,
        installmentAmount: amortization.installmentAmount,
        totalInterest: amortization.totalInterest,
        totalPayment: amortization.totalPayment,
        schedule: amortization.schedule.map(item => ({
          ...item,
          dueDate: item.dueDate.toISOString(),
        })),
      };
    }

    res.json(response);
  } catch (error) {
    console.error('Preview refinancing error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// POST /api/loans/:id/execute-refinancing - Execute refinancing (Admin only)
router.post('/:id/execute-refinancing', authMiddleware, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id: loanId } = req.params;
    const body = executeRefinancingSchema.parse(req.body);

    const { nuevaTasaInteres, cantidadCuotas, nuevaFrecuencia, fechaInicio, pagoInicial, interesesVencidosManual } = body;

    // Parse the first due date
    const startDate = fechaInicio ? new Date(fechaInicio) : await getNow();

    // Validate loan exists is eligible for refinancing
    const validation = await RefinancingService.validateRefinancingEligibility(loanId);
    if (!validation.eligible) {
      res.status(400).json({
        success: false,
        error: validation.error,
      });
      return;
    }

    // Execute refinancing
    const result = await RefinancingService.executeRefinancing({
      loanId,
      newInterestRate: nuevaTasaInteres,
      newTermMonths: cantidadCuotas,
      newFrequency: nuevaFrecuencia as PaymentFrequency,
      startDate,
      notes: pagoInicial ? `Pago inicial: ${pagoInicial}` : undefined,
      capitalExtra: pagoInicial || undefined,
      interesesVencidosManual,
    });

    if (!result.success) {
      res.status(400).json({
        success: false,
        error: result.error,
      });
      return;
    }

    // Get full new loan details
    const newLoan = await prisma.loan.findUnique({
      where: { id: result.newLoan!.id },
      include: {
        client: {
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        installments: {
          orderBy: { installmentNumber: 'asc' },
        },
      },
    });

    res.json({
      success: true,
      data: {
        message: 'Refinanciación ejecutada exitosamente',
        newLoan,
        oldLoanId: loanId,
      },
    });
  } catch (error) {
    console.error('Execute refinancing error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// GET /api/loans/:id/preview-cancelacion-anticipada - Preview early cancellation (no auth)
router.get('/:id/preview-cancelacion-anticipada', async (req, res): Promise<void> => {
  try {
    const { id } = req.params;

    const preview = await CancelacionAnticipadaService.getCancelacionAnticipadaPreview(id);

    if (!preview) {
      res.status(404).json({
        success: false,
        error: 'Préstamo no encontrado',
      });
      return;
    }

    if (preview.error) {
      res.status(400).json({
        success: false,
        error: preview.error,
      });
      return;
    }

    res.json({
      success: true,
      data: {
        loanId: preview.loanId,
        loanStatus: preview.loanStatus,
        breakdown: preview.breakdown,
      },
    });
  } catch (error) {
    console.error('Preview cancelacion anticipada error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// POST /api/loans/:id/execute-cancelacion-anticipada - Execute early cancellation (Admin or Vendor)
router.post('/:id/execute-cancelacion-anticipada', authMiddleware, requireVendor, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id: loanId } = req.params;
    const { interesesVencidosManual } = req.body;

    const result = await CancelacionAnticipadaService.executeEarlyCancellation(
      loanId,
      interesesVencidosManual
    );

    if (!result.success) {
      res.status(400).json({
        success: false,
        error: result.error,
      });
      return;
    }

    res.json({
      success: true,
      data: {
        message: 'Cancelación anticipada ejecutada exitosamente',
        loan: result.loan,
      },
    });
  } catch (error) {
    console.error('Execute cancelacion anticipada error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

export default router;
