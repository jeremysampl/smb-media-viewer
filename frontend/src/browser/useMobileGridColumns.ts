import { useCallback, useEffect, useRef, useState } from 'react';
import { touchDistance } from '../gallery/mobileImageZoom';

const STORAGE_OFFSET_PORTRAIT = 'smb-media-grid-offset-portrait';
const STORAGE_OFFSET_LANDSCAPE = 'smb-media-grid-offset-landscape';
const STORAGE_VERSION_KEY = 'smb-media-grid-columns-v';
/** v4: density is suggested(width) + offset (fixes landscape/tablet stuck at 2). */
const STORAGE_VERSION = '4';

export const MIN_GRID_COLUMNS = 2;
export const MAX_GRID_COLUMNS = 12;
export const DEFAULT_GRID_COLUMNS = 3;

/** Target thumb size; landscape uses a slightly tighter value. */
const TARGET_THUMB_PORTRAIT_PX = 118;
const TARGET_THUMB_LANDSCAPE_PX = 112;

function clampColumns(value: number) {
  return Math.min(MAX_GRID_COLUMNS, Math.max(MIN_GRID_COLUMNS, value));
}

function clampOffset(value: number) {
  return Math.min(6, Math.max(-4, Math.round(value)));
}

function isLandscapeViewport() {
  return window.innerWidth > window.innerHeight;
}

/** Phones (vs tablets): use the shorter viewport side. */
export function isPhoneViewport(
  width = window.innerWidth,
  height = window.innerHeight,
) {
  return Math.min(width, height) < 520;
}

function ensureStorageVersion() {
  if (localStorage.getItem(STORAGE_VERSION_KEY) === STORAGE_VERSION) return;
  // Drop legacy absolute column keys so devices reseed from width.
  for (const key of [
    'smb-media-grid-columns',
    'smb-media-grid-columns-portrait',
    'smb-media-grid-columns-landscape',
    STORAGE_OFFSET_PORTRAIT,
    STORAGE_OFFSET_LANDSCAPE,
  ]) {
    localStorage.removeItem(key);
  }
  localStorage.setItem(STORAGE_VERSION_KEY, STORAGE_VERSION);
}

function offsetStorageKey(landscape: boolean) {
  return landscape ? STORAGE_OFFSET_LANDSCAPE : STORAGE_OFFSET_PORTRAIT;
}

function readOffset(landscape: boolean): number {
  ensureStorageVersion();
  const raw = Number(localStorage.getItem(offsetStorageKey(landscape)));
  if (!Number.isFinite(raw)) return 0;
  return clampOffset(raw);
}

function writeOffset(landscape: boolean, offset: number) {
  localStorage.setItem(offsetStorageKey(landscape), String(clampOffset(offset)));
}

/** Columns that fit the viewport at a comfortable thumb size. */
export function suggestedColumnsForWidth(
  width = window.innerWidth,
  height = window.innerHeight,
): number {
  const landscape = width > height;
  const target = landscape ? TARGET_THUMB_LANDSCAPE_PX : TARGET_THUMB_PORTRAIT_PX;
  const available = Math.max(0, width - 12);
  return clampColumns(Math.max(MIN_GRID_COLUMNS, Math.round(available / target)));
}

function columnsFromOffset(
  offset: number,
  width = window.innerWidth,
  height = window.innerHeight,
) {
  return clampColumns(suggestedColumnsForWidth(width, height) + offset);
}

export function gapForColumns(columns: number) {
  const t = (columns - MIN_GRID_COLUMNS) / (MAX_GRID_COLUMNS - MIN_GRID_COLUMNS);
  const base = 12 - t * 8;
  if (typeof window !== 'undefined' && isPhoneViewport()) {
    return Math.max(2, base * 0.4);
  }
  return base;
}

export function paddingForColumns(columns: number) {
  const t = (columns - MIN_GRID_COLUMNS) / (MAX_GRID_COLUMNS - MIN_GRID_COLUMNS);
  const base = 0.75 - t * 0.45;
  if (typeof window !== 'undefined' && isPhoneViewport()) {
    return Math.max(0.06, base * 0.28);
  }
  return base;
}

interface PinchStart {
  distance: number;
  columns: number;
}

