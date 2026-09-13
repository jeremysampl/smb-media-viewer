import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import { authMiddleware, type AuthenticatedRequest } from '../auth/middleware.js';
import { streamFileWithRange } from '../cache/cache.js';
import { resolveDocumentAssetPath } from '../media/documentAssets.js';
import { getResizedImage } from '../media/image.js';
import { isQualityTier } from '../media/quality.js';
import { getOfficePdf } from '../media/office.js';
import { getVideoPoster } from '../media/poster.js';
import { verifyMediaToken } from '../media/tokens.js';
import { getTranscodedVideo, ensureTranscodedVideo, getVideoTranscodeStatus } from '../media/video.js';
import { getMediaMetadata } from '../media/metadata.js';
import { resolveShareForPath } from '../permissions/resolver.js';
import {
  getBrowserNativeImageContentType,
  getExtension,
  getViewerContentType,
  getViewerKind,
  isImageFile,
  isMediaFile,
  isOfficeFile,
  isPdfFile,
  isSpreadsheetFile,
} from '../media/fileTypes.js';
import { pipeFileStream } from '../util/pipeFileStream.js';

const router = Router();

/** Soft caps for in-browser previews (bytes) */
const TEXT_VIEW_MAX_BYTES = 5 * 1024 * 1024;
const PDF_VIEW_MAX_BYTES = 80 * 1024 * 1024;
const SPREADSHEET_VIEW_MAX_BYTES = 25 * 1024 * 1024;
const OFFICE_VIEW_MAX_BYTES = 50 * 1024 * 1024;
const AUDIO_VIEW_MAX_BYTES = 500 * 1024 * 1024;

const IMAGE_EXTENSION_FALLBACKS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.bmp',
  '.tif',
  '.tiff',
  '.heic',
  '.heif',
  '.avif',
];

async function resolveExistingImagePath(candidate: string): Promise<string | null> {
  const isEmbeddable = (filePath: string) =>
    isImageFile(filePath) || getExtension(filePath) === '.svg';

  try {
    const stats = await fsp.stat(candidate);
    if (stats.isFile() && isEmbeddable(candidate)) return candidate;
  } catch {
    // try extensions
  }

  if (getExtension(candidate)) return null;

  for (const ext of IMAGE_EXTENSION_FALLBACKS) {
    const withExt = `${candidate}${ext}`;
    try {
      const stats = await fsp.stat(withExt);
      if (stats.isFile() && isEmbeddable(withExt)) return withExt;
    } catch {
      // continue
    }
  }
  return null;
}

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

async function authorizeMediaWithShare(
  req: AuthenticatedRequest,
  token: string,
): Promise<{ documentPath: string; sharePath: string } | null> {
  const payload = verifyMediaToken(token);
  if (!payload) return null;
  if (payload.username !== req.user!.username) return null;

  const share = await resolveShareForPath(req.user!.username, payload.path);
  if (!share) return null;

  return { documentPath: payload.path, sharePath: share.path };
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
    pipeFileStream(req, res, fs.createReadStream(result.filePath));
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
    pipeFileStream(req, res, ranged.stream);
  } catch (error) {
    console.error('Video processing failed:', error);
    res.status(500).json({ error: 'Failed to process video' });
  }
});

