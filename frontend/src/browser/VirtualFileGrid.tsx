import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { BrowseEntry } from '../types';
import { gapForColumns } from './useMobileGridColumns';

interface VirtualFileGridProps {
  entries: BrowseEntry[];
  isMobile: boolean;
  mobileColumns: number;
  /** During pinch, show a CSS flex preview instead of reflowing the virtualizer. */
  isPinching?: boolean;
  showGridDetails: boolean;
  className?: string;
  style?: CSSProperties;
  'aria-busy'?: boolean;
  gridRef?: Ref<HTMLDivElement>;
  renderCard: (entry: BrowseEntry, index: number) => ReactNode;
}

const DESKTOP_MIN_COL = 180;
const DESKTOP_GAP = 16;
const OVERSCAN_ROWS = 1;
const VIRTUALIZE_AFTER = 48;
/** Extra rows of items kept around the viewport for pinch reflow. */
const PINCH_ROW_BUFFER = 3;

function estimateRowHeight(
  gridWidth: number,
  columns: number,
  gap: number,
  showDetails: boolean,
  isMobile: boolean,
): number {
  const colWidth =
    gridWidth > 0
      ? Math.max(1, (gridWidth - gap * (columns - 1)) / columns)
      : isMobile
        ? 110
        : DESKTOP_MIN_COL;

  const pad = isMobile ? (showDetails ? 12 : 4) : showDetails ? 12 : 6;
  const meta = showDetails ? (isMobile ? 26 : 34) : 0;
  const gapInside = showDetails ? (isMobile ? 6 : 10) : 0;
  const content = Math.max(1, colWidth - pad * 2);
  return content + pad * 2 + gapInside + meta;
}

