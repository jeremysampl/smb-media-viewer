import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { writeAtomic } from '../cache/cache.js';
import { config } from '../config.js';
import { getImageCaptureTime } from '../media/captureTime.js';
import { getQualityProfile } from '../media/quality.js';
import { getVideoBrowseInfo } from '../media/videoMetadata.js';
import { recordFinishedJob } from '../jobs/tracker.js';
import { createSemaphore } from '../util/concurrency.js';
import { getIndexDb, getMediaIndexRow, getThumbPath, upsertMediaIndexRow } from './db.js';

export interface IndexJob {
  absolutePath: string;
  mtimeMs: number;
  size: number;
  kind: 'image' | 'video';
}

/** Bump when capture-time parsing changes so existing rows are refreshed. */
export const CAPTURE_META_VERSION = 2;

/** Shared limit for background indexing and on-demand thumbs. */
const indexWork = createSemaphore(config.indexConcurrency);

type QueuedIndexJob = IndexJob & { priority: 'high' | 'low' };

const queue: QueuedIndexJob[] = [];
const queuedPaths = new Set<string>();
const inFlight = new Map<string, Promise<{ filePath: string; contentType: string } | null>>();
const activeJobs = new Map<string, QueuedIndexJob>();
let activeWorkers = 0;
let completedCount = 0;
let failedCount = 0;

function thumbKeyFor(sourcePath: string, mtimeMs: number, kind: string): string {
  // color-v6: HDR via libplacebo (or CPU tonemap+vibrance); SDR limited→full + light eq
  return crypto
    .createHash('sha1')
    .update(`index|${sourcePath}|${mtimeMs}|${kind}|color-v6`)
    .digest('hex');
}

const HDR_TRANSFERS = new Set([
  'smpte2084',
  'arib-std-b67',
  'smpte428',
]);

type PosterPipeline = 'libplacebo' | 'cpu-hdr' | 'sdr';

function probeVideoTransfer(sourcePath: string): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn(
      'ffprobe',
      [
        '-v',
        'quiet',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=color_transfer',
        '-of',
        'default=nw=1:nk=1',
        sourcePath,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );

    let stdout = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.on('error', () => resolve(null));
    child.on('close', () => {
      const transfer = stdout.trim().toLowerCase();
      resolve(transfer || null);
    });
  });
}

function posterVf(
  maxDim: number,
  pipeline: PosterPipeline,
  transfer: string | null,
): string {
  const scale = `scale=w=${maxDim}:h=${maxDim}:force_original_aspect_ratio=decrease:flags=lanczos`;

  if (pipeline === 'libplacebo') {
    // Best perceptual HDR→SDR (needs Vulkan). Spline + mild vibrance recovers
    // contrast/chroma without the flat milky look of basic tonemap.
    const placebo = [
      `libplacebo=w=${maxDim}:h=${maxDim}:force_original_aspect_ratio=decrease`,
      'colorspace=bt709',
      'color_primaries=bt709',
      'color_trc=bt709',
      'range=pc',
      'tonemapping=spline',
      'gamut_mode=perceptual',
      'contrast_recovery=0.6',
      'format=gbrp',
    ].join(':');
    return [placebo, 'vibrance=intensity=0.45', 'eq=contrast=1.1', 'format=rgb24'].join(
      ',',
    );
  }

  if (pipeline === 'cpu-hdr') {
    const tin = transfer === 'arib-std-b67' ? 'arib-std-b67' : 'smpte2084';
    return [
      `zscale=tin=${tin}:min=bt2020nc:pin=bt2020:t=linear:npl=100`,
      'format=gbrpf32le',
      'zscale=p=bt709:t=bt709:m=bt709:r=pc',
      'tonemap=mobius:desat=0',
      'eq=contrast=1.28:gamma=0.9',
      'vibrance=intensity=0.35',
      'format=rgb24',
      scale,
    ].join(',');
  }

  // SDR: expand limited-range YUV so stills aren't gray/washed-out.
  return [
    `${scale}:in_range=auto:out_range=pc`,
    'eq=saturation=1.18:contrast=1.05',
    'format=rgb24',
  ].join(',');
}

