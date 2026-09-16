import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import { authMiddleware, type AuthenticatedRequest } from '../auth/middleware.js';
import {
  createCastSession,
  endCastSession,
  getCastSession,
  touchCastSession,
} from '../cast/sessions.js';
import { config } from '../config.js';
import {
  isLoopbackOrigin,
  listLanIpv4Addresses,
  normalizePublicOrigin,
} from '../util/lanOrigins.js';
import { streamFileWithRange } from '../cache/cache.js';
import { getCastImage } from '../media/image.js';
import { isImageFile, isVideoFile } from '../media/fileTypes.js';
import { getVideoPoster } from '../media/poster.js';
import { isQualityTier } from '../media/quality.js';
import { createCastToken, createMediaToken, verifyCastToken } from '../media/tokens.js';
import { getTranscodedVideo, ensureTranscodedVideo, getVideoTranscodeStatus } from '../media/video.js';
import { assessDirectPlayVideo } from '../media/videoCompatibility.js';
import { resolveAbsolutePath, resolveShareForPath } from '../permissions/resolver.js';
import { pipeFileStream } from '../util/pipeFileStream.js';
import type { QualityTier } from '../types.js';

const router = Router();
const MAX_CAST_ITEMS = 5000;

router.get('/config', (_req, res) => {
  const configured = normalizePublicOrigin(config.castPublicOrigin);
  const frontend = normalizePublicOrigin(config.frontendOrigin);
  const publicOrigin =
    configured
    ?? (frontend && !isLoopbackOrigin(frontend) ? frontend : null);
  const lanAddresses = listLanIpv4Addresses();
  res.json({
    publicOrigin,
    publicOriginFromEnv: Boolean(configured),
    lanAddresses,
    candidates: publicOrigin ? [publicOrigin] : [],
  });
});

router.post('/sessions', authMiddleware, (req: AuthenticatedRequest, res) => {
  const username = req.user!.username;
  const deviceName = typeof req.body?.deviceName === 'string' ? req.body.deviceName : 'Cast device';
  const mediaOrigin = typeof req.body?.mediaOrigin === 'string' ? req.body.mediaOrigin : '';
  const itemCount = Number(req.body?.itemCount ?? 0);
  const currentItem = typeof req.body?.currentItem === 'string' ? req.body.currentItem : null;
  const existingId = typeof req.body?.sessionId === 'string' ? req.body.sessionId : '';
  if (existingId) {
    const existing = touchCastSession(existingId, username, {
      deviceName,
      mediaOrigin,
      itemCount: Number.isFinite(itemCount) ? itemCount : 0,
      currentItem,
    });
    if (existing) {
      res.json({ session: existing });
      return;
    }
  }
  const session = createCastSession({
    username,
    deviceName,
    mediaOrigin,
    itemCount: Number.isFinite(itemCount) ? itemCount : 0,
    currentItem,
  });
  res.status(201).json({ session });
});

router.post('/sessions/:id/heartbeat', authMiddleware, (req: AuthenticatedRequest, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const username = req.user!.username;
  const patch = {
    deviceName: typeof req.body?.deviceName === 'string' ? req.body.deviceName : undefined,
    mediaOrigin: typeof req.body?.mediaOrigin === 'string' ? req.body.mediaOrigin : undefined,
    itemCount: Number.isFinite(Number(req.body?.itemCount)) ? Number(req.body.itemCount) : undefined,
    currentItem: typeof req.body?.currentItem === 'string' || req.body?.currentItem === null
      ? (req.body.currentItem as string | null)
      : undefined,
  };
  const session = touchCastSession(id, username, patch);
  if (!session) {
    res.json({ stop: true });
    return;
  }
  res.json({
    stop: session.stopRequested,
    session,
  });
});

router.delete('/sessions/:id', authMiddleware, (req: AuthenticatedRequest, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const ok = endCastSession(id, req.user!.username);
  if (!ok && getCastSession(id)) {
    res.status(403).json({ error: 'Not allowed to end this cast session' });
    return;
  }
  res.json({ ok: true });
});

interface CastItem {
  path: string;
  name: string;
  kind: 'image' | 'video';
  token: string;
  mediaToken: string;
  contentType: string;
  quality?: string;
  directPlay?: boolean;
  url: string;
  thumbnailUrl: string;
}

