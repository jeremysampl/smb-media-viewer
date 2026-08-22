import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import { authMiddleware, type AuthenticatedRequest } from '../auth/middleware.js';
import { streamFileWithRange } from '../cache/cache.js';
import { getResizedImage } from '../media/image.js';
import { isQualityTier } from '../media/quality.js';
import { getOfficePdf } from '../media/office.js';
import { getVideoPoster } from '../media/poster.js';
import { verifyMediaToken } from '../media/tokens.js';
import { getTranscodedVideo } from '../media/video.js';
import { getMediaMetadata } from '../media/metadata.js';
import { resolveShareForPath } from '../permissions/resolver.js';
import {
  getViewerContentType,
  getViewerKind,
  isMediaFile,
  isOfficeFile,
  isPdfFile,
  isSpreadsheetFile,
  isTextFile,
} from '../media/fileTypes.js';

const router = Router();

/** Soft caps for in-browser previews (bytes). */
const TEXT_VIEW_MAX_BYTES = 5 * 1024 * 1024;
const PDF_VIEW_MAX_BYTES = 80 * 1024 * 1024;
const SPREADSHEET_VIEW_MAX_BYTES = 25 * 1024 * 1024;
const OFFICE_VIEW_MAX_BYTES = 50 * 1024 * 1024;

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

/**
 * Convert an Office file to PDF (cached) for preview.
 */
router.get('/:token/pdf-preview', async (req: AuthenticatedRequest, res) => {
  const sourcePath = await authorizeMedia(req, getTokenParam(req.params.token));
  if (!sourcePath) {
    res.status(404).json({ error: 'File not found' });
    return;
  }

  const basename = path.basename(sourcePath);
  if (!isOfficeFile(basename)) {
    res.status(400).json({ error: 'Not an Office document' });
    return;
  }

  try {
    const stats = await fsp.stat(sourcePath);
    if (!stats.isFile()) {
      res.status(404).json({ error: 'File not found' });
      return;
    }
    if (stats.size > OFFICE_VIEW_MAX_BYTES) {
      res.status(413).json({
        error: `File is too large to preview (max ${Math.round(OFFICE_VIEW_MAX_BYTES / (1024 * 1024))} MB)`,
      });
      return;
    }

    const result = await getOfficePdf(sourcePath);
    const outStats = await fsp.stat(result.filePath);
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Length', String(outStats.size));
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${basename.replace(/\.[^.]+$/, '.pdf').replace(/"/g, '')}"`,
    );
    fs.createReadStream(result.filePath).pipe(res);
  } catch (error) {
    console.error('Office PDF preview failed:', error);
    const message = error instanceof Error ? error.message : 'Failed to convert document';
    res.status(500).json({ error: message });
  }
});

/**
 * Stream a viewable non-media file (text, PDF, spreadsheet, …).
 * Some kinds are size-capped so huge files don't blow up the browser.
 */
router.get('/:token/raw', async (req: AuthenticatedRequest, res) => {
  const sourcePath = await authorizeMedia(req, getTokenParam(req.params.token));
  if (!sourcePath) {
    res.status(404).json({ error: 'File not found' });
    return;
  }

  const basename = path.basename(sourcePath);
  const viewer = getViewerKind(basename);
  if (!viewer) {
    res.status(400).json({ error: 'This file type cannot be previewed' });
    return;
  }

  if (viewer === 'office') {
    res.status(400).json({ error: 'Use pdf-preview for Office documents' });
    return;
  }

  try {
    const stats = await fsp.stat(sourcePath);
    if (!stats.isFile()) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    if (viewer === 'text') {
      if (!isTextFile(sourcePath)) {
        res.status(400).json({ error: 'Not a text file' });
        return;
      }
      if (stats.size > TEXT_VIEW_MAX_BYTES) {
        res.status(413).json({
          error: `File is too large to preview (max ${Math.round(TEXT_VIEW_MAX_BYTES / (1024 * 1024))} MB)`,
        });
        return;
      }
    } else if (viewer === 'pdf') {
      if (!isPdfFile(sourcePath)) {
        res.status(400).json({ error: 'Not a PDF file' });
        return;
      }
      if (stats.size > PDF_VIEW_MAX_BYTES) {
        res.status(413).json({
          error: `PDF is too large to preview (max ${Math.round(PDF_VIEW_MAX_BYTES / (1024 * 1024))} MB)`,
        });
        return;
      }
    } else if (viewer === 'spreadsheet') {
      if (!isSpreadsheetFile(sourcePath)) {
        res.status(400).json({ error: 'Not a spreadsheet file' });
        return;
      }
      if (stats.size > SPREADSHEET_VIEW_MAX_BYTES) {
        res.status(413).json({
          error: `Spreadsheet is too large to preview (max ${Math.round(SPREADSHEET_VIEW_MAX_BYTES / (1024 * 1024))} MB)`,
        });
        return;
      }
    }

    res.setHeader('Content-Type', getViewerContentType(basename));
    res.setHeader('Content-Length', String(stats.size));
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('Content-Disposition', `inline; filename="${basename.replace(/"/g, '')}"`);
    fs.createReadStream(sourcePath).pipe(res);
  } catch (error) {
    console.error('Raw file serve failed:', error);
    res.status(500).json({ error: 'Failed to read file' });
  }
});

export default router;
