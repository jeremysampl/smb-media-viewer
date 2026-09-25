import fs from 'node:fs/promises';
import exifr from 'exifr';

/** Bytes to read for EXIF */
const EXIF_PREFIX_BYTES = 2 * 1024 * 1024;

async function readFilePrefix(sourcePath: string, maxBytes: number): Promise<Buffer> {
  const handle = await fs.open(sourcePath, 'r');
  try {
    const { size } = await handle.stat();
    const length = Math.min(size, maxBytes);
    if (length <= 0) return Buffer.alloc(0);
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    return bytesRead === length ? buffer : buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

/**
 * Parse EXIF without handing a path to exifr.
 * Path-based chunked reads leak FileHandles on Node 26 (and crash the process)
 */
export async function parseExifFile(
  sourcePath: string,
  options?: Parameters<typeof exifr.parse>[1],
): Promise<Record<string, unknown> | null> {
  try {
    const prefix = await readFilePrefix(sourcePath, EXIF_PREFIX_BYTES);
    if (prefix.length === 0) return null;
    const parsed = await exifr.parse(prefix, options);
    return (parsed as Record<string, unknown> | undefined) ?? null;
  } catch {
    return null;
  }
}
