import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { isImageFile, isVideoFile } from './fileTypes.js';
import { pickCaptureTime } from './captureTime.js';
import { parseExifFile } from './exif.js';
import { getVideoMetadata, type VideoMetadata } from './videoMetadata.js';

export interface ImageMetadata {
  kind: 'image';
  filename: string;
  size: number;
  mtime: string;
  dimensions?: { width: number; height: number };
  format?: string;
  camera?: {
    make?: string;
    model?: string;
    lens?: string;
  };
  captureTime?: string;
  location?: {
    latitude: number;
    longitude: number;
    altitude?: number;
  };
  settings?: {
    iso?: number;
    aperture?: string;
    shutterSpeed?: string;
    focalLength?: string;
    flash?: string;
    whiteBalance?: string;
  };
  orientation?: number;
  software?: string;
  colorSpace?: string;
}

export type MediaMetadata = ImageMetadata | VideoMetadata;

function formatAperture(value: unknown): string | undefined {
  if (typeof value !== 'number') return undefined;
  return `f/${value}`;
}

function formatShutter(value: unknown): string | undefined {
  if (typeof value === 'number') {
    if (value >= 1) return `${value}s`;
    return `1/${Math.round(1 / value)}s`;
  }
  if (typeof value === 'string') return value;
  return undefined;
}

function formatFocalLength(value: unknown): string | undefined {
  if (typeof value === 'number') return `${value}mm`;
  if (typeof value === 'string') return value;
  return undefined;
}

export async function getImageMetadata(sourcePath: string): Promise<ImageMetadata> {
  const stats = await fs.stat(sourcePath);
  const filename = path.basename(sourcePath);

  let dimensions: { width: number; height: number } | undefined;
  let format: string | undefined;
  try {
    const meta = await sharp(sourcePath).metadata();
    if (meta.width && meta.height) {
      dimensions = { width: meta.width, height: meta.height };
    }
    format = meta.format;
  } catch {
    // ignore unsupported formats for sharp
  }

  const exif = await parseExifFile(sourcePath, {
    gps: true,
    tiff: true,
    exif: true,
    mergeOutput: true,
  });

  const metadata: ImageMetadata = {
    kind: 'image',
    filename,
    size: stats.size,
    mtime: stats.mtime.toISOString(),
    dimensions,
    format,
  };

  if (!exif) return metadata;

  const make = exif.Make as string | undefined;
  const model = exif.Model as string | undefined;
  const lens = (exif.LensModel ?? exif.Lens) as string | undefined;
  if (make || model || lens) {
    metadata.camera = { make, model, lens };
  }

  const captureTime = pickCaptureTime(exif);
  if (captureTime) metadata.captureTime = captureTime;

  const latitude = exif.latitude as number | undefined;
  const longitude = exif.longitude as number | undefined;
  if (typeof latitude === 'number' && typeof longitude === 'number') {
    metadata.location = {
      latitude,
      longitude,
      altitude: typeof exif.GPSAltitude === 'number' ? exif.GPSAltitude : undefined,
    };
  }

  const iso = exif.ISO as number | undefined;
  const aperture = formatAperture(exif.FNumber ?? exif.ApertureValue);
  const shutterSpeed = formatShutter(exif.ExposureTime ?? exif.ShutterSpeedValue);
  const focalLength = formatFocalLength(exif.FocalLength);
  const flash = exif.Flash as string | number | undefined;
  const whiteBalance = exif.WhiteBalance as string | undefined;

  if (iso || aperture || shutterSpeed || focalLength || flash !== undefined || whiteBalance) {
    metadata.settings = {
      iso,
      aperture,
      shutterSpeed,
      focalLength,
      flash: flash !== undefined ? String(flash) : undefined,
      whiteBalance: whiteBalance !== undefined ? String(whiteBalance) : undefined,
    };
  }

  if (typeof exif.Orientation === 'number') metadata.orientation = exif.Orientation;
  if (typeof exif.Software === 'string') metadata.software = exif.Software;
  if (typeof exif.ColorSpace === 'string') metadata.colorSpace = exif.ColorSpace;

  return metadata;
}

export async function getMediaMetadata(sourcePath: string): Promise<MediaMetadata> {
  if (isVideoFile(sourcePath)) {
    return getVideoMetadata(sourcePath);
  }
  if (isImageFile(sourcePath)) {
    return getImageMetadata(sourcePath);
  }
  throw new Error('Unsupported media type for metadata');
}
