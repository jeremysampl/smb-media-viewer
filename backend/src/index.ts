import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import path from 'node:path';
import sharp from 'sharp';
import { config } from './config.js';
import authRoutes from './auth/routes.js';
import browseRoutes from './routes/browse.js';
import mediaRoutes from './routes/media.js';
import downloadRoutes from './routes/download.js';
import adminRoutes from './routes/admin.js';
import { startCacheCleanupJob } from './cache/cleanup.js';
import { getIndexDb } from './index/db.js';
import { QUALITY_PROFILES } from './media/quality.js';

// Avoid holding SMB source files open across concurrent viewers
sharp.cache({ files: 0 });

const app = express();

app.use(
  cors({
    origin: config.frontendOrigin,
    credentials: true,
  }),
);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/quality', (_req, res) => {
  res.json({ profiles: QUALITY_PROFILES });
});

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', browseRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/download', downloadRoutes);

app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  res.status(500).json({ error: 'Internal server error' });
});

getIndexDb();
startCacheCleanupJob();

app.listen(config.port, () => {
  console.log(`SMB Media Viewer API listening on port ${config.port}`);
  console.log(`Media index directory: ${path.resolve(config.indexDir)}`);
  if (config.adminUsers.length > 0) {
    console.log(`Admin users: ${config.adminUsers.join(', ')}`);
  } else {
    console.log('Admin users: (none; set ADMIN_USERS to enable /admin)');
  }
  if (config.localDev) {
    console.log(`[LOCAL_DEV] Serving share "${config.devShareName}" from ${path.resolve(config.devMediaRoot)}`);
    if (config.smbHost !== 'localhost') {
      console.log(`[LOCAL_DEV] Login still validated against Samba host ${config.smbHost}`);
    }
  }
});
