import { Router, Response } from 'express';
import { PrismaClient, Role } from '@prisma/client';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { requireAdmin, requireVendor } from '../middleware/rbac';

const router: ReturnType<typeof Router> = Router();
const prisma = new PrismaClient();

// Validation schema for creating client
const createClientSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
  dni: z.string().min(1),
  dateOfBirth: z.string(),
  address: z.string().optional(),
  city: z.string().optional(),
  occupation: z.string().optional(),
  employer: z.string().optional(),
  monthlyIncome: z.number().positive(),
});

// GET /api/clients/search - Search clients (MUST be before /:id)
router.get('/search', authMiddleware, requireVendor, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { q } = req.query;
    const searchTerm = q as string;

    if (!searchTerm || searchTerm.length < 2) {
      res.json({
        success: true,
        data: [],
      });
      return;
    }

    const clients = await prisma.client.findMany({
      where: {
        OR: [
          { dni: { contains: searchTerm, mode: 'insensitive' } },
          { user: { firstName: { contains: searchTerm, mode: 'insensitive' } } },
          { user: { lastName: { contains: searchTerm, mode: 'insensitive' } } },
          { user: { email: { contains: searchTerm, mode: 'insensitive' } } },
        ],
      },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      take: 10,
    });

    const results = clients.map(c => ({
      id: c.id,
      dni: c.dni,
      firstName: c.user.firstName,
      lastName: c.user.lastName,
      email: c.user.email,
    }));

    res.json({
      success: true,
      data: results,
    });
  } catch (error) {
    console.error('Search clients error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// GET /api/clients - List all clients
router.get('/', authMiddleware, requireVendor, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const clients = await prisma.client.findMany({
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const formattedClients = clients.map(c => ({
      id: c.id,
      dni: c.dni,
      firstName: c.user.firstName,
      lastName: c.user.lastName,
      email: c.user.email,
      phone: c.user.phone,
      city: c.city,
      monthlyIncome: Number(c.monthlyIncome),
      createdAt: c.createdAt.toISOString(),
    }));

    res.json({
      success: true,
      data: formattedClients,
    });
  } catch (error) {
    console.error('List clients error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// POST /api/clients - Create new client (Admin only)
router.post('/', authMiddleware, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const body = createClientSchema.parse(req.body);

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

    // Create user and client in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create user with hashed password
      const { password } = body;
      const passwordHash = await bcrypt.hash(password, 10);

      const user = await tx.user.create({
        data: {
          email: body.email,
          passwordHash,
          role: Role.CLIENTE,
          firstName: body.firstName,
          lastName: body.lastName,
          phone: body.phone,
        },
      });

      // Create client
      const client = await tx.client.create({
        data: {
          userId: user.id,
          dni: body.dni,
          dateOfBirth: new Date(body.dateOfBirth),
          address: body.address,
          city: body.city,
          occupation: body.occupation,
          employer: body.employer,
          monthlyIncome: body.monthlyIncome,
        },
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
            },
          },
        },
      });

      return client;
    });

    res.status(201).json({
      success: true,
      data: {
        id: result.id,
        dni: result.dni,
        firstName: result.user.firstName,
        lastName: result.user.lastName,
        email: result.user.email,
        phone: result.user.phone,
        city: result.city,
        monthlyIncome: Number(result.monthlyIncome),
        createdAt: result.createdAt.toISOString(),
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
    
    console.error('Create client error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// PATCH /api/clients/:id - Update client (Admin only)
router.patch('/:id', authMiddleware, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { email, firstName, lastName, phone, dni, dateOfBirth, address, city, occupation, employer, monthlyIncome } = req.body;

    const client = await prisma.client.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!client) {
      res.status(404).json({
        success: false,
        error: 'Client not found',
      });
      return;
    }

    // Check if email is being changed and if it's already taken
    if (email && email !== client.user.email) {
      const existingUser = await prisma.user.findUnique({ where: { email } });
      if (existingUser) {
        res.status(400).json({
          success: false,
          error: 'El email ya está registrado',
        });
        return;
      }
    }

    // Check if DNI is being changed and if it's already taken
    if (dni && dni !== client.dni) {
      const existingClient = await prisma.client.findUnique({ where: { dni } });
      if (existingClient) {
        res.status(400).json({
          success: false,
          error: 'El DNI ya está registrado',
        });
        return;
      }
    }

    // Update client and user in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Update user
      await tx.user.update({
        where: { id: client.userId },
        data: {
          email: email || undefined,
          firstName: firstName || undefined,
          lastName: lastName || undefined,
          phone: phone !== undefined ? phone : undefined,
        },
      });

      // Update client
      const updatedClient = await tx.client.update({
        where: { id },
        data: {
          dni: dni || undefined,
          dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
          address: address !== undefined ? address : undefined,
          city: city !== undefined ? city : undefined,
          occupation: occupation !== undefined ? occupation : undefined,
          employer: employer !== undefined ? employer : undefined,
          monthlyIncome: monthlyIncome ? Number(monthlyIncome) : undefined,
        },
        include: {
          user: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
            },
          },
        },
      });

      return updatedClient;
    });

    res.json({
      success: true,
      data: {
        id: result.id,
        dni: result.dni,
        firstName: result.user.firstName,
        lastName: result.user.lastName,
        email: result.user.email,
        phone: result.user.phone,
        city: result.city,
        monthlyIncome: Number(result.monthlyIncome),
      },
    });
  } catch (error) {
    console.error('Update client error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// DELETE /api/clients/:id - Delete client (Admin only)
router.delete('/:id', authMiddleware, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const client = await prisma.client.findUnique({
      where: { id },
      include: { loans: true },
    });

    if (!client) {
      res.status(404).json({
        success: false,
        error: 'Client not found',
      });
      return;
    }

    // Check if client has loans in ANY status
    if (client.loans.length > 0) {
      res.status(400).json({
        success: false,
        error: 'No se puede eliminar un cliente con préstamos',
      });
      return;
    }

    // Get the user to check if they were a vendor with assigned loans
    const user = client.userId ? await prisma.user.findUnique({
      where: { id: client.userId },
      include: {
        assignedLoans: true, // Get ALL loans regardless of status
      },
    }) : null;

    // Check if user was ever a vendor and has loans assigned
    const wasVendorWithLoans = user && 
      user.assignedLoans && 
      user.assignedLoans.length > 0;

    await prisma.$transaction(async (tx) => {
      // Delete the client
      await tx.client.delete({ where: { id } });
      
      // If there's an associated user
      if (client.userId) {
        if (wasVendorWithLoans) {
          // User was a vendor with assigned loans - only deactivate
          await tx.user.update({
            where: { id: client.userId },
            data: { isActive: false },
          });
        } else {
          // User can be deleted - no loans as vendor
          await tx.user.delete({ where: { id: client.userId } });
        }
      }
    });

    res.json({
      success: true,
      data: { 
        message: wasVendorWithLoans 
          ? 'Cliente eliminado, usuario desactivado (tenía préstamos como vendedor)'
          : 'Cliente y usuario eliminados correctamente'
      },
    });
  } catch (error) {
    console.error('Delete client error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

// GET /api/clients/:id - Get client by ID
router.get('/:id', authMiddleware, requireVendor, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const client = await prisma.client.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
        loans: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!client) {
      res.status(404).json({
        success: false,
        error: 'Client not found',
      });
      return;
    }

    res.json({
      success: true,
      data: {
        ...client,
        monthlyIncome: Number(client.monthlyIncome),
      },
    });
  } catch (error) {
    console.error('Get client error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

export default router;
