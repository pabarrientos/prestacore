import { Router, Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { requireVendor } from '../middleware/rbac';
import { getCollectionActionTypes, isValidCollectionActionType } from '../services/settings';

const router: ReturnType<typeof Router> = Router();
const prisma = new PrismaClient();

// Validation schema for creating a collection action
const createCollectionActionSchema = z.object({
  type: z.string().min(1, 'Type is required'),
  description: z.string().min(1, 'Description is required').max(1000),
  result: z.string().max(500).optional(),
  nextAction: z.string().max(500).optional(),
  followUpDate: z.string().optional(), // ISO date string
});

// GET /api/collection-actions/:loanId - Get all collection actions for a loan
router.get('/:loanId', authMiddleware, requireVendor, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { loanId } = req.params;

    // Check if loan exists
    const loan = await prisma.loan.findUnique({
      where: { id: loanId },
    });

    if (!loan) {
      res.status(404).json({
        success: false,
        error: 'Loan not found',
      });
      return;
    }

    // Get collection actions ordered by createdAt desc
    const actions = await prisma.collectionAction.findMany({
      where: { loanId },
      orderBy: { createdAt: 'desc' },
    });

    // Get configured types for labels
    const configuredTypes = await getCollectionActionTypes();
    const typesMap = new Map(configuredTypes.map(t => [t.code, t.label]));

    res.json({
      success: true,
      data: actions.map(action => ({
        ...action,
        typeLabel: typesMap.get(action.type) || action.type,
        nextActionLabel: action.nextAction ? typesMap.get(action.nextAction) || action.nextAction : null,
        followUpDate: action.followUpDate?.toISOString() || null,
        createdAt: action.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('Get collection actions error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// GET /api/collection-actions - Get all collection actions with filters (for agenda)
router.get('/', authMiddleware, requireVendor, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { createdBy, createdFrom, createdTo, followUpFrom, followUpTo, type, loanId, q, page = '1', limit = '20' } = req.query;
    const userRole = req.user?.role;
    const userId = req.user?.userId;

    // Pagination
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);

    // Build where clause
    const where: any = {};

    // VENDEDOR can only see actions from their own loans
    if (userRole === 'VENDEDOR' && userId) {
      // Get loans assigned to this vendor
      const vendorLoans = await prisma.loan.findMany({
        where: { assignedVendorId: userId },
        select: { id: true },
      });
      const loanIds = vendorLoans.map(l => l.id);

      // If vendor has no loans, return empty. Otherwise filter by their loans.
      if (loanIds.length === 0) {
        res.json({
          success: true,
          data: [],
        });
        return;
      }

      // If loanId filter is provided, ensure it's within vendor's loans
      if (loanId) {
        if (!loanIds.includes(loanId as string)) {
          // Vendor is trying to see actions from a loan not assigned to them
          res.json({
            success: true,
            data: [],
          });
          return;
        }
        where.loanId = loanId;
      } else {
        where.loanId = { in: loanIds };
      }
    } else if (loanId) {
      where.loanId = loanId as string;
    }

    // createdBy filter only for ADMIN (VENDEDOR can't see who created actions)
    if (createdBy && userRole === 'ADMIN') {
      where.createdBy = createdBy as string;
    }

    // Build date filter objects
    const hasCreatedDate = !!(createdFrom || createdTo);
    const hasFollowUpDate = !!(followUpFrom || followUpTo);

    const createdFilter: any = {};
    if (createdFrom) createdFilter.gte = new Date(createdFrom as string);
    if (createdTo) {
      const toDate = new Date(createdTo as string);
      toDate.setHours(23, 59, 59, 999);
      createdFilter.lte = toDate;
    }

    const followUpFilter: any = {};
    if (followUpFrom) followUpFilter.gte = new Date(followUpFrom as string);
    if (followUpTo) {
      const toDate = new Date(followUpTo as string);
      toDate.setHours(23, 59, 59, 999);
      followUpFilter.lte = toDate;
    }

    // Date filters are OR: show actions that match EITHER creation date range OR follow-up date range
    if (hasCreatedDate && hasFollowUpDate) {
      where.OR = [
        { createdAt: createdFilter },
        { followUpDate: followUpFilter },
      ];
    } else if (hasCreatedDate) {
      where.createdAt = createdFilter;
    } else if (hasFollowUpDate) {
      where.followUpDate = followUpFilter;
    }

    if (type) {
      where.type = type as string;
    }

    // Text search across client name
    if (q && typeof q === 'string' && q.trim()) {
      const searchTerm = q.trim();
      where.client = {
        user: {
          OR: [
            { firstName: { contains: searchTerm, mode: 'insensitive' } },
            { lastName: { contains: searchTerm, mode: 'insensitive' } },
          ],
        },
      };
    }

    // Get collection actions with pagination
    const [actions, total] = await Promise.all([
      prisma.collectionAction.findMany({
        where,
        include: {
          loan: {
            select: {
              id: true,
              amount: true,
              status: true,
            },
          },
          client: {
            select: {
              id: true,
              dni: true,
              user: {
                select: {
                  firstName: true,
                  lastName: true,
                  phone: true,
                },
              },
            },
          },
        },
        orderBy: [
          { followUpDate: 'asc' }, // Pending follow-ups first
          { createdAt: 'desc' },
        ],
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
      prisma.collectionAction.count({ where }),
    ]);

    // Get configured types for labels
    const configuredTypes = await getCollectionActionTypes();
    const typesMap = new Map(configuredTypes.map(t => [t.code, t.label]));

    res.json({
      success: true,
      data: {
        data: actions.map(action => ({
          id: action.id,
          type: action.type,
          typeLabel: typesMap.get(action.type) || action.type,
          description: action.description,
          result: action.result,
          nextAction: action.nextAction,
          nextActionLabel: action.nextAction ? typesMap.get(action.nextAction) || action.nextAction : null,
          followUpDate: action.followUpDate?.toISOString() || null,
          createdAt: action.createdAt.toISOString(),
          createdBy: action.createdBy,
          loan: action.loan,
          client: action.client ? {
            id: action.client.id,
            name: `${action.client.user.firstName} ${action.client.user.lastName}`,
            phone: action.client.user.phone,
            dni: action.client.dni,
          } : null,
        })),
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('Get all collection actions error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// POST /api/collection-actions/:loanId - Create a new collection action
router.post('/:loanId', authMiddleware, requireVendor, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { loanId } = req.params;

    // Validate request body
    const validation = createCollectionActionSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'Validation error',
        details: validation.error.errors,
      });
      return;
    }

    const { type, description, result, nextAction, followUpDate } = validation.data;

    // Check if loan exists
    const loan = await prisma.loan.findUnique({
      where: { id: loanId },
    });

    if (!loan) {
      res.status(404).json({
        success: false,
        error: 'Loan not found',
      });
      return;
    }

    // Validate type against configured types
    const isValidType = await isValidCollectionActionType(type);
    if (!isValidType) {
      const configuredTypes = await getCollectionActionTypes();
      res.status(400).json({
        success: false,
        error: `Invalid type. Valid types are: ${configuredTypes.map(t => t.code).join(', ')}`,
      });
      return;
    }

    // Validate nextAction if provided
    let validatedNextAction: string | null = null;
    if (nextAction) {
      const isValidNextAction = await isValidCollectionActionType(nextAction);
      if (!isValidNextAction) {
        const configuredTypes = await getCollectionActionTypes();
        res.status(400).json({
          success: false,
          error: `Invalid nextAction type. Valid types are: ${configuredTypes.map(t => t.code).join(', ')}`,
        });
        return;
      }
      validatedNextAction = nextAction;
    }

    // Create the collection action
    const collectionAction = await prisma.collectionAction.create({
      data: {
        loanId,
        clientId: loan.clientId,
        type: type,
        description,
        result: result || null,
        nextAction: validatedNextAction,
        followUpDate: followUpDate ? new Date(followUpDate) : null,
        createdBy: req.user?.userId || null,
      },
    });

    // Get type labels
    const configuredTypes = await getCollectionActionTypes();
    const typeLabel = configuredTypes.find(t => t.code === type)?.label || type;
    const nextActionLabel = validatedNextAction
      ? configuredTypes.find(t => t.code === validatedNextAction)?.label || validatedNextAction
      : null;

    res.status(201).json({
      success: true,
      data: {
        ...collectionAction,
        typeLabel,
        nextActionLabel,
        followUpDate: collectionAction.followUpDate?.toISOString() || null,
        createdAt: collectionAction.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Create collection action error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

export default router;
