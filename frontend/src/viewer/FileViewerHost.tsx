import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { BrowseEntry } from '../types';
import { getEntryViewerKind } from './kinds';
import { getFileViewer } from './registry';

interface FileViewerHostProps {
  entry: BrowseEntry | null;
  open: boolean;
  onClose: () => void;
}

/** Picks the registered viewer for the entry and mounts it in a portal. */
export function FileViewerHost({ entry, open, onClose }: FileViewerHostProps) {
  const kind = entry ? getEntryViewerKind(entry) : null;
  const Viewer = kind ? getFileViewer(kind) : null;

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open || !entry || !Viewer) return null;

  return createPortal(<Viewer entry={entry} onClose={onClose} />, document.body);
}
