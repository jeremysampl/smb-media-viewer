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

export const config = {
  port: Number(process.env.PORT ?? 3001),
  jwtSecret: requireEnv('JWT_SECRET', 'change-me-in-production'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '8h',
  cookieName: process.env.COOKIE_NAME ?? 'smb_media_token',
  localDev: process.env.LOCAL_DEV === 'true',
  devShareName: process.env.DEV_SHARE_NAME ?? 'media',
  devMediaRoot: process.env.DEV_MEDIA_ROOT ?? path.join(process.cwd(), 'dev-media'),
  smbConfPath: process.env.SMB_CONF_PATH ?? '/etc/samba/smb.conf',
  groupFilePath: process.env.GROUP_FILE_PATH ?? '/etc/group',
  smbHost: process.env.SMB_HOST ?? 'localhost',
  mediaRoot: process.env.MEDIA_ROOT ?? '/srv',
  cacheDir: process.env.CACHE_DIR ?? path.join(process.cwd(), 'cache'),
  cacheMaxBytes: Number(process.env.CACHE_MAX_BYTES ?? 10 * 1024 * 1024 * 1024),
  cacheCleanupCron: process.env.CACHE_CLEANUP_CRON ?? '0 */6 * * *',
  tokenSecret: requireEnv('TOKEN_SECRET', 'change-me-token-secret'),
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173',
};
