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
  showGridDetails: boolean;
  className?: string;
  style?: CSSProperties;
  'aria-busy'?: boolean;
  gridRef?: Ref<HTMLDivElement>;
  renderCard: (entry: BrowseEntry, index: number) => ReactNode;
}

const DESKTOP_MIN_COL = 180;
const DESKTOP_GAP = 16;
const OVERSCAN_ROWS = 2;

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

  // Square thumb fills the content box; padding + optional meta sit around it.
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

  // Column / density changes invalidate cached row measurements.
  useLayoutEffect(() => {
    virtualizer.measure();
  }, [virtualizer, columns, showGridDetails, estimatedSize, isMobile]);

  const measureRef = useCallback(
    (element: HTMLDivElement | null) => {
      if (element) virtualizer.measureElement(element);
    },
    [virtualizer],
  );

  // Small folders: skip virtualization overhead, keep prior CSS grid/flex behavior.
  if (entries.length < 80) {
    return (
      <div ref={setRefs} className={className} style={style} aria-busy={ariaBusy}>
        {entries.map((entry, index) => renderCard(entry, index))}
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
        style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}
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
