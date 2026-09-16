import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  restrictToVerticalAxis,
  restrictToFirstScrollableAncestor,
} from '@dnd-kit/modifiers';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useVirtualizer } from '@tanstack/react-virtual';
import { LazyThumbnail } from '../browser/LazyThumbnail';
import { MediaGallery } from '../gallery/MediaGallery';
import { useIsMobile } from '../hooks/useIsMobile';
import type { BrowseEntry } from '../types';
import { Button, Modal, Slider, Toggle } from '../ui';
import type { CastItem, CastSettings } from './types';

interface CastSetupDialogProps {
  open: boolean;
  connected: boolean;
  loading: boolean;
  error: string;
  status?: string;
  items: CastItem[];
  settings: CastSettings;
  mediaOrigin: string;
  mediaOriginCandidates: string[];
  showMediaOriginField: boolean;
  onMediaOriginChange: (origin: string) => void;
  onSettingsChange: (settings: CastSettings) => void;
  onItemsChange: (items: CastItem[]) => void;
  onDismissError?: () => void;
  onClose: () => void;
  onApply: () => void;
}

const QUEUE_ITEM_ESTIMATE = 58;
const QUEUE_ITEM_GAP = 8;
const VIRTUALIZE_AFTER = 36;
const QUEUE_OVERSCAN = 12;

function folderPath(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const idx = normalized.lastIndexOf('/');
  if (idx <= 0) return normalized || '/';
  return normalized.slice(0, idx);
}

function castItemsToBrowseEntries(items: CastItem[]): BrowseEntry[] {
  return items.map((item) => ({
    path: item.path,
    name: item.name,
    type: item.kind,
    token: item.mediaToken,
    thumbnailUrl: item.thumbnailUrl,
  }));
}

function CastQueueItemContent({
  item,
  layoutKey,
  dragHandleProps,
  onRemove,
  onView,
}: {
  item: CastItem;
  layoutKey: string | number;
  dragHandleProps?: Record<string, unknown>;
  onRemove?: () => void;
  onView?: () => void;
}) {
  const folder = folderPath(item.path);
  return (
    <>
      <button
        type="button"
        className="cast-queue-handle"
        aria-label={`Move ${item.name}`}
        {...dragHandleProps}
      >
        <span aria-hidden>☰</span>
      </button>
      <button
        type="button"
        className="cast-queue-thumb"
        aria-label={`View ${item.name}`}
        onClick={onView}
      >
        <LazyThumbnail
          src={item.thumbnailUrl}
          alt=""
          bufferRows={2}
          layoutKey={layoutKey}
        />
      </button>
      <div className="cast-queue-item__meta">
        <span className="cast-queue-item__name" title={item.name}>{item.name}</span>
        <span className="cast-queue-item__path" title={folder}>{folder}</span>
      </div>
      {onRemove ? (
        <button
          type="button"
          className="cast-queue-remove"
          aria-label={`Remove ${item.name}`}
          onClick={onRemove}
        >
          ×
        </button>
      ) : (
        <span className="cast-queue-remove" aria-hidden />
      )}
    </>
  );
}

function SortableCastItem({
  item,
  index,
  layoutKey,
  virtualStart,
  measureRef,
  onRemove,
  onView,
}: {
  item: CastItem;
  index: number;
  layoutKey: string | number;
  virtualStart?: number;
  measureRef?: (node: HTMLElement | null) => void;
  onRemove: () => void;
  onView: () => void;
}) {
  const sortable = useSortable({ id: item.path });
  const transform = sortable.transform
    ? { ...sortable.transform, x: 0 }
    : null;

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.35 : 1,
    ...(virtualStart !== undefined
      ? {
          position: 'absolute',
          top: virtualStart,
          left: 0,
          width: '100%',
        }
      : null),
  };

  return (
    <li
      ref={(node) => {
        sortable.setNodeRef(node);
        measureRef?.(node);
      }}
      className="cast-queue-item"
      data-index={index}
      style={style}
    >
      <CastQueueItemContent
        item={item}
        layoutKey={layoutKey}
        dragHandleProps={{ ...sortable.attributes, ...sortable.listeners }}
        onRemove={onRemove}
        onView={onView}
      />
    </li>
  );
}

