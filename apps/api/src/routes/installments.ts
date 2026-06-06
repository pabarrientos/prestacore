import Router, { Response } from 'express';
import { PrismaClient, Role } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { MoraService } from '../services/mora';
import { getRate } from '../services/settings';
import { getToday } from '../services/datetime';

const router: ReturnType<typeof Router> = Router();
const prisma = new PrismaClient();

// GET /api/installments - Get installments with filters and pagination
router.get('/', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { fechaInicio, fechaFin, cliente, vendedorId, estado, page = '1', limit = '20' } = req.query;
    const user = req.user;

    if (!user) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
      return;
    }

    // Pagination
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const offset = (pageNum - 1) * limitNum;

    // Validate date params
    let startDate: string;
    let endDate: string;
    const today = await getToday();

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
      // Default: today to today using date-only comparison
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      startDate = `${year}-${month}-${day}`;
      endDate = startDate;
    }

    // Build filters
    const clienteFilter = cliente
      ? `AND (LOWER(u."firstName") LIKE '%${String(cliente).toLowerCase()}%' OR LOWER(u."lastName") LIKE '%${String(cliente).toLowerCase()}%')`
      : '';

    // VENDEDOR role filtering - can only see their own loans
    const vendorFilter =
      user.role === Role.VENDEDOR
        ? `AND l."assignedVendorId" = '${user.userId}'`
        : vendedorId && user.role === Role.ADMIN
          ? `AND l."assignedVendorId" = '${vendedorId}'`
          : '';

    // Status filter with dynamic OVERDUE calculation
    const todayYear = today.getFullYear();
    const todayMonth = String(today.getMonth() + 1).padStart(2, '0');
    const todayDay = String(today.getDate()).padStart(2, '0');
    const todayStr = `${todayYear}-${todayMonth}-${todayDay}`;

    let statusFilter = '';
    if (estado) {
      const estadoStr = String(estado).toUpperCase();
      if (estadoStr === 'OVERDUE') {
        statusFilter = `AND (i.status = 'OVERDUE' OR (i.status = 'PENDING' AND i."dueDate"::date < '${todayStr}'::date))`;
      } else if (estadoStr === 'PENDING') {
        statusFilter = `AND i.status = 'PENDING' AND i."dueDate"::date >= '${todayStr}'::date`;
      } else {
        statusFilter = `AND i.status = '${estadoStr}'`;
      }
    }

    // Only ACTIVE loans
    const loanStatusFilter = `AND l.status = 'ACTIVE'`;

    // Common FROM + WHERE clauses
    const fromClause = `
      FROM "Installment" i
      JOIN "Loan" l ON i."loanId" = l.id
      JOIN "Client" c ON l."clientId" = c.id
      JOIN "User" u ON c."userId" = u.id
      LEFT JOIN "User" v ON l."assignedVendorId" = v.id
    `;

    const dateWhere = startDate === endDate
      ? `WHERE i."dueDate"::date = $1::date`
      : `WHERE i."dueDate"::date >= $1::date AND i."dueDate"::date <= $2::date`;

    const filtersClause = `${loanStatusFilter} ${vendorFilter} ${statusFilter} ${clienteFilter}`;
    const params = startDate === endDate ? [startDate] : [startDate, endDate];

    // Get MORA_RATE for totalMora calculation in SQL
    const dailyRate = await getRate('MORA_RATE');

    // Run data, count, and totals queries in parallel
    const [installments, countResult, totalsResult] = await Promise.all([
      // Paginated data
      prisma.$queryRawUnsafe<any[]>(`
        SELECT
          i.id,
          i."loanId",
          i."installmentNumber",
          i."dueDate",
          i.amount,
          i.balance,
          i.status,
          i."paidAmount",
          i."moraAmount",
          l."amount" as "loanAmount",
          l."assignedVendorId",
          c.id as "clientId",
          u."firstName" as "clientFirstName",
          u."lastName" as "clientLastName",
          u.phone,
          i."dueDate"::text as "dueDateLocal",
          v."firstName" as "vendorFirstName",
          v."lastName" as "vendorLastName"
        ${fromClause}
        ${dateWhere}
          ${filtersClause}
        ORDER BY u."lastName" ASC, u."firstName" ASC, i."dueDate" ASC, i."installmentNumber" ASC
        LIMIT ${limitNum} OFFSET ${offset}
      `, ...params),
      // Count
      prisma.$queryRawUnsafe<any[]>(`
        SELECT COUNT(*) as count
        ${fromClause}
        ${dateWhere}
          ${filtersClause}
      `, ...params),
      // Totals (totalMonto + totalMora across all filtered results)
      prisma.$queryRawUnsafe<any[]>(`
        SELECT
          COALESCE(SUM(i.balance), 0) as "totalMonto",
          COALESCE(SUM(
            CASE
              WHEN GREATEST(0, '${todayStr}'::date - i."dueDate"::date) > 0
              THEN i.balance * ${dailyRate} * GREATEST(0, '${todayStr}'::date - i."dueDate"::date)
              ELSE 0
            END
          ), 0) as "totalMora"
        ${fromClause}
        ${dateWhere}
          ${filtersClause}
      `, ...params),
    ]);

    const total = parseInt(countResult[0]?.count || '0', 10);
    const totalMonto = Number(totalsResult[0]?.totalMonto || 0);
    const totalMora = Number(totalsResult[0]?.totalMora || 0);

    // Calculate mora for each installment in the current page
    const now = await getToday();

    const formattedInstallments = await Promise.all(
      installments.map(async (inst: any) => {
        const dueDate = new Date(inst.dueDate);
        const daysOverdue = await MoraService.calculateDaysOverdue(dueDate, now);
        const moraAmount =
          daysOverdue > 0
            ? MoraService.calculate({
                installmentAmount: Number(inst.balance),
                dailyRate,
                daysOverdue,
              }).moraAmount
            : 0;

        return {
          id: inst.id,
          loanId: inst.loanId,
          installmentNumber: inst.installmentNumber,
          dueDate: inst.dueDateLocal || dueDate.toISOString().split('T')[0],
          amount: Number(inst.amount),
          balance: Number(inst.balance),
          paidAmount: Number(inst.paidAmount),
          moraAmount: Math.round(moraAmount * 100) / 100,
          daysOverdue,
          // Only override PENDING to OVERDUE dynamically
          status: (daysOverdue > 0 && inst.status === 'PENDING') ? 'OVERDUE' : inst.status,
          loan: {
            id: inst.loanId,
            amount: Number(inst.loanAmount),
          },
          client: {
            id: inst.clientId,
            name: (inst.clientFirstName || '') + ' ' + (inst.clientLastName || ''),
            phone: inst.phone || '',
          },
          vendor: inst.vendorFirstName && inst.vendorLastName
            ? `${inst.vendorFirstName} ${inst.vendorLastName}`
            : null,
        };
      })
    );

    res.json({
      success: true,
      data: {
        installments: formattedInstallments,
        totalMonto: Math.round(totalMonto * 100) / 100,
        totalMora: Math.round(totalMora * 100) / 100,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
        filtros: {
          fechaInicio: startDate,
          fechaFin: endDate,
          vendedorId: vendedorId || null,
          estado: estado || null,
          cliente: cliente || null,
        },
      },
    });
  } catch (error) {
    console.error('Get installments error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

export default router;
