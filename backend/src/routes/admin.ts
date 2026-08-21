import { Router } from 'express';
import { sendAdminPreview } from '../admin/preview.js';
import {
  clearCacheEntries,
  listCacheSourceFolders,
  queryCacheEntries,
} from '../cache/meta.js';
import { getCacheStats, invalidateCacheStats } from '../cache/stats.js';
import {
  clearMediaIndexEntries,
  getMediaIndexCount,
  listIndexSourceFolders,
  queryMediaIndexEntries,
} from '../index/db.js';
import { getIndexQueueStatus } from '../index/indexer.js';
import { listRecentJobs, listTrackedJobs } from '../jobs/tracker.js';
import { getSystemMetrics } from '../util/systemMetrics.js';
import {
  adminMiddleware,
  authMiddleware,
  type AuthenticatedRequest,
} from '../auth/middleware.js';

const router = Router();

router.use(authMiddleware, adminMiddleware);

function parseListQuery(query: AuthenticatedRequest['query']) {
  return {
    page: Number(query.page ?? 1),
    pageSize: Number(query.pageSize ?? 50),
    sort: String(query.sort ?? ''),
    order: query.order === 'asc' ? ('asc' as const) : ('desc' as const),
    search: String(query.search ?? ''),
    kind: String(query.kind ?? 'all'),
    folder: String(query.folder ?? ''),
  };
}

router.get('/status', async (_req: AuthenticatedRequest, res) => {
  const [cache, system] = await Promise.all([
    getCacheStats(),
    Promise.resolve(getSystemMetrics()),
  ]);
  const index = getIndexQueueStatus();
  const mediaJobs = listTrackedJobs();
  const recentJobs = listRecentJobs();

  res.json({
    generatedAt: Date.now(),
    system,
    cache,
    index: {
      ...index,
      indexedFiles: getMediaIndexCount(),
    },
    mediaJobs,
    recentJobs,
  });
});

router.get('/cache/entries', (req: AuthenticatedRequest, res) => {
  const query = parseListQuery(req.query);
  const result = queryCacheEntries(query);
  res.json({
    generatedAt: Date.now(),
    page: result.page,
    pageSize: result.pageSize,
    total: result.total,
    folders: listCacheSourceFolders(),
    entries: result.entries.map((entry) => ({
      id: entry.cachePath,
      cachePath: entry.cachePath,
      sourcePath: entry.sourcePath,
      label: entry.sourcePath
        ? entry.sourcePath.replace(/^.*[/\\]/, '')
        : entry.cachePath.replace(/^.*[/\\]/, ''),
      kind: entry.kind,
      quality: entry.quality,
      size: entry.size,
      createdAt: entry.createdAt,
      lastAccessAt: entry.lastAccessAt,
      accessCount: entry.accessCount,
    })),
  });
});

router.post('/cache/clear', async (req: AuthenticatedRequest, res) => {
  const body = req.body as {
    mode?: 'all' | 'ids' | 'folder';
    ids?: string[];
    folder?: string;
  };
  const mode = body.mode;
  if (mode !== 'all' && mode !== 'ids' && mode !== 'folder') {
    res.status(400).json({ error: 'mode must be all, ids, or folder' });
    return;
  }

  try {
    const result = await clearCacheEntries({
      mode,
      ids: body.ids,
      folder: body.folder,
    });
    invalidateCacheStats();
    res.json({ ok: true, deleted: result.deleted });
  } catch (error) {
    console.error('[admin] Cache clear failed:', error);
    res.status(500).json({ error: 'Failed to clear cache' });
  }
});

router.get('/index/entries', (req: AuthenticatedRequest, res) => {
  const query = parseListQuery(req.query);
  const result = queryMediaIndexEntries(query);
  res.json({
    generatedAt: Date.now(),
    page: result.page,
    pageSize: result.pageSize,
    total: result.total,
    folders: listIndexSourceFolders(),
    entries: result.entries.map((entry) => ({
      id: entry.absolutePath,
      path: entry.absolutePath,
      label: entry.absolutePath.replace(/^.*[/\\]/, ''),
      kind: entry.kind,
      size: entry.size,
      mtimeMs: entry.mtimeMs,
      captureTime: entry.captureTime,
      duration: entry.duration,
      indexedAt: entry.indexedAt,
      hasThumb: Boolean(entry.thumbKey),
    })),
  });
});

router.post('/index/clear', (req: AuthenticatedRequest, res) => {
  const body = req.body as {
    mode?: 'all' | 'ids' | 'folder';
    ids?: string[];
    folder?: string;
  };
  const mode = body.mode;
  if (mode !== 'all' && mode !== 'ids' && mode !== 'folder') {
    res.status(400).json({ error: 'mode must be all, ids, or folder' });
    return;
  }

  try {
    const result = clearMediaIndexEntries({
      mode,
      ids: body.ids,
      folder: body.folder,
    });
    res.json({ ok: true, deleted: result.deleted });
  } catch (error) {
    console.error('[admin] Index clear failed:', error);
    res.status(500).json({ error: 'Failed to clear index' });
  }
});

router.get('/preview', async (req: AuthenticatedRequest, res) => {
  const absolutePath = String(req.query.path ?? '');
  if (!absolutePath) {
    res.status(400).json({ error: 'path is required' });
    return;
  }

  try {
    const ok = await sendAdminPreview(res, absolutePath);
    if (!ok && !res.headersSent) {
      res.status(404).json({ error: 'Preview unavailable' });
    }
  } catch (error) {
    console.error('[admin] Preview failed:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Preview failed' });
    }
  }
});

export default router;
