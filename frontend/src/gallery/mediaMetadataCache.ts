import { getMediaMetadata } from '../api/client';
import type { MediaMetadata } from '../types';

const cache = new Map<string, MediaMetadata>();
const inflight = new Map<string, Promise<MediaMetadata>>();

export function getCachedMediaMetadata(token: string): MediaMetadata | undefined {
  return cache.get(token);
}

export function loadMediaMetadata(token: string): Promise<MediaMetadata> {
  const cached = cache.get(token);
  if (cached) return Promise.resolve(cached);

  const existing = inflight.get(token);
  if (existing) return existing;

  const promise = getMediaMetadata(token)
    .then((metadata) => {
      cache.set(token, metadata);
      return metadata;
    })
    .finally(() => {
      inflight.delete(token);
    });

  inflight.set(token, promise);
  return promise;
}

export function prefetchMediaMetadata(token: string): void {
  void loadMediaMetadata(token).catch(() => {
    // Ignore prefetch failures; the visible panel will surface errors.
  });
}
