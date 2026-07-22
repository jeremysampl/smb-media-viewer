const IMAGE_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.bmp',
  '.tif',
  '.tiff',
  '.heic',
  '.heif',
  '.avif',
]);

/** Formats browsers can show as-is in <img> across Chromium/Firefox/Safari. */
const BROWSER_NATIVE_IMAGE_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
};

const VIDEO_EXTENSIONS = new Set([
  '.mp4',
  '.m4v',
  '.mov',
  '.mkv',
  '.avi',
  '.webm',
  '.wmv',
  '.flv',
  '.mpeg',
  '.mpg',
  '.3gp',
]);

export function getExtension(filename: string): string {
  const index = filename.lastIndexOf('.');
  if (index === -1) return '';
  return filename.slice(index).toLowerCase();
}

export function getFormatLabel(filename: string): string | undefined {
  const extension = getExtension(filename);
  if (!extension) return undefined;
  return extension.slice(1).toUpperCase();
}

export function isImageFile(filename: string): boolean {
  return IMAGE_EXTENSIONS.has(getExtension(filename));
}

export function isVideoFile(filename: string): boolean {
  return VIDEO_EXTENSIONS.has(getExtension(filename));
}

export function isMediaFile(filename: string): boolean {
  return isImageFile(filename) || isVideoFile(filename);
}

/** Content-Type if the file can be streamed to browsers without conversion; else null. */
export function getBrowserNativeImageContentType(filename: string): string | null {
  return BROWSER_NATIVE_IMAGE_TYPES[getExtension(filename)] ?? null;
}
