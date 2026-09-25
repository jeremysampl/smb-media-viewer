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
  /** When true, Cast can stream the original without waiting on a remux job. */
  directPlay?: boolean;
  url: string;
  thumbnailUrl: string;
}

export interface CastVideoProgress {
  currentTime: number;
  duration: number;
  paused: boolean;
}

export interface CastSettings {
  mode: CastMode;
  intervalSec: number;
  volume: number;
  shuffle: boolean;
  repeat: boolean;
}
