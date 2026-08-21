import exifr from 'exifr';

/** Normalize EXIF/Samsung offsets like "+01:00", "+0100", "-4:00" to "+01:00". */
export function normalizeUtcOffset(raw: string | undefined | null): string | undefined {
  if (!raw || typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  const match = /^([+-])(\d{1,2}):?(\d{2})$/.exec(trimmed);
  if (!match) return undefined;
  const hours = match[2].padStart(2, '0');
  return `${match[1]}${hours}:${match[3]}`;
}

/** EXIF dates are "YYYY:MM:DD HH:MM:SS" wall-clock in the given offset. */
function parseExifWallClock(
  value: string,
  offset?: string,
): string | undefined {
  const match =
    /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(value.trim());
  if (!match) return undefined;
  const [, year, month, day, hour, minute, second] = match;
  const isoLocal = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
  const withOffset = offset ? `${isoLocal}${offset}` : isoLocal;
  const parsed = new Date(withOffset);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

function dateLocalWallClockIso(date: Date, offset?: string): string | undefined {
  // exifr often builds Date assuming the server's local TZ and ignores OffsetTime*.
  // Recover the wall-clock it used, then reinterpret with the real offset.
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  const second = String(date.getSeconds()).padStart(2, '0');
  const isoLocal = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
  const withOffset = offset ? `${isoLocal}${offset}` : isoLocal;
  const parsed = new Date(withOffset);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

export function pickCaptureTime(exif: Record<string, unknown> | null): string | undefined {
  if (!exif) return undefined;

  const offset =
    normalizeUtcOffset(
      (exif.OffsetTimeOriginal as string | undefined) ??
        (exif.OffsetTimeDigitized as string | undefined) ??
        (exif.OffsetTime as string | undefined),
    ) ?? undefined;

  const candidates = [
    exif.DateTimeOriginal,
    exif.CreateDate,
    exif.ModifyDate,
    exif.DateTime,
  ];

  for (const value of candidates) {
    if (value instanceof Date) {
      if (offset) {
        const fixed = dateLocalWallClockIso(value, offset);
        if (fixed) return fixed;
      }
      return value.toISOString();
    }
    if (typeof value === 'string') {
      const fromExif = parseExifWallClock(value, offset);
      if (fromExif) return fromExif;
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
      return value;
    }
  }
  return undefined;
}

export async function getImageCaptureTime(sourcePath: string): Promise<string | undefined> {
  const exif = (await exifr
    .parse(sourcePath, {
      pick: [
        'DateTimeOriginal',
        'CreateDate',
        'ModifyDate',
        'DateTime',
        'OffsetTimeOriginal',
        'OffsetTimeDigitized',
        'OffsetTime',
      ],
    })
    .catch(() => null)) as Record<string, unknown> | null;

  return pickCaptureTime(exif);
}

function tagFromSets(
  tagSets: Array<Record<string, string> | undefined>,
  key: string,
): string | undefined {
  for (const tags of tagSets) {
    if (!tags) continue;
    const value = tags[key];
    if (value) return value;
  }
  return undefined;
}

export function pickVideoCaptureTime(
  ...tagSets: Array<Record<string, string> | undefined>
): string | undefined {
  // Apple embeds the real local offset in this tag.
  const apple = tagFromSets(tagSets, 'com.apple.quicktime.creationdate');
  if (apple) {
    const date = new Date(apple);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }

  const creation =
    tagFromSets(tagSets, 'creation_time') ??
    tagFromSets(tagSets, 'creation_time-eng') ??
    tagFromSets(tagSets, 'date');

  // Samsung writes real UTC in creation_time plus the capture TZ offset.
  // Prefer creation_time as UTC (correct absolute time vs photos with OffsetTime*).
  if (creation) {
    const date = new Date(creation);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }

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
