import Router, { Response } from 'express';
import { PrismaClient, Role } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { requireAdmin } from '../middleware/rbac';

const router = Router();
const prisma = new PrismaClient();

// GET /api/users/vendors - Get all vendors (admin only)
router.get('/vendors', authMiddleware, requireAdmin, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const vendors = await prisma.user.findMany({
      where: { role: Role.VENDEDOR },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
      },
      orderBy: { firstName: 'asc' },
    });

    res.json({
      success: true,
      data: vendors,
    });
  } catch (error) {
    console.error('Error fetching vendors:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

export default router;