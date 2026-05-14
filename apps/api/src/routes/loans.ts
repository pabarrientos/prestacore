import { Router, Response } from 'express';
import { z } from 'zod';
import { PrismaClient, Role, LoanStatus, PaymentFrequency, CommissionMode } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { requireAdmin, requireVendor, requireClientOnly } from '../middleware/rbac';
import { AmortizationService } from '../services/amortization';
import { RefinancingService } from '../services/refinancing';
import { CancelacionAnticipadaService } from '../services/cancelacion-anticipada';
import { getNow } from '../services/datetime';
import { getDefaultAmortizationSystem } from '../services/settings';
import { AmortizationSystemType } from '../services/amortization';
import { CommissionService } from '../services/commission';

const router: ReturnType<typeof Router> = Router();
const prisma = new PrismaClient();

// Validation schemas
const amortizationSystemSchema = z.enum(['FRENCH', 'GERMAN', 'FLAT_RATE']).optional();

const simulationSchema = z.object({
  amount: z.number().positive().min(100), // No max limit - can be configured in settings
  interestRate: z.number().positive().min(0.1), // Allow up to 2000% annual rate for high inflation scenarios
  termMonths: z.number().int().positive().min(1).max(60),
  frequency: z.enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY', 'DAILY']).default('MONTHLY'),
  amortizationSystem: amortizationSystemSchema,
  startDate: z.string().optional(),
});

