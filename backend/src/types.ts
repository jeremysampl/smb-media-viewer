export type QualityTier =
  | 'very_low'
  | 'low'
  | 'medium'
  | 'high'
  | 'very_high'
  | 'full';

export type MediaType = 'image' | 'video';

export type EntryType = 'folder' | MediaType | 'file';

/** Non-media overlay viewers */
export type { ViewerKind } from './media/fileTypes.js';
import type { ViewerKind } from './media/fileTypes.js';

export interface ShareInfo {
  name: string;
  path: string;
  comment?: string;
  guestOk: boolean;
  validUsers: string[];
  readList: string[];
  writeList: string[];
}

export interface BrowseEntry {
  name: string;
  path: string;
  type: EntryType;
  size?: number;
  mtime?: string;
  captureTime?: string;
  /** False until the index has a fresh row for this file */
  indexed?: boolean;
  /** Overlay viewer for this non-media file */
  viewer?: ViewerKind;
  format?: string;
  duration?: number;
  token?: string;
  thumbnailUrl?: string;
}

export interface JwtPayload {
  username: string;
}

export interface MediaTokenPayload {
  path: string;
  username: string;
  exp: number;
}
