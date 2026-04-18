import { Router, Response } from 'express';
import { PrismaClient, Role } from '@prisma/client';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { requireAdmin } from '../middleware/rbac';

const router = Router();
const prisma = new PrismaClient();

// Validation schemas
const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password debe tener al menos 8 caracteres'),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: z.enum(['ADMIN', 'VENDEDOR', 'CLIENTE']),
  phone: z.string().optional(),
  // Client-specific fields (optional - used when role is CLIENTE)
  dni: z.string().optional(),
  dateOfBirth: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  occupation: z.string().optional(),
  employer: z.string().optional(),
  monthlyIncome: z.number().optional(),
});

const updateUserSchema = z.object({
  email: z.string().email().optional(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().optional(),
  isActive: z.boolean().optional(),
});

const updateRoleSchema = z.object({
  role: z.enum(['ADMIN', 'VENDEDOR', 'CLIENTE']),
});

const updatePasswordSchema = z.object({
  newPassword: z.string().min(8, 'Password debe tener al menos 8 caracteres'),
});

// Schema for profile update (user themselves)
const updateProfileSchema = z.object({
  email: z.string().email().optional(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8).optional(),
});

// GET /api/users/me - Get current user profile
router.get('/me', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        phone: true,
        isActive: true,
        createdAt: true,
        client: {
          select: {
            id: true,
            dni: true,
            dateOfBirth: true,
            address: true,
            city: true,
            occupation: true,
            employer: true,
            monthlyIncome: true,
          },
        },
      },
    });

    if (!user) {
      res.status(404).json({
        success: false,
        error: 'Usuario no encontrado',
      });
      return;
    }

    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// PATCH /api/users/me - Update current user profile
