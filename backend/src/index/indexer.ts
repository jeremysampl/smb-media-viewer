import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { writeAtomic } from '../cache/cache.js';
import { getImageCaptureTime } from '../media/captureTime.js';
import { getQualityProfile } from '../media/quality.js';
import { getVideoBrowseInfo } from '../media/videoMetadata.js';
import { getIndexDb, getThumbPath, upsertMediaIndexRow } from './db.js';

export interface IndexJob {
  absolutePath: string;
  mtimeMs: number;
  size: number;
  kind: 'image' | 'video';
}

const INDEX_CONCURRENCY = 2;
const queue: IndexJob[] = [];
const queuedPaths = new Set<string>();
const inFlight = new Map<string, Promise<{ filePath: string; contentType: string } | null>>();
let activeWorkers = 0;

function thumbKeyFor(sourcePath: string, mtimeMs: number, kind: string): string {
  return crypto
    .createHash('sha1')
    .update(`index|${sourcePath}|${mtimeMs}|${kind}`)
    .digest('hex');
}

function extractPosterJpeg(
  sourcePath: string,
  seekSeconds: string,
  maxDim: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-ss',
        seekSeconds,
        '-i',
        sourcePath,
        '-frames:v',
        '1',
        '-vf',
        `scale=w=${maxDim}:h=${maxDim}:force_original_aspect_ratio=decrease`,
        '-f',
        'image2pipe',
        '-vcodec',
        'mjpeg',
        'pipe:1',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );

    const chunks: Buffer[] = [];
    let stderr = '';

    child.stdout?.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      const buffer = Buffer.concat(chunks);
      if (code !== 0) {
        reject(new Error(stderr.trim() || `ffmpeg exited with code ${code}`));
        return;
      }
      if (buffer.length === 0) {
        reject(new Error(stderr.trim() || 'ffmpeg produced an empty poster frame'));
        return;
      }
      resolve(buffer);
    });
  });
}

async function generateImageThumb(
  sourcePath: string,
  thumbPath: string,
): Promise<void> {
  const maxDim = getQualityProfile('very_low').imageMaxDimension ?? 320;
  const buffer = await sharp(sourcePath, {
    failOn: 'none',
    sequentialRead: true,
  })
    .rotate()
    .resize({
      width: maxDim,
      height: maxDim,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 70 })
    .toBuffer();
  await writeAtomic(thumbPath, buffer);
}

async function generateVideoPoster(
  sourcePath: string,
  thumbPath: string,
): Promise<void> {
  const maxDim = getQualityProfile('very_low').imageMaxDimension ?? 320;
  await fs.mkdir(path.dirname(thumbPath), { recursive: true });

  let lastError: unknown;
  // Prefer ~1s in; fall back to the first frame for short / hard-to-seek clips.
  for (const seek of ['1', '0']) {
    try {
      const jpeg = await extractPosterJpeg(sourcePath, seek, maxDim);
      const buffer = await sharp(jpeg, { failOn: 'none' })
        .rotate()
        .webp({ quality: 70 })
        .toBuffer();
      await writeAtomic(thumbPath, buffer);
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Failed to extract video poster');
}

async function indexOne(
  job: IndexJob,
  options: { requireThumb: boolean },
): Promise<{
  filePath: string;
  contentType: string;
} | null> {
  getIndexDb();

  const thumbKey = thumbKeyFor(job.absolutePath, job.mtimeMs, job.kind);
  const thumbPath = getThumbPath(thumbKey);
  const flightKey = `${job.kind}:${thumbKey}`;

  const existing = inFlight.get(flightKey);
  if (existing) {
    const shared = await existing;
    if (shared) return shared;
    if (options.requireThumb) {
      throw new Error(`Failed to generate index thumb for ${job.absolutePath}`);
    }
    return null;
  }

  const work = (async () => {
    let captureTime: string | null = null;
    let duration: number | null = null;
    let thumbReady = false;

    if (job.kind === 'image') {
      captureTime = (await getImageCaptureTime(job.absolutePath)) ?? null;
    } else {
      const info = await getVideoBrowseInfo(job.absolutePath);
      captureTime = info.captureTime ?? null;
      duration = info.duration ?? null;
    }

    try {
      await fs.access(thumbPath);
      thumbReady = true;
    } catch {
      try {
        if (job.kind === 'image') {
          await generateImageThumb(job.absolutePath, thumbPath);
        } else {
          await generateVideoPoster(job.absolutePath, thumbPath);
        }
        thumbReady = true;
      } catch (error) {
        console.error(`[index] Thumb failed for ${job.absolutePath}:`, error);
      }
    }

    upsertMediaIndexRow({
      absolutePath: job.absolutePath,
      mtimeMs: job.mtimeMs,
      size: job.size,
      kind: job.kind,
      thumbKey: thumbReady ? thumbKey : null,
      captureTime,
      duration,
    });

    if (!thumbReady) return null;
    return { filePath: thumbPath, contentType: 'image/webp' };
  })();

  inFlight.set(flightKey, work);
  try {
    const result = await work;
    if (!result && options.requireThumb) {
      throw new Error(`Failed to generate index thumb for ${job.absolutePath}`);
    }
    return result;
  } finally {
    inFlight.delete(flightKey);
  }
}

function pumpQueue(): void {
  while (activeWorkers < INDEX_CONCURRENCY && queue.length > 0) {
    const job = queue.shift()!;
    activeWorkers += 1;

    void indexOne(job, { requireThumb: false })
      .catch((error) => {
        console.error(`[index] Failed for ${job.absolutePath}:`, error);
      })
      .finally(() => {
        queuedPaths.delete(job.absolutePath);
        activeWorkers -= 1;
        pumpQueue();
      });
  }
}

export function enqueueIndexJobs(jobs: IndexJob[]): void {
  for (const job of jobs) {
    if (queuedPaths.has(job.absolutePath)) continue;
    queuedPaths.add(job.absolutePath);
    queue.push(job);
  }
  pumpQueue();
}

/** Ensure a grid thumb/poster exists (on-demand path for media routes). */
export async function ensureIndexAsset(
  absolutePath: string,
  mtimeMs: number,
  size: number,
  kind: 'image' | 'video',
): Promise<{ filePath: string; contentType: string }> {
  const result = await indexOne(
    { absolutePath, mtimeMs, size, kind },
    { requireThumb: true },
  );
  return result!;
}
