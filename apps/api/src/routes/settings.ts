import { Router, Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { requireAdmin } from '../middleware/rbac';
import { invalidateRatesCache } from '../services/settings';
import { invalidateTimezoneCache } from '../services/datetime';

const router: ReturnType<typeof Router> = Router();
const prisma = new PrismaClient();

const updateSettingSchema = z.object({
  key: z.string(),
  value: z.string().optional(),
  description: z.string().nullable().optional(),
});

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

    // Invalidate cache if updating a rate or timezone
    if (['WEEKLY_BASE_RATE', 'BIWEEKLY_BASE_RATE', 'MONTHLY_BASE_RATE', 'DAILY_BASE_RATE', 'MORA_RATE'].includes(body.key)) {
      invalidateRatesCache();
    }
    if (body.key === 'TIMEZONE') {
      invalidateTimezoneCache();
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
