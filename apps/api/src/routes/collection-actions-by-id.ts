import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { requireAdmin } from '../middleware/rbac';

const router: ReturnType<typeof Router> = Router();
const prisma = new PrismaClient();

// DELETE /api/collection-actions/:id - Delete a collection action (admin only)
router.delete('/:id', authMiddleware, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Check if collection action exists
    const action = await prisma.collectionAction.findUnique({
      where: { id },
    });

    if (!action) {
      res.status(404).json({
        success: false,
        error: 'CollectionAction not found',
      });
      return;
    }

    // Delete the action
    await prisma.collectionAction.delete({
      where: { id },
    });

    res.json({
      success: true,
      data: { message: 'CollectionAction deleted successfully' },
    });
  } catch (error) {
    console.error('Delete collection action error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

export default router;
