import type { CSSProperties } from 'react';

export type FileIconKind =
  | 'pdf'
  | 'word'
  | 'spreadsheet'
  | 'presentation'
  | 'text'
  | 'code'
  | 'archive'
  | 'audio'
  | 'ebook'
  | 'image'
  | 'video'
  | 'generic';

interface FileIconStyle {
  kind: FileIconKind;
  label: string;
  color: string;
}

const STYLE_BY_FORMAT: Record<string, FileIconStyle> = {
  PDF: { kind: 'pdf', label: 'PDF', color: '#e2554a' },

  DOC: { kind: 'word', label: 'DOC', color: '#3b82f6' },
  DOCX: { kind: 'word', label: 'DOCX', color: '#3b82f6' },
  ODT: { kind: 'word', label: 'ODT', color: '#3b82f6' },
  PAGES: { kind: 'word', label: 'PAGES', color: '#3b82f6' },
  RTF: { kind: 'word', label: 'RTF', color: '#3b82f6' },

  XLS: { kind: 'spreadsheet', label: 'XLS', color: '#22a06b' },
  XLSX: { kind: 'spreadsheet', label: 'XLSX', color: '#22a06b' },
  ODS: { kind: 'spreadsheet', label: 'ODS', color: '#22a06b' },
  NUMBERS: { kind: 'spreadsheet', label: 'NUM', color: '#22a06b' },
  CSV: { kind: 'spreadsheet', label: 'CSV', color: '#22a06b' },
  TSV: { kind: 'spreadsheet', label: 'TSV', color: '#22a06b' },

  PPT: { kind: 'presentation', label: 'PPT', color: '#e67e22' },
  PPTX: { kind: 'presentation', label: 'PPTX', color: '#e67e22' },
  ODP: { kind: 'presentation', label: 'ODP', color: '#e67e22' },
  KEY: { kind: 'presentation', label: 'KEY', color: '#e67e22' },

  TXT: { kind: 'text', label: 'TXT', color: '#94a3b8' },
  MD: { kind: 'text', label: 'MD', color: '#94a3b8' },
  MARKDOWN: { kind: 'text', label: 'MD', color: '#94a3b8' },
  MDOWN: { kind: 'text', label: 'MD', color: '#94a3b8' },
  MKD: { kind: 'text', label: 'MD', color: '#94a3b8' },
  TEX: { kind: 'text', label: 'TEX', color: '#94a3b8' },
  LATEX: { kind: 'text', label: 'TEX', color: '#94a3b8' },
  LTX: { kind: 'text', label: 'TEX', color: '#94a3b8' },
  LOG: { kind: 'text', label: 'LOG', color: '#94a3b8' },

  XLSM: { kind: 'spreadsheet', label: 'XLSM', color: '#22a06b' },
  XLSB: { kind: 'spreadsheet', label: 'XLSB', color: '#22a06b' },

  JSON: { kind: 'code', label: 'JSON', color: '#a78bfa' },
  XML: { kind: 'code', label: 'XML', color: '#a78bfa' },
  YAML: { kind: 'code', label: 'YAML', color: '#a78bfa' },
  YML: { kind: 'code', label: 'YML', color: '#a78bfa' },
  HTML: { kind: 'code', label: 'HTML', color: '#a78bfa' },
  HTM: { kind: 'code', label: 'HTML', color: '#a78bfa' },
  CSS: { kind: 'code', label: 'CSS', color: '#a78bfa' },
  JS: { kind: 'code', label: 'JS', color: '#a78bfa' },
  TS: { kind: 'code', label: 'TS', color: '#a78bfa' },

  ZIP: { kind: 'archive', label: 'ZIP', color: '#c9a227' },
  RAR: { kind: 'archive', label: 'RAR', color: '#c9a227' },
  '7Z': { kind: 'archive', label: '7Z', color: '#c9a227' },
  TAR: { kind: 'archive', label: 'TAR', color: '#c9a227' },
  GZ: { kind: 'archive', label: 'GZ', color: '#c9a227' },
  TGZ: { kind: 'archive', label: 'TGZ', color: '#c9a227' },
  BZ2: { kind: 'archive', label: 'BZ2', color: '#c9a227' },
  XZ: { kind: 'archive', label: 'XZ', color: '#c9a227' },

  MP3: { kind: 'audio', label: 'MP3', color: '#c084fc' },
  AAC: { kind: 'audio', label: 'AAC', color: '#c084fc' },
  M4A: { kind: 'audio', label: 'M4A', color: '#c084fc' },
  WAV: { kind: 'audio', label: 'WAV', color: '#c084fc' },
  FLAC: { kind: 'audio', label: 'FLAC', color: '#c084fc' },
  OGG: { kind: 'audio', label: 'OGG', color: '#c084fc' },
  OPUS: { kind: 'audio', label: 'OPUS', color: '#c084fc' },
  WMA: { kind: 'audio', label: 'WMA', color: '#c084fc' },
  AIFF: { kind: 'audio', label: 'AIFF', color: '#c084fc' },

  EPUB: { kind: 'ebook', label: 'EPUB', color: '#14b8a6' },

  JPG: { kind: 'image', label: 'JPG', color: '#38bdf8' },
  JPEG: { kind: 'image', label: 'JPG', color: '#38bdf8' },
  PNG: { kind: 'image', label: 'PNG', color: '#38bdf8' },
  GIF: { kind: 'image', label: 'GIF', color: '#38bdf8' },
  WEBP: { kind: 'image', label: 'WEBP', color: '#38bdf8' },
  BMP: { kind: 'image', label: 'BMP', color: '#38bdf8' },
  TIF: { kind: 'image', label: 'TIF', color: '#38bdf8' },
  TIFF: { kind: 'image', label: 'TIFF', color: '#38bdf8' },
  HEIC: { kind: 'image', label: 'HEIC', color: '#38bdf8' },
  HEIF: { kind: 'image', label: 'HEIF', color: '#38bdf8' },
  AVIF: { kind: 'image', label: 'AVIF', color: '#38bdf8' },

  MP4: { kind: 'video', label: 'MP4', color: '#f472b6' },
  M4V: { kind: 'video', label: 'M4V', color: '#f472b6' },
  MOV: { kind: 'video', label: 'MOV', color: '#f472b6' },
  MKV: { kind: 'video', label: 'MKV', color: '#f472b6' },
  AVI: { kind: 'video', label: 'AVI', color: '#f472b6' },
  WEBM: { kind: 'video', label: 'WEBM', color: '#f472b6' },
  WMV: { kind: 'video', label: 'WMV', color: '#f472b6' },
  MPEG: { kind: 'video', label: 'MPEG', color: '#f472b6' },
  MPG: { kind: 'video', label: 'MPG', color: '#f472b6' },
};

