import fs from 'node:fs/promises';
import sharp from 'sharp';
import { getQualityProfile } from './quality.js';
import type { QualityTier } from '../types.js';
import {
  buildCacheKey,
  getCachePath,
  readCacheEntry,
  writeAtomic,
} from '../cache/cache.js';
import { ensureIndexAsset } from '../index/indexer.js';
import { getBrowserNativeImageContentType } from './fileTypes.js';

export async function getResizedImage(
  sourcePath: string,
  quality: QualityTier,
): Promise<{ filePath: string; contentType: string }> {
  const stats = await fs.stat(sourcePath);

  if (quality === 'very_low') {
    const indexed = await ensureIndexAsset(
      sourcePath,
      stats.mtimeMs,
      stats.size,
      'image',
    );
    return { filePath: indexed.filePath, contentType: indexed.contentType };
  }

  // Full: stream the original when browsers can display it (JPEG/PNG/WebP/…).
  // HEIC/TIFF/etc. still convert to WebP so the lightbox doesn't break.
  if (quality === 'full') {
    const nativeType = getBrowserNativeImageContentType(sourcePath);
    if (nativeType) {
      return { filePath: sourcePath, contentType: nativeType };
    }
  }

  const key = buildCacheKey(sourcePath, stats.mtimeMs, quality, 'image');
  const cachePath = getCachePath('images', key, '.webp');
  const cached = await readCacheEntry(cachePath);
  if (cached) {
    return { filePath: cached.filePath, contentType: 'image/webp' };
  }

  const profile = getQualityProfile(quality);
  const resize = profile.imageMaxDimension
    ? {
        width: profile.imageMaxDimension,
        height: profile.imageMaxDimension,
        fit: 'inside' as const,
        withoutEnlargement: true,
      }
    : null;

  try {
    let pipeline = sharp(sourcePath, {
      failOn: 'none',
      sequentialRead: false,
    }).rotate();
    if (resize) pipeline = pipeline.resize(resize);
    const buffer = await pipeline.webp({ quality: 82 }).toBuffer();
    await writeAtomic(cachePath, buffer);
    return { filePath: cachePath, contentType: 'image/webp' };
  } catch {
    let fallback = sharp(sourcePath, {
      failOn: 'none',
      sequentialRead: false,
    });
    if (resize) fallback = fallback.resize(resize);
    const buffer = await fallback.webp({ quality: 82 }).toBuffer();
    await writeAtomic(cachePath, buffer);
    return { filePath: cachePath, contentType: 'image/webp' };
  }
}

export async function getThumbnailImage(
  sourcePath: string,
): Promise<{ filePath: string; contentType: string }> {
  return getResizedImage(sourcePath, 'very_low');
}
