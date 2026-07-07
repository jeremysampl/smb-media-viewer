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

export async function getTranscodedVideo(
  sourcePath: string,
  quality: QualityTier,
): Promise<{ filePath: string; contentType: string }> {
  const stats = await fs.stat(sourcePath);
  const key = buildCacheKey(sourcePath, stats.mtimeMs, quality, 'video');
  const cachePath = getCachePath('videos', key, '.mp4');
  const cached = await readCacheEntry(cachePath);
  if (cached) {
    return { filePath: cached.filePath, contentType: 'video/mp4' };
  }

  await ensureParentDir(cachePath);
  const profile = getQualityProfile(quality);
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
  await runFfmpeg(args);

  return { filePath: cachePath, contentType: 'video/mp4' };
}
