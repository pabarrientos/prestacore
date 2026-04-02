import Router, { Response } from 'express';
import { PrismaClient, Role, LoanStatus, InstallmentStatus, PaymentStatus } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { requireVendor } from '../middleware/rbac';
import { MoraService } from '../services/mora';
import { getRate } from '../services/settings';

const router: ReturnType<typeof Router> = Router();
const prisma = new PrismaClient();

// GET /api/dashboard - Get dashboard metrics
router.get('/', authMiddleware, requireVendor, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const whereClause: any = {};
    const now = new Date();

    // Filter by role
    if (req.user!.role === Role.VENDEDOR) {
      whereClause.assignedVendorId = req.user!.userId;
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
      
      // Total collected (completed payments)
      prisma.payment.aggregate({
        _sum: { amount: true },
        where: { 
          status: PaymentStatus.COMPLETED,
        },
      }),

      // Overdue installments - dynamic calculation based on dueDate - EXCLUDE DEFAULTED and REFINANCIADO loans
      prisma.installment.findMany({
        where: {
          status: { not: InstallmentStatus.PAID },
          dueDate: { lt: now }, // All installments with dueDate < now
          loan: {
            ...whereClause,
            status: { notIn: [LoanStatus.DEFAULTED, LoanStatus.REFINANCIADO] }, // Exclude DEFAULTED and REFINANCIADO loans
          },
        },
        select: {
          balance: true,
          dueDate: true,
        },
      }),
    ]);

    // Calculate overdue metrics
    const totalOverdueInstallments = overdueInstallments.length;
    const totalOverdueAmount = overdueInstallments.reduce((sum, inst) => sum + Number(inst.balance), 0);
    
    // Group by days overdue
    const byDaysMap = new Map<string, { count: number; amount: number }>();
    
    for (const inst of overdueInstallments) {
      const daysOverdue = MoraService.calculateDaysOverdue(inst.dueDate, now);
      let range: string;
      if (daysOverdue <= 7) range = '1-7 días';
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

    const overdueByDays = Array.from(byDaysMap.entries()).map(([range, data]) => ({
      range,
      count: data.count,
      amount: Math.round(data.amount * 100) / 100,
    }));

    // Calculate future collection amount - sum of all installments with balance > 0 - EXCLUDE DEFAULTED and REFINANCIADO loans
    const allInstallmentsWithBalance = await prisma.installment.findMany({
      where: {
        ...whereClause,
        balance: { gt: 0 },
        loan: {
          ...whereClause,
          status: { notIn: [LoanStatus.DEFAULTED, LoanStatus.REFINANCIADO] }, // Exclude DEFAULTED and REFINANCIADO loans
        },
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
        totalDisbursed: totalDisbursed._sum.amount || 0,
        totalCollected: totalCollected._sum.amount || 0,
        statusBreakdown,
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
    const now = new Date();

    // Base where clause - NO filter by status, we calculate dynamically - EXCLUDE DEFAULTED and REFINANCIADO loans
    const whereClause: any = {
      status: { not: InstallmentStatus.PAID }, // Exclude paid only
      dueDate: { lt: now }, // Overdue based on date
      loan: {
        status: { notIn: [LoanStatus.DEFAULTED, LoanStatus.REFINANCIADO] }, // Exclude DEFAULTED and REFINANCIADO loans
      },
    };

    // Filter by vendor - combined with exclusion
    if (req.user!.role === Role.VENDEDOR) {
      whereClause.loan = { 
        assignedVendorId: req.user!.userId,
        status: { notIn: [LoanStatus.DEFAULTED, LoanStatus.REFINANCIADO] },
      };
    } else if (vendorId) {
      whereClause.loan = { 
        assignedVendorId: vendorId as string,
        status: { notIn: [LoanStatus.DEFAULTED, LoanStatus.REFINANCIADO] },
      };
    }

    // Filter by date range
    if (from) {
      whereClause.dueDate = { ...whereClause.dueDate, gte: new Date(from as string) };
    }
    if (to) {
      whereClause.dueDate = { ...whereClause.dueDate, lte: new Date(to as string) };
    }

    const overdueInstallments = await prisma.installment.findMany({
      where: whereClause,
      orderBy: [{ dueDate: 'asc' }, { installmentNumber: 'asc' }],
      include: {
        loan: {
          select: {
            id: true,
            amount: true,
            termMonths: true,
            client: {
              select: {
                id: true,
                user: {
                  select: { firstName: true, lastName: true, phone: true },
                },
              },
            },
          },
        },
      },
    });

    // Calculate summary
    let totalOverdue = 0;
    let totalMora = 0;
    const byDaysMap = new Map<string, { count: number; amount: number }>();
    const dailyRate = await getRate('MORA_RATE');

    const installments = overdueInstallments.map((inst) => {
      const daysOverdue = MoraService.calculateDaysOverdue(inst.dueDate, now);
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
      if (daysOverdue <= 7) range = '1-7 días';
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
      const remainingCount = inst.loan.termMonths - inst.installmentNumber + 1;

      return {
        id: inst.id,
        installmentNumber: inst.installmentNumber,
        dueDate: inst.dueDate.toISOString(),
        amount: Number(inst.amount),
        balance: Number(inst.balance),
        moraAmount: Math.round(moraAmount * 100) / 100,
        daysOverdue,
        status: inst.status,
        loan: {
          id: inst.loan.id,
          amount: Number(inst.loan.amount),
          remainingInstallments: remainingCount,
        },
        client: {
          id: inst.loan.client.id,
          name: inst.loan.client.user.firstName + ' ' + inst.loan.client.user.lastName,
          phone: inst.loan.client.user.phone || '',
        },
      };
    });

    const byDays = Array.from(byDaysMap.entries()).map(([range, data]) => ({
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
