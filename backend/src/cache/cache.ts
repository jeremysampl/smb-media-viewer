import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';

export function buildCacheKey(
  sourcePath: string,
  mtimeMs: number,
  quality: string,
  kind: string,
): string {
  return crypto
    .createHash('sha1')
    .update(`${sourcePath}|${mtimeMs}|${quality}|${kind}`)
    .digest('hex');
}

export function getCachePath(subdir: string, key: string, ext: string): string {
  return path.join(config.cacheDir, subdir, key.slice(0, 2), `${key}${ext}`);
}

export async function ensureParentDir(filePath: string): Promise<void> {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
}

export async function writeAtomic(filePath: string, data: Buffer): Promise<void> {
  await ensureParentDir(filePath);
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fsp.writeFile(tempPath, data);
  await fsp.rename(tempPath, filePath);
}

export async function readCacheEntry(
  filePath: string,
): Promise<{ filePath: string } | null> {
  try {
    await fsp.access(filePath, fs.constants.R_OK);
    return { filePath };
  } catch {
    return null;
  }
}

function parseRangeHeader(
  rangeHeader: string | undefined,
  size: number,
): { start: number; end: number } | null {
  if (!rangeHeader) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match) return null;

  const startText = match[1];
  const endText = match[2];
  if (!startText && !endText) return null;

  let start: number;
  let end: number;

  if (!startText) {
    const suffix = Number(endText);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(startText);
    end = endText ? Number(endText) : size - 1;
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start) {
    return null;
  }

  end = Math.min(end, size - 1);
  if (start >= size) return null;
  return { start, end };
}

export function streamFileWithRange(
  filePath: string,
  rangeHeader: string | undefined,
  contentType = 'video/mp4',
): {
  status: number;
  headers: Record<string, string | number>;
  stream: fs.ReadStream;
} {
  const stats = fs.statSync(filePath);
  const size = stats.size;
  const range = parseRangeHeader(rangeHeader, size);

  if (!range) {
    return {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': size,
        'Accept-Ranges': 'bytes',
      },
      stream: fs.createReadStream(filePath),
    };
  }

  const { start, end } = range;
  const chunkSize = end - start + 1;
  return {
    status: 206,
    headers: {
      'Content-Type': contentType,
      'Content-Length': chunkSize,
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Accept-Ranges': 'bytes',
    },
    stream: fs.createReadStream(filePath, { start, end }),
  };
}
