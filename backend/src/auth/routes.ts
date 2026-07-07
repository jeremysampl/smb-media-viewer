import { Router } from 'express';
import { config } from '../config.js';
import { validateSambaCredentials } from './smb.js';
import { signAuthToken } from './jwt.js';
import { authMiddleware, type AuthenticatedRequest } from './middleware.js';

const router = Router();

router.post('/login', async (req, res) => {
  const { username, password } = req.body as {
    username?: string;
    password?: string;
  };

  if (!username || !password) {
    res.status(400).json({ error: 'Username and password are required' });
    return;
  }

  const valid = await validateSambaCredentials(username, password);
  if (!valid) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const token = signAuthToken(username);

  res.cookie(config.cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 8 * 60 * 60 * 1000,
  });

  res.json({ username, token });
});

router.post('/logout', (_req, res) => {
  res.clearCookie(config.cookieName);
  res.json({ ok: true });
});

router.get('/me', authMiddleware, (req: AuthenticatedRequest, res) => {
  res.json({ username: req.user!.username });
});

export default router;
