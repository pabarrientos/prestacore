import { Router, Response } from 'express';
import { z } from 'zod';
import { PrismaClient, Role, CommissionMode } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { requireAdmin, rbacMiddleware } from '../middleware/rbac';
import { CommissionService } from '../services/commission';

const router = Router();
const prisma = new PrismaClient();

// Validation schemas
const setCommissionConfigSchema = z.object({
  vendorId: z.string().cuid(),
  percentage: z.number().min(0).max(100),
  mode: z.enum(['PROPORTIONAL', 'AFTER_CAPITAL_RECOVERY', 'ADVANCED']),
});

const updateCommissionConfigSchema = z.object({
  percentage: z.number().min(0).max(100).optional(),
  mode: z.enum(['PROPORTIONAL', 'AFTER_CAPITAL_RECOVERY', 'ADVANCED']).optional(),
});

const liquidateSchema = z.object({
  vendorId: z.string().cuid(),
  amount: z.number().min(0),
  type: z.enum(['PAYMENT', 'ADVANCE', 'REFUND']).default('PAYMENT'),
  date: z.string().optional(), // Date-only string YYYY-MM-DD
  notes: z.string().optional(),
});

// --- Helper: redistribution functions for liquidation ---
type LoanSnapshot = { id: string; commissionGenerated: number; commissionLiquidated: number };
type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** Distribute an increment to loans prioritizing those with room (generated > liquidated) */
async function distributePayment(tx: TxClient, loans: LoanSnapshot[], amount: number) {
  let remaining = amount;
  // First pass: distribute to loans with pending > 0
  for (const loan of loans) {
    if (remaining <= 0) break;
    const pending = Math.max(0, loan.commissionGenerated - loan.commissionLiquidated);
    if (pending <= 0) continue;
    const dist = Math.min(remaining, pending);
    await tx.loan.update({
      where: { id: loan.id },
      data: { commissionLiquidated: { increment: dist } },
    });
    loan.commissionLiquidated += dist;
    remaining -= dist;
  }
  // Second pass: if ADVANCE and remaining > 0, distribute evenly/proportionally
  if (remaining > 0) {
    const totalGen = loans.reduce((s, l) => s + l.commissionGenerated, 0);
    for (const loan of loans) {
      if (remaining <= 0) break;
      const share = totalGen > 0
        ? Math.round((loan.commissionGenerated / totalGen) * remaining * 100) / 100
        : Math.round((remaining / Math.max(1, loans.length)) * 100) / 100;
      if (share <= 0) continue;
      const dist = Math.min(remaining, share);
      await tx.loan.update({
        where: { id: loan.id },
        data: { commissionLiquidated: { increment: dist } },
      });
      loan.commissionLiquidated += dist;
      remaining -= dist;
    }
  }
}

/** Distribute ADVANCE: proportionally, can exceed generated */
async function distributeAdvance(tx: TxClient, loans: LoanSnapshot[], amount: number) {
  const totalGen = loans.reduce((s, l) => s + l.commissionGenerated, 0);
  let remaining = amount;
  // First pass: proportional distribution (can exceed generated for ADVANCE)
  for (const loan of loans) {
    if (remaining <= 0) break;
    const share = totalGen > 0
      ? Math.round((loan.commissionGenerated / totalGen) * amount * 100) / 100
      : Math.round((amount / Math.max(1, loans.length)) * 100) / 100;
    const dist = Math.min(remaining, share);
    if (dist <= 0) continue;
    await tx.loan.update({
      where: { id: loan.id },
      data: { commissionLiquidated: { increment: dist } },
    });
    loan.commissionLiquidated += dist;
    remaining -= dist;
  }
  // Post-distribution rebalance: move excess from loans with liquidated > generated
  // to loans with pending > 0
  for (const excessLoan of loans) {
    const excess = Math.max(0, excessLoan.commissionLiquidated - excessLoan.commissionGenerated);
    if (excess <= 0) continue;
    
    let toMove = excess;
    for (const roomLoan of loans) {
      if (toMove <= 0) break;
      if (roomLoan.id === excessLoan.id) continue;
      const room = Math.max(0, roomLoan.commissionGenerated - roomLoan.commissionLiquidated);
      if (room <= 0) continue;
      const move = Math.min(toMove, room);
      
      // Decrement excess loan
      await tx.loan.update({
        where: { id: excessLoan.id },
        data: { commissionLiquidated: { decrement: move } },
      });
      excessLoan.commissionLiquidated -= move;
      
      // Increment room loan
      await tx.loan.update({
        where: { id: roomLoan.id },
        data: { commissionLiquidated: { increment: move } },
      });
      roomLoan.commissionLiquidated += move;
      
      toMove -= move;
    }
  }
}

