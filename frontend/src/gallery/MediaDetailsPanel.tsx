import { useEffect, useState } from 'react';
import { getMediaMetadata } from '../api/client';
import type { MediaMetadata } from '../types';

function formatSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDate(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatDuration(seconds?: number): string {
  if (!seconds) return '—';
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

function formatBitrate(bitsPerSecond?: number): string {
  if (!bitsPerSecond) return '—';
  const mbps = bitsPerSecond / 1_000_000;
  if (mbps >= 1) return `${mbps.toFixed(1)} Mbps`;
  return `${Math.round(bitsPerSecond / 1000)} kbps`;
}

function formatLocation(location?: MediaMetadata['location']): string {
  if (!location) return '—';
  const coords = `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`;
  if (location.altitude !== undefined) {
    return `${coords} (${location.altitude.toFixed(1)} m)`;
  }
  return coords;
}

interface MediaDetailsPanelProps {
  token: string;
  onClose: () => void;
}

export function MediaDetailsPanel({ token, onClose }: MediaDetailsPanelProps) {
  const [metadata, setMetadata] = useState<MediaMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    getMediaMetadata(token)
      .then(setMetadata)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load details'))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div
      className="image-details-panel"
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onTouchStart={(event) => event.stopPropagation()}
    >
      <div className="image-details-header">
        <h2>Details</h2>
        <button type="button" className="secondary" onClick={onClose}>
          Close
        </button>
      </div>

      {loading ? <p className="status">Loading metadata...</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {metadata?.kind === 'image' ? (
        <dl className="image-details-list">
          <dt>File</dt>
          <dd>{metadata.filename}</dd>
          <dt>Size</dt>
          <dd>{formatSize(metadata.size)}</dd>
          <dt>Modified</dt>
          <dd>{formatDate(metadata.mtime)}</dd>
          <dt>Dimensions</dt>
          <dd>
            {metadata.dimensions
              ? `${metadata.dimensions.width} × ${metadata.dimensions.height}`
              : '—'}
          </dd>
          <dt>Format</dt>
          <dd>{metadata.format ?? '—'}</dd>
          <dt>Captured</dt>
          <dd>{formatDate(metadata.captureTime)}</dd>
          <dt>Camera</dt>
          <dd>
            {metadata.camera
              ? [metadata.camera.make, metadata.camera.model].filter(Boolean).join(' ') || '—'
              : '—'}
          </dd>
          <dt>Lens</dt>
          <dd>{metadata.camera?.lens ?? '—'}</dd>
          <dt>Location</dt>
          <dd>
            {metadata.location ? (
              <a
                href={`https://www.openstreetmap.org/?mlat=${metadata.location.latitude}&mlon=${metadata.location.longitude}#map=15/${metadata.location.latitude}/${metadata.location.longitude}`}
                target="_blank"
                rel="noreferrer"
              >
                {formatLocation(metadata.location)}
              </a>
            ) : (
              '—'
            )}
          </dd>
          <dt>ISO</dt>
          <dd>{metadata.settings?.iso ?? '—'}</dd>
          <dt>Aperture</dt>
          <dd>{metadata.settings?.aperture ?? '—'}</dd>
          <dt>Shutter</dt>
          <dd>{metadata.settings?.shutterSpeed ?? '—'}</dd>
          <dt>Focal length</dt>
          <dd>{metadata.settings?.focalLength ?? '—'}</dd>
          <dt>Flash</dt>
          <dd>{metadata.settings?.flash ?? '—'}</dd>
          <dt>White balance</dt>
          <dd>{metadata.settings?.whiteBalance ?? '—'}</dd>
          <dt>Software</dt>
          <dd>{metadata.software ?? '—'}</dd>
        </dl>
      ) : null}

      {metadata?.kind === 'video' ? (
        <dl className="image-details-list">
          <dt>File</dt>
          <dd>{metadata.filename}</dd>
          <dt>Size</dt>
          <dd>{formatSize(metadata.size)}</dd>
          <dt>Modified</dt>
          <dd>{formatDate(metadata.mtime)}</dd>
          <dt>Duration</dt>
          <dd>{formatDuration(metadata.duration)}</dd>
          <dt>Dimensions</dt>
          <dd>
            {metadata.dimensions
              ? `${metadata.dimensions.width} × ${metadata.dimensions.height}`
              : '—'}
          </dd>
          <dt>Format</dt>
          <dd>{metadata.format ?? '—'}</dd>
          <dt>Captured</dt>
          <dd>{formatDate(metadata.captureTime)}</dd>
          <dt>Video codec</dt>
          <dd>{metadata.videoCodec ?? '—'}</dd>
          <dt>Audio codec</dt>
          <dd>{metadata.audioCodec ?? '—'}</dd>
          <dt>Frame rate</dt>
          <dd>{metadata.frameRate ?? '—'}</dd>
          <dt>Bitrate</dt>
          <dd>{formatBitrate(metadata.bitrate)}</dd>
          <dt>Audio channels</dt>
          <dd>{metadata.audioChannels ?? '—'}</dd>
          <dt>Sample rate</dt>
          <dd>
            {metadata.audioSampleRate ? `${metadata.audioSampleRate} Hz` : '—'}
          </dd>
          <dt>Location</dt>
          <dd>
            {metadata.location ? (
              <a
                href={`https://www.openstreetmap.org/?mlat=${metadata.location.latitude}&mlon=${metadata.location.longitude}#map=15/${metadata.location.latitude}/${metadata.location.longitude}`}
                target="_blank"
                rel="noreferrer"
              >
                {formatLocation(metadata.location)}
              </a>
            ) : (
              '—'
            )}
          </dd>
        </dl>
      ) : null}
    </div>
  );
}