function CastQueueList({
  items,
  open,
  onItemsChange,
  onView,
}: {
  items: CastItem[];
  open: boolean;
  onItemsChange: (items: CastItem[]) => void;
  onView: (index: number) => void;
}) {
  const isMobile = useIsMobile();
  const [scrollRoot, setScrollRoot] = useState<HTMLElement | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const itemIds = useMemo(() => items.map((item) => item.path), [items]);
  const virtualize = items.length > VIRTUALIZE_AFTER;

  const pointerSensor = useSensor(PointerSensor, { activationConstraint: { distance: 6 } });
  const touchSensor = useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 10 } });
  const keyboardSensor = useSensor(KeyboardSensor, {
    coordinateGetter: sortableKeyboardCoordinates,
  });
  const sensors = useSensors(
    isMobile ? touchSensor : pointerSensor,
    keyboardSensor,
  );

  const virtualizer = useVirtualizer({
    count: virtualize ? items.length : 0,
    getScrollElement: () => scrollRoot,
    estimateSize: () => QUEUE_ITEM_ESTIMATE,
    gap: QUEUE_ITEM_GAP,
    overscan: QUEUE_OVERSCAN,
    getItemKey: (index) => items[index]?.path ?? index,
  });

  const virtualItems = virtualize ? virtualizer.getVirtualItems() : null;
  const rangeKey = virtualItems && virtualItems.length > 0
    ? `${virtualItems[0].index}:${virtualItems[virtualItems.length - 1].index}`
    : 'all';
  const queueLayoutKey = `${open}:${items.length}:${rangeKey}`;

  const activeItem = activeId
    ? items.find((item) => item.path === activeId) ?? null
    : null;

  function finishDrag(event: DragEndEvent) {
    setActiveId(null);
    if (!event.over || event.active.id === event.over.id) return;
    const from = items.findIndex((item) => item.path === event.active.id);
    const to = items.findIndex((item) => item.path === event.over?.id);
    if (from >= 0 && to >= 0) onItemsChange(arrayMove(items, from, to));
  }

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  if (items.length === 0) {
    return <ul className="cast-queue" />;
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis, restrictToFirstScrollableAncestor]}
      onDragStart={onDragStart}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={finishDrag}
      autoScroll
    >
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        <div
          ref={setScrollRoot}
          className={`cast-queue-scroller${virtualize ? ' is-virtual' : ''}`}
        >
          <ul
            className="cast-queue"
            style={
              virtualize
                ? {
                    height: virtualizer.getTotalSize(),
                    position: 'relative',
                  }
                : undefined
            }
          >
            {virtualItems
              ? virtualItems.map((virtualRow) => {
                  const item = items[virtualRow.index];
                  if (!item) return null;
                  return (
                    <SortableCastItem
                      key={item.path}
                      item={item}
                      index={virtualRow.index}
                      layoutKey={queueLayoutKey}
                      virtualStart={virtualRow.start}
                      measureRef={virtualizer.measureElement}
                      onView={() => onView(virtualRow.index)}
                      onRemove={() => onItemsChange(
                        items.filter((candidate) => candidate.path !== item.path),
                      )}
                    />
                  );
                })
              : items.map((item, index) => (
                  <SortableCastItem
                    key={item.path}
                    item={item}
                    index={index}
                    layoutKey={queueLayoutKey}
                    onView={() => onView(index)}
                    onRemove={() => onItemsChange(
                      items.filter((candidate) => candidate.path !== item.path),
                    )}
                  />
                ))}
          </ul>
        </div>
      </SortableContext>
      <DragOverlay dropAnimation={null} style={{ zIndex: 12050 }}>
        {activeItem ? (
          <div className="cast-queue-item cast-queue-item--overlay">
            <CastQueueItemContent
              item={activeItem}
              layoutKey={queueLayoutKey}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

export function CastSetupDialog({
  open,
  connected,
  loading,
  error,
  status,
  items,
  settings,
  mediaOrigin,
  mediaOriginCandidates,
  showMediaOriginField,
  onMediaOriginChange,
  onSettingsChange,
  onItemsChange,
  onDismissError,
  onClose,
  onApply,
}: CastSetupDialogProps) {
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const previewOpen = previewIndex !== null;
  const previewEntries = useMemo(() => castItemsToBrowseEntries(items), [items]);

  useEffect(() => {
    if (!open) setPreviewIndex(null);
  }, [open]);

  return (
    <>
      <Modal
        open={open}
        title={connected ? 'Cast settings' : 'Cast media'}
        onClose={onClose}
        className="cast-setup"
        closeOnEscape={!previewOpen}
      >
        <div className="cast-setup-body">
          <div className="cast-mode-toggle" role="group" aria-label="Cast mode">
            <button
              type="button"
              className={settings.mode === 'slideshow' ? 'active' : ''}
              aria-pressed={settings.mode === 'slideshow'}
              onClick={() => onSettingsChange({ ...settings, mode: 'slideshow' })}
            >
              Slideshow
            </button>
            <button
              type="button"
              className={settings.mode === 'manual' ? 'active' : ''}
              aria-pressed={settings.mode === 'manual'}
              onClick={() => onSettingsChange({ ...settings, mode: 'manual' })}
            >
              Pick photos
            </button>
          </div>

          {showMediaOriginField ? (
            <label className="cast-media-origin">
              <span>LAN media address</span>
              <input
                list="cast-media-origin-options"
                value={mediaOrigin}
                placeholder="http://192.168.1.50:5174"
                onChange={(event) => onMediaOriginChange(event.target.value)}
              />
              <datalist id="cast-media-origin-options">
                {mediaOriginCandidates.map((candidate) => (
                  <option key={candidate} value={candidate} />
                ))}
              </datalist>
              <small>
                Chromecast loads files from this address. Use localhost in Chrome for Cast controls,
                and set this to your LAN URL (Vite --host).
              </small>
            </label>
          ) : null}

          {settings.mode === 'slideshow' ? (
            <Slider
              label="Time between photos"
              min={2}
              max={60}
              step={1}
              value={settings.intervalSec}
              valueLabel={`${settings.intervalSec}s`}
              onChange={(intervalSec) => onSettingsChange({ ...settings, intervalSec })}
            />
          ) : (
            <p className="cast-help">Choose any photo or video while browsing to show it on the TV.</p>
          )}

          <Slider
            label="TV volume"
            min={0}
            max={100}
            step={1}
            value={Math.round(settings.volume * 100)}
            valueLabel={`${Math.round(settings.volume * 100)}%`}
            onChange={(volume) => onSettingsChange({ ...settings, volume: volume / 100 })}
          />

          {settings.mode === 'slideshow' ? (
            <div className="cast-toggle-row">
              <Toggle
                label="Shuffle"
                checked={settings.shuffle}
                onChange={(shuffle) => onSettingsChange({ ...settings, shuffle })}
              />
              <Toggle
                label="Repeat"
                checked={settings.repeat}
                onChange={(repeat) => onSettingsChange({ ...settings, repeat })}
              />
            </div>
          ) : null}

          <div className="cast-queue-heading">
            <strong>Queue</strong>
            <span>{items.length} item{items.length === 1 ? '' : 's'}</span>
          </div>

          <CastQueueList
            items={items}
            open={open}
            onItemsChange={onItemsChange}
            onView={setPreviewIndex}
          />

          {loading ? (
            <div className="cast-banner cast-banner--info" role="status">
              <span className="cast-banner__title">Preparing queue</span>
              <p>Resolving photos and videos for Cast…</p>
            </div>
          ) : null}
          {status && !loading ? (
            <div className="cast-banner cast-banner--info" role="status">
              <span className="cast-banner__title">Working</span>
              <p>{status}</p>
            </div>
          ) : null}
          {error ? (
            <div className="cast-banner cast-banner--error" role="alert">
              <div className="cast-banner__header">
                <span className="cast-banner__title">Couldn’t cast</span>
                {onDismissError ? (
                  <button type="button" className="cast-banner__dismiss" onClick={onDismissError}>
                    Dismiss
                  </button>
                ) : null}
              </div>
              <p>{error}</p>
            </div>
          ) : null}
        </div>
        <div className="modal-actions">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            disabled={loading || Boolean(status) || (settings.mode === 'slideshow' && items.length === 0)}
            onClick={onApply}
          >
            {connected ? 'Apply' : 'Choose device'}
          </Button>
        </div>
      </Modal>

      <MediaGallery
        className="cast-queue-gallery"
        entries={previewEntries}
        initialIndex={previewIndex ?? 0}
        open={previewOpen}
        onClose={() => setPreviewIndex(null)}
      />
    </>
  );
}
