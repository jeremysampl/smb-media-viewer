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
import { isImageFile, isMediaFile, isVideoFile } from '../media/fileTypes.js';
import type { BrowseEntry } from '../types.js';

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

    const stats = await fs.stat(absoluteEntryPath).catch(() => null);
    if (!stats) continue;

    const token = createMediaToken(absoluteEntryPath, username);
    const isVideo = isVideoFile(entry.name);
    const isImage = isImageFile(entry.name);

    entries.push({
      name: entry.name,
      path: entryBrowsePath,
      type: isVideo ? 'video' : 'image',
      size: stats.size,
      mtime: stats.mtime.toISOString(),
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
});

export default router;
