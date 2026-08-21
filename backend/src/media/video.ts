import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { getQualityProfile } from './quality.js';
import type { QualityTier } from '../types.js';
import {
  buildCacheKey,
  ensureParentDir,
  getCachePath,
  readCacheEntry,
} from '../cache/cache.js';
import {
  setTrackedJobOutputSize,
  updateTrackedJobProgress,
  withTrackedJob,
} from '../jobs/tracker.js';
import { registerCacheEntry, recordCacheAccess } from '../cache/meta.js';

function probeDurationSeconds(sourcePath: string): Promise<number | null> {
  return new Promise((resolve) => {
    const child = spawn(
      'ffprobe',
      [
        '-v',
        'quiet',
        '-show_entries',
        'format=duration',
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
      const value = Number.parseFloat(stdout.trim());
      resolve(Number.isFinite(value) && value > 0 ? value : null);
    });
  });
}

function parseFfmpegTimeSeconds(chunk: string): number | null {
  const match = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(chunk);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  if (![hours, minutes, seconds].every(Number.isFinite)) return null;
  return hours * 3600 + minutes * 60 + seconds;
}

function runFfmpeg(
  args: string[],
  onProgress?: (outTimeSeconds: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', ['-y', ...args], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      if (onProgress) {
        const time = parseFfmpegTimeSeconds(text);
        if (time !== null) onProgress(time);
      }
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

export async function getTranscodedVideo(
  sourcePath: string,
  quality: QualityTier,
): Promise<{ filePath: string; contentType: string }> {
  const stats = await fs.stat(sourcePath);
  const key = buildCacheKey(sourcePath, stats.mtimeMs, quality, 'video');
  const cachePath = getCachePath('videos', key, '.mp4');
  const cached = await readCacheEntry(cachePath);
  if (cached) {
    let size = stats.size;
    try {
      size = (await fs.stat(cachePath)).size;
    } catch {
      // keep source size as fallback for meta only
    }
    registerCacheEntry({
      cachePath,
      sourcePath,
      kind: 'video',
      quality,
      size,
    });
    recordCacheAccess(cachePath);
    return { filePath: cached.filePath, contentType: 'video/mp4' };
  }

  return withTrackedJob(
    { kind: 'video_transcode', path: sourcePath, size: stats.size, quality },
    async (jobId) => {
      await ensureParentDir(cachePath);
      const profile = getQualityProfile(quality);
      const duration = await probeDurationSeconds(sourcePath);
      const args = ['-i', sourcePath, '-movflags', '+faststart'];

      if (profile.videoHeight) {
        args.push(
          '-vf',
          `scale=-2:${profile.videoHeight}`,
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          '23',
          '-c:a',
          'aac',
          '-b:a',
          '128k',
        );
      } else {
        args.push('-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k');
      }

      args.push(cachePath);
      await runFfmpeg(args, (outTime) => {
        if (duration && duration > 0) {
          updateTrackedJobProgress(jobId, outTime / duration);
        }
      });

      try {
        const outStats = await fs.stat(cachePath);
        setTrackedJobOutputSize(jobId, outStats.size);
        registerCacheEntry({
          cachePath,
          sourcePath,
          kind: 'video',
          quality,
          size: outStats.size,
        });
        recordCacheAccess(cachePath);
      } catch {
        // ignore missing output size
      }

      return { filePath: cachePath, contentType: 'video/mp4' };
    },
  );
}