router.get('/:token/video-status', async (req: AuthenticatedRequest, res) => {
  const sourcePath = await authorizeMedia(req, getTokenParam(req.params.token));
  if (!sourcePath) {
    res.status(404).json({ error: 'Media not found' });
    return;
  }

  const qualityParam = String(req.query.quality ?? 'medium');
  const quality = isQualityTier(qualityParam) ? qualityParam : 'medium';
  const prepare =
    req.query.prepare === '1' ||
    req.query.prepare === 'true' ||
    req.query.prepare === 'yes';

  try {
    let status = await getVideoTranscodeStatus(sourcePath, quality);
    if (status.state === 'missing' && prepare) {
      ensureTranscodedVideo(sourcePath, quality);
      status = await getVideoTranscodeStatus(sourcePath, quality);
      if (status.state === 'missing') {
        status = { state: 'processing', progress: null };
      }
    }
    res.json(status);
  } catch (error) {
    console.error('Video status failed:', error);
    res.status(500).json({ error: 'Failed to read video status' });
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
    pipeFileStream(req, res, fs.createReadStream(result.filePath));
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
 * Serve an image referenced from a document (markdown/latex) preview.
 * Path must stay under the same share as the document token.
 */
router.get('/:token/asset', async (req: AuthenticatedRequest, res) => {
  const auth = await authorizeMediaWithShare(req, getTokenParam(req.params.token));
  if (!auth) {
    res.status(404).json({ error: 'File not found' });
    return;
  }

  const rel = String(req.query.rel ?? '');
  const resolved = resolveDocumentAssetPath(auth.documentPath, rel, auth.sharePath);
  if (!resolved) {
    res.status(403).json({ error: 'Asset path is not allowed' });
    return;
  }

  const assetPath = await resolveExistingImagePath(resolved);
  if (!assetPath) {
    res.status(404).json({ error: 'Asset not found' });
    return;
  }

  // Must stay on the same share as the document.
  const assetShare = await resolveShareForPath(req.user!.username, assetPath);
  if (!assetShare || path.resolve(assetShare.path) !== path.resolve(auth.sharePath)) {
    res.status(403).json({ error: 'Asset is outside the document share' });
    return;
  }

  try {
    const stats = await fsp.stat(assetPath);
    if (!stats.isFile()) {
      res.status(404).json({ error: 'Asset not found' });
      return;
    }

    const nativeType =
      getExtension(assetPath) === '.svg'
        ? 'image/svg+xml'
        : getBrowserNativeImageContentType(assetPath);
    if (nativeType) {
      res.setHeader('Content-Type', nativeType);
      res.setHeader('Content-Length', String(stats.size));
      res.setHeader('Cache-Control', 'private, max-age=300');
      pipeFileStream(req, res, fs.createReadStream(assetPath));
      return;
    }

    // HEIC/TIFF/etc.: convert so the browser can show them.
    const result = await getResizedImage(assetPath, 'high');
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Cache-Control', 'private, max-age=300');
    pipeFileStream(req, res, fs.createReadStream(result.filePath));
  } catch (error) {
    console.error('Document asset serve failed:', error);
    res.status(500).json({ error: 'Failed to load asset' });
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
    pipeFileStream(req, res, fs.createReadStream(result.filePath));
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

    if (viewer === 'text' || viewer === 'markdown' || viewer === 'latex' || viewer === 'code') {
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
    } else if (viewer === 'audio') {
      if (stats.size > AUDIO_VIEW_MAX_BYTES) {
        res.status(413).json({
          error: `Audio file is too large to play (max ${Math.round(AUDIO_VIEW_MAX_BYTES / (1024 * 1024))} MB)`,
        });
        return;
      }

      const contentType = getViewerContentType(basename);
      const ranged = streamFileWithRange(sourcePath, req.headers.range, contentType);
      res.status(ranged.status);
      for (const [key, value] of Object.entries(ranged.headers)) {
        res.setHeader(key, value);
      }
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.setHeader('Content-Disposition', `inline; filename="${basename.replace(/"/g, '')}"`);
      pipeFileStream(req, res, ranged.stream);
      return;
    }

    res.setHeader('Content-Type', getViewerContentType(basename));
    res.setHeader('Content-Length', String(stats.size));
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('Content-Disposition', `inline; filename="${basename.replace(/"/g, '')}"`);
    pipeFileStream(req, res, fs.createReadStream(sourcePath));
  } catch (error) {
    console.error('Raw file serve failed:', error);
    res.status(500).json({ error: 'Failed to read file' });
  }
});

export default router;