/** Distribute a decrement (REFUND or reverse) from loans that have liquidated */
async function distributeDecrement(tx: TxClient, loans: LoanSnapshot[], amount: number) {
  let remaining = amount;
  for (const loan of loans) {
    if (remaining <= 0) break;
    const loanLiq = loan.commissionLiquidated;
    if (loanLiq <= 0) continue;
    const decr = Math.min(remaining, loanLiq);
    await tx.loan.update({
      where: { id: loan.id },
      data: { commissionLiquidated: { decrement: decr } },
    });
    loan.commissionLiquidated -= decr;
    remaining -= decr;
  }
}

// POST /api/commissions/config - Set initial commission config for a vendor (ADMIN)
router.post('/config', authMiddleware, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const parsed = setCommissionConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: parsed.error.errors.map(e => e.message).join(', '),
      });
      return;
    }

    const { vendorId, percentage, mode } = parsed.data;

    // Verify vendor exists and is VENDEDOR role
    const vendor = await prisma.user.findUnique({
      where: { id: vendorId },
    });

    if (!vendor) {
      res.status(404).json({
        success: false,
        error: 'Vendedor no encontrado',
      });
      return;
    }

    if (vendor.role !== Role.VENDEDOR) {
      res.status(400).json({
        success: false,
        error: 'El usuario debe tener rol VENDEDOR',
      });
      return;
    }

    // Use transaction to update user and create audit entry
    await prisma.$transaction(async (tx) => {
      // Update vendor commission config
      await tx.user.update({
        where: { id: vendorId },
        data: {
          commissionPercentage: percentage,
          commissionMode: mode as CommissionMode,
        },
      });

      // Create audit entries for the new config
      await tx.sellerCommissionAudit.createMany({
        data: [
          {
            vendorId,
            field: 'commissionPercentage',
            previousValue: 'null',
            newValue: String(percentage),
            changedBy: req.user!.userId,
          },
          {
            vendorId,
            field: 'commissionMode',
            previousValue: 'null',
            newValue: mode,
            changedBy: req.user!.userId,
          },
        ],
      });
    });

    res.status(201).json({
      success: true,
      data: { vendorId, percentage, mode },
    });
  } catch (error) {
    console.error('Error setting commission config:', error);
    res.status(500).json({
      success: false,
      error: 'Error al configurar la comisión',
    });
  }
});