export function useMobileGridColumns(enabled: boolean) {
  const [gridEl, setGridEl] = useState<HTMLDivElement | null>(null);
  const [columns, setColumns] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_GRID_COLUMNS;
    return columnsFromOffset(readOffset(isLandscapeViewport()));
  });
  const [isPinching, setIsPinching] = useState(false);

  const columnsRef = useRef(columns);
  const offsetRef = useRef(
    typeof window === 'undefined' ? 0 : readOffset(isLandscapeViewport()),
  );
  const landscapeRef = useRef(
    typeof window === 'undefined' ? false : isLandscapeViewport(),
  );
  const pinchRef = useRef<PinchStart | null>(null);
  const suppressClickRef = useRef(false);

  columnsRef.current = columns;

  const gridRef = useCallback((node: HTMLDivElement | null) => {
    setGridEl(node);
  }, []);

  const applyVisualColumns = useCallback((next: number, element?: HTMLDivElement | null) => {
    const grid = element ?? gridEl;
    if (!grid) return;
    const clamped = clampColumns(next);
    // Needs an integer string for CSS repeat(var(--cols), ...).
    grid.style.setProperty('--cols', String(Math.round(clamped * 1000) / 1000));
    grid.style.setProperty('--gap', `${gapForColumns(clamped)}px`);
    grid.style.setProperty('--card-padding', `${paddingForColumns(clamped)}rem`);
  }, [gridEl]);

  const commitColumns = useCallback((next: number) => {
    const snapped = Math.round(clampColumns(next));
    const suggested = suggestedColumnsForWidth();
    const nextOffset = clampOffset(snapped - suggested);
    offsetRef.current = nextOffset;
    writeOffset(landscapeRef.current, nextOffset);

    setColumns(snapped);
    columnsRef.current = snapped;
    applyVisualColumns(snapped);
  }, [applyVisualColumns]);

  const resyncToViewport = useCallback(() => {
    const landscape = isLandscapeViewport();
    if (landscape !== landscapeRef.current) {
      landscapeRef.current = landscape;
      offsetRef.current = readOffset(landscape);
    }
    const next = columnsFromOffset(offsetRef.current);
    setColumns(next);
    columnsRef.current = next;
    applyVisualColumns(next);
  }, [applyVisualColumns]);

  useEffect(() => {
    if (!enabled || !gridEl) return;
    applyVisualColumns(columnsRef.current, gridEl);
  }, [enabled, gridEl, applyVisualColumns]);

  useEffect(() => {
    if (!enabled) return undefined;

    resyncToViewport();

    const onResize = () => {
      if (pinchRef.current) return;
      resyncToViewport();
    };

    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, [enabled, resyncToViewport]);

  useEffect(() => {
    if (!gridEl || !enabled) return undefined;

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 2) return;
      const t1 = event.touches[0];
      const t2 = event.touches[1];
      if (!t1 || !t2) return;

      suppressClickRef.current = false;
      pinchRef.current = {
        distance: touchDistance(t1, t2),
        columns: columnsRef.current,
      };
      setIsPinching(true);
      gridEl.classList.add('is-pinching');
    };

    const onTouchMove = (event: TouchEvent) => {
      const pinch = pinchRef.current;
      if (!pinch || event.touches.length < 2) return;

      const t1 = event.touches[0];
      const t2 = event.touches[1];
      if (!t1 || !t2 || pinch.distance <= 0) return;

      event.preventDefault();
      const scale = touchDistance(t1, t2) / pinch.distance;
      const next = pinch.columns / scale;
      if (Math.abs(next - pinch.columns) > 0.08) {
        suppressClickRef.current = true;
      }
      applyVisualColumns(next, gridEl);
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (!pinchRef.current) return;
      if (event.touches.length >= 2) return;

      const pinch = pinchRef.current;
      pinchRef.current = null;
      setIsPinching(false);
      gridEl.classList.remove('is-pinching');

      const raw = Number(gridEl.style.getPropertyValue('--cols'));
      const currentCols = Number.isFinite(raw) && raw > 0 ? raw : pinch.columns;
      commitColumns(currentCols);

      if (suppressClickRef.current) {
        window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 320);
      }
    };

    gridEl.addEventListener('touchstart', onTouchStart, { passive: true });
    gridEl.addEventListener('touchmove', onTouchMove, { passive: false });
    gridEl.addEventListener('touchend', onTouchEnd);
    gridEl.addEventListener('touchcancel', onTouchEnd);

    return () => {
      gridEl.removeEventListener('touchstart', onTouchStart);
      gridEl.removeEventListener('touchmove', onTouchMove);
      gridEl.removeEventListener('touchend', onTouchEnd);
      gridEl.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [enabled, gridEl, applyVisualColumns, commitColumns]);

  const shouldSuppressClick = useCallback(() => suppressClickRef.current, []);

  return {
    gridRef,
    columns,
    isPinching,
    shouldSuppressClick,
  };
}