export function VirtualFileGrid({
  entries,
  isMobile,
  mobileColumns,
  isPinching = false,
  showGridDetails,
  className,
  style,
  'aria-busy': ariaBusy,
  gridRef,
  renderCard,
}: VirtualFileGridProps) {
  const localRef = useRef<HTMLDivElement | null>(null);
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null);
  const [width, setWidth] = useState(0);
  const pinchSliceRef = useRef<{ start: number; end: number; top: number } | null>(
    null,
  );
  const [pinchSlice, setPinchSlice] = useState<{
    start: number;
    end: number;
    top: number;
  } | null>(null);

  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      localRef.current = node;
      if (typeof gridRef === 'function') gridRef(node);
      else if (gridRef && 'current' in gridRef) {
        (gridRef as { current: HTMLDivElement | null }).current = node;
      }
    },
    [gridRef],
  );

  useEffect(() => {
    setScrollElement(document.documentElement);
  }, []);

  useLayoutEffect(() => {
    const node = localRef.current;
    if (!node) return undefined;

    const update = () => setWidth(node.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [entries.length]);

  const columns = useMemo(() => {
    if (isMobile) return Math.max(1, Math.round(mobileColumns));
    if (width <= 0) return 1;
    return Math.max(1, Math.floor((width + DESKTOP_GAP) / (DESKTOP_MIN_COL + DESKTOP_GAP)));
  }, [isMobile, mobileColumns, width]);

  const rowGap = isMobile ? gapForColumns(columns) : DESKTOP_GAP;
  const rowCount = Math.max(1, Math.ceil(entries.length / columns));
  const estimatedSize = estimateRowHeight(
    width,
    columns,
    rowGap,
    showGridDetails,
    isMobile,
  );

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollElement,
    estimateSize: () => estimatedSize,
    gap: rowGap,
    overscan: OVERSCAN_ROWS,
  });

  // Capture a window of items when a pinch starts so --cols can reflow them via CSS.
  useLayoutEffect(() => {
    if (!isPinching) {
      pinchSliceRef.current = null;
      setPinchSlice(null);
      return;
    }
    if (pinchSliceRef.current) return;

    const visible = virtualizer.getVirtualItems();
    if (visible.length === 0) {
      const top = window.scrollY;
      const approxRows = Math.ceil(window.innerHeight / Math.max(1, estimatedSize)) + 2;
      const startRow = Math.max(0, Math.floor(top / Math.max(1, estimatedSize + rowGap)));
      const start = Math.max(0, startRow * columns);
      const end = Math.min(entries.length, start + approxRows * columns);
      const slice = { start, end, top: startRow * (estimatedSize + rowGap) };
      pinchSliceRef.current = slice;
      setPinchSlice(slice);
      return;
    }

    const firstRow = visible[0].index;
    const lastRow = visible[visible.length - 1].index;
    const startRow = Math.max(0, firstRow - PINCH_ROW_BUFFER);
    const endRow = Math.min(rowCount - 1, lastRow + PINCH_ROW_BUFFER);
    const slice = {
      start: startRow * columns,
      end: Math.min(entries.length, (endRow + 1) * columns),
      top: visible[0].start - (firstRow - startRow) * (estimatedSize + rowGap),
    };
    slice.top = Math.max(0, slice.top);
    pinchSliceRef.current = slice;
    setPinchSlice(slice);
  }, [
    isPinching,
    virtualizer,
    columns,
    entries.length,
    estimatedSize,
    rowGap,
    rowCount,
  ]);

  useLayoutEffect(() => {
    if (isPinching) return;
    virtualizer.measure();
  }, [virtualizer, columns, showGridDetails, estimatedSize, isMobile, isPinching]);

  const measureRef = useCallback(
    (element: HTMLDivElement | null) => {
      if (isPinching) return;
      if (element) virtualizer.measureElement(element);
    },
    [virtualizer, isPinching],
  );

  // Small folders: skip virtualization overhead, keep prior CSS grid/flex behavior.
  if (entries.length < VIRTUALIZE_AFTER) {
    return (
      <div ref={setRefs} className={className} style={style} aria-busy={ariaBusy}>
        {entries.map((entry, index) => renderCard(entry, index))}
      </div>
    );
  }

  const totalSize = virtualizer.getTotalSize();

  // Large folders during pinch: only reflow a viewport-sized CSS flex slice.
  if (isMobile && isPinching && pinchSlice) {
    const sliceEntries = entries.slice(pinchSlice.start, pinchSlice.end);
    return (
      <div
        ref={setRefs}
        className={`${className ?? ''} file-grid-virtual file-grid-pinch-mode`.trim()}
        style={style}
        aria-busy={ariaBusy}
      >
        <div
          className="file-grid-virtual-inner"
          style={{ height: totalSize, position: 'relative', width: '100%' }}
        >
          <div
            className="file-grid-pinch-preview"
            style={{ top: pinchSlice.top }}
          >
            {sliceEntries.map((entry, offset) =>
              renderCard(entry, pinchSlice.start + offset),
            )}
          </div>
        </div>
      </div>
    );
  }

  const virtualRows = virtualizer.getVirtualItems();

  return (
    <div
      ref={setRefs}
      className={`${className ?? ''} file-grid-virtual`.trim()}
      style={style}
      aria-busy={ariaBusy}
    >
      <div
        className="file-grid-virtual-inner"
        style={{ height: totalSize, position: 'relative', width: '100%' }}
      >
        {virtualRows.map((virtualRow) => {
          const start = virtualRow.index * columns;
          const rowEntries = entries.slice(start, start + columns);
          return (
            <div
              key={virtualRow.key}
              ref={measureRef}
              data-index={virtualRow.index}
              className={`file-grid-virtual-row${isMobile ? ' is-mobile' : ''}`}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
                display: 'grid',
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                gap: isMobile ? 'var(--gap, 8px)' : DESKTOP_GAP,
                contentVisibility: 'auto',
                containIntrinsicSize: `auto ${virtualRow.size}px`,
              }}
            >
              {rowEntries.map((entry, offset) => renderCard(entry, start + offset))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
