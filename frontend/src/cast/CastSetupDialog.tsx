import { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  restrictToParentElement,
  restrictToVerticalAxis,
} from '@dnd-kit/modifiers';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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
  items: CastItem[];
  settings: CastSettings;
  mediaOrigin: string;
  mediaOriginCandidates: string[];
  showMediaOriginField: boolean;
  onMediaOriginChange: (origin: string) => void;
  onSettingsChange: (settings: CastSettings) => void;
  onItemsChange: (items: CastItem[]) => void;
  onClose: () => void;
  onApply: () => void;
}

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

function SortableCastItem({
  item,
  layoutKey,
  scrollRoot,
  onRemove,
  onView,
}: {
  item: CastItem;
  layoutKey: string | number;
  scrollRoot: Element | null;
  onRemove: () => void;
  onView: () => void;
}) {
  const sortable = useSortable({ id: item.path });
  const transform = sortable.transform
    ? { ...sortable.transform, x: 0 }
    : null;
  const folder = folderPath(item.path);

  return (
    <li
      ref={sortable.setNodeRef}
      className="cast-queue-item"
      style={{
        transform: CSS.Transform.toString(transform),
        transition: sortable.transition,
        opacity: sortable.isDragging ? 0.6 : 1,
      }}
    >
      <button
        type="button"
        className="cast-queue-handle"
        aria-label={`Move ${item.name}`}
        {...sortable.attributes}
        {...sortable.listeners}
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
          bufferRows={3}
          layoutKey={layoutKey}
          root={scrollRoot}
        />
      </button>
      <div className="cast-queue-item__meta">
        <span className="cast-queue-item__name" title={item.name}>{item.name}</span>
        <span className="cast-queue-item__path" title={folder}>{folder}</span>
      </div>
      <button
        type="button"
        className="cast-queue-remove"
        aria-label={`Remove ${item.name}`}
        onClick={onRemove}
      >
        ×
      </button>
    </li>
  );
}

export function CastSetupDialog({
  open,
  connected,
  loading,
  error,
  items,
  settings,
  mediaOrigin,
  mediaOriginCandidates,
  showMediaOriginField,
  onMediaOriginChange,
  onSettingsChange,
  onItemsChange,
  onClose,
  onApply,
}: CastSetupDialogProps) {
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [scrollRoot, setScrollRoot] = useState<HTMLElement | null>(null);
  const previewOpen = previewIndex !== null;
  const previewEntries = useMemo(() => castItemsToBrowseEntries(items), [items]);
  const queueLayoutKey = useMemo(
    () => `${open}:${items.length}:${items.map((item) => item.path).join('\0')}`,
    [open, items],
  );
  const isMobile = useIsMobile();
  const pointerSensor = useSensor(PointerSensor, { activationConstraint: { distance: 6 } });
  const touchSensor = useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 10 } });
  const keyboardSensor = useSensor(KeyboardSensor, {
    coordinateGetter: sortableKeyboardCoordinates,
  });
  const sensors = useSensors(
    isMobile ? touchSensor : pointerSensor,
    keyboardSensor,
  );

  useEffect(() => {
    if (!open) setPreviewIndex(null);
  }, [open]);

  function finishDrag(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return;
    const from = items.findIndex((item) => item.path === event.active.id);
    const to = items.findIndex((item) => item.path === event.over?.id);
    if (from >= 0 && to >= 0) onItemsChange(arrayMove(items, from, to));
  }

  return (
    <>
      <Modal
        open={open}
        title={connected ? 'Cast settings' : 'Cast media'}
        onClose={onClose}
        className="cast-setup"
        closeOnEscape={!previewOpen}
      >
        <div className="cast-setup-body" ref={setScrollRoot}>
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
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis, restrictToParentElement]}
            onDragEnd={finishDrag}
          >
            <SortableContext items={items.map((item) => item.path)} strategy={verticalListSortingStrategy}>
              <ul className="cast-queue">
                {items.map((item, index) => (
                  <SortableCastItem
                    key={item.path}
                    item={item}
                    layoutKey={queueLayoutKey}
                    scrollRoot={scrollRoot}
                    onView={() => setPreviewIndex(index)}
                    onRemove={() => onItemsChange(items.filter((candidate) => candidate.path !== item.path))}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>

          {loading ? <p className="cast-status">Preparing photos...</p> : null}
          {error ? <p className="error">{error}</p> : null}
        </div>
        <div className="modal-actions">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            disabled={loading || (settings.mode === 'slideshow' && items.length === 0)}
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
