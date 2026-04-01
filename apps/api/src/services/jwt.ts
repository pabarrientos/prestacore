import jwt, { SignOptions } from 'jsonwebtoken';
import { Role } from '@prisma/client';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

export interface JWTPayload {
  userId: string;
  email: string;
  role: Role;
  firstName: string;
  lastName: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export class JWTService {
  static sign(payload: JWTPayload): string {
    const options: SignOptions = { expiresIn: '7d' };
    return jwt.sign(payload, JWT_SECRET, options);
  }

  static verify(token: string): JWTPayload | null {
    try {
      return jwt.verify(token, JWT_SECRET) as JWTPayload;
    } catch {
      return null;
    }
  }

  static decode(token: string): JWTPayload | null {
    try {
      return jwt.decode(token) as JWTPayload;
    } catch {
      return null;
    }
  }

  static generateTokenPair(payload: Omit<JWTPayload, 'iat' | 'exp'>): TokenPair {
    const accessToken = this.sign(payload);
    
    // Refresh token lasts longer (30 days)
    const refreshTokenOptions: SignOptions = { expiresIn: '30d' };
    const refreshToken = jwt.sign(payload, JWT_SECRET, refreshTokenOptions);

    return { accessToken, refreshToken };
  }

  static verifyRefreshToken(token: string): JWTPayload | null {
    try {
      return jwt.verify(token, JWT_SECRET) as JWTPayload;
    } catch {
      return null;
    }
  }
}

export default JWTService;
