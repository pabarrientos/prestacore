import { Router, Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { requireAdmin } from '../middleware/rbac';
import { invalidateRatesCache, getDefaultAmortizationSystem, setDefaultAmortizationSystem, AmortizationSystemType } from '../services/settings';

const router: ReturnType<typeof Router> = Router();
const prisma = new PrismaClient();

const updateSettingSchema = z.object({
  key: z.string(),
  value: z.string().optional(),
  description: z.string().nullable().optional(),
});

const updateSystemSchema = z.object({
  system: z.enum(['FRENCH', 'GERMAN', 'FLAT_RATE']),
});

/**
 * Get Spanish label for amortization system
 */
function getSystemLabel(system: string): string {
  switch (system) {
    case 'FRENCH': return 'Sistema Francés';
    case 'GERMAN': return 'Sistema Alemán';
    case 'FLAT_RATE': return 'Sistema de Tasa Plana';
    default: return system;
  }
}

// GET /api/settings - Get all settings (public for rates)
router.get('/', async (_req, res: Response): Promise<void> => {
  try {
    const settings = await prisma.setting.findMany();
    
    // Convert to key-value object
    const settingsObj = settings.reduce((acc, s) => {
      acc[s.key] = {
        value: s.value,
        description: s.description,
      };
      return acc;
    }, {} as Record<string, { value: string; description: string | null }>);

    res.json({
      success: true,
      data: settingsObj,
    });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// GET /api/settings/default-amortization-system - Get default amortization system (public)
router.get('/default-amortization-system', async (_req, res: Response): Promise<void> => {
  try {
    const system = await getDefaultAmortizationSystem();
    res.json({
      success: true,
      data: {
        defaultAmortizationSystem: system,
        label: getSystemLabel(system),
      },
    });
  } catch (error) {
    console.error('Get default amortization system error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// Default collection action types
const DEFAULT_COLLECTION_ACTION_TYPES = [
  { code: 'CALL', label: 'Llamada telefónica' },
  { code: 'VISIT', label: 'Visita presencial' },
  { code: 'AGREEMENT', label: 'Acuerdo de pago' },
  { code: 'REFINANCING', label: 'Refinanciación' },
  { code: 'LEGAL', label: 'Acción legal' },
  { code: 'PROMISE', label: 'Promesa de pago' },
];

export interface CollectionActionTypeConfig {
  code: string;
  label: string;
}

// GET /api/settings/collection-action-types - Get collection action types (public)
router.get('/collection-action-types', async (_req, res: Response): Promise<void> => {
  try {
    const setting = await prisma.setting.findUnique({
      where: { key: 'COLLECTION_ACTION_TYPES' },
    });

    let types: CollectionActionTypeConfig[];

    if (setting && setting.value) {
      try {
        types = JSON.parse(setting.value);
      } catch {
        // Invalid JSON, use defaults
        types = DEFAULT_COLLECTION_ACTION_TYPES;
      }
    } else {
      // Setting doesn't exist, use defaults
      types = DEFAULT_COLLECTION_ACTION_TYPES;
    }

    res.json({
      success: true,
      data: { types },
    });
  } catch (error) {
    console.error('Get collection action types error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// GET /api/settings/rates - Get interest rates (public)
router.get('/rates', async (_req, res: Response): Promise<void> => {
  try {
    const settings = await prisma.setting.findMany({
      where: {
        key: {
          in: [
            'WEEKLY_BASE_RATE',
            'BIWEEKLY_BASE_RATE', 
            'MONTHLY_BASE_RATE',
            'DAILY_BASE_RATE',
            'MORA_RATE',
            'MIN_LOAN_AMOUNT',
            'MAX_LOAN_AMOUNT',
          ],
        },
      },
    });

    const rates = settings.reduce((acc, s) => {
      acc[s.key] = parseFloat(s.value);
      return acc;
    }, {} as Record<string, number>);

    res.json({
      success: true,
      data: rates,
    });
  } catch (error) {
    console.error('Get rates error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// PATCH /api/settings/default-amortization-system - Update default amortization system (admin only)
router.patch('/default-amortization-system', authMiddleware, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const body = updateSystemSchema.parse(req.body);
    await setDefaultAmortizationSystem(body.system as AmortizationSystemType);
    res.json({
      success: true,
      data: {
        defaultAmortizationSystem: body.system,
        label: getSystemLabel(body.system),
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
    console.error('Update default amortization system error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// PATCH /api/settings - Update setting (admin only)
router.patch('/', authMiddleware, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const body = updateSettingSchema.parse(req.body);

    // Ensure value is never undefined - use empty string as fallback for new settings
    const value = body.value ?? '';
    const description = body.description ?? null;

    const setting = await prisma.setting.upsert({
      where: { key: body.key },
      update: {
        value,
        description,
      },
      create: {
        key: body.key,
        value,
        description,
      },
    });

    // Invalidate cache if updating rates
    if (['WEEKLY_BASE_RATE', 'BIWEEKLY_BASE_RATE', 'MONTHLY_BASE_RATE', 'DAILY_BASE_RATE', 'MORA_RATE'].includes(body.key)) {
      invalidateRatesCache();
    }

    res.json({
      success: true,
      data: setting,
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
    
    console.error('Update setting error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

export default router;
