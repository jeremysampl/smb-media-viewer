import type { BrowseEntry } from '../types';

export interface FileViewerProps {
  entry: BrowseEntry;
  onClose: () => void;
}