// PUT /api/commissions/config/:vendorId - Update commission config (ADMIN)
router.put('/config/:vendorId', authMiddleware, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { vendorId } = req.params;

    const parsed = updateCommissionConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: parsed.error.errors.map(e => e.message).join(', '),
      });
      return;
    }

    const { percentage, mode } = parsed.data;

    if (percentage === undefined && mode === undefined) {
      res.status(400).json({
        success: false,
        error: 'Debe proporcionar al menos un campo a actualizar',
      });
      return;
    }

    // Get current config
    const vendor = await prisma.user.findUnique({
      where: { id: vendorId },
    });

    if (!vendor) {
      res.status(404).json({
        success: false,
        error: 'Vendedor no encontrado',
      });
      return;
    }

    // Prepare audit entries for changed fields
    const auditEntries: Array<{
      vendorId: string;
      field: string;
      previousValue: string;
      newValue: string;
      changedBy: string;
    }> = [];

    if (percentage !== undefined && percentage !== Number(vendor.commissionPercentage ?? 0)) {
      auditEntries.push({
        vendorId,
        field: 'commissionPercentage',
        previousValue: String(vendor.commissionPercentage ?? 'null'),
        newValue: String(percentage),
        changedBy: req.user!.userId,
      });
    }

    if (mode !== undefined && mode !== vendor.commissionMode) {
      auditEntries.push({
        vendorId,
        field: 'commissionMode',
        previousValue: String(vendor.commissionMode ?? 'null'),
        newValue: mode,
        changedBy: req.user!.userId,
      });
    }

    // Update and create audit entries in transaction
    await prisma.$transaction(async (tx) => {
      const updateData: { commissionPercentage?: number; commissionMode?: CommissionMode } = {};
      if (percentage !== undefined) updateData.commissionPercentage = percentage;
      if (mode !== undefined) updateData.commissionMode = mode as CommissionMode;

      await tx.user.update({
        where: { id: vendorId },
        data: updateData,
      });

      if (auditEntries.length > 0) {
        await tx.sellerCommissionAudit.createMany({
          data: auditEntries,
        });
      }
    });

    // Recalculate commissions for all active loans of this vendor
    const updatedLoans = await CommissionService.recalculateVendorLoans(vendorId);

    res.json({
      success: true,
      data: {
        vendorId,
        percentage: percentage ?? vendor.commissionPercentage,
        mode: mode ?? vendor.commissionMode,
        loansRecalculated: updatedLoans,
      },
    });
  } catch (error) {
    console.error('Error updating commission config:', error);
    res.status(500).json({
      success: false,
      error: 'Error al actualizar la configuración de comisión',
    });
  }
});

// GET /api/commissions/vendor/:vendorId - Get vendor commission summary (ADMIN or self VENDEDOR)
router.get('/vendor/:vendorId', authMiddleware, rbacMiddleware([Role.ADMIN, Role.VENDEDOR]), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { vendorId } = req.params;

    // VENDEDOR can only see their own data
    if (req.user!.role === Role.VENDEDOR && req.user!.userId !== vendorId) {
      res.status(403).json({
        success: false,
        error: 'No tiene permisos para ver este vendedor',
      });
      return;
    }

    const vendor = await prisma.user.findUnique({
      where: { id: vendorId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        commissionPercentage: true,
        commissionMode: true,
      },
    });

    if (!vendor) {
      res.status(404).json({
        success: false,
        error: 'Vendedor no encontrado',
      });
      return;
    }

    // Get commission summary across all loans
    const loans = await prisma.loan.findMany({
      where: {
        assignedVendorId: vendorId,
        commissionPercentage: { not: null },
      },
      select: {
        commissionGenerated: true,
        commissionLiquidated: true,
        commissionProjected: true,
        status: true,
      },
    });

    let totalGenerated = 0;
    let totalLiquidated = 0;
    let totalProjected = 0;

    for (const loan of loans) {
      totalGenerated += Number(loan.commissionGenerated ?? 0);
      totalLiquidated += Number(loan.commissionLiquidated ?? 0);
      totalProjected += Number(loan.commissionProjected ?? 0);
    }

    res.json({
      success: true,
      data: {
        vendor,
        summary: {
          totalGenerated: Math.round(totalGenerated * 100) / 100,
          totalLiquidated: Math.round(totalLiquidated * 100) / 100,
          totalProjected: Math.round(totalProjected * 100) / 100,
          pending: Math.round((totalGenerated - totalLiquidated) * 100) / 100,
          loansCount: loans.length,
        },
      },
    });
  } catch (error) {
    console.error('Error getting vendor commission summary:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener el resumen de comisiones',
    });
  }
});

