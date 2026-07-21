import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import { ZipArchive } from 'archiver';
import { authMiddleware, type AuthenticatedRequest } from '../auth/middleware.js';
import { resolveAbsolutePath } from '../permissions/resolver.js';
import { isImageFile, isVideoFile } from '../media/fileTypes.js';
import { getResizedImage } from '../media/image.js';
import { getTranscodedVideo } from '../media/video.js';
import { isQualityTier } from '../media/quality.js';
import type { QualityTier } from '../types.js';

const router = Router();

router.use(authMiddleware);

interface ZipJob {
  absolutePath: string;
  zipPath: string;
}

function sanitizeZipName(input: string): string {
  const trimmed = input.trim().replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, ' ');
  const withoutExt = trimmed.replace(/\.zip$/i, '');
  return (withoutExt || 'download').slice(0, 120);
}

function uniqueZipPath(desired: string, used: Set<string>): string {
  if (!used.has(desired)) {
    used.add(desired);
    return desired;
  }

  const ext = path.extname(desired);
  const base = ext ? desired.slice(0, -ext.length) : desired;
  let index = 2;
  while (true) {
    const candidate = `${base} (${index})${ext}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
    index += 1;
  }
}

function replaceExtension(filePath: string, nextExt: string): string {
  const current = path.extname(filePath);
  if (!current) return `${filePath}${nextExt}`;
  return `${filePath.slice(0, -current.length)}${nextExt}`;
}

async function collectJobs(
  username: string,
  browsePaths: string[],
): Promise<ZipJob[]> {
  const used = new Set<string>();
  const jobs: ZipJob[] = [];

  async function walkDirectory(
    absoluteDir: string,
    zipPrefix: string,
  ): Promise<void> {
    let entries;
    try {
      entries = await fsp.readdir(absoluteDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const absolutePath = path.join(absoluteDir, entry.name);
      const zipPath = zipPrefix ? `${zipPrefix}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        await walkDirectory(absolutePath, zipPath);
        continue;
      }
      if (!entry.isFile()) continue;

      jobs.push({
        absolutePath,
        zipPath: uniqueZipPath(zipPath, used),
      });
    }
  }

  for (const browsePath of browsePaths) {
    const resolved = await resolveAbsolutePath(username, browsePath);
    if (!resolved) continue;

    let stats;
    try {
      stats = await fsp.stat(resolved.absolutePath);
    } catch {
      continue;
    }

    const baseName = path.basename(resolved.absolutePath);

    if (stats.isDirectory()) {
      await walkDirectory(resolved.absolutePath, baseName);
      continue;
    }

    if (stats.isFile()) {
      jobs.push({
        absolutePath: resolved.absolutePath,
        zipPath: uniqueZipPath(baseName, used),
      });
    }
  }

  return jobs;
}

async function resolveExportFile(
  absolutePath: string,
  quality: QualityTier,
): Promise<{ filePath: string; zipPathTransform: (zipPath: string) => string }> {
  const identity = (zipPath: string) => zipPath;

  if (quality === 'full') {
    return { filePath: absolutePath, zipPathTransform: identity };
  }

  if (isImageFile(absolutePath)) {
    const result = await getResizedImage(absolutePath, quality);
    return {
      filePath: result.filePath,
      zipPathTransform: (zipPath) => replaceExtension(zipPath, '.webp'),
    };
  }

  if (isVideoFile(absolutePath)) {
    const result = await getTranscodedVideo(absolutePath, quality);
    return {
      filePath: result.filePath,
      zipPathTransform: (zipPath) => replaceExtension(zipPath, '.mp4'),
    };
  }

  return { filePath: absolutePath, zipPathTransform: identity };
}

router.post('/zip', async (req: AuthenticatedRequest, res) => {
  const username = req.user!.username;
  const paths = Array.isArray(req.body?.paths)
    ? (req.body.paths as unknown[])
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter(Boolean)
    : [];
  const zipName = sanitizeZipName(String(req.body?.zipName ?? 'download'));
  const qualityRaw = String(req.body?.quality ?? 'full');
  const quality: QualityTier = isQualityTier(qualityRaw) ? qualityRaw : 'full';

  if (paths.length === 0) {
    res.status(400).json({ error: 'Select at least one item to download' });
    return;
  }

  if (paths.length > 500) {
    res.status(400).json({ error: 'Too many items selected (max 500)' });
    return;
  }

  let jobs: ZipJob[];
  try {
    jobs = await collectJobs(username, paths);
  } catch (error) {
    console.error('Failed to collect download files:', error);
    res.status(500).json({ error: 'Failed to prepare download' });
    return;
  }

  if (jobs.length === 0) {
    res.status(404).json({ error: 'No downloadable files found' });
    return;
  }

  if (jobs.length > 5000) {
    res.status(400).json({ error: 'Selection expands to too many files (max 5000)' });
    return;
  }

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${zipName}.zip"; filename*=UTF-8''${encodeURIComponent(`${zipName}.zip`)}`,
  );
  res.setHeader('Cache-Control', 'no-store');

  const archive = new ZipArchive({ zlib: { level: 5 } });
  archive.on('error', (error: Error) => {
    console.error('Zip archive error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to create zip' });
      return;
    }
    res.destroy(error);
  });

  archive.pipe(res);

  try {
    for (const job of jobs) {
      if (req.aborted) break;
      try {
        const exported = await resolveExportFile(job.absolutePath, quality);
        const zipPath = exported.zipPathTransform(job.zipPath);
        archive.append(fs.createReadStream(exported.filePath), { name: zipPath });
      } catch (error) {
        console.error(`Skipping ${job.absolutePath}:`, error);
      }
    }
    await archive.finalize();
  } catch (error) {
    console.error('Zip streaming failed:', error);
    archive.abort();
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to create zip' });
    } else {
      res.destroy(error instanceof Error ? error : undefined);
    }
  }
});

export default router;
