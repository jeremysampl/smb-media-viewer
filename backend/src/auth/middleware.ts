import type { NextFunction, Request, Response } from 'express';
import { config } from '../config.js';
import { verifyAuthToken } from './jwt.js';

export interface AuthenticatedRequest extends Request {
  user?: { username: string };
}

export function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization;
  const bearer = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  const cookieToken = req.cookies?.[config.cookieName] as string | undefined;
  const token = bearer ?? cookieToken;

  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const payload = verifyAuthToken(token);
  if (!payload?.username) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  req.user = { username: payload.username };
  next();
}
