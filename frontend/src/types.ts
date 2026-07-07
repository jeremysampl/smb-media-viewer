export type QualityTier =
  | 'very_low'
  | 'low'
  | 'medium'
  | 'high'
  | 'very_high'
  | 'full';

export type MediaType = 'image' | 'video';

export interface QualityProfile {
  id: QualityTier;
  label: string;
  imageMaxDimension: number | null;
  videoHeight: number | null;
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

export interface BrowseResponse {
  path: string;
  share?: string;
  entries: BrowseEntry[];
}