// POST /api/commissions/liquidate - Record a liquidation (ADMIN)
// Types: PAYMENT (normal), ADVANCE (adelanto, can exceed pending), REFUND (devolución del vendedor)
router.post('/liquidate', authMiddleware, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const parsed = liquidateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: parsed.error.errors.map(e => e.message).join(', '),
      });
      return;
    }

    const { vendorId, amount, type, date, notes } = parsed.data;

    if (amount <= 0 && type !== 'REFUND') {
      res.status(400).json({ success: false, error: 'El monto debe ser mayor a 0' });
      return;
    }

    const loans = await prisma.loan.findMany({
      where: {
        assignedVendorId: vendorId,
        commissionPercentage: { not: null },
      },
      select: {
        id: true,
        commissionGenerated: true,
        commissionLiquidated: true,
      },
    });

    let totalGenerated = 0;
    let totalLiquidated = 0;
    for (const loan of loans) {
      totalGenerated += Number(loan.commissionGenerated ?? 0);
      totalLiquidated += Number(loan.commissionLiquidated ?? 0);
    }

    const pending = totalGenerated - totalLiquidated;

    if (type === 'PAYMENT' && pending <= 0) {
      res.status(422).json({
        success: false,
        error: 'No hay comisiones pendientes. Use "Adelanto" para exceder el disponible.',
      });
      return;
    }

    const loanSnapshots: LoanSnapshot[] = loans.map(l => ({
      id: l.id,
      commissionGenerated: Number(l.commissionGenerated ?? 0),
      commissionLiquidated: Number(l.commissionLiquidated ?? 0),
    }));

    await prisma.$transaction(async (tx) => {
      await tx.sellerLiquidation.create({
        data: {
          sellerId: vendorId,
          amount,
          type,
          notes,
          createdBy: req.user!.userId,
          ...(date ? { createdAt: new Date(date + 'T00:00:00.000Z') } : {}),
        },
      });

      // Redistribute across loans
      if (type === 'REFUND') {
        await distributeDecrement(tx, loanSnapshots, amount);
      } else if (type === 'ADVANCE') {
        await distributeAdvance(tx, loanSnapshots, amount);
      } else {
        await distributePayment(tx, loanSnapshots, amount);
      }
    });

    const label = type === 'REFUND' ? 'Devolución' : type === 'ADVANCE' ? 'Adelanto' : 'Liquidación';
    res.status(201).json({
      success: true,
      data: { message: `${label} de $${amount.toFixed(2)} registrada` },
    });
  } catch (error) {
    console.error('Error processing liquidation:', error);
    res.status(500).json({
      success: false,
      error: 'Error al procesar la liquidación',
    });
  }
});
// GET /api/commissions/liquidations/:vendorId - Get liquidation history (ADMIN or self VENDEDOR)
router.get('/liquidations/:vendorId', authMiddleware, rbacMiddleware([Role.ADMIN, Role.VENDEDOR]), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { vendorId } = req.params;

    if (req.user!.role === Role.VENDEDOR && req.user!.userId !== vendorId) {
      res.status(403).json({ success: false, error: 'No tiene permisos para ver este vendedor' });
      return;
    }

    const liquidations = await prisma.sellerLiquidation.findMany({
      where: { sellerId: vendorId },
      orderBy: { createdAt: 'desc' },
      include: {
        creator: { select: { firstName: true, lastName: true } },
      },
    });

    res.json({
      success: true,
      data: liquidations.map(l => ({
        id: l.id,
        amount: Number(l.amount),
        type: l.type,
        notes: l.notes,
        createdBy: l.creator.firstName + ' ' + l.creator.lastName,
        createdAt: l.createdAt.toISOString().split('T')[0], // date-only, no timezone shift
      })),
    });
  } catch (error) {
    console.error('Error fetching liquidations:', error);
    res.status(500).json({ success: false, error: 'Error al obtener las liquidaciones' });
  }
});

