import jwt, { type SignOptions } from 'jsonwebtoken';
import { config } from '../config.js';
import type { JwtPayload } from '../types.js';

export function signAuthToken(username: string): string {
  const options: SignOptions = {
    expiresIn: config.jwtExpiresIn as SignOptions['expiresIn'],
  };
  return jwt.sign({ username }, config.jwtSecret, options);
}

export function verifyAuthToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, config.jwtSecret) as JwtPayload;
  } catch {
    return null;
  }
}