function extractPosterFrame(
  sourcePath: string,
  seekSeconds: string,
  maxDim: number,
  pipeline: PosterPipeline,
  transfer: string | null,
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
        posterVf(maxDim, pipeline, transfer),
        '-f',
        'image2pipe',
        '-vcodec',
        'png',
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
  const transfer = await probeVideoTransfer(sourcePath);
  const hdr = transfer !== null && HDR_TRANSFERS.has(transfer);

  // Try libplacebo for HDR, then CPU tonemap, then SDR.
  const pipelines: PosterPipeline[] = hdr
    ? ['libplacebo', 'cpu-hdr', 'sdr']
    : ['sdr'];

  let lastError: unknown;
  for (const pipeline of pipelines) {
    for (const seek of ['1', '0']) {
      try {
        const frame = await extractPosterFrame(
          sourcePath,
          seek,
          maxDim,
          pipeline,
          transfer,
        );
        const buffer = await sharp(frame, { failOn: 'none' })
          .rotate()
          .webp({ quality: 78 })
          .toBuffer();
        await writeAtomic(thumbPath, buffer);
        return;
      } catch (error) {
        lastError = error;
      }
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

  const work = indexWork.run(async () => {
    let captureTime: string | null = null;
    let duration: number | null = null;
    let thumbReady = false;

    try {
      await fs.access(thumbPath);
      thumbReady = true;
    } catch {
      // generate below
    }

    // Always refresh capture/duration when indexing (parsing can improve over time).
    if (job.kind === 'image') {
      captureTime = (await getImageCaptureTime(job.absolutePath)) ?? null;
    } else {
      const info = await getVideoBrowseInfo(job.absolutePath);
      captureTime = info.captureTime ?? null;
      duration = info.duration ?? null;
    }

    if (!thumbReady) {
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

    if (thumbReady || captureTime || duration != null) {
      upsertMediaIndexRow({
        absolutePath: job.absolutePath,
        mtimeMs: job.mtimeMs,
        size: job.size,
        kind: job.kind,
        thumbKey: thumbReady ? thumbKey : null,
        captureTime,
        duration,
        captureMetaVersion: CAPTURE_META_VERSION,
      });
    }

    if (!thumbReady) return null;
    return { filePath: thumbPath, contentType: 'image/webp' };
  });

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

function takeNextJob(): QueuedIndexJob | undefined {
  const highIndex = queue.findIndex((job) => job.priority === 'high');
  if (highIndex >= 0) {
    return queue.splice(highIndex, 1)[0];
  }
  return queue.shift();
}

function pumpQueue(): void {
  while (activeWorkers < config.indexConcurrency && queue.length > 0) {
    const job = takeNextJob();
    if (!job) return;
    activeWorkers += 1;
    activeJobs.set(job.absolutePath, job);
    const startedAt = Date.now();

    void indexOne(job, { requireThumb: job.priority === 'high' })
      .then(() => {
        completedCount += 1;
        recordFinishedJob({
          kind: job.kind === 'image' ? 'image_index' : 'video_index',
          path: job.absolutePath,
          size: job.size,
          priority: job.priority,
          startedAt,
          outcome: 'completed',
        });
      })
      .catch((error) => {
        failedCount += 1;
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[index] Failed for ${job.absolutePath}:`, error);
        recordFinishedJob({
          kind: job.kind === 'image' ? 'image_index' : 'video_index',
          path: job.absolutePath,
          size: job.size,
          priority: job.priority,
          startedAt,
          outcome: 'failed',
          error: message,
        });
      })
      .finally(() => {
        activeJobs.delete(job.absolutePath);
        queuedPaths.delete(job.absolutePath);
        activeWorkers -= 1;
        pumpQueue();
      });
  }
}

export interface IndexQueueJobView {
  path: string;
  label: string;
  size: number;
  kind: 'image' | 'video';
  priority: 'high' | 'low';
  status: 'queued' | 'active';
}

export interface IndexQueueStatus {
  concurrency: number;
  activeWorkers: number;
  queued: number;
  semaphoreActive: number;
  semaphorePending: number;
  completed: number;
  failed: number;
  /** Rough progress for the current backlog this session. */
  progress: number | null;
  jobs: IndexQueueJobView[];
}

export function getIndexQueueStatus(): IndexQueueStatus {
  const active: IndexQueueJobView[] = [...activeJobs.values()].map((job) => ({
    path: job.absolutePath,
    label: path.basename(job.absolutePath),
    size: job.size,
    kind: job.kind,
    priority: job.priority,
    status: 'active' as const,
  }));
  const queued: IndexQueueJobView[] = queue.map((job) => ({
    path: job.absolutePath,
    label: path.basename(job.absolutePath),
    size: job.size,
    kind: job.kind,
    priority: job.priority,
    status: 'queued' as const,
  }));

  const remaining = active.length + queued.length;
  const total = completedCount + remaining;
  const progress =
    remaining > 0 && total > 0
      ? Math.round((completedCount / total) * 1000) / 1000
      : remaining === 0 && completedCount > 0
        ? 1
        : null;

  return {
    concurrency: config.indexConcurrency,
    activeWorkers,
    queued: queue.length,
    semaphoreActive: indexWork.active,
    semaphorePending: indexWork.pending,
    completed: completedCount,
    failed: failedCount,
    progress,
    // Keep the admin payload small.
    jobs: [...active, ...queued].slice(0, 80),
  };
}

export function enqueueIndexJobs(jobs: IndexJob[]): void {
  for (const job of jobs) {
    if (queuedPaths.has(job.absolutePath)) continue;
    queuedPaths.add(job.absolutePath);
    queue.push({ ...job, priority: 'low' });
  }
  pumpQueue();
}

/** Make sure a grid thumb/poster exists (media routes). */
export async function ensureIndexAsset(
  absolutePath: string,
  mtimeMs: number,
  size: number,
  kind: 'image' | 'video',
): Promise<{ filePath: string; contentType: string }> {
  const existing = getMediaIndexRow(absolutePath);
  if (existing?.mtimeMs === mtimeMs && existing.thumbKey) {
    const existingThumb = getThumbPath(existing.thumbKey);
    try {
      await fs.access(existingThumb);
      return { filePath: existingThumb, contentType: 'image/webp' };
    } catch {
      // regenerate below
    }
  }

  const result = await indexOne(
    { absolutePath, mtimeMs, size, kind },
    { requireThumb: true },
  );
  return result!;
}
