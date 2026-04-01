import { Request, Response, NextFunction } from 'express';
import { JWTService, JWTPayload } from '../services/jwt';

export interface AuthRequest extends Request {
  user?: JWTPayload;
}

export const authMiddleware = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
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
