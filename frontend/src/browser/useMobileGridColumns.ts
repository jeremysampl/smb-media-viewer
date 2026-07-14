import { useCallback, useEffect, useRef, useState } from 'react';
import { touchDistance } from '../gallery/mobileImageZoom';

const STORAGE_KEY = 'smb-media-grid-columns';
export const MIN_GRID_COLUMNS = 2;
export const MAX_GRID_COLUMNS = 6;
export const DEFAULT_GRID_COLUMNS = 3;

function clampColumns(value: number) {
  return Math.min(MAX_GRID_COLUMNS, Math.max(MIN_GRID_COLUMNS, value));
}

function readStoredColumns() {
  const stored = Number(localStorage.getItem(STORAGE_KEY));
  if (!Number.isFinite(stored)) return DEFAULT_GRID_COLUMNS;
  return Math.round(clampColumns(stored));
}

export function gapForColumns(columns: number) {
  const t = (columns - MIN_GRID_COLUMNS) / (MAX_GRID_COLUMNS - MIN_GRID_COLUMNS);
  return 12 - t * 8;
}

export function paddingForColumns(columns: number) {
  const t = (columns - MIN_GRID_COLUMNS) / (MAX_GRID_COLUMNS - MIN_GRID_COLUMNS);
  return 0.75 - t * 0.45;
}

interface PinchStart {
  distance: number;
  columns: number;
}

export function useMobileGridColumns(enabled: boolean) {
  const [gridEl, setGridEl] = useState<HTMLDivElement | null>(null);
  const [columns, setColumns] = useState(readStoredColumns);
  const [isPinching, setIsPinching] = useState(false);
  const columnsRef = useRef(columns);
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
    grid.style.setProperty('--cols', String(clamped));
    grid.style.setProperty('--gap', `${gapForColumns(clamped)}px`);
    grid.style.setProperty('--card-padding', `${paddingForColumns(clamped)}rem`);
  }, [gridEl]);

  const commitColumns = useCallback((next: number) => {
    const snapped = Math.round(clampColumns(next));
    setColumns(snapped);
    columnsRef.current = snapped;
    localStorage.setItem(STORAGE_KEY, String(snapped));
    applyVisualColumns(snapped);
  }, [applyVisualColumns]);

  useEffect(() => {
    if (!enabled || !gridEl) return;
    applyVisualColumns(columnsRef.current, gridEl);
  }, [enabled, gridEl, applyVisualColumns]);

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
      // Pinch out → fewer columns (zoom in); pinch in → more columns
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

      const currentCols = Number(gridEl.style.getPropertyValue('--cols')) || pinch.columns;
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
