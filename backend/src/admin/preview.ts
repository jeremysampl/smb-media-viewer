import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Response } from 'express';
import sharp from 'sharp';
import { config } from '../config.js';
import { getMediaIndexRow, getThumbPath } from '../index/db.js';
import { isImageFile } from '../media/fileTypes.js';

function isUnderRoot(absolutePath: string, root: string): boolean {
  const resolved = path.resolve(absolutePath);
  const resolvedRoot = path.resolve(root);
  return (
    resolved === resolvedRoot || resolved.startsWith(`${resolvedRoot}${path.sep}`)
  );
}

/** Reject paths outside mediaRoot / devMediaRoot. */
export function isAllowedAdminMediaPath(absolutePath: string): boolean {
  return (
    isUnderRoot(absolutePath, config.mediaRoot) ||
    isUnderRoot(absolutePath, config.devMediaRoot)
  );
}

async function streamFile(
  res: Response,
  filePath: string,
  contentType: string,
): Promise<void> {
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'private, max-age=60');
  await new Promise<void>((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('close', resolve);
    stream.pipe(res);
  });
}

/** Use the index thumb if we have one, otherwise a quick Sharp resize for images. */
export async function sendAdminPreview(
  res: Response,
  absolutePath: string,
): Promise<boolean> {
  if (!isAllowedAdminMediaPath(absolutePath)) return false;

  try {
    await fsp.access(absolutePath);
  } catch {
    return false;
  }

  const indexed = getMediaIndexRow(absolutePath);
  if (indexed?.thumbKey) {
    const thumbPath = getThumbPath(indexed.thumbKey);
    try {
      await fsp.access(thumbPath);
      await streamFile(res, thumbPath, 'image/webp');
      return true;
    } catch {
      // fall through
    }
  }

  if (isImageFile(absolutePath)) {
    const buffer = await sharp(absolutePath, {
      failOn: 'none',
      sequentialRead: true,
    })
      .rotate()
      .resize({
        width: 480,
        height: 480,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 72 })
      .toBuffer();
    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.send(buffer);
    return true;
  }

  return false;
}