async function authorizeCastPath(
  token: string,
): Promise<{ sourcePath: string; username: string } | null> {
  const payload = verifyCastToken(token);
  if (!payload) return null;

  const share = await resolveShareForPath(payload.username, payload.path);
  if (!share) return null;

  const [realSource, realRoot] = await Promise.all([
    fsp.realpath(payload.path).catch(() => null),
    fsp.realpath(share.path).catch(() => null),
  ]);
  if (
    !realSource ||
    !realRoot ||
    (realSource !== realRoot && !realSource.startsWith(`${realRoot}${path.sep}`))
  ) {
    return null;
  }

  return { sourcePath: realSource, username: payload.username };
}

function castQuality(value: unknown, fallback: QualityTier): QualityTier {
  const text = String(value ?? fallback);
  return isQualityTier(text) ? text : fallback;
}

router.get('/:token/image', async (req, res) => {
  const token = Array.isArray(req.params.token) ? req.params.token[0] : req.params.token;
  const auth = await authorizeCastPath(token);
  if (!auth || !isImageFile(auth.sourcePath)) {
    res.status(404).json({ error: 'Image not found' });
    return;
  }

  try {
    const image = await getCastImage(auth.sourcePath, castQuality(req.query.quality, 'high'));
    const stats = await fsp.stat(image.filePath);
    res.setHeader('Content-Type', image.contentType);
    res.setHeader('Content-Length', stats.size);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    pipeFileStream(req, res, fs.createReadStream(image.filePath));
  } catch (error) {
    console.error('Cast image processing failed:', error);
    res.status(500).json({ error: 'Failed to process image' });
  }
});

router.get('/:token/poster', async (req, res) => {
  const token = Array.isArray(req.params.token) ? req.params.token[0] : req.params.token;
  const auth = await authorizeCastPath(token);
  if (!auth || !isVideoFile(auth.sourcePath)) {
    res.status(404).json({ error: 'Poster not found' });
    return;
  }

  try {
    const poster = await getVideoPoster(auth.sourcePath);
    const stats = await fsp.stat(poster.filePath);
    res.setHeader('Content-Type', poster.contentType);
    res.setHeader('Content-Length', stats.size);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    pipeFileStream(req, res, fs.createReadStream(poster.filePath));
  } catch (error) {
    console.error('Cast poster processing failed:', error);
    res.status(500).json({ error: 'Failed to process poster' });
  }
});

router.get('/:token/video-status', async (req, res) => {
  const token = Array.isArray(req.params.token) ? req.params.token[0] : req.params.token;
  const auth = await authorizeCastPath(token);
  if (!auth || !isVideoFile(auth.sourcePath)) {
    res.status(404).json({ error: 'Video not found' });
    return;
  }

  const quality = castQuality(req.query.quality, 'full');
  const prepare =
    req.query.prepare === '1'
    || req.query.prepare === 'true'
    || req.query.prepare === 'yes';

  try {
    let status = await getVideoTranscodeStatus(auth.sourcePath, quality, {
      directPlayTarget: 'cast',
    });
    if (status.state === 'missing' && prepare) {
      ensureTranscodedVideo(auth.sourcePath, quality, { directPlayTarget: 'cast' });
      status = await getVideoTranscodeStatus(auth.sourcePath, quality, {
        directPlayTarget: 'cast',
      });
      if (status.state === 'missing') {
        status = { state: 'processing', progress: null };
      }
    }
    res.json(status);
  } catch (error) {
    console.error('Cast video status failed:', error);
    res.status(500).json({ error: 'Failed to read video status' });
  }
});

router.get('/:token/video', async (req, res) => {
  const token = Array.isArray(req.params.token) ? req.params.token[0] : req.params.token;
  const auth = await authorizeCastPath(token);
  if (!auth || !isVideoFile(auth.sourcePath)) {
    res.status(404).json({ error: 'Video not found' });
    return;
  }

  try {
    const video = await getTranscodedVideo(
      auth.sourcePath,
      castQuality(req.query.quality, 'full'),
      { directPlayTarget: 'cast' },
    );
    const ranged = streamFileWithRange(video.filePath, req.headers.range, video.contentType);
    res.status(ranged.status);
    for (const [key, value] of Object.entries(ranged.headers)) {
      res.setHeader(key, value);
    }
    res.setHeader('Cache-Control', 'private, max-age=3600');
    pipeFileStream(req, res, ranged.stream);
  } catch (error) {
    console.error('Cast video processing failed:', error);
    res.status(500).json({ error: 'Failed to process video' });
  }
});