function styleForFormat(format?: string): FileIconStyle {
  const key = (format ?? '').toUpperCase();
  if (key && STYLE_BY_FORMAT[key]) return STYLE_BY_FORMAT[key];
  if (key) {
    return {
      kind: 'generic',
      label: key.length > 4 ? key.slice(0, 4) : key,
      color: '#7dd3fc',
    };
  }
  return { kind: 'generic', label: 'FILE', color: '#7dd3fc' };
}

function Glyph({ kind }: { kind: FileIconKind }) {
  switch (kind) {
    case 'spreadsheet':
      return (
        <g fill="currentColor" opacity="0.92">
          <rect x="9" y="13" width="14" height="10" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <path d="M9 16.5h14M9 19.5h14M13.5 13v10M18.5 13v10" stroke="currentColor" strokeWidth="1.2" fill="none" />
        </g>
      );
    case 'presentation':
      return (
        <g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
          <rect x="9" y="12.5" width="14" height="9" rx="1.2" />
          <path d="M16 21.5v2.5M13 24h6" strokeLinecap="round" />
          <path d="M12 17.5h4.5l2.5-3v6" fill="currentColor" stroke="none" opacity="0.9" />
        </g>
      );
    case 'audio':
      return (
        <g fill="currentColor">
          <path d="M14 12.5v9.2c0 1.3-1.2 2.3-2.6 2.3S9 23 9 21.7s1-2.2 2.4-2.2c.4 0 .8.1 1.1.2v-5.6l8-1.6v7.4c0 1.3-1.2 2.3-2.6 2.3s-2.4-1-2.4-2.3 1-2.2 2.4-2.2c.4 0 .8.1 1.1.2V12l-5 .9z" />
        </g>
      );
    case 'archive':
      return (
        <g fill="currentColor">
          <path d="M15 11h2v2h-2zm0 2h2v2h-2zm0 2h2v2h-2zm0 2h2v2h-2zm0 2h2v2h-2z" opacity="0.95" />
          <rect x="14.2" y="21.5" width="3.6" height="2.2" rx="0.4" />
        </g>
      );
    case 'code':
      return (
        <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M13 15.5 10.5 18 13 20.5" />
          <path d="M19 15.5 21.5 18 19 20.5" />
          <path d="M17.2 14.5 14.8 21.5" />
        </g>
      );
    case 'ebook':
      return (
        <g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
          <path d="M10 13.5c2.2-1 4.2-1 6 0v9c-1.8-1-3.8-1-6 0z" />
          <path d="M16 13.5c2.2-1 4.2-1 6 0v9c-1.8-1-3.8-1-6 0z" />
        </g>
      );
    case 'image':
      return (
        <g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
          <rect x="10" y="13" width="12" height="10" rx="1.2" />
          <circle cx="13.5" cy="16.2" r="1.2" fill="currentColor" stroke="none" />
          <path d="M10.5 21.5 14 18.2l2.2 2.1 2.3-2.8 3.5 4" />
        </g>
      );
    case 'video':
      return (
        <g fill="currentColor">
          <rect x="9.5" y="13.5" width="10" height="9" rx="1.2" />
          <path d="M20 15.2 24 13.2v10l-4-2z" />
        </g>
      );
    case 'pdf':
    case 'word':
    case 'text':
    case 'generic':
    default:
      return (
        <g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
          <path d="M12 15.5h8M12 18.5h8M12 21.5h5.5" />
        </g>
      );
  }
}

