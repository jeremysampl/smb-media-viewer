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

export function pickVideoCaptureTime(
  ...tagSets: Array<Record<string, string> | undefined>
): string | undefined {
  const preferredKeys = [
    'com.apple.quicktime.creationdate',
    'creation_time',
    'date',
    'creation_time-eng',
  ];

  for (const tags of tagSets) {
    if (!tags) continue;
    for (const key of preferredKeys) {
      const value = tags[key];
      if (!value) continue;
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) return date.toISOString();
      return value;
    }

    for (const [key, value] of Object.entries(tags)) {
      if (!value) continue;
      const lower = key.toLowerCase();
      if (
        !lower.includes('creation') &&
        lower !== 'date' &&
        !lower.includes('datetime')
      ) {
        continue;
      }
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) return date.toISOString();
    }
  }

  return undefined;
}

