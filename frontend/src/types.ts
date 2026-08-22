export type QualityTier =
  | 'very_low'
  | 'low'
  | 'medium'
  | 'high'
  | 'very_high'
  | 'full';

export type MediaType = 'image' | 'video';

export type EntryType = 'folder' | MediaType | 'file';

/** Non-media overlay viewers. Keep in sync with backend ViewerKind. */
export type ViewerKind = 'text' | 'pdf' | 'spreadsheet' | 'office';

export interface QualityProfile {
  id: QualityTier;
  label: string;
  imageMaxDimension: number | null;
  videoHeight: number | null;
}

export interface BrowseEntry {
  name: string;
  path: string;
  type: EntryType;
  size?: number;
  mtime?: string;
  captureTime?: string;
  /** False until the index has a fresh row for this file. */
  indexed?: boolean;
  /** Which overlay viewer opens this non-media file. */
  viewer?: ViewerKind;
  format?: string;
  duration?: number;
  token?: string;
  thumbnailUrl?: string;
}

export interface BrowseResponse {
  path: string;
  share?: string;
  entries: BrowseEntry[];
}

export interface ImageMetadata {
  kind: 'image';
  filename: string;
  size: number;
  mtime: string;
  dimensions?: { width: number; height: number };
  format?: string;
  camera?: {
    make?: string;
    model?: string;
    lens?: string;
  };
  captureTime?: string;
  location?: {
    latitude: number;
    longitude: number;
    altitude?: number;
  };
  settings?: {
    iso?: number;
    aperture?: string;
    shutterSpeed?: string;
    focalLength?: string;
    flash?: string;
    whiteBalance?: string;
  };
  orientation?: number;
  software?: string;
  colorSpace?: string;
}

export interface VideoMetadata {
  kind: 'video';
  filename: string;
  size: number;
  mtime: string;
  format?: string;
  duration?: number;
  dimensions?: { width: number; height: number };
  videoCodec?: string;
  audioCodec?: string;
  bitrate?: number;
  frameRate?: string;
  audioChannels?: number;
  audioSampleRate?: number;
  captureTime?: string;
  location?: {
    latitude: number;
    longitude: number;
    altitude?: number;
  };
}

export type MediaMetadata = ImageMetadata | VideoMetadata;
