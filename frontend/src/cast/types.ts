export type CastMode = 'slideshow' | 'manual';

export interface CastItem {
  path: string;
  name: string;
  kind: 'image' | 'video';
  token: string;
  mediaToken: string;
  contentType: string;
  /** Playback quality for cast media URLs / prepare status. */
  quality?: string;
  url: string;
  thumbnailUrl: string;
}

export interface CastSettings {
  mode: CastMode;
  intervalSec: number;
  volume: number;
  shuffle: boolean;
  repeat: boolean;
}
