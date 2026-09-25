import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { isCastSessionAllowed } from '../cast/sessions.js';
import type { CastTokenPayload, MediaTokenPayload } from '../types.js';

const TOKEN_TTL_SECONDS = 60 * 60 * 24;
const CAST_TOKEN_TTL_SECONDS = 60 * 60 * 4;

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

export function createCastToken(
  path: string,
  username: string,
  sessionId?: string,
): string {
  const payload: CastTokenPayload = {
    path,
    username,
    purpose: 'cast',
    exp: Math.floor(Date.now() / 1000) + CAST_TOKEN_TTL_SECONDS,
    ...(sessionId ? { sid: sessionId } : {}),
  };
  return jwt.sign(payload, config.tokenSecret);
}

export function verifyCastToken(token: string): CastTokenPayload | null {
  try {
    const payload = jwt.verify(token, config.tokenSecret) as CastTokenPayload;
    if (payload.purpose !== 'cast') return null;
    if (!isCastSessionAllowed(payload.sid)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function cacheKey(parts: string[]): string {
  return crypto.createHash('sha256').update(parts.join('|')).digest('hex');
}
