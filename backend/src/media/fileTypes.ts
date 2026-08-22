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

/**
 * Viewer kinds for non-media files. Add a kind here, map extensions below,
 * then register a frontend viewer for that kind.
 */
export type ViewerKind = 'text' | 'pdf' | 'spreadsheet' | 'office';

const TEXT_CONTENT_TYPES: Record<string, string> = {
  '.txt': 'text/plain; charset=utf-8',
  '.text': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.markdown': 'text/markdown; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.tsv': 'text/tab-separated-values; charset=utf-8',
  '.log': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8',
  '.yml': 'text/yaml; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.ts': 'text/plain; charset=utf-8',
  '.tsx': 'text/plain; charset=utf-8',
  '.jsx': 'text/plain; charset=utf-8',
  '.py': 'text/x-python; charset=utf-8',
  '.rb': 'text/x-ruby; charset=utf-8',
  '.go': 'text/x-go; charset=utf-8',
  '.rs': 'text/x-rust; charset=utf-8',
  '.java': 'text/x-java; charset=utf-8',
  '.c': 'text/x-c; charset=utf-8',
  '.h': 'text/x-c; charset=utf-8',
  '.cpp': 'text/x-c; charset=utf-8',
  '.hpp': 'text/x-c; charset=utf-8',
  '.cs': 'text/plain; charset=utf-8',
  '.sh': 'text/x-shellscript; charset=utf-8',
  '.bash': 'text/x-shellscript; charset=utf-8',
  '.zsh': 'text/x-shellscript; charset=utf-8',
  '.env': 'text/plain; charset=utf-8',
  '.ini': 'text/plain; charset=utf-8',
  '.cfg': 'text/plain; charset=utf-8',
  '.conf': 'text/plain; charset=utf-8',
  '.toml': 'text/plain; charset=utf-8',
  '.sql': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.rtf': 'text/rtf; charset=utf-8',
  '.gitignore': 'text/plain; charset=utf-8',
  '.dockerignore': 'text/plain; charset=utf-8',
  '.editorconfig': 'text/plain; charset=utf-8',
};

const SPREADSHEET_CONTENT_TYPES: Record<string, string> = {
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xlsm': 'application/vnd.ms-excel.sheet.macroEnabled.12',
  '.xlsb': 'application/vnd.ms-excel.sheet.binary.macroEnabled.12',
  '.xls': 'application/vnd.ms-excel',
  '.ods': 'application/vnd.oasis.opendocument.spreadsheet',
};

const OFFICE_CONTENT_TYPES: Record<string, string> = {
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.odt': 'application/vnd.oasis.opendocument.text',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.odp': 'application/vnd.oasis.opendocument.presentation',
};

/** extension → viewer kind. Grow this map as new viewers ship. */
const VIEWER_BY_EXTENSION: Record<string, ViewerKind> = {
  ...Object.fromEntries(
    Object.keys(TEXT_CONTENT_TYPES).map((ext) => [ext, 'text' as const]),
  ),
  ...Object.fromEntries(
    Object.keys(SPREADSHEET_CONTENT_TYPES).map((ext) => [ext, 'spreadsheet' as const]),
  ),
  ...Object.fromEntries(
    Object.keys(OFFICE_CONTENT_TYPES).map((ext) => [ext, 'office' as const]),
  ),
  '.pdf': 'pdf',
};

export function getExtension(filename: string): string {
  const base = filename.includes('/')
    ? filename.slice(filename.lastIndexOf('/') + 1)
    : filename;
  // Dotfiles like ".gitignore"
  if (base.startsWith('.') && base.indexOf('.', 1) === -1) {
    return base.toLowerCase();
  }
  const index = base.lastIndexOf('.');
  if (index <= 0) return '';
  return base.slice(index).toLowerCase();
}

export function getFormatLabel(filename: string): string | undefined {
  const extension = getExtension(filename);
  if (!extension) return undefined;
  return extension.startsWith('.')
    ? extension.slice(1).toUpperCase()
    : extension.toUpperCase();
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

export function getViewerKind(filename: string): ViewerKind | null {
  return VIEWER_BY_EXTENSION[getExtension(filename)] ?? null;
}

export function isViewableFile(filename: string): boolean {
  return getViewerKind(filename) !== null;
}

export function isTextFile(filename: string): boolean {
  return getViewerKind(filename) === 'text';
}

export function isPdfFile(filename: string): boolean {
  return getViewerKind(filename) === 'pdf';
}

export function isSpreadsheetFile(filename: string): boolean {
  return getViewerKind(filename) === 'spreadsheet';
}

export function isOfficeFile(filename: string): boolean {
  return getViewerKind(filename) === 'office';
}

export function getTextContentType(filename: string): string {
  return TEXT_CONTENT_TYPES[getExtension(filename)] ?? 'text/plain; charset=utf-8';
}

export function getViewerContentType(filename: string): string {
  const ext = getExtension(filename);
  const kind = getViewerKind(filename);
  if (kind === 'text') return getTextContentType(filename);
  if (kind === 'pdf') return 'application/pdf';
  if (kind === 'spreadsheet') {
    return SPREADSHEET_CONTENT_TYPES[ext] ?? 'application/octet-stream';
  }
  if (kind === 'office') {
    return OFFICE_CONTENT_TYPES[ext] ?? 'application/octet-stream';
  }
  return 'application/octet-stream';
}

/** Content-Type if the file can be streamed to browsers without conversion; else null. */
export function getBrowserNativeImageContentType(filename: string): string | null {
  return BROWSER_NATIVE_IMAGE_TYPES[getExtension(filename)] ?? null;
}
