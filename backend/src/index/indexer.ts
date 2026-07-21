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
let activeWorkers = 0;

function thumbKeyFor(sourcePath: string, mtimeMs: number, kind: string): string {
  return crypto
    .createHash('sha1')
    .update(`index|${sourcePath}|${mtimeMs}|${kind}`)
    .digest('hex');
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', ['-y', ...args], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr || `ffmpeg exited with code ${code}`));
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
  // Extension must be .jpg — ffmpeg rejects *.jpg.tmp as an unknown muxer.
  const tempJpg = `${thumbPath}.${process.pid}.tmp.jpg`;
  await fs.mkdir(path.dirname(thumbPath), { recursive: true });

  try {
    await runFfmpeg([
      '-ss',
      '00:00:01',
      '-i',
      sourcePath,
      '-frames:v',
      '1',
      '-q:v',
      '4',
      tempJpg,
    ]);

    const maxDim = getQualityProfile('very_low').imageMaxDimension ?? 320;
    const buffer = await sharp(tempJpg, { failOn: 'none' })
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
  } finally {
    await fs.unlink(tempJpg).catch(() => undefined);
  }
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

  if (!thumbReady) {
    if (options.requireThumb) {
      throw new Error(`Failed to generate index thumb for ${job.absolutePath}`);
    }
    return null;
  }

  return { filePath: thumbPath, contentType: 'image/webp' };
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
