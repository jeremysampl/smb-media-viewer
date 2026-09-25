import { Router } from 'express';
import { config } from '../config.js';
import { isAdminUsername } from './admin.js';
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

  const cookieOptions = {
    httpOnly: true,
    sameSite: 'lax' as const,
    // Must be false for plain HTTP (typical LAN). Browsers ignore Secure cookies on http://.
    secure: config.cookieSecure,
    maxAge: 8 * 60 * 60 * 1000,
  };

  res.cookie(config.cookieName, token, cookieOptions);

  res.json({ username, admin: isAdminUsername(username), token });
});

router.post('/logout', (_req, res) => {
  res.clearCookie(config.cookieName, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
  });
  res.json({ ok: true });
});

router.get('/me', authMiddleware, (req: AuthenticatedRequest, res) => {
  const username = req.user!.username;
  res.json({ username, admin: isAdminUsername(username) });
});

export default router;
