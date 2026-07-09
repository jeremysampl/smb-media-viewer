import exifr from 'exifr';

export function pickCaptureTime(exif: Record<string, unknown> | null): string | undefined {
  if (!exif) return undefined;
  const candidates = [
    exif.DateTimeOriginal,
    exif.CreateDate,
    exif.ModifyDate,
    exif.DateTime,
  ];
  for (const value of candidates) {
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string') {
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
    }
  }
  return undefined;
}

export async function getImageCaptureTime(sourcePath: string): Promise<string | undefined> {
  const exif = (await exifr
    .parse(sourcePath, {
      pick: ['DateTimeOriginal', 'CreateDate', 'ModifyDate', 'DateTime'],
    })
    .catch(() => null)) as Record<string, unknown> | null;

  return pickCaptureTime(exif);
}

export function pickVideoCaptureTime(tags?: Record<string, string>): string | undefined {
  if (!tags) return undefined;
  const value = tags.creation_time ?? tags.date ?? tags['com.apple.quicktime.creationdate'];
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}
