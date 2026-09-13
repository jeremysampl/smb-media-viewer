import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { config } from '../config.js';
import {
  buildCacheKey,
  getCachePath,
  readCacheEntry,
  writeAtomic,
} from '../cache/cache.js';
import { recordCacheAccess, registerCacheEntry } from '../cache/meta.js';
import { setTrackedJobOutputSize, withTrackedJob } from '../jobs/tracker.js';
import { getDisplayFileKind } from './fileTypes.js';

function runCommand(command: string, args: string[], timeoutMs = 120_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('Office conversion timed out'));
    }, timeoutMs);

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(
          new Error(
            'LibreOffice is not installed (soffice). Install it on the host or use the backend Docker image.',
          ),
        );
        return;
      }
      reject(error);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || `Office conversion failed (exit ${code})`));
    });
  });
}

async function convertOfficeToPdf(sourcePath: string, outputPath: string): Promise<void> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'office-pdf-'));
  try {
    await runCommand(config.libreOfficeBin, [
      '--headless',
      '--norestore',
      '--nolockcheck',
      '--convert-to',
      'pdf',
      '--outdir',
      tmpDir,
      sourcePath,
    ]);

    const baseName = path.basename(sourcePath, path.extname(sourcePath));
    const generated = path.join(tmpDir, `${baseName}.pdf`);
    const pdfBuffer = await fs.readFile(generated);
    await writeAtomic(outputPath, pdfBuffer);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

export async function getOfficePdf(
  sourcePath: string,
): Promise<{ filePath: string; contentType: string }> {
  const stats = await fs.stat(sourcePath);
  const key = buildCacheKey(sourcePath, stats.mtimeMs, 'pdf', 'office');
  const cachePath = getCachePath('office-pdf', key, '.pdf');
  const cached = await readCacheEntry(cachePath);
  if (cached) {
    let size = stats.size;
    try {
      size = (await fs.stat(cachePath)).size;
    } catch {
      // keep source size for meta fallback
    }
    registerCacheEntry({
      cachePath,
      sourcePath,
      kind: getDisplayFileKind(sourcePath),
      quality: 'office-pdf',
      size,
    });
    recordCacheAccess(cachePath);
    return { filePath: cached.filePath, contentType: 'application/pdf' };
  }

  return withTrackedJob(
    { kind: 'office_convert', path: sourcePath, size: stats.size },
    async (jobId) => {
      await convertOfficeToPdf(sourcePath, cachePath);
      const outStats = await fs.stat(cachePath);
      setTrackedJobOutputSize(jobId, outStats.size);
      registerCacheEntry({
        cachePath,
        sourcePath,
        kind: getDisplayFileKind(sourcePath),
        quality: 'office-pdf',
        size: outStats.size,
      });
      return { filePath: cachePath, contentType: 'application/pdf' };
    },
  );
}
