import type { BrowseEntry, ViewerKind } from '../types';

/** True when this browse entry can open in a non-media file viewer. */
export function isViewableFileEntry(entry: BrowseEntry): boolean {
  return entry.type === 'file' && Boolean(entry.viewer && entry.token);
}

export function getEntryViewerKind(entry: BrowseEntry): ViewerKind | null {
  if (!isViewableFileEntry(entry) || !entry.viewer) return null;
  return entry.viewer;
}
