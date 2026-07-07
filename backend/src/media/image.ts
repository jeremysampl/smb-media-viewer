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

export async function getResizedImage(
  sourcePath: string,
  quality: QualityTier,
): Promise<{ filePath: string; contentType: string }> {
  const stats = await fs.stat(sourcePath);
  const key = buildCacheKey(sourcePath, stats.mtimeMs, quality, 'image');
  const cachePath = getCachePath('images', key, '.webp');
  const cached = await readCacheEntry(cachePath);
  if (cached) {
    return { filePath: cached.filePath, contentType: 'image/webp' };
  }

  const profile = getQualityProfile(quality);
  let pipeline = sharp(sourcePath).rotate();

  if (profile.imageMaxDimension) {
    pipeline = pipeline.resize({
      width: profile.imageMaxDimension,
      height: profile.imageMaxDimension,
      fit: 'inside',
      withoutEnlargement: true,
    });
  }

  const buffer = await pipeline.webp({ quality: 82 }).toBuffer();
  await writeAtomic(cachePath, buffer);
  return { filePath: cachePath, contentType: 'image/webp' };
}

export async function getThumbnailImage(
  sourcePath: string,
): Promise<{ filePath: string; contentType: string }> {
  return getResizedImage(sourcePath, 'very_low');
}
