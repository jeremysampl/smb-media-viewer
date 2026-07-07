import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import type { MediaTokenPayload } from '../types.js';

const TOKEN_TTL_SECONDS = 60 * 60 * 24;

export function createMediaToken(path: string, username: string): string {
  const payload: MediaTokenPayload = {
    path,
    username,
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
  };
  return jwt.sign(payload, config.tokenSecret);
}

export function verifyMediaToken(token: string): MediaTokenPayload | null {
  try {
    return jwt.verify(token, config.tokenSecret) as MediaTokenPayload;
  } catch {
    return null;
  }
}

export function cacheKey(parts: string[]): string {
  return crypto.createHash('sha256').update(parts.join('|')).digest('hex');
}