interface FileTypeIconProps {
  format?: string;
  className?: string;
}

export function FileTypeIcon({ format, className }: FileTypeIconProps) {
  const style = styleForFormat(format);
  const labelSize = style.label.length > 3 ? 6.2 : 7.2;

  return (
    <div
      className={['file-type-icon', `file-type-icon--${style.kind}`, className]
        .filter(Boolean)
        .join(' ')}
      style={{ '--file-icon-color': style.color } as CSSProperties}
      aria-hidden
    >
      <svg viewBox="0 0 32 36" className="file-type-icon-svg" role="img">
        <path
          className="file-type-icon-body"
          d="M6 2.5h13.2L26 9.3V33a1.5 1.5 0 0 1-1.5 1.5h-17A1.5 1.5 0 0 1 6 33V2.5z"
        />
        <path className="file-type-icon-fold" d="M19.2 2.5V8a1.3 1.3 0 0 0 1.3 1.3H26" />
        <Glyph kind={style.kind} />
        <rect
          className="file-type-icon-badge"
          x="5"
          y="4.2"
          width="14.5"
          height="7.2"
          rx="1.4"
        />
        <text
          className="file-type-icon-label"
          x="12.25"
          y="9.35"
          textAnchor="middle"
          fontSize={labelSize}
          fontWeight="700"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
        >
          {style.label}
        </text>
      </svg>
    </div>
  );
}
