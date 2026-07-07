export type QualityTier =
  | 'very_low'
  | 'low'
  | 'medium'
  | 'high'
  | 'very_high'
  | 'full';

export type MediaType = 'image' | 'video';

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
  type: 'folder' | MediaType;
  size?: number;
  mtime?: string;
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
