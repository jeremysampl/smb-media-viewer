import fs from 'node:fs/promises';
import { ensureIndexAsset } from '../index/indexer.js';

export async function getVideoPoster(sourcePath: string): Promise<{
  filePath: string;
  contentType: string;
}> {
  const stats = await fs.stat(sourcePath);
  const indexed = await ensureIndexAsset(
    sourcePath,
    stats.mtimeMs,
    stats.size,
    'video',
  );
  return { filePath: indexed.filePath, contentType: indexed.contentType };
}
