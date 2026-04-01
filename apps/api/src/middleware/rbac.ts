import { Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import { AuthRequest } from './auth';

type RoleAllowed = Role | Role[];

export const rbacMiddleware = (allowedRoles: RoleAllowed) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
      return;
    }

    const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
    
    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
      });
      return;
    }

    next();
  };
};

// Helper middleware for specific roles
export const requireAdmin = rbacMiddleware(Role.ADMIN);
export const requireVendor = rbacMiddleware([Role.ADMIN, Role.VENDEDOR]);
export const requireClient = rbacMiddleware([Role.ADMIN, Role.VENDEDOR, Role.CLIENTE]);

export default rbacMiddleware;
