import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
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

export async function getVideoPoster(sourcePath: string): Promise<{
  filePath: string;
  contentType: string;
}> {
  const stats = await fs.stat(sourcePath);
  const key = buildCacheKey(sourcePath, stats.mtimeMs, 'poster', 'poster');
  const cachePath = getCachePath('posters', key, '.jpg');
  const cached = await readCacheEntry(cachePath);
  if (cached) {
    return { filePath: cached.filePath, contentType: 'image/jpeg' };
  }

  await ensureParentDir(cachePath);
  await runFfmpeg([
    '-ss',
    '00:00:01',
    '-i',
    sourcePath,
    '-frames:v',
    '1',
    '-q:v',
    '2',
    cachePath,
  ]);

  return { filePath: cachePath, contentType: 'image/jpeg' };
}
