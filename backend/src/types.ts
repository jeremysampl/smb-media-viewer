export type QualityTier =
  | 'very_low'
  | 'low'
  | 'medium'
  | 'high'
  | 'very_high'
  | 'full';

export type MediaType = 'image' | 'video';

export type EntryType = 'folder' | MediaType | 'file';

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
  /** False until the index has a fresh row for this file (thumb may still be generating). */
  indexed?: boolean;
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
