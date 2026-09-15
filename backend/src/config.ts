import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const frontendOrigin = process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173';

/** Secure cookies need HTTPS. Leave false for plain HTTP on the LAN. */
function resolveCookieSecure(origin: string): boolean {
  if (process.env.COOKIE_SECURE === 'true') return true;
  if (process.env.COOKIE_SECURE === 'false') return false;
  return origin.startsWith('https://');
}

function parseAdminUsers(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export const config = {
  port: Number(process.env.PORT ?? 3001),
  jwtSecret: requireEnv('JWT_SECRET', 'change-me-in-production'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '8h',
  cookieName: process.env.COOKIE_NAME ?? 'smb_media_token',
  cookieSecure: resolveCookieSecure(frontendOrigin),
  /** From ADMIN_USERS (comma-separated Samba usernames). */
  adminUsers: parseAdminUsers(process.env.ADMIN_USERS),
  localDev: process.env.LOCAL_DEV === 'true',
  devShareName: process.env.DEV_SHARE_NAME ?? 'media',
  devMediaRoot: process.env.DEV_MEDIA_ROOT ?? path.join(process.cwd(), 'dev-media'),
  smbConfPath: process.env.SMB_CONF_PATH ?? '/etc/samba/smb.conf',
  groupFilePath: process.env.GROUP_FILE_PATH ?? '/etc/group',
  passwdFilePath: process.env.PASSWD_FILE_PATH ?? '/etc/passwd',
  smbHost: process.env.SMB_HOST ?? 'localhost',
  mediaRoot: process.env.MEDIA_ROOT ?? '/srv',
  cacheDir: path.resolve(process.env.CACHE_DIR ?? path.join(process.cwd(), 'cache')),
  cacheMaxBytes: Number(process.env.CACHE_MAX_BYTES ?? 10 * 1024 * 1024 * 1024),
  cacheCleanupCron: process.env.CACHE_CLEANUP_CRON ?? '0 */6 * * *',
  /** Index DB + grid thumbs (kept permanently). */
  indexDir: path.resolve(process.env.INDEX_DIR ?? path.join(process.cwd(), 'index')),
  /** Max concurrent index/thumb jobs (shared by background + on-demand). */
  indexConcurrency: Math.max(1, Number(process.env.INDEX_CONCURRENCY ?? 2)),
  tokenSecret: requireEnv('TOKEN_SECRET', 'change-me-token-secret'),
  frontendOrigin,
  /**
   * Origin Chromecast should use for media URLs (e.g. http://192.168.1.50:5173).
   * Use this when the browser page is on localhost (Cast API works) but media must
   * be fetched from a LAN address the TV can reach.
   */
  castPublicOrigin: process.env.CAST_PUBLIC_ORIGIN?.trim() || '',
  libreOfficeBin: process.env.LIBREOFFICE_BIN ?? 'soffice',
};
