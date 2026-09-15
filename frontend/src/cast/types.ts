export type CastMode = 'slideshow' | 'manual';

export interface CastItem {
  path: string;
  name: string;
  kind: 'image' | 'video';
  token: string;
  mediaToken: string;
  contentType: string;
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