// DELETE /api/commissions/liquidations/:id - Delete a liquidation and redistribuya (ADMIN)
router.delete('/liquidations/:id', authMiddleware, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const liquidation = await prisma.sellerLiquidation.findUnique({ where: { id } });
    if (!liquidation) {
      res.status(404).json({ success: false, error: 'Liquidación no encontrada' });
      return;
    }

    const vendorId = liquidation.sellerId;
    const amount = Number(liquidation.amount);
    const type = liquidation.type;

    // Get all vendor loans
    const loans = await prisma.loan.findMany({
      where: {
        assignedVendorId: vendorId,
        commissionPercentage: { not: null },
      },
      select: {
        id: true,
        commissionGenerated: true,
        commissionLiquidated: true,
      },
    });

    const loanSnapshots: LoanSnapshot[] = loans.map(l => ({
      id: l.id,
      commissionGenerated: Number(l.commissionGenerated ?? 0),
      commissionLiquidated: Number(l.commissionLiquidated ?? 0),
    }));

    await prisma.$transaction(async (tx) => {
      if (type === 'REFUND') {
        // Reverse refund: restore liquidated (increment, prioritizing loans with room)
        await distributePayment(tx, loanSnapshots, amount);
      } else {
        // Reverse PAYMENT/ADVANCE: decrease liquidated from loans that have it
        await distributeDecrement(tx, loanSnapshots, amount);
      }

      await tx.sellerLiquidation.delete({ where: { id } });
    });

    res.json({ success: true, data: { message: 'Liquidación eliminada y redistribuida' } });
  } catch (error) {
    console.error('Error deleting liquidation:', error);
    res.status(500).json({ success: false, error: 'Error al eliminar la liquidación' });
  }
});

// POST /api/commissions/rebalance/:vendorId - Rebalance liquidated amounts across loans (ADMIN)
router.post('/rebalance/:vendorId', authMiddleware, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { vendorId } = req.params;

    const loans = await prisma.loan.findMany({
      where: {
        assignedVendorId: vendorId,
        commissionPercentage: { not: null },
      },
      select: {
        id: true,
        commissionGenerated: true,
        commissionLiquidated: true,
      },
    });

    const loanSnapshots: LoanSnapshot[] = loans.map(l => ({
      id: l.id,
      commissionGenerated: Number(l.commissionGenerated ?? 0),
      commissionLiquidated: Number(l.commissionLiquidated ?? 0),
    }));

    let moved = 0;
    await prisma.$transaction(async (tx) => {
      // Move excess from loans with liquidated > generated to loans with pending > 0
      for (const excessLoan of loanSnapshots) {
        const excess = Math.max(0, excessLoan.commissionLiquidated - excessLoan.commissionGenerated);
        if (excess <= 0) continue;

        let toMove = excess;
        for (const roomLoan of loanSnapshots) {
          if (toMove <= 0) break;
          if (roomLoan.id === excessLoan.id) continue;
          const room = Math.max(0, roomLoan.commissionGenerated - roomLoan.commissionLiquidated);
          if (room <= 0) continue;
          const move = Math.min(toMove, room);

          await tx.loan.update({
            where: { id: excessLoan.id },
            data: { commissionLiquidated: { decrement: move } },
          });
          await tx.loan.update({
            where: { id: roomLoan.id },
            data: { commissionLiquidated: { increment: move } },
          });

          excessLoan.commissionLiquidated -= move;
          roomLoan.commissionLiquidated += move;
          toMove -= move;
          moved += move;
        }
      }
    });

    res.json({
      success: true,
      data: {
        message: moved > 0
          ? `Rebalanceo completado. Se redistribuyeron $${moved.toFixed(2)} entre préstamos.`
          : 'No había excesos que rebalancear.',
        moved,
      },
    });
  } catch (error) {
    console.error('Error rebalancing:', error);
    res.status(500).json({ success: false, error: 'Error al rebalancear' });
  }
});

// GET /api/commissions/audit/:vendorId - Get audit history for a vendor (ADMIN)
router.get('/audit/:vendorId', authMiddleware, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { vendorId } = req.params;

    const audits = await prisma.sellerCommissionAudit.findMany({
      where: { vendorId },
      include: {
        vendor: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        changer: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    res.json({
      success: true,
      data: audits.map(audit => ({
        id: audit.id,
        vendorId: audit.vendorId,
        vendorName: `${audit.vendor.firstName} ${audit.vendor.lastName}`,
        vendorEmail: audit.vendor.email,
        field: audit.field,
        previousValue: audit.previousValue,
        newValue: audit.newValue,
        changedBy: audit.changedBy,
        changedByName: `${audit.changer.firstName} ${audit.changer.lastName}`,
        createdAt: audit.createdAt,
      })),
    });
  } catch (error) {
    console.error('Error getting audit history:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener el historial de auditoría',
    });
  }
});

export default router;