const createLoanSchema = z.object({
  clientId: z.string().cuid(),
  amount: z.number().positive().min(100),
  interestRate: z.number().positive().min(0.1),
  termMonths: z.number().int().positive().min(1).max(120),
  frequency: z.enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY', 'DAILY']).default('MONTHLY'),
  purpose: z.string().optional(),
  notes: z.string().optional(),
  startDate: z.string().optional(),
  amortizationSystem: amortizationSystemSchema,
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

// POST /api/loans/request - Client requests a new loan (creates PENDING loan)
router.post('/request', authMiddleware, requireClientOnly, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const requestSchema = z.object({
      amount: z.number().positive().min(100),
      interestRate: z.number().positive().min(0.1),
      termMonths: z.number().int().positive().min(1).max(120),
      frequency: z.enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY', 'DAILY']).default('MONTHLY'),
      purpose: z.string().optional(),
      notes: z.string().optional(),
      startDate: z.string().optional(),
      amortizationSystem: amortizationSystemSchema,
      schedule: z.array(z.object({
        number: z.number(),
        dueDate: z.string(),
        amount: z.number(),
        principal: z.number(),
        interest: z.number(),
        balance: z.number(),
      })).optional(),
    });

    const body = requestSchema.parse(req.body);

    // Get client associated with current user
    const client = await prisma.client.findUnique({
      where: { userId: req.user!.userId },
    });

    if (!client) {
      res.status(404).json({
        success: false,
        error: 'Client not found. Please contact support.',
      });
      return;
    }

    // Check if client already has a pending loan
    const existingPending = await prisma.loan.findFirst({
      where: {
        clientId: client.id,
        status: LoanStatus.PENDING,
      },
    });

    if (existingPending) {
      res.status(400).json({
        success: false,
        error: 'You already have a pending loan request. Please wait for it to be processed.',
      });
      return;
    }

    const startDate = body.startDate ? new Date(body.startDate) : await getNow();
    const systemFromBody = body.amortizationSystem as AmortizationSystemType | undefined;
    const amortizationSystem = systemFromBody ?? (await getDefaultAmortizationSystem());
    
    let installmentsData: { number: number; dueDate: string; amount: number; principal: number; interest: number; balance: number; }[] = body.schedule || [];
    let installmentAmount = 0;
    let totalInterest = 0;
    let totalPayment = 0;

    if (body.schedule && body.schedule.length > 0) {
      installmentAmount = body.schedule[0].amount;
      totalPayment = body.schedule.reduce((sum, item) => sum + item.amount, 0);
      totalInterest = totalPayment - body.amount;
    } else {
      // Calculate from amortization if no schedule provided
      const amortization = AmortizationService.calculate({
        amount: body.amount,
        interestRate: body.interestRate / 100,
        termMonths: body.termMonths,
        frequency: body.frequency,
        startDate,
        amortizationSystem,
      });
      installmentAmount = amortization.installmentAmount;
      totalPayment = amortization.totalPayment;
      totalInterest = amortization.totalInterest;
      installmentsData = amortization.schedule.map(item => ({
        number: item.number,
        dueDate: item.dueDate.toISOString(),
        amount: item.amount,
        principal: item.principal,
        interest: item.interest,
        balance: item.amount,
      }));
    }

    // Create loan with installments in transaction
    const loan = await prisma.$transaction(async (tx) => {
      // Create loan
      const newLoan = await tx.loan.create({
        data: {
          clientId: client.id,
          amount: body.amount,
          interestRate: body.interestRate,
          termMonths: body.termMonths,
          frequency: body.frequency as PaymentFrequency,
          status: LoanStatus.PENDING,
          purpose: body.purpose,
          notes: body.notes,
          startedAt: startDate,
          totalInterest,
          totalPayment,
          installmentAmount,
          amortizationSystem,
        },
      });

      // Create installments
      if (installmentsData.length > 0) {
        await tx.installment.createMany({
          data: installmentsData.map(item => ({
            loanId: newLoan.id,
            installmentNumber: item.number,
            dueDate: new Date(item.dueDate),
            amount: item.amount,
            principal: item.principal,
            interest: item.interest,
            balance: item.balance,
            capitalBalance: item.balance,
            status: 'PENDING',
          })),
        });
      }

      return newLoan;
    });

    res.status(201).json({
      success: true,
      data: loan,
    });
  } catch (error) {
    console.error('Client loan request error:', error);
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: 'Invalid data',
        details: error.errors,
      });
      return;
    }
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// POST /api/loans/simulate - Public endpoint for loan simulation
router.post('/simulate', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const body = simulationSchema.parse(req.body);

    // Use default from settings if not provided
    const systemFromBody = body.amortizationSystem as AmortizationSystemType | undefined;
    const system = systemFromBody ?? (await getDefaultAmortizationSystem());

    const result = AmortizationService.calculate({
      amount: body.amount,
      interestRate: body.interestRate / 100, // Convert percentage to decimal
      termMonths: body.termMonths,
      frequency: body.frequency,
      amortizationSystem: system,
      startDate: body.startDate ? new Date(body.startDate) : undefined,
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
        data: loans.map(loan => ({
          ...loan,
          amount: Number(loan.amount),
          interestRate: Number(loan.interestRate),
          totalInterest: Number(loan.totalInterest),
          totalPayment: Number(loan.totalPayment),
          installmentAmount: Number(loan.installmentAmount),
        })),
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
    const systemFromBody = body.amortizationSystem as AmortizationSystemType | undefined;
    const amortizationSystem = systemFromBody ?? (await getDefaultAmortizationSystem());
    
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
        amortizationSystem,
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

    // Determine vendor ID and fetch commission config for snapshot
    let vendorId: string | undefined = undefined;
    let commissionPercentage: number | undefined = undefined;
    let commissionMode: CommissionMode | undefined = undefined;
    let commissionProjected = 0;

    if (req.user!.role === Role.VENDEDOR) {
      vendorId = req.user!.userId;
    }

    if (vendorId) {
      const vendor = await prisma.user.findUnique({
        where: { id: vendorId },
        select: { commissionPercentage: true, commissionMode: true },
      });
      
      if (vendor && vendor.commissionPercentage !== null) {
        commissionPercentage = Number(vendor.commissionPercentage);
        commissionMode = vendor.commissionMode as CommissionMode;
        
        // Calculate projected commission using the calculated installmentAmount
        commissionProjected = CommissionService.projectCommission(
          Number(body.amount),
          Number(body.interestRate) / 100,
          body.termMonths,
          commissionPercentage,
          commissionMode ?? CommissionMode.PROPORTIONAL,
          installmentAmount
        );
      }
    }

    // Create loan with installments in transaction
    const loan = await prisma.$transaction(async (tx) => {
      // Create loan
      const newLoan = await tx.loan.create({
        data: {
          clientId: body.clientId,
          assignedVendorId: vendorId,
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
          amortizationSystem,
          // Commission snapshot fields
          commissionPercentage: commissionPercentage ?? null,
          commissionMode: commissionMode ?? null,
          commissionProjected: commissionProjected || null,
          commissionGenerated: 0,
          commissionLiquidated: 0,
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
      },
    });

    // Recalculate commission after approval
    if (updatedLoan.assignedVendorId) {
      await CommissionService.recalculateLoan(id);
    }

    // Re-fetch with updated commission fields
    const refreshed = await prisma.loan.findUnique({
      where: { id },
      include: {
        client: { include: { user: { select: { firstName: true, lastName: true, email: true, phone: true } } } },
        installments: { orderBy: { installmentNumber: 'asc' } },
        payments: { orderBy: { createdAt: 'desc' } },
      },
    });

    res.json({
      success: true,
      data: refreshed,
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
    const { amount, interestRate, termMonths, frequency, purpose, notes, startDate, schedule, status, assignedVendorId, amortizationSystem, commissionPercentage, commissionMode } = req.body;

    const loan = await prisma.loan.findUnique({ where: { id } });

    if (!loan) {
      res.status(404).json({
        success: false,
        error: 'Loan not found',
      });
      return;
    }

    // Handle assignedVendorId change (can be done for any loan status)
    if (assignedVendorId !== undefined) {
      const newVendorId = assignedVendorId || null;

      // Recorrer toda la cadena de préstamos (both prestamo_origen_id and prestamo_nuevo_id)
      const loanIdsToUpdate = new Set<string>();
      
      // Función para recorreRPrestamo la cadena hacia atrás (prestamo_origen_id)
      const traverseBackwards = async (loanId: string) => {
        const loan = await prisma.loan.findUnique({ 
          where: { id: loanId },
          select: { prestamo_origen_id: true },
        });
        if (loan?.prestamo_origen_id) {
          loanIdsToUpdate.add(loan.prestamo_origen_id);
          await traverseBackwards(loan.prestamo_origen_id);
        }
      };
      
      // Función para recorrer la cadena hacia adelante (prestamo_nuevo_id)
      const traverseForwards = async (loanId: string) => {
        const loan = await prisma.loan.findUnique({ 
          where: { id: loanId },
          select: { prestamo_nuevo_id: true },
        });
        if (loan?.prestamo_nuevo_id) {
          loanIdsToUpdate.add(loan.prestamo_nuevo_id);
          await traverseForwards(loan.prestamo_nuevo_id);
        }
      };
      
      // Recorrer ambas direcciones
      await traverseBackwards(id);
      await traverseForwards(id);
      
      // Incluir el préstamo actual
      loanIdsToUpdate.add(id);
      
      // Obtener defaults del nuevo vendor si existe
      let vendorCommissionData: { commissionPercentage?: number | null; commissionMode?: CommissionMode | null } = {};
      if (newVendorId) {
        const newVendor = await prisma.user.findUnique({
          where: { id: newVendorId },
          select: { commissionPercentage: true, commissionMode: true },
        });
        if (newVendor?.commissionPercentage !== null && newVendor?.commissionPercentage !== undefined) {
          vendorCommissionData = {
            commissionPercentage: Number(newVendor.commissionPercentage),
            commissionMode: newVendor.commissionMode as CommissionMode,
          };
        }
      }
      
      // Actualizar todos los préstamos en la cadena
      await prisma.loan.updateMany({
        where: { id: { in: Array.from(loanIdsToUpdate) } },
        data: {
          assignedVendorId: newVendorId,
          ...(newVendorId && vendorCommissionData.commissionPercentage !== undefined ? {
            commissionPercentage: vendorCommissionData.commissionPercentage,
            commissionMode: vendorCommissionData.commissionMode ?? CommissionMode.PROPORTIONAL,
          } : !newVendorId ? {
            // Vendor removed — reset commission fields
            commissionPercentage: null,
            commissionMode: null,
            commissionProjected: null,
            commissionGenerated: 0,
            commissionLiquidated: 0,
          } : {}),
        },
      });
      
      // Recalcular comisiones para todos los préstamos afectados
      for (const lid of loanIdsToUpdate) {
        CommissionService.recalculateLoan(lid).catch(err => {
          console.error('Commission recalculation error on vendor reassign:', err);
        });
      }
      
      // Obtener el préstamo actualizado para retornar
      const updated = await prisma.loan.findUnique({
        where: { id },
        include: {
          client: { include: { user: { select: { firstName: true, lastName: true, email: true, phone: true } } } },
          assignedVendor: { select: { id: true, firstName: true, lastName: true } },
          installments: { orderBy: { installmentNumber: 'asc' } },
          payments: { orderBy: { createdAt: 'desc' } },
        },
      });
      
      res.json({ success: true, data: updated });
      return;
    }

    // Handle status change separately
    if (status) {
      // Allow status changes: PENDING -> ACTIVE, ACTIVE -> DEFAULTED, DEFAULTED -> ACTIVE
      if (status === 'DEFAULTED' && loan.status === 'ACTIVE') {
        await prisma.loan.update({
          where: { id },
          data: { status: LoanStatus.DEFAULTED },
        });
        // Recalculate commission and return updated loan
        if (loan.assignedVendorId) {
          await CommissionService.recalculateLoan(id);
        }
        const updated = await prisma.loan.findUnique({
          where: { id },
          include: {
            client: { include: { user: { select: { firstName: true, lastName: true } } } },
            installments: { orderBy: { installmentNumber: 'asc' } },
            payments: { orderBy: { createdAt: 'desc' } },
          },
        });
        res.json({ success: true, data: updated });
        return;
      }
      
      if (status === 'ACTIVE' && (loan.status === 'DEFAULTED' || loan.status === 'PENDING')) {
        await prisma.loan.update({
          where: { id },
          data: { status: LoanStatus.ACTIVE },
        });
        if (loan.assignedVendorId) {
          await CommissionService.recalculateLoan(id);
        }
        const updated = await prisma.loan.findUnique({
          where: { id },
          include: {
            client: { include: { user: { select: { firstName: true, lastName: true } } } },
            installments: { orderBy: { installmentNumber: 'asc' } },
            payments: { orderBy: { createdAt: 'desc' } },
          },
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

    // Handle commission config changes (any loan status)
    if (commissionPercentage !== undefined || commissionMode !== undefined) {
      const updateData: Record<string, unknown> = {};
      
      if (commissionPercentage !== undefined) {
        const pct = Number(commissionPercentage);
        if (isNaN(pct) || pct < 0 || pct > 100) {
          res.status(400).json({ success: false, error: 'Commission percentage must be between 0 and 100' });
          return;
        }
        updateData.commissionPercentage = pct;
      }
      
      if (commissionMode !== undefined) {
        if (!['PROPORTIONAL', 'AFTER_CAPITAL_RECOVERY', 'ADVANCED'].includes(commissionMode)) {
          res.status(400).json({ success: false, error: 'Invalid commission mode' });
          return;
        }
        updateData.commissionMode = commissionMode;
      }
      
      await prisma.loan.update({
        where: { id },
        data: updateData,
      });
      
      // Recalculate commission with new config
      await CommissionService.recalculateLoan(id);
      
      const updated = await prisma.loan.findUnique({
        where: { id },
        include: {
          client: { include: { user: { select: { firstName: true, lastName: true, email: true, phone: true } } } },
          assignedVendor: { select: { id: true, firstName: true, lastName: true } },
          installments: { orderBy: { installmentNumber: 'asc' } },
          payments: { orderBy: { createdAt: 'desc' } },
        },
      });
      
      // Format Decimal fields as numbers for frontend
      res.json({ 
        success: true, 
        data: updated ? {
          ...updated,
          amount: Number(updated.amount),
          interestRate: Number(updated.interestRate),
          totalInterest: Number(updated.totalInterest),
          totalPayment: Number(updated.totalPayment),
          installmentAmount: Number(updated.installmentAmount),
          commissionPercentage: updated.commissionPercentage ? Number(updated.commissionPercentage) : null,
          commissionGenerated: Number(updated.commissionGenerated ?? 0),
          commissionProjected: Number(updated.commissionProjected ?? 0),
          commissionLiquidated: Number(updated.commissionLiquidated ?? 0),
          installments: updated.installments.map(inst => ({
            ...inst,
            amount: Number(inst.amount),
            balance: Number(inst.balance),
            paidAmount: Number(inst.paidAmount),
            principal: Number(inst.principal),
            interest: Number(inst.interest),
            capitalBalance: Number(inst.capitalBalance),
            moraAmount: Number(inst.moraAmount ?? 0),
          })),
        } : null,
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

    // Check if amortization-related fields changed (triggers commission recalculation)
    const amortizationFieldsChanged = 
      amortizationSystem !== undefined ||
      frequency !== undefined ||
      termMonths !== undefined;

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
      const system = amortizationSystem || loan.amortizationSystem;
      const amortization = AmortizationService.calculate({
        amount: amount || Number(loan.amount),
        interestRate: (interestRate || Number(loan.interestRate)) / 100,
        termMonths: termMonths || loan.termMonths,
        frequency: frequency || loan.frequency,
        startDate: parsedStartDate,
        amortizationSystem: system,
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
          amortizationSystem: amortizationSystem || undefined,
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
      data: loanWithDetails ? {
        ...loanWithDetails,
        amount: Number(loanWithDetails.amount),
        interestRate: Number(loanWithDetails.interestRate),
        totalInterest: Number(loanWithDetails.totalInterest),
        totalPayment: Number(loanWithDetails.totalPayment),
        installmentAmount: Number(loanWithDetails.installmentAmount),
        installments: loanWithDetails.installments.map(inst => ({
          ...inst,
          amount: Number(inst.amount),
          balance: Number(inst.balance),
          paidAmount: Number(inst.paidAmount),
        })),
      } : null,
    });

    // Recalculate commission if amortization-related fields changed (non-blocking)
    if (amortizationFieldsChanged) {
      CommissionService.recalculateLoan(id).catch(err => {
        console.error('Commission recalculation error:', err);
      });
    }
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
      data: installments.map(inst => ({
        ...inst,
        amount: Number(inst.amount),
        balance: Number(inst.balance),
        paidAmount: Number(inst.paidAmount),
      })),
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
  amortizationSystem: amortizationSystemSchema,
});

// GET /api/loans/:id/preview-refinancing - Preview refinancing (PUBLIC - no auth)
router.get('/:id/preview-refinancing', async (req, res): Promise<void> => {
  try {
    const { id } = req.params;
    const { nuevaTasaInteres, cantidadCuotas, nuevaFrecuencia, pagoInicial, interesesVencidosManual, fechaInicio, amortizationSystem } = req.query;

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

    // Get default amortization system from settings
    const defaultSystem = await getDefaultAmortizationSystem();
    const system = (amortizationSystem as string) as any || defaultSystem;

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
        amortizationSystem: system,
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

    const { nuevaTasaInteres, cantidadCuotas, nuevaFrecuencia, fechaInicio, pagoInicial, interesesVencidosManual, amortizationSystem } = body;

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
      amortizationSystem: amortizationSystem,
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

    // Recalculate commission for both old (now REFINANCIADO) and new loan
    if (result.newLoan?.assignedVendorId) {
      await CommissionService.recalculateLoan(loanId).catch(err => {
        console.error('Commission recalculation error on old refinanced loan:', err);
      });
      await CommissionService.recalculateLoan(result.newLoan.id).catch(err => {
        console.error('Commission recalculation error on new refinanced loan:', err);
      });
    }

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

    // Recalculate commission after early cancellation (loan is now PAID)
    if (result.loan?.assignedVendorId) {
      await CommissionService.recalculateLoan(loanId).catch(err => {
        console.error('Commission recalculation error after cancellation:', err);
      });
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