router.post('/resolve', authMiddleware, async (req: AuthenticatedRequest, res) => {
  const paths = Array.isArray(req.body?.paths)
    ? req.body.paths.filter((value: unknown): value is string => typeof value === 'string')
    : [];
  if (paths.length === 0) {
    res.status(400).json({ error: 'Select at least one photo, video, or folder' });
    return;
  }
  if (paths.length > MAX_CAST_ITEMS) {
    res.status(400).json({ error: `Too many selected paths (max ${MAX_CAST_ITEMS})` });
    return;
  }

  const username = req.user!.username;
  const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId.trim() : '';
  if (sessionId) {
    const session = touchCastSession(sessionId, username);
    if (!session || session.stopRequested) {
      res.status(409).json({ error: 'Cast session is no longer active' });
      return;
    }
  }

  const found = new Map<string, { browsePath: string; absolutePath: string; kind: 'image' | 'video' }>();

  function addMedia(
    absolutePath: string,
    browsePath: string,
    kind: 'image' | 'video',
  ): void {
    found.set(absolutePath, { absolutePath, browsePath, kind });
    if (found.size > MAX_CAST_ITEMS) throw new Error('CAST_LIMIT');
  }

  async function addDirectory(
    absoluteDir: string,
    shareName: string,
    shareRoot: string,
  ): Promise<void> {
    const entries = await fsp.readdir(absoluteDir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const absolutePath = path.join(absoluteDir, entry.name);
      if (entry.isDirectory()) {
        await addDirectory(absolutePath, shareName, shareRoot);
        continue;
      }
      if (!entry.isFile()) continue;
      const kind = isImageFile(entry.name)
        ? 'image'
        : isVideoFile(entry.name)
          ? 'video'
          : null;
      if (!kind) continue;
      const relative = path.relative(shareRoot, absolutePath).split(path.sep).join('/');
      addMedia(absolutePath, `${shareName}/${relative}`, kind);
    }
  }

  try {
    for (const browsePath of paths) {
      const resolved = await resolveAbsolutePath(username, browsePath);
      if (!resolved) continue;
      const stats = await fsp.stat(resolved.absolutePath).catch(() => null);
      if (!stats) continue;
      const [realTarget, realRoot] = await Promise.all([
        fsp.realpath(resolved.absolutePath).catch(() => null),
        fsp.realpath(resolved.share.path).catch(() => null),
      ]);
      if (
        !realTarget ||
        !realRoot ||
        (realTarget !== realRoot && !realTarget.startsWith(`${realRoot}${path.sep}`))
      ) {
        continue;
      }
      if (stats.isDirectory()) {
        await addDirectory(
          resolved.absolutePath,
          resolved.share.name,
          path.resolve(resolved.share.path),
        );
        continue;
      }
      if (!stats.isFile()) continue;
      if (isImageFile(resolved.absolutePath)) {
        addMedia(resolved.absolutePath, browsePath, 'image');
      } else if (isVideoFile(resolved.absolutePath)) {
        addMedia(resolved.absolutePath, browsePath, 'video');
      }
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'CAST_LIMIT') {
      res.status(400).json({
        error: `Selection expands to too many media items (max ${MAX_CAST_ITEMS})`,
      });
      return;
    }
    console.error('Cast selection failed:', error);
    res.status(500).json({ error: 'Failed to prepare Cast selection' });
    return;
  }

  const items: CastItem[] = [];
  for (const { absolutePath, browsePath, kind } of found.values()) {
    const token = createCastToken(absolutePath, username, sessionId || undefined);
    const mediaToken = createMediaToken(absolutePath, username);
    const encoded = encodeURIComponent(token);
    if (kind === 'video') {
      // Stream original when Cast-playable; otherwise remux at Full (cheap) instead of 1080p re-encode.
      const direct = await assessDirectPlayVideo(absolutePath, 'cast');
      const quality: QualityTier = 'full';
      items.push({
        path: browsePath,
        name: path.basename(absolutePath),
        kind,
        token,
        mediaToken,
        contentType: direct.ok ? direct.contentType : 'video/mp4',
        quality,
        directPlay: direct.ok,
        url: `/api/cast/${encoded}/video?quality=${quality}`,
        thumbnailUrl: `/api/cast/${encoded}/poster`,
      });
      continue;
    }
    items.push({
      path: browsePath,
      name: path.basename(absolutePath),
      kind,
      token,
      mediaToken,
      contentType: 'image/jpeg',
      quality: 'high',
      url: `/api/cast/${encoded}/image?quality=high`,
      thumbnailUrl: `/api/cast/${encoded}/image?quality=very_low`,
    });
  }

  res.json({ items });
});

export default router;
