import Router, { Response } from 'express';
import { PrismaClient, Role, LoanStatus, InstallmentStatus, PaymentStatus } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { requireVendor } from '../middleware/rbac';
import { MoraService } from '../services/mora';
import { getRate } from '../services/settings';
import { getToday } from '../services/datetime';

const router: ReturnType<typeof Router> = Router();
const prisma = new PrismaClient();

// GET /api/dashboard - Get dashboard metrics
router.get('/', authMiddleware, requireVendor, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const whereClause: any = {};
    const todayDateOnly = await getToday();

    // Filter by role
    if (req.user!.role === Role.VENDEDOR) {
      whereClause.assignedVendorId = req.user!.userId;
    }

    // Build filter for installment queries
    const overdueLoanFilter: any = {
      status: { notIn: [LoanStatus.PENDING, LoanStatus.PAID, LoanStatus.DEFAULTED, LoanStatus.REFINANCIADO] },
    };
    if (whereClause.assignedVendorId) {
      overdueLoanFilter.assignedVendorId = whereClause.assignedVendorId;
    }

    // Get metrics
    const [
      totalLoans,
      activeLoans,
      pendingApprovals,
      loansByStatus,
      totalDisbursed,
      totalCollected,
      overdueInstallments,
      commissionTotals,
    ] = await Promise.all([
      // Total loans count
      prisma.loan.count({ where: whereClause }),
      
      // Active loans - EXCLUDE REFINANCIADO (old loan stops counting)
      prisma.loan.count({
        where: { ...whereClause, status: LoanStatus.ACTIVE },
      }),
      
      // Pending approvals
      prisma.loan.count({
        where: { ...whereClause, status: LoanStatus.PENDING },
      }),
      
      // Loans by status
      prisma.loan.groupBy({
        by: ['status'],
        _count: { status: true },
        where: whereClause,
      }),
      
      // Total disbursed - sum of original loans (including refinanced ones)
      // Include: ACTIVE, PAID, DEFAULTED, REFINANCIADO loans that are NOT new loans from refinancing
      // A "new loan from refinancing" has status = ACTIVE and prestamo_origen_id is not null
      // Original loans (REFINANCIADO) should be included as money was disbursed
      prisma.loan.aggregate({
        _sum: { amount: true },
        where: {
          ...whereClause,
          status: { in: [LoanStatus.ACTIVE, LoanStatus.PAID, LoanStatus.DEFAULTED, LoanStatus.REFINANCIADO] },
          // Include only loans that are NOT new loans from refinancing (those without prestamo_origen_id)
          prestamo_origen_id: null,
        },
      }),
      
      // Total collected (completed payments) - filter by vendor's loans
      prisma.payment.aggregate({
        _sum: { amount: true },
        where: { 
          status: PaymentStatus.COMPLETED,
          loan: whereClause,
        },
      }),

      // Overdue installments — use ::date to avoid PG timezone-dependent comparison
       prisma.$queryRawUnsafe<Array<{ balance: number; dueDate: Date }>>(`
         SELECT i."balance", i."dueDate"
         FROM "Installment" i
         JOIN "Loan" l ON i."loanId" = l.id
         WHERE i.status NOT IN ('PAID', 'INTEREST_ONLY')
           AND i."dueDate"::date <= $1::date
           AND l.status NOT IN ('PENDING', 'PAID', 'DEFAULTED', 'REFINANCIADO')
           ${overdueLoanFilter.assignedVendorId ? `AND l."assignedVendorId" = '${overdueLoanFilter.assignedVendorId}'` : ''}
       `, todayDateOnly),
      // Commission totals (excluding PENDING)
      prisma.loan.aggregate({
        where: {
          ...whereClause,
          commissionPercentage: { not: null },
          status: { not: 'PENDING' },
        },
        _sum: {
          commissionGenerated: true,
          commissionProjected: true,
          commissionLiquidated: true,
        },
      }),
    ]);

    // Calculate overdue metrics
    const totalOverdueInstallments = overdueInstallments.length;
    const totalOverdueAmount = overdueInstallments.reduce((sum, inst) => sum + Number(inst.balance), 0);
    
    // Group by days overdue
    const byDaysMap = new Map<string, { count: number; amount: number }>();
    const today = await getToday();
    
    for (const inst of overdueInstallments) {
      const daysOverdue = await MoraService.calculateDaysOverdue(inst.dueDate, today);
      let range: string;
      if (daysOverdue == 0) range = '0 días';
      else if (daysOverdue <= 7) range = '1-7 días';
      else if (daysOverdue <= 14) range = '8-14 días';
      else if (daysOverdue <= 30) range = '15-30 días';
      else if (daysOverdue <= 60) range = '31-60 días';
      else range = '60+ días';
      
      const existing = byDaysMap.get(range) || { count: 0, amount: 0 };
      byDaysMap.set(range, {
        count: existing.count + 1,
        amount: existing.amount + Number(inst.balance),
      });
    }

    const overdueByDays = Array.from(byDaysMap.entries())
      .sort(([a], [b]) => {
        const order = ['0 días', '1-7 días', '8-14 días', '15-30 días', '31-60 días', '60+ días'];
        return order.indexOf(a) - order.indexOf(b);
      })
      .map(([range, data]) => ({
        range,
        count: data.count,
        amount: Math.round(data.amount * 100) / 100,
      }));

    // Calculate future collection amount - sum of all installments with balance > 0 - EXCLUDE PENDING, PAID, DEFAULTED and REFINANCIADO loans
    const loanFilter: any = {
      status: { notIn: [LoanStatus.PENDING, LoanStatus.PAID, LoanStatus.DEFAULTED, LoanStatus.REFINANCIADO] },
    };
    if (whereClause.assignedVendorId) {
      loanFilter.assignedVendorId = whereClause.assignedVendorId;
    }
    const allInstallmentsWithBalance = await prisma.installment.findMany({
      where: {
        balance: { gt: 0 },
        loan: loanFilter,
      },
      select: { balance: true },
    });
    const futureCollectionAmount = allInstallmentsWithBalance.reduce(
      (sum, inst) => sum + Number(inst.balance),
      0
    );

    // Format response
    const statusBreakdown = loansByStatus.reduce((acc, item) => {
      acc[item.status] = item._count.status;
      return acc;
    }, {} as Record<string, number>);

    res.json({
      success: true,
      data: {
        totalLoans,
        activeLoans,
        pendingApprovals,
        futureCollectionAmount: Math.round(futureCollectionAmount * 100) / 100,
        totalDisbursed: Number(totalDisbursed._sum.amount) || 0,
        totalCollected: Number(totalCollected._sum.amount) || 0,
        statusBreakdown,
        commission: {
          totalGenerated: Number(commissionTotals._sum.commissionGenerated || 0),
          totalProjected: Number(commissionTotals._sum.commissionProjected || 0),
          totalLiquidated: Number(commissionTotals._sum.commissionLiquidated || 0),
        },
        // Extended metrics
        totalOverdueInstallments,
        totalOverdueAmount: Math.round(totalOverdueAmount * 100) / 100,
        overdueByDays,
      },
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// GET /api/dashboard/recent - Get recent activity
router.get('/recent', authMiddleware, requireVendor, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const whereClause: any = {};

    if (req.user!.role === Role.VENDEDOR) {
      whereClause.assignedVendorId = req.user!.userId;
    }

    const [recentLoans, recentPayments] = await Promise.all([
      prisma.loan.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          client: {
            include: {
              user: { select: { firstName: true, lastName: true } },
            },
          },
        },
      }),
      prisma.payment.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          loan: true,
          client: {
            include: {
              user: { select: { firstName: true, lastName: true } },
            },
          },
        },
      }),
    ]);

    res.json({
      success: true,
      data: {
        recentLoans,
        recentPayments,
      },
    });
  } catch (error) {
    console.error('Recent activity error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// GET /api/dashboard/overdue - Get overdue installments
router.get('/overdue', authMiddleware, requireVendor, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { vendorId, from, to } = req.query;
    const today = await getToday();

    // Base where clause
    const whereClause: any = {
      status: { notIn: [InstallmentStatus.PAID, InstallmentStatus.INTEREST_ONLY] },
      dueDate: { lt: today }, // Overdue based on date (midnight in local timezone)
      loan: {
        status: { notIn: [LoanStatus.PENDING, LoanStatus.PAID, LoanStatus.DEFAULTED, LoanStatus.REFINANCIADO] },
      },
    };

    // Filter by vendor - combined with exclusion
    if (req.user!.role === Role.VENDEDOR) {
      whereClause.loan = { 
        assignedVendorId: req.user!.userId,
        status: { notIn: [LoanStatus.PENDING, LoanStatus.PAID, LoanStatus.DEFAULTED, LoanStatus.REFINANCIADO] },
      };
    } else if (vendorId) {
      whereClause.loan = { 
        assignedVendorId: vendorId as string,
        status: { notIn: [LoanStatus.PENDING, LoanStatus.PAID, LoanStatus.DEFAULTED, LoanStatus.REFINANCIADO] },
      };
    }

    // Filter by date range
    if (from) {
      whereClause.dueDate = { ...whereClause.dueDate, gte: new Date(from as string) };
    }
    if (to) {
      whereClause.dueDate = { ...whereClause.dueDate, lte: new Date(to as string) };
    }

    const overdueInstallments = await prisma.$queryRawUnsafe<any[]>(`
      SELECT 
        i.id, i."loanId", i."installmentNumber", i."dueDate", i.amount, i.balance, i.status,
        l.amount as "loanAmount", l."termMonths",
        c.id as "clientId",
        u."firstName" as "clientFirstName", u."lastName" as "clientLastName", u.phone,
        i."dueDate"::text as "dueDateLocal"
      FROM "Installment" i
      JOIN "Loan" l ON i."loanId" = l.id
      JOIN "Client" c ON l."clientId" = c.id
      JOIN "User" u ON c."userId" = u.id
      WHERE i.status NOT IN ('PAID', 'INTEREST_ONLY')
        AND i."dueDate"::date <= $1::date
        AND l.status NOT IN ('PENDING', 'PAID', 'DEFAULTED', 'REFINANCIADO')
        ${req.user!.role === Role.VENDEDOR ? `AND l."assignedVendorId" = '${req.user!.userId}'` : ''}
        ${vendorId ? `AND l."assignedVendorId" = '${vendorId}'` : ''}
        ${from ? `AND i."dueDate" >= '${from}'` : ''}
        ${to ? `AND i."dueDate" <= '${to}'` : ''}
      ORDER BY u."lastName" ASC, u."firstName" ASC, l.id ASC, i."dueDate" ASC, i."installmentNumber" ASC
    `, today);

    // Calculate summary
    let totalOverdue = 0;
    let totalMora = 0;
    const byDaysMap = new Map<string, { count: number; amount: number }>();
    const dailyRate = await getRate('MORA_RATE');

    // Process installments with timezone-aware days overdue calculation
    const installments = await Promise.all(overdueInstallments.map(async (inst) => {
      // Parse dueDate from raw query (comes as string or Date depending on driver)
      const dueDate = inst.dueDate instanceof Date ? inst.dueDate : new Date(inst.dueDate);
      const daysOverdue = await MoraService.calculateDaysOverdue(dueDate);
      const moraAmount = daysOverdue > 0
        ? MoraService.calculate({
            installmentAmount: Number(inst.balance),
            dailyRate,
            daysOverdue,
          }).moraAmount
        : 0;

      totalOverdue += Number(inst.balance);
      totalMora += moraAmount;

      // Group by days
      let range: string;
      if (daysOverdue == 0) range = '0 días';
      else if (daysOverdue <= 7) range = '1-7 días';
      else if (daysOverdue <= 14) range = '8-14 días';
      else if (daysOverdue <= 30) range = '15-30 días';
      else if (daysOverdue <= 60) range = '31-60 días';
      else range = '60+ días';

      const existing = byDaysMap.get(range) || { count: 0, amount: 0 };
      byDaysMap.set(range, {
        count: existing.count + 1,
        amount: existing.amount + Number(inst.balance),
      });

      // Count remaining installments
      const remainingCount = inst.termMonths - inst.installmentNumber + 1;

      return {
        id: inst.id,
        installmentNumber: inst.installmentNumber,
        dueDate: inst.dueDateLocal || dueDate.toISOString(),
        amount: Number(inst.amount),
        balance: Number(inst.balance),
        moraAmount,
        daysOverdue,
        status: inst.status,
        loan: {
          id: inst.loanId,
          amount: Number(inst.loanAmount),
          remainingInstallments: remainingCount,
        },
        client: {
          id: inst.clientId,
          name: (inst.clientFirstName || '') + ' ' + (inst.clientLastName || ''),
          phone: inst.phone || '',
        },
      };
    }));

    const byDays = Array.from(byDaysMap.entries())
      .sort(([a], [b]) => {
        const order = ['0 días', '1-7 días', '8-14 días', '15-30 días', '31-60 días', '60+ días'];
        return order.indexOf(a) - order.indexOf(b);
      })
      .map(([range, data]) => ({
        range,
        count: data.count,
        amount: Math.round(data.amount * 100) / 100,
      }));

    res.json({
      success: true,
      data: {
        installments,
        summary: {
          totalOverdue: Math.round(totalOverdue * 100) / 100,
          totalMora: Math.round(totalMora * 100) / 100,
          byDays,
        },
      },
    });
  } catch (error) {
    console.error('Overdue dashboard error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

export default router;
