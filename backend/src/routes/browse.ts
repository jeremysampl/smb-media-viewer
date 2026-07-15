import fs from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import {
  listShareRoots,
  normalizeBrowsePath,
  resolveAbsolutePath,
} from '../permissions/resolver.js';
import { authMiddleware, type AuthenticatedRequest } from '../auth/middleware.js';
import { createMediaToken } from '../media/tokens.js';
import { getFormatLabel, isImageFile, isMediaFile, isVideoFile } from '../media/fileTypes.js';
import { getMediaIndexRows } from '../index/db.js';
import { enqueueIndexJobs, type IndexJob } from '../index/indexer.js';
import { mapWithConcurrency } from '../util/concurrency.js';
import type { BrowseEntry } from '../types.js';

const STAT_CONCURRENCY = 16;

const router = Router();

router.use(authMiddleware);

router.get('/shares', async (req: AuthenticatedRequest, res) => {
  const entries = await listShareRoots(req.user!.username);
  res.json({ entries });
});

router.get('/browse', async (req: AuthenticatedRequest, res) => {
  const browsePath = normalizeBrowsePath(String(req.query.path ?? ''));
  const username = req.user!.username;

  if (!browsePath) {
    const entries = await listShareRoots(username);
    res.json({ path: '', entries });
    return;
  }

  const resolved = await resolveAbsolutePath(username, browsePath);
  if (!resolved) {
    res.status(404).json({ error: 'Path not found' });
    return;
  }

  let dirEntries;
  try {
    dirEntries = await fs.readdir(resolved.absolutePath, { withFileTypes: true });
  } catch {
    res.status(404).json({ error: 'Path not found' });
    return;
  }

  const entries: BrowseEntry[] = [];
  const mediaCandidates: Array<{
    name: string;
    entryBrowsePath: string;
    absoluteEntryPath: string;
  }> = [];

  for (const entry of dirEntries) {
    if (entry.name.startsWith('.')) continue;

    const absoluteEntryPath = path.join(resolved.absolutePath, entry.name);
    const entryBrowsePath = browsePath
      ? `${browsePath}/${entry.name}`
      : entry.name;

    if (entry.isDirectory()) {
      entries.push({
        name: entry.name,
        path: entryBrowsePath,
        type: 'folder',
      });
      continue;
    }

    if (!entry.isFile() || !isMediaFile(entry.name)) continue;

    mediaCandidates.push({
      name: entry.name,
      entryBrowsePath,
      absoluteEntryPath,
    });
  }

  const stated = await mapWithConcurrency(
    mediaCandidates,
    STAT_CONCURRENCY,
    async (job) => {
      const stats = await fs.stat(job.absoluteEntryPath).catch(() => null);
      if (!stats) return null;
      return { ...job, stats };
    },
  );

  const mediaFiles = stated.filter(
    (item): item is NonNullable<typeof item> => item !== null,
  );

  const indexRows = getMediaIndexRows(mediaFiles.map((item) => item.absoluteEntryPath));
  const staleJobs: IndexJob[] = [];

  for (const file of mediaFiles) {
    const isVideo = isVideoFile(file.name);
    const isImage = isImageFile(file.name);
    const token = createMediaToken(file.absoluteEntryPath, username);
    const mtimeMs = file.stats.mtimeMs;
    const indexed = indexRows.get(file.absoluteEntryPath);
    const fresh = indexed && indexed.mtimeMs === mtimeMs;

    if (!fresh) {
      staleJobs.push({
        absolutePath: file.absoluteEntryPath,
        mtimeMs,
        size: file.stats.size,
        kind: isVideo ? 'video' : 'image',
      });
    } else if (
      !indexed.thumbKey ||
      (isVideo && !indexed.captureTime) ||
      (isImage && !indexed.captureTime)
    ) {
      staleJobs.push({
        absolutePath: file.absoluteEntryPath,
        mtimeMs,
        size: file.stats.size,
        kind: isVideo ? 'video' : 'image',
      });
    }

    entries.push({
      name: file.name,
      path: file.entryBrowsePath,
      type: isVideo ? 'video' : 'image',
      size: file.stats.size,
      mtime: file.stats.mtime.toISOString(),
      captureTime: fresh ? indexed.captureTime ?? undefined : undefined,
      format: getFormatLabel(file.name),
      duration: fresh ? indexed.duration ?? undefined : undefined,
      token,
      thumbnailUrl: isImage
        ? `/api/media/${token}/image?quality=very_low`
        : `/api/media/${token}/poster`,
    });
  }

  entries.sort((a, b) => {
    if (a.type === 'folder' && b.type !== 'folder') return -1;
    if (a.type !== 'folder' && b.type === 'folder') return 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });

  res.json({
    path: browsePath,
    share: resolved.share.name,
    entries,
  });

  if (staleJobs.length > 0) {
    enqueueIndexJobs(staleJobs);
  }
});

export default router;