router.patch('/me', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const body = updateProfileSchema.parse(req.body);

    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!currentUser) {
      res.status(404).json({
        success: false,
        error: 'Usuario no encontrado',
      });
      return;
    }

    // Check if email is being changed
    if (body.email && body.email !== currentUser.email) {
      // Check if new email is already taken
      const existingUser = await prisma.user.findUnique({ where: { email: body.email } });
      if (existingUser) {
        res.status(400).json({
          success: false,
          error: 'El email ya está registrado',
        });
        return;
      }
    }

    // If changing password, verify current password
    if (body.newPassword) {
      if (!body.currentPassword) {
        res.status(400).json({
          success: false,
          error: 'Debe ingresar la contraseña actual para cambiar la contraseña',
        });
        return;
      }

      const isValid = await bcrypt.compare(body.currentPassword, currentUser.passwordHash);
      if (!isValid) {
        res.status(400).json({
          success: false,
          error: 'La contraseña actual es incorrecta',
        });
        return;
      }
    }

    // Update user data
    const updateData: Record<string, unknown> = {};
    if (body.email) updateData.email = body.email;
    if (body.firstName) updateData.firstName = body.firstName;
    if (body.lastName) updateData.lastName = body.lastName;
    if (body.phone !== undefined) updateData.phone = body.phone;
    if (body.newPassword) updateData.passwordHash = await bcrypt.hash(body.newPassword, 10);

    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        phone: true,
        isActive: true,
        createdAt: true,
      },
    });

    res.json({
      success: true,
      data: user,
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

    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// GET /api/users - List all users (admin only)
router.get('/', authMiddleware, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { role, isActive, search } = req.query;

    const where: Record<string, unknown> = {};

    if (role) {
      where.role = role;
    }

    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

    if (search && typeof search === 'string') {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        phone: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: users,
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// POST /api/users - Create new user (admin only)
router.post('/', authMiddleware, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const body = createUserSchema.parse(req.body);

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: body.email },
    });

    if (existingUser) {
      res.status(400).json({
        success: false,
        error: 'El email ya está registrado',
      });
      return;
    }

    // Check if requester is admin - only admin can create admin users
    const requester = req.user!;
    if (body.role === Role.ADMIN && requester.role !== Role.ADMIN) {
      res.status(403).json({
        success: false,
        error: 'No tienes permisos para crear usuarios ADMIN',
      });
      return;
    }

    // For CLIENTE role, require client-specific fields
    if (body.role === Role.CLIENTE) {
      if (!body.dni || !body.dateOfBirth) {
        res.status(400).json({
          success: false,
          error: 'DNI y fecha de nacimiento son requeridos para clientes',
        });
        return;
      }

      // Check if DNI already exists
      const existingClient = await prisma.client.findUnique({
        where: { dni: body.dni },
      });

      if (existingClient) {
        res.status(400).json({
          success: false,
          error: 'El DNI ya está registrado',
        });
        return;
      }
    }

    // Hash password
    const passwordHash = await bcrypt.hash(body.password, 10);

    // Create user and optionally client in transaction
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: body.email,
          passwordHash,
          role: body.role as Role,
          firstName: body.firstName,
          lastName: body.lastName,
          phone: body.phone,
        },
        select: {
          id: true,
          email: true,
          role: true,
          firstName: true,
          lastName: true,
          phone: true,
          isActive: true,
          createdAt: true,
        },
      });

      // If role is CLIENTE, create client record
      if (body.role === Role.CLIENTE) {
        await tx.client.create({
          data: {
            userId: user.id,
            dni: body.dni!,
            dateOfBirth: new Date(body.dateOfBirth!),
            address: body.address,
            city: body.city,
            occupation: body.occupation,
            employer: body.employer,
            monthlyIncome: body.monthlyIncome || 0,
          },
        });
      }

      return user;
    });

    res.status(201).json({
      success: true,
      data: result,
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

    console.error('Create user error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

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

// GET /api/users/:id - Get user by ID (admin only)
router.get('/:id', authMiddleware, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        phone: true,
        isActive: true,
        createdAt: true,
      },
    });

    if (!user) {
      res.status(404).json({
        success: false,
        error: 'Usuario no encontrado',
      });
      return;
    }

    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// PATCH /api/users/:id - Update user (admin only)
router.patch('/:id', authMiddleware, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const body = updateUserSchema.parse(req.body);

    const requester = req.user!;

    // Business rule: Admin cannot deactivate themselves
    if (requester.userId === id && body.isActive === false) {
      res.status(403).json({
        success: false,
        error: 'No puedes desactivarte a ti mismo',
      });
      return;
    }

    // Get current user to check business rules
    const currentUser = await prisma.user.findUnique({
      where: { id },
      include: {
        assignedLoans: {
          where: {
            OR: [
              { status: 'ACTIVE' },
              { status: 'PENDING' },
            ],
          },
        },
        client: true,
      },
    });

    if (!currentUser) {
      res.status(404).json({
        success: false,
        error: 'Usuario no encontrado',
      });
      return;
    }

    // Check if email is being changed and if it's already taken
    if (body.email && body.email !== currentUser.email) {
      const existingUser = await prisma.user.findUnique({ where: { email: body.email } });
      if (existingUser) {
        res.status(400).json({
          success: false,
          error: 'El email ya está registrado',
        });
        return;
      }
    }

    // Business rule: If last active admin, cannot deactivate
    if (currentUser.role === Role.ADMIN && body.isActive === false) {
      const adminCount = await prisma.user.count({
        where: { role: Role.ADMIN, isActive: true },
      });

      if (adminCount <= 1) {
        res.status(400).json({
          success: false,
          error: 'No se puede desactivar el último administrador activo',
        });
        return;
      }
    }

    const user = await prisma.user.update({
      where: { id },
      data: {
        email: body.email,
        lastName: body.lastName,
        phone: body.phone,
        isActive: body.isActive,
      },
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        phone: true,
        isActive: true,
        createdAt: true,
      },
    });

    res.json({
      success: true,
      data: user,
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

    console.error('Update user error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// PATCH /api/users/:id/role - Change user role (admin only)
router.patch('/:id/role', authMiddleware, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const body = updateRoleSchema.parse(req.body);

    const requester = req.user!;

    // Business rule: Admin cannot change their own role
    if (requester.userId === id) {
      res.status(403).json({
        success: false,
        error: 'No puedes cambiar tu propio rol',
      });
      return;
    }

    const currentUser = await prisma.user.findUnique({
      where: { id },
      include: {
        assignedLoans: {
          where: { status: 'ACTIVE' },
        },
      },
    });

    if (!currentUser) {
      res.status(404).json({
        success: false,
        error: 'Usuario no encontrado',
      });
      return;
    }

    // Business rule: If user has active or pending loans as vendor, cannot change to CLIENTE
    if (currentUser.role === Role.VENDEDOR && body.role === Role.CLIENTE) {
      const activeLoansAsVendor = currentUser.assignedLoans.filter(l => l.assignedVendorId === id);
      if (activeLoansAsVendor.length > 0) {
        res.status(400).json({
          success: false,
          error: 'No se puede cambiar a CLIENTE porque tiene préstamos activos o pendientes asignados como vendedor',
        });
        return;
      }
    }

    // Update user and create client if changing to CLIENTE
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id },
        data: { role: body.role as Role },
        select: {
          id: true,
          email: true,
          role: true,
          firstName: true,
          lastName: true,
          phone: true,
          isActive: true,
          createdAt: true,
        },
      });

      // If changing to CLIENTE and user doesn't have a client record, create one
      if (body.role === Role.CLIENTE) {
        const existingClient = await tx.client.findUnique({
          where: { userId: id },
        });

        if (!existingClient) {
          // Create empty client record - admin must fill in details later
          await tx.client.create({
            data: {
              userId: id,
              dni: '',
              dateOfBirth: new Date(),
              monthlyIncome: 0,
            },
          });
        }
      }

      return user;
    });

    res.json({
      success: true,
      data: result,
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

    console.error('Update user role error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// PATCH /api/users/:id/password - Change password (admin only)
router.patch('/:id/password', authMiddleware, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { newPassword } = updatePasswordSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      res.status(404).json({
        success: false,
        error: 'Usuario no encontrado',
      });
      return;
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id },
      data: { passwordHash },
    });

    res.json({
      success: true,
      data: { message: 'Password actualizado correctamente' },
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

    console.error('Update password error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// DELETE /api/users/:id - Soft delete user (admin only)
router.delete('/:id', authMiddleware, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const requester = req.user!;

    // Business rule: Admin cannot delete themselves
    if (requester.userId === id) {
      res.status(403).json({
        success: false,
        error: 'No puedes eliminarte a ti mismo',
      });
      return;
    }

    const currentUser = await prisma.user.findUnique({
      where: { id },
      include: {
        assignedLoans: true, // Get ALL loans regardless of status
      },
    });

    if (!currentUser) {
      res.status(404).json({
        success: false,
        error: 'Usuario no encontrado',
      });
      return;
    }

    // Check if user has a client associated (current or past)
    const associatedClient = await prisma.client.findUnique({
      where: { userId: id },
      include: { loans: true },
    });

    // If user has associated client with loans, cannot delete - only deactivate
    if (associatedClient && associatedClient.loans.length > 0) {
      await prisma.user.update({
        where: { id },
        data: { isActive: false },
      });

      res.json({
        success: true,
        data: { message: 'Usuario desactivado (tiene cliente asociadas con préstamos)' },
      });
      return;
    }

    // Check if user was ever a vendor and has assigned loans (regardless of current role)
    const wasVendorWithLoans = currentUser.assignedLoans && 
      currentUser.assignedLoans.length > 0;

    if (wasVendorWithLoans) {
      // User was a vendor with assigned loans - only deactivate
      await prisma.user.update({
        where: { id },
        data: { isActive: false },
      });

      res.json({
        success: true,
        data: { message: 'Usuario desactivado (fue vendedor con préstamos asignados)' },
      });
      return;
    }

    // User can be deleted - no client with loans and wasn't a vendor with loans
    // First, delete associated client if exists (no loans)
    if (associatedClient) {
      await prisma.client.delete({ where: { id: associatedClient.id } });
    }

    // Soft delete - deactivate user instead of hard delete (since user records may be referenced)
    await prisma.user.update({
      where: { id },
      data: { isActive: false },
    });

    res.json({
      success: true,
      data: { message: 'Usuario eliminado correctamente' },
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

export default router;