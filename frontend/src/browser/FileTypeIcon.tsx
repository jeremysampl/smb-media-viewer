import {
  getDisplayFileKind,
  getExtension,
  getFormatLabel,
  type DisplayFileKind,
} from '@smb/file-types';
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

const COLOR_BY_ICON: Record<FileIconKind, string> = {
  pdf: '#e2554a',
  word: '#3b82f6',
  spreadsheet: '#22a06b',
  presentation: '#e67e22',
  text: '#94a3b8',
  code: '#a78bfa',
  archive: '#c9a227',
  audio: '#7dd3fc',
  ebook: '#14b8a6',
  image: '#38bdf8',
  video: '#f472b6',
  generic: '#7dd3fc',
};

/** Formats without a viewer (archives, etc.) */
const ARCHIVE_EXTENSIONS = new Set([
  '.zip',
  '.rar',
  '.7z',
  '.tar',
  '.gz',
  '.tgz',
  '.bz2',
  '.xz',
]);

const EBOOK_EXTENSIONS = new Set(['.epub']);

const PRESENTATION_EXTENSIONS = new Set(['.ppt', '.pptx', '.odp', '.key']);

function iconKindForDisplay(
  display: DisplayFileKind,
  filename: string,
): FileIconKind {
  switch (display) {
    case 'image':
      return 'image';
    case 'video':
      return 'video';
    case 'pdf':
      return 'pdf';
    case 'spreadsheet':
      return 'spreadsheet';
    case 'audio':
      return 'audio';
    case 'code':
      return 'code';
    case 'text':
    case 'markdown':
    case 'latex':
      return 'text';
    case 'office':
      return PRESENTATION_EXTENSIONS.has(getExtension(filename))
        ? 'presentation'
        : 'word';
    case 'file':
    default: {
      const ext = getExtension(filename);
      if (ARCHIVE_EXTENSIONS.has(ext)) return 'archive';
      if (EBOOK_EXTENSIONS.has(ext)) return 'ebook';
      if (PRESENTATION_EXTENSIONS.has(ext)) return 'presentation';
      return 'generic';
    }
  }
}

function styleForFile(filename: string, formatHint?: string): FileIconStyle {
  const display = getDisplayFileKind(filename);
  const kind = iconKindForDisplay(display, filename);
  const label =
    formatHint?.trim() ||
    getFormatLabel(filename) ||
    (kind === 'generic' ? 'FILE' : kind.toUpperCase());
  return {
    kind,
    label: label.length > 4 ? label.slice(0, 4) : label,
    color: COLOR_BY_ICON[kind],
  };
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

/** Document body top-left in the icon viewBox (matches the body path). */
const DOC_LEFT = 6;
const DOC_TOP = 3.5;
/** Flat top edge ends where the fold begins. */
const DOC_FOLD_X = 20.25;
/** Half of `.file-type-icon-body` stroke-width; covers the rim so the badge is flush. */
const BODY_STROKE_OUTSET = 1.35 / 2;
/** Fixed badge box: flush top/left, extends to the fold, consistent bottom/right. */
const BADGE_WIDTH = DOC_FOLD_X - DOC_LEFT + BODY_STROKE_OUTSET;
const BADGE_HEIGHT = 7.13;
const BADGE_PAD_X = 1.2;
const BADGE_PAD_Y = 0.8;
const BADGE_INNER_RADIUS = 0;
/** Approximate advance width for bold condensed caps. */
const CHAR_WIDTH_EM = 0.58;

function badgeLayout(label: string) {
  const len = Math.max(label.length, 1);
  const x = DOC_LEFT - BODY_STROKE_OUTSET;
  const y = DOC_TOP - BODY_STROKE_OUTSET;

  const innerW = BADGE_WIDTH - BADGE_PAD_X * 2;
  const innerH = BADGE_HEIGHT - BADGE_PAD_Y * 2 - BODY_STROKE_OUTSET;
  // Fit height first, then shrink so the natural glyph width stays inside the pad.
  const fontSize = Math.min(innerH, innerW / (len * CHAR_WIDTH_EM));

  return {
    x,
    y,
    width: BADGE_WIDTH,
    height: BADGE_HEIGHT,
    fontSize,
    textX: x + BADGE_WIDTH / 2,
    // Optical center within the visible badge (below the stroke-cover strip).
    textY: y + BODY_STROKE_OUTSET + (BADGE_HEIGHT - BODY_STROKE_OUTSET) * 0.35,
  };
}

/** Square on the document edges; rounded only on the inner bottom-right. */
function badgePath(x: number, y: number, w: number, h: number, r: number): string {
  const radius = Math.min(r, w / 2, h / 2);
  return [
    `M${x} ${y}`,
    `h${w}`,
    `v${h - radius}`,
    `a${radius} ${radius} 0 0 1 ${-radius} ${radius}`,
    `H${x}`,
    'z',
  ].join('');
}

interface FileTypeIconProps {
  /** Path or filename for classification */
  filename?: string;
  /** Format label override from browse API */
  format?: string;
  className?: string;
}

export function FileTypeIcon({ filename, format, className }: FileTypeIconProps) {
  const style = styleForFile(filename || format || '', format);
  const badge = badgeLayout(style.label);

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
        <path
          className="file-type-icon-badge"
          d={badgePath(badge.x, badge.y, badge.width, badge.height, BADGE_INNER_RADIUS)}
        />
        <text
          className="file-type-icon-label"
          x={badge.textX}
          y={badge.textY}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={badge.fontSize}
          fontWeight="700"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
        >
          {style.label}
        </text>
      </svg>
    </div>
  );
}
