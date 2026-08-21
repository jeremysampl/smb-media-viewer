import { useState } from 'react';
import type { BrowseEntry } from '../types';

export type FileTypeFilter =
  | 'any'
  | 'media'
  | 'images'
  | 'videos'
  | 'pdf'
  | 'text'
  | 'document'
  | 'spreadsheet'
  | 'presentation'
  | 'archive'
  | 'audio'
  | 'other'
  | `image:${string}`
  | `video:${string}`;

interface FilterOption {
  id: FileTypeFilter;
  label: string;
}

interface FilterGroup {
  label: string;
  options: FilterOption[];
}

/** Format alias -> BrowseEntry.format values (uppercase). */
const FORMAT_ALIASES: Record<string, string[]> = {
  jpeg: ['JPG', 'JPEG'],
  png: ['PNG'],
  gif: ['GIF'],
  webp: ['WEBP'],
  heic: ['HEIC', 'HEIF'],
  tiff: ['TIF', 'TIFF'],
  bmp: ['BMP'],
  avif: ['AVIF'],
  raw: ['RAW', 'CR2', 'CR3', 'NEF', 'ARW', 'DNG', 'ORF', 'RW2'],
  mp4: ['MP4', 'M4V'],
  mov: ['MOV'],
  mkv: ['MKV'],
  webm: ['WEBM'],
  avi: ['AVI'],
  wmv: ['WMV'],
  mpeg: ['MPEG', 'MPG'],
};

const IMAGE_SUBTYPES: FilterOption[] = [
  { id: 'image:jpeg', label: 'JPEG' },
  { id: 'image:png', label: 'PNG' },
  { id: 'image:gif', label: 'GIF' },
  { id: 'image:webp', label: 'WebP' },
  { id: 'image:heic', label: 'HEIC' },
  { id: 'image:tiff', label: 'TIFF' },
  { id: 'image:bmp', label: 'BMP' },
  { id: 'image:avif', label: 'AVIF' },
  { id: 'image:raw', label: 'RAW' },
];

const VIDEO_SUBTYPES: FilterOption[] = [
  { id: 'video:mp4', label: 'MP4' },
  { id: 'video:mov', label: 'MOV' },
  { id: 'video:mkv', label: 'MKV' },
  { id: 'video:webm', label: 'WebM' },
  { id: 'video:avi', label: 'AVI' },
  { id: 'video:wmv', label: 'WMV' },
  { id: 'video:mpeg', label: 'MPEG' },
];

const TEXT_FORMATS = new Set([
  'TXT',
  'TEXT',
  'MD',
  'MARKDOWN',
  'CSV',
  'TSV',
  'LOG',
  'JSON',
  'XML',
  'YAML',
  'YML',
  'HTML',
  'HTM',
  'CSS',
  'JS',
  'MJS',
  'CJS',
  'TS',
  'TSX',
  'JSX',
  'PY',
  'RB',
  'GO',
  'RS',
  'JAVA',
  'C',
  'H',
  'CPP',
  'HPP',
  'CS',
  'SH',
  'BASH',
  'ZSH',
  'ENV',
  'INI',
  'CFG',
  'CONF',
  'TOML',
  'SQL',
  'SVG',
  'RTF',
  'GITIGNORE',
  'DOCKERIGNORE',
  'EDITORCONFIG',
]);

const DOCUMENT_FORMATS = new Set([
  'DOC',
  'DOCX',
  'ODT',
  'PAGES',
  'EPUB',
]);

const SPREADSHEET_FORMATS = new Set([
  'XLS',
  'XLSX',
  'ODS',
  'NUMBERS',
]);

const PRESENTATION_FORMATS = new Set([
  'PPT',
  'PPTX',
  'ODP',
  'KEY',
]);

const ARCHIVE_FORMATS = new Set([
  'ZIP',
  'RAR',
  '7Z',
  'TAR',
  'GZ',
  'TGZ',
  'BZ2',
  'XZ',
]);

const AUDIO_FORMATS = new Set([
  'MP3',
  'AAC',
  'M4A',
  'WAV',
  'FLAC',
  'OGG',
  'OPUS',
  'WMA',
  'AIFF',
]);

const KNOWN_IMAGE_FORMATS = new Set(
  IMAGE_SUBTYPES.flatMap((option) => {
    const key = option.id.slice('image:'.length);
    return FORMAT_ALIASES[key] ?? [key.toUpperCase()];
  }),
);

const KNOWN_VIDEO_FORMATS = new Set(
  VIDEO_SUBTYPES.flatMap((option) => {
    const key = option.id.slice('video:'.length);
    return FORMAT_ALIASES[key] ?? [key.toUpperCase()];
  }),
);

