import fs from 'node:fs/promises';
import path from 'node:path';
import cron from 'node-cron';
import { config } from '../config.js';

interface CacheFile {
  filePath: string;
  size: number;
  mtimeMs: number;
}

async function walkFiles(dir: string): Promise<CacheFile[]> {
  const results: CacheFile[] = [];

  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await walkFiles(fullPath)));
      continue;
    }
    if (!entry.isFile()) continue;
    try {
      const stats = await fs.stat(fullPath);
      results.push({
        filePath: fullPath,
        size: stats.size,
        mtimeMs: stats.mtimeMs,
      });
    } catch {
      // ignore vanished files
    }
  }

  return results;
}

export async function enforceCacheLimit(): Promise<void> {
  const files = await walkFiles(config.cacheDir);
  let total = files.reduce((sum, file) => sum + file.size, 0);
  if (total <= config.cacheMaxBytes) return;

  files.sort((a, b) => a.mtimeMs - b.mtimeMs);

  for (const file of files) {
    if (total <= config.cacheMaxBytes) break;
    try {
      await fs.unlink(file.filePath);
      total -= file.size;
    } catch {
      // ignore
    }
  }
}

export function startCacheCleanupJob(): void {
  void enforceCacheLimit();

  if (!cron.validate(config.cacheCleanupCron)) {
    console.warn(
      `[cache] Invalid CACHE_CLEANUP_CRON "${config.cacheCleanupCron}"; skipping schedule`,
    );
    return;
  }

  cron.schedule(config.cacheCleanupCron, () => {
    void enforceCacheLimit().catch((error) => {
      console.error('[cache] Cleanup failed:', error);
    });
  });
}
