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
export type ViewerKind =
  | 'text'
  | 'pdf'
  | 'spreadsheet'
  | 'office'
  | 'markdown'
  | 'latex'
  | 'code';

const TEXT_CONTENT_TYPES: Record<string, string> = {
  '.txt': 'text/plain; charset=utf-8',
  '.text': 'text/plain; charset=utf-8',
  '.log': 'text/plain; charset=utf-8',
  '.rtf': 'text/rtf; charset=utf-8',
};

const CODE_CONTENT_TYPES: Record<string, string> = {
  '.json': 'application/json; charset=utf-8',
  '.jsonc': 'application/json; charset=utf-8',
  '.json5': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.xsl': 'application/xml; charset=utf-8',
  '.xslt': 'application/xml; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8',
  '.yml': 'text/yaml; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.scss': 'text/x-scss; charset=utf-8',
  '.sass': 'text/x-sass; charset=utf-8',
  '.less': 'text/x-less; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.ts': 'text/plain; charset=utf-8',
  '.mts': 'text/plain; charset=utf-8',
  '.cts': 'text/plain; charset=utf-8',
  '.tsx': 'text/plain; charset=utf-8',
  '.jsx': 'text/plain; charset=utf-8',
  '.py': 'text/x-python; charset=utf-8',
  '.pyw': 'text/x-python; charset=utf-8',
  '.rb': 'text/x-ruby; charset=utf-8',
  '.go': 'text/x-go; charset=utf-8',
  '.rs': 'text/x-rust; charset=utf-8',
  '.java': 'text/x-java; charset=utf-8',
  '.c': 'text/x-c; charset=utf-8',
  '.h': 'text/x-c; charset=utf-8',
  '.cpp': 'text/x-c; charset=utf-8',
  '.cc': 'text/x-c; charset=utf-8',
  '.cxx': 'text/x-c; charset=utf-8',
  '.hpp': 'text/x-c; charset=utf-8',
  '.hh': 'text/x-c; charset=utf-8',
  '.cs': 'text/plain; charset=utf-8',
  '.sh': 'text/x-shellscript; charset=utf-8',
  '.bash': 'text/x-shellscript; charset=utf-8',
  '.zsh': 'text/x-shellscript; charset=utf-8',
  '.fish': 'text/x-shellscript; charset=utf-8',
  '.ps1': 'text/plain; charset=utf-8',
  '.psm1': 'text/plain; charset=utf-8',
  '.env': 'text/plain; charset=utf-8',
  '.ini': 'text/plain; charset=utf-8',
  '.cfg': 'text/plain; charset=utf-8',
  '.conf': 'text/plain; charset=utf-8',
  '.properties': 'text/plain; charset=utf-8',
  '.toml': 'text/plain; charset=utf-8',
  '.sql': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.php': 'text/x-php; charset=utf-8',
  '.phtml': 'text/x-php; charset=utf-8',
  '.kt': 'text/plain; charset=utf-8',
  '.kts': 'text/plain; charset=utf-8',
  '.swift': 'text/plain; charset=utf-8',
  '.scala': 'text/plain; charset=utf-8',
  '.sc': 'text/plain; charset=utf-8',
  '.lua': 'text/x-lua; charset=utf-8',
  '.r': 'text/plain; charset=utf-8',
  '.pl': 'text/x-perl; charset=utf-8',
  '.pm': 'text/x-perl; charset=utf-8',
  '.dart': 'text/plain; charset=utf-8',
  '.zig': 'text/plain; charset=utf-8',
  '.hs': 'text/x-haskell; charset=utf-8',
  '.ex': 'text/plain; charset=utf-8',
  '.exs': 'text/plain; charset=utf-8',
  '.erl': 'text/plain; charset=utf-8',
  '.hrl': 'text/plain; charset=utf-8',
  '.clj': 'text/plain; charset=utf-8',
  '.cljs': 'text/plain; charset=utf-8',
  '.edn': 'text/plain; charset=utf-8',
  '.graphql': 'text/plain; charset=utf-8',
  '.gql': 'text/plain; charset=utf-8',
  '.vue': 'text/plain; charset=utf-8',
  '.svelte': 'text/plain; charset=utf-8',
  '.astro': 'text/plain; charset=utf-8',
  '.mdx': 'text/plain; charset=utf-8',
  '.cmake': 'text/plain; charset=utf-8',
  '.diff': 'text/x-diff; charset=utf-8',
  '.patch': 'text/x-diff; charset=utf-8',
  '.m': 'text/plain; charset=utf-8',
  '.mm': 'text/plain; charset=utf-8',
  '.f90': 'text/plain; charset=utf-8',
  '.f95': 'text/plain; charset=utf-8',
  '.f03': 'text/plain; charset=utf-8',
  '.f': 'text/plain; charset=utf-8',
  '.for': 'text/plain; charset=utf-8',
  '.jl': 'text/plain; charset=utf-8',
  '.nim': 'text/plain; charset=utf-8',
  '.ml': 'text/plain; charset=utf-8',
  '.mli': 'text/plain; charset=utf-8',
  '.fs': 'text/plain; charset=utf-8',
  '.fsx': 'text/plain; charset=utf-8',
  '.fsi': 'text/plain; charset=utf-8',
  '.vb': 'text/plain; charset=utf-8',
  '.wat': 'text/plain; charset=utf-8',
  '.proto': 'text/plain; charset=utf-8',
  '.prisma': 'text/plain; charset=utf-8',
  '.tf': 'text/plain; charset=utf-8',
  '.tfvars': 'text/plain; charset=utf-8',
  '.hcl': 'text/plain; charset=utf-8',
  '.bicep': 'text/plain; charset=utf-8',
  '.sol': 'text/plain; charset=utf-8',
  '.vy': 'text/plain; charset=utf-8',
  '.glsl': 'text/plain; charset=utf-8',
  '.frag': 'text/plain; charset=utf-8',
  '.vert': 'text/plain; charset=utf-8',
  '.hlsl': 'text/plain; charset=utf-8',
  '.wgsl': 'text/plain; charset=utf-8',
  '.asm': 'text/plain; charset=utf-8',
  '.s': 'text/plain; charset=utf-8',
  '.bat': 'text/plain; charset=utf-8',
  '.cmd': 'text/plain; charset=utf-8',
  '.coffee': 'text/plain; charset=utf-8',
  '.lisp': 'text/plain; charset=utf-8',
  '.cl': 'text/plain; charset=utf-8',
  '.scm': 'text/plain; charset=utf-8',
  '.rkt': 'text/plain; charset=utf-8',
  '.groovy': 'text/plain; charset=utf-8',
  '.gradle': 'text/plain; charset=utf-8',
  '.jinja': 'text/plain; charset=utf-8',
  '.j2': 'text/plain; charset=utf-8',
  '.bib': 'text/plain; charset=utf-8',
  '.nginx': 'text/plain; charset=utf-8',
  '.mk': 'text/plain; charset=utf-8',
  '.dockerfile': 'text/plain; charset=utf-8',
  '.gitignore': 'text/plain; charset=utf-8',
  '.dockerignore': 'text/plain; charset=utf-8',
  '.editorconfig': 'text/plain; charset=utf-8',
};

