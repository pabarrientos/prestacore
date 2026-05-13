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
  notes: z.string().optional(),
});

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

    const { vendorId, amount, type, notes } = parsed.data;

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

    await prisma.$transaction(async (tx) => {
      await tx.sellerLiquidation.create({
        data: {
          sellerId: vendorId,
          amount,
          type,
          notes,
          createdBy: req.user!.userId,
        },
      });

      if (type === 'REFUND') {
        let remaining = amount;
        for (const loan of loans) {
          if (remaining <= 0) break;
          const loanLiq = Number(loan.commissionLiquidated ?? 0);
          if (loanLiq <= 0) continue;
          const refund = Math.min(remaining, loanLiq);
          await tx.loan.update({
            where: { id: loan.id },
            data: { commissionLiquidated: { decrement: refund } },
          });
          remaining -= refund;
        }
      } else {
        let remaining = amount;
        for (const loan of loans) {
          if (remaining <= 0) break;
          const loanPending = Number(loan.commissionGenerated ?? 0) - Number(loan.commissionLiquidated ?? 0);
          if (type === 'PAYMENT' && loanPending <= 0) continue;
          const dist = type === 'ADVANCE'
            ? Math.min(remaining, Math.max(0.01, loanPending || remaining))
            : Math.min(remaining, Math.max(0, loanPending));
          if (dist <= 0) continue;
          await tx.loan.update({
            where: { id: loan.id },
            data: { commissionLiquidated: { increment: dist } },
          });
          remaining -= dist;
        }
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
        createdAt: l.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('Error fetching liquidations:', error);
    res.status(500).json({ success: false, error: 'Error al obtener las liquidaciones' });
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
