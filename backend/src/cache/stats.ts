import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';

interface CacheFile {
  size: number;
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
    if (entry.name.startsWith('cache-meta.db')) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await walkFiles(fullPath)));
      continue;
    }
    if (!entry.isFile()) continue;
    if (entry.name.endsWith('.tmp')) continue;
    try {
      const stats = await fs.stat(fullPath);
      results.push({ size: stats.size });
    } catch {
      // ignore vanished files
    }
  }

  return results;
}

export interface CacheStats {
  usedBytes: number;
  maxBytes: number;
  usedPercent: number;
  fileCount: number;
  measuredAt: number;
}

let cached: CacheStats | null = null;
let measuring: Promise<CacheStats> | null = null;
const CACHE_TTL_MS = 15_000;

async function measureCache(): Promise<CacheStats> {
  const files = await walkFiles(config.cacheDir);
  const usedBytes = files.reduce((sum, file) => sum + file.size, 0);
  const maxBytes = config.cacheMaxBytes;
  return {
    usedBytes,
    maxBytes,
    usedPercent:
      maxBytes > 0 ? Math.round((usedBytes / maxBytes) * 1000) / 10 : 0,
    fileCount: files.length,
    measuredAt: Date.now(),
  };
}

/** Cache size/count. Cached briefly so admin polls do not re-walk every time. */
export async function getCacheStats(): Promise<CacheStats> {
  if (cached && Date.now() - cached.measuredAt < CACHE_TTL_MS) {
    return cached;
  }
  if (!measuring) {
    measuring = measureCache()
      .then((stats) => {
        cached = stats;
        return stats;
      })
      .finally(() => {
        measuring = null;
      });
  }
  return measuring;
}

export function invalidateCacheStats(): void {
  cached = null;
}