const CODE_BASENAME_LABELS: Record<string, string> = {
  dockerfile: 'DOCKERFILE',
  makefile: 'MAKEFILE',
  gnumakefile: 'MAKEFILE',
  'cmakelists.txt': 'CMAKE',
};

const MARKDOWN_CONTENT_TYPES: Record<string, string> = {
  '.md': 'text/markdown; charset=utf-8',
  '.markdown': 'text/markdown; charset=utf-8',
  '.mdown': 'text/markdown; charset=utf-8',
  '.mkd': 'text/markdown; charset=utf-8',
};

const LATEX_CONTENT_TYPES: Record<string, string> = {
  '.tex': 'application/x-tex; charset=utf-8',
  '.latex': 'application/x-latex; charset=utf-8',
  '.ltx': 'application/x-latex; charset=utf-8',
};

const SPREADSHEET_CONTENT_TYPES: Record<string, string> = {
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xlsm': 'application/vnd.ms-excel.sheet.macroEnabled.12',
  '.xlsb': 'application/vnd.ms-excel.sheet.binary.macroEnabled.12',
  '.xls': 'application/vnd.ms-excel',
  '.ods': 'application/vnd.oasis.opendocument.spreadsheet',
  '.csv': 'text/csv; charset=utf-8',
  '.tsv': 'text/tab-separated-values; charset=utf-8',
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
    Object.keys(CODE_CONTENT_TYPES).map((ext) => [ext, 'code' as const]),
  ),
  ...Object.fromEntries(
    Object.keys(MARKDOWN_CONTENT_TYPES).map((ext) => [ext, 'markdown' as const]),
  ),
  ...Object.fromEntries(
    Object.keys(LATEX_CONTENT_TYPES).map((ext) => [ext, 'latex' as const]),
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
  const base = filename.includes('/')
    ? filename.slice(filename.lastIndexOf('/') + 1)
    : filename;
  const basenameLabel = CODE_BASENAME_LABELS[base.toLowerCase()];
  if (basenameLabel) return basenameLabel;
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
  const base = filename.includes('/')
    ? filename.slice(filename.lastIndexOf('/') + 1)
    : filename;
  if (CODE_BASENAME_LABELS[base.toLowerCase()]) {
    return 'code';
  }
  return VIEWER_BY_EXTENSION[getExtension(filename)] ?? null;
}

export function isViewableFile(filename: string): boolean {
  return getViewerKind(filename) !== null;
}

export function isTextFile(filename: string): boolean {
  const kind = getViewerKind(filename);
  return kind === 'text' || kind === 'markdown' || kind === 'latex' || kind === 'code';
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

export function isMarkdownFile(filename: string): boolean {
  return getViewerKind(filename) === 'markdown';
}

export function isLatexFile(filename: string): boolean {
  return getViewerKind(filename) === 'latex';
}

export function isCodeFile(filename: string): boolean {
  return getViewerKind(filename) === 'code';
}

export function getTextContentType(filename: string): string {
  const base = filename.includes('/')
    ? filename.slice(filename.lastIndexOf('/') + 1)
    : filename;
  if (CODE_BASENAME_LABELS[base.toLowerCase()]) {
    return 'text/plain; charset=utf-8';
  }
  const ext = getExtension(filename);
  return (
    TEXT_CONTENT_TYPES[ext] ??
    CODE_CONTENT_TYPES[ext] ??
    MARKDOWN_CONTENT_TYPES[ext] ??
    LATEX_CONTENT_TYPES[ext] ??
    'text/plain; charset=utf-8'
  );
}

export function getViewerContentType(filename: string): string {
  const ext = getExtension(filename);
  const kind = getViewerKind(filename);
  if (kind === 'text' || kind === 'markdown' || kind === 'latex' || kind === 'code') {
    return getTextContentType(filename);
  }
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