const KNOWN_OTHER_EXCLUDED = new Set([
  ...KNOWN_IMAGE_FORMATS,
  ...KNOWN_VIDEO_FORMATS,
  'PDF',
  ...TEXT_FORMATS,
  ...DOCUMENT_FORMATS,
  ...SPREADSHEET_FORMATS,
  ...PRESENTATION_FORMATS,
  ...ARCHIVE_FORMATS,
  ...AUDIO_FORMATS,
]);

export const FILE_TYPE_FILTER_TOP: FilterOption[] = [
  { id: 'any', label: 'Any' },
  { id: 'media', label: 'Images & Videos' },
];

export const FILE_TYPE_FILTER_GROUPS: FilterGroup[] = [
  {
    label: 'Images',
    options: [{ id: 'images', label: 'All images' }, ...IMAGE_SUBTYPES],
  },
  {
    label: 'Videos',
    options: [{ id: 'videos', label: 'All videos' }, ...VIDEO_SUBTYPES],
  },
  {
    label: 'Documents',
    options: [
      { id: 'pdf', label: 'PDF' },
      { id: 'text', label: 'Text' },
      { id: 'document', label: 'Word / Docs' },
      { id: 'spreadsheet', label: 'Spreadsheets' },
      { id: 'presentation', label: 'Presentations' },
    ],
  },
  {
    label: 'Other files',
    options: [
      { id: 'audio', label: 'Audio' },
      { id: 'archive', label: 'Archives' },
      { id: 'other', label: 'Other' },
    ],
  },
];

const ALL_FILTER_IDS = new Set<string>([
  ...FILE_TYPE_FILTER_TOP.map((option) => option.id),
  ...FILE_TYPE_FILTER_GROUPS.flatMap((group) =>
    group.options.map((option) => option.id),
  ),
]);

function entryFormat(entry: BrowseEntry): string {
  return (entry.format ?? '').toUpperCase();
}

function matchesAlias(format: string, aliasKey: string): boolean {
  const accepted = FORMAT_ALIASES[aliasKey];
  if (!accepted) return format === aliasKey.toUpperCase();
  return accepted.includes(format);
}

function isKnownCommonFile(entry: BrowseEntry): boolean {
  if (entry.type === 'image' || entry.type === 'video') return true;
  const format = entryFormat(entry);
  if (!format) return false;
  return KNOWN_OTHER_EXCLUDED.has(format);
}

export function entryMatchesFileTypeFilter(
  entry: BrowseEntry,
  filter: FileTypeFilter,
): boolean {
  if (filter === 'any') return true;
  // Keep folders so you can still navigate while filtering.
  if (entry.type === 'folder') return true;

  const format = entryFormat(entry);

  switch (filter) {
    case 'media':
      return entry.type === 'image' || entry.type === 'video';
    case 'images':
      return entry.type === 'image';
    case 'videos':
      return entry.type === 'video';
    case 'pdf':
      return entry.type === 'file' && format === 'PDF';
    case 'text':
      return entry.type === 'file' && TEXT_FORMATS.has(format);
    case 'document':
      return entry.type === 'file' && DOCUMENT_FORMATS.has(format);
    case 'spreadsheet':
      return entry.type === 'file' && SPREADSHEET_FORMATS.has(format);
    case 'presentation':
      return entry.type === 'file' && PRESENTATION_FORMATS.has(format);
    case 'archive':
      return entry.type === 'file' && ARCHIVE_FORMATS.has(format);
    case 'audio':
      return entry.type === 'file' && AUDIO_FORMATS.has(format);
    case 'other':
      return entry.type === 'file' && !isKnownCommonFile(entry);
    default:
      break;
  }

  if (filter.startsWith('image:')) {
    const key = filter.slice('image:'.length);
    if (!matchesAlias(format, key)) return false;
    return entry.type === 'image' || entry.type === 'file';
  }

  if (filter.startsWith('video:')) {
    const key = filter.slice('video:'.length);
    if (!matchesAlias(format, key)) return false;
    return entry.type === 'video' || entry.type === 'file';
  }

  return true;
}

export function filterEntriesByFileType(
  entries: BrowseEntry[],
  filter: FileTypeFilter,
): BrowseEntry[] {
  if (filter === 'any') return entries;
  return entries.filter((entry) => entryMatchesFileTypeFilter(entry, filter));
}

export function isFileTypeFilter(value: string): value is FileTypeFilter {
  return ALL_FILTER_IDS.has(value);
}

const STORAGE_KEY = 'smb-media-file-type-filter';

export function useFileTypeFilterPreference(): {
  fileTypeFilter: FileTypeFilter;
  setFileTypeFilter: (filter: FileTypeFilter) => void;
} {
  const [fileTypeFilter, setFileTypeFilterState] = useState<FileTypeFilter>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && isFileTypeFilter(stored)) return stored;
    return 'any';
  });

  function setFileTypeFilter(next: FileTypeFilter) {
    setFileTypeFilterState(next);
    localStorage.setItem(STORAGE_KEY, next);
  }

  return { fileTypeFilter, setFileTypeFilter };
}
