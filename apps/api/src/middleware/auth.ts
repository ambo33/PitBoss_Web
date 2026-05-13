import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';

const secret = process.env.JWT_SECRET ?? 'dev-secret';
const jwtExpiresIn = (process.env.JWT_EXPIRES_IN ?? '30d') as SignOptions['expiresIn'];

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, secret, { expiresIn: jwtExpiresIn });
}

function decodeUserId(header?: string): string | null {
  if (!header?.startsWith('Bearer ')) {
    return null;
  }
  try {
    const payload = jwt.verify(header.slice(7), secret) as { sub: string };
    return payload.sub;
  } catch {
    return null;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const userId = decodeUserId(req.headers.authorization);
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  req.userId = userId;
  next();
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const userId = decodeUserId(req.headers.authorization);
  if (userId) {
    req.userId = userId;
  }
  next();
}
