import fs from 'node:fs';
import { Router } from 'express';
import { authMiddleware, type AuthenticatedRequest } from '../auth/middleware.js';
import { streamFileWithRange } from '../cache/cache.js';
import { getResizedImage } from '../media/image.js';
import { isQualityTier } from '../media/quality.js';
import { getVideoPoster } from '../media/poster.js';
import { verifyMediaToken } from '../media/tokens.js';
import { getTranscodedVideo } from '../media/video.js';
import { getMediaMetadata } from '../media/metadata.js';
import { resolveShareForPath } from '../permissions/resolver.js';
import { isMediaFile } from '../media/fileTypes.js';

const router = Router();

function getTokenParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

router.use(authMiddleware);

async function authorizeMedia(
  req: AuthenticatedRequest,
  token: string,
): Promise<string | null> {
  const payload = verifyMediaToken(token);
  if (!payload) return null;
  if (payload.username !== req.user!.username) return null;

  const share = await resolveShareForPath(req.user!.username, payload.path);
  if (!share) return null;

  return payload.path;
}

router.get('/:token/image', async (req: AuthenticatedRequest, res) => {
  const sourcePath = await authorizeMedia(req, getTokenParam(req.params.token));
  if (!sourcePath) {
    res.status(404).json({ error: 'Media not found' });
    return;
  }

  const qualityParam = String(req.query.quality ?? 'medium');
  const quality = isQualityTier(qualityParam) ? qualityParam : 'medium';

  try {
    const result = await getResizedImage(sourcePath, quality);
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    fs.createReadStream(result.filePath).pipe(res);
  } catch (error) {
    console.error('Image processing failed:', error);
    res.status(500).json({ error: 'Failed to process image' });
  }
});

router.get('/:token/video', async (req: AuthenticatedRequest, res) => {
  const sourcePath = await authorizeMedia(req, getTokenParam(req.params.token));
  if (!sourcePath) {
    res.status(404).json({ error: 'Media not found' });
    return;
  }

  const qualityParam = String(req.query.quality ?? 'medium');
  const quality = isQualityTier(qualityParam) ? qualityParam : 'medium';

  try {
    const result = await getTranscodedVideo(sourcePath, quality);
    const rangeHeader = req.headers.range;
    const ranged = streamFileWithRange(result.filePath, rangeHeader);
    res.status(ranged.status);
    for (const [key, value] of Object.entries(ranged.headers)) {
      res.setHeader(key, value);
    }
    ranged.stream.pipe(res);
  } catch (error) {
    console.error('Video processing failed:', error);
    res.status(500).json({ error: 'Failed to process video' });
  }
});

router.get('/:token/poster', async (req: AuthenticatedRequest, res) => {
  const sourcePath = await authorizeMedia(req, getTokenParam(req.params.token));
  if (!sourcePath) {
    res.status(404).json({ error: 'Media not found' });
    return;
  }

  try {
    const result = await getVideoPoster(sourcePath);
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    fs.createReadStream(result.filePath).pipe(res);
  } catch (error) {
    console.error('Poster generation failed:', error);
    res.status(500).json({ error: 'Failed to generate poster' });
  }
});

router.get('/:token/metadata', async (req: AuthenticatedRequest, res) => {
  const sourcePath = await authorizeMedia(req, getTokenParam(req.params.token));
  if (!sourcePath) {
    res.status(404).json({ error: 'Media not found' });
    return;
  }

  if (!isMediaFile(sourcePath)) {
    res.status(400).json({ error: 'Metadata is only available for images and videos' });
    return;
  }

  try {
    const metadata = await getMediaMetadata(sourcePath);
    res.json(metadata);
  } catch (error) {
    console.error('Metadata extraction failed:', error);
    res.status(500).json({ error: 'Failed to read image metadata' });
  }
});

export default router;
