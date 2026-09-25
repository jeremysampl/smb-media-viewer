import { useEffect, useRef } from 'react';
import type { BrowseEntry } from '../types';
import { isViewableFileEntry } from '../viewer/kinds';

export interface ContextMenuState {
  x: number;
  y: number;
  entry: BrowseEntry;
}

interface EntryContextMenuProps {
  menu: ContextMenuState;
  selectMode: boolean;
  selected: boolean;
  selectedCount: number;
  onClose: () => void;
  onSelect: () => void;
  onDeselect: () => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onView: () => void;
  onDownloadOne: () => void;
  onDownloadSelected: () => void;
  onCastOne: () => void;
  onCastSelected: () => void;
  castConnected: boolean;
}

export function EntryContextMenu({
  menu,
  selectMode,
  selected,
  selectedCount,
  onClose,
  onSelect,
  onDeselect,
  onSelectAll,
  onClearSelection,
  onView,
  onDownloadOne,
  onDownloadSelected,
  onCastOne,
  onCastSelected,
  castConnected,
}: EntryContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const canView =
    menu.entry.type === 'folder' ||
    menu.entry.type === 'image' ||
    menu.entry.type === 'video' ||
    isViewableFileEntry(menu.entry);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const rect = node.getBoundingClientRect();
    const pad = 8;
    let left = menu.x;
    let top = menu.y;
    if (left + rect.width > window.innerWidth - pad) {
      left = Math.max(pad, window.innerWidth - rect.width - pad);
    }
    if (top + rect.height > window.innerHeight - pad) {
      top = Math.max(pad, window.innerHeight - rect.height - pad);
    }
    node.style.left = `${left}px`;
    node.style.top = `${top}px`;
  }, [menu.x, menu.y]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const onPointer = (event: PointerEvent) => {
      if (ref.current?.contains(event.target as Node)) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer, true);
    };
  }, [onClose]);

  function run(action: () => void) {
    action();
    onClose();
  }

  return (
    <div
      ref={ref}
      className="entry-context-menu"
      role="menu"
      style={{ left: menu.x, top: menu.y }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {!selectMode ? (
        <>
          <button type="button" role="menuitem" onClick={() => run(onSelect)}>
            Select
          </button>
          {canView ? (
            <button type="button" role="menuitem" onClick={() => run(onView)}>
              {menu.entry.type === 'folder' ? 'Open' : 'View'}
            </button>
          ) : null}
          <button type="button" role="menuitem" onClick={() => run(onDownloadOne)}>
            Download
          </button>
          {(menu.entry.type === 'folder'
            || menu.entry.type === 'image'
            || menu.entry.type === 'video') ? (
            <button type="button" role="menuitem" onClick={() => run(onCastOne)}>
              {castConnected ? 'Add to Cast' : 'Cast'}
            </button>
          ) : null}
        </>
      ) : (
        <>
          <button
            type="button"
            role="menuitem"
            onClick={() => run(selected ? onDeselect : onSelect)}
          >
            {selected ? 'Deselect' : 'Select'}
          </button>
          <button type="button" role="menuitem" onClick={() => run(onSelectAll)}>
            Select all
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={selectedCount === 0}
            onClick={() => run(onDownloadSelected)}
          >
            Download selected ({selectedCount})
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={selectedCount === 0}
            onClick={() => run(onCastSelected)}
          >
            {castConnected ? 'Add selected to Cast' : `Cast selected (${selectedCount})`}
          </button>
          {canView ? (
            <button type="button" role="menuitem" onClick={() => run(onView)}>
              {menu.entry.type === 'folder' ? 'Open' : 'View'}
            </button>
          ) : null}
          <button type="button" role="menuitem" onClick={() => run(onClearSelection)}>
            Clear selection
          </button>
        </>
      )}
    </div>
  );
}
