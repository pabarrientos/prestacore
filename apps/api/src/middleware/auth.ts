import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { JWTService, JWTPayload } from '../services/jwt';

const prisma = new PrismaClient();

export interface AuthRequest extends Request {
  user?: JWTPayload;
}

export const authMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: 'No token provided',
    });
    return;
  }

  const token = authHeader.substring(7);
  const payload = JWTService.verify(token);

  if (!payload) {
    res.status(401).json({
      success: false,
      error: 'Invalid or expired token',
    });
    return;
  }

  // Verify user still exists and is active in the database
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { isActive: true },
  });

  if (!user) {
    res.status(401).json({
      success: false,
      error: 'User no longer exists',
    });
    return;
  }

  if (!user.isActive) {
    res.status(401).json({
      success: false,
      error: 'User account is deactivated',
    });
    return;
  }

  req.user = payload;
  next();
};

export const optionalAuthMiddleware = (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const payload = JWTService.verify(token);
    if (payload) {
      req.user = payload;
    }
  }

  next();
};

export default authMiddleware;
