import { useEffect, useState, type ReactNode } from 'react';
import type { MediaMetadata } from '../types';
import { Button, CloseIcon } from '../ui';
import {
  getCachedMediaMetadata,
  loadMediaMetadata,
} from './mediaMetadataCache';

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

function isEmptyValue(value: ReactNode): boolean {
  return value == null || value === '' || value === '—';
}

interface DetailItem {
  label: string;
  value: ReactNode;
  hideIfEmpty?: boolean;
}

function DetailSection({ title, items }: { title: string; items: DetailItem[] }) {
  const visible = items.filter(
    (item) => !item.hideIfEmpty || !isEmptyValue(item.value),
  );
  if (visible.length === 0) return null;

  return (
    <section className="image-details-section">
      <h3 className="image-details-section-title">{title}</h3>
      <div className="image-details-rows">
        {visible.map((item) => (
          <div key={item.label} className="image-details-row">
            <span className="image-details-row-label">{item.label}</span>
            <span className="image-details-row-value">{item.value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function LocationValue({ location }: { location?: MediaMetadata['location'] }) {
  if (!location) return '—';
  return (
    <a
      href={`https://www.openstreetmap.org/?mlat=${location.latitude}&mlon=${location.longitude}#map=15/${location.latitude}/${location.longitude}`}
      target="_blank"
      rel="noreferrer"
    >
      {formatLocation(location)}
    </a>
  );
}

function MetadataFields({ metadata }: { metadata: MediaMetadata }) {
  if (metadata.kind === 'image') {
    const cameraName = metadata.camera
      ? [metadata.camera.make, metadata.camera.model].filter(Boolean).join(' ')
      : '';

    return (
      <div className="image-details-sections">
        <DetailSection
          title="File"
          items={[
            { label: 'Name', value: metadata.filename },
            { label: 'Size', value: formatSize(metadata.size) },
            { label: 'Modified', value: formatDate(metadata.mtime) },
            {
              label: 'Dimensions',
              value: metadata.dimensions
                ? `${metadata.dimensions.width} × ${metadata.dimensions.height}`
                : '—',
            },
            { label: 'Format', value: metadata.format ?? '—', hideIfEmpty: true },
          ]}
        />
        <DetailSection
          title="Capture"
          items={[
            {
              label: 'Taken',
              value: formatDate(metadata.captureTime),
              hideIfEmpty: true,
            },
            {
              label: 'Software',
              value: metadata.software ?? '—',
              hideIfEmpty: true,
            },
          ]}
        />
        <DetailSection
          title="Camera"
          items={[
            { label: 'Body', value: cameraName || '—', hideIfEmpty: true },
            { label: 'Lens', value: metadata.camera?.lens ?? '—', hideIfEmpty: true },
            { label: 'ISO', value: metadata.settings?.iso ?? '—', hideIfEmpty: true },
            {
              label: 'Aperture',
              value: metadata.settings?.aperture ?? '—',
              hideIfEmpty: true,
            },
            {
              label: 'Shutter',
              value: metadata.settings?.shutterSpeed ?? '—',
              hideIfEmpty: true,
            },
            {
              label: 'Focal length',
              value: metadata.settings?.focalLength ?? '—',
              hideIfEmpty: true,
            },
            { label: 'Flash', value: metadata.settings?.flash ?? '—', hideIfEmpty: true },
            {
              label: 'White balance',
              value: metadata.settings?.whiteBalance ?? '—',
              hideIfEmpty: true,
            },
          ]}
        />
        <DetailSection
          title="Location"
          items={
            metadata.location
              ? [
                  {
                    label: 'Coordinates',
                    value: <LocationValue location={metadata.location} />,
                  },
                ]
              : []
          }
        />
      </div>
    );
  }

  return (
    <div className="image-details-sections">
      <DetailSection
        title="File"
        items={[
          { label: 'Name', value: metadata.filename },
          { label: 'Size', value: formatSize(metadata.size) },
          { label: 'Modified', value: formatDate(metadata.mtime) },
          {
            label: 'Dimensions',
            value: metadata.dimensions
              ? `${metadata.dimensions.width} × ${metadata.dimensions.height}`
              : '—',
          },
          { label: 'Format', value: metadata.format ?? '—', hideIfEmpty: true },
        ]}
      />
      <DetailSection
        title="Playback"
        items={[
          { label: 'Duration', value: formatDuration(metadata.duration) },
          {
            label: 'Taken',
            value: formatDate(metadata.captureTime),
            hideIfEmpty: true,
          },
          {
            label: 'Video codec',
            value: metadata.videoCodec ?? '—',
            hideIfEmpty: true,
          },
          {
            label: 'Audio codec',
            value: metadata.audioCodec ?? '—',
            hideIfEmpty: true,
          },
          {
            label: 'Frame rate',
            value: metadata.frameRate ?? '—',
            hideIfEmpty: true,
          },
          {
            label: 'Bitrate',
            value: formatBitrate(metadata.bitrate),
            hideIfEmpty: true,
          },
          {
            label: 'Audio channels',
            value: metadata.audioChannels ?? '—',
            hideIfEmpty: true,
          },
          {
            label: 'Sample rate',
            value: metadata.audioSampleRate
              ? `${metadata.audioSampleRate} Hz`
              : '—',
            hideIfEmpty: true,
          },
        ]}
      />
      <DetailSection
        title="Location"
        items={
          metadata.location
            ? [
                {
                  label: 'Coordinates',
                  value: <LocationValue location={metadata.location} />,
                },
              ]
            : []
        }
      />
    </div>
  );
}

interface MediaDetailsPanelProps {
  token: string;
  onClose?: () => void;
  variant?: 'overlay' | 'sheet';
}

export function MediaDetailsPanel({
  token,
  onClose,
  variant = 'overlay',
}: MediaDetailsPanelProps) {
  const [metadata, setMetadata] = useState<MediaMetadata | null>(
    () => getCachedMediaMetadata(token) ?? null,
  );
  const [loading, setLoading] = useState(() => !getCachedMediaMetadata(token));
  const [error, setError] = useState('');

  useEffect(() => {
    const cached = getCachedMediaMetadata(token);
    setMetadata(cached ?? null);
    setLoading(!cached);
    setError('');

    let cancelled = false;
    loadMediaMetadata(token)
      .then((next) => {
        if (!cancelled) {
          setMetadata(next);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load details');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const isSheet = variant === 'sheet';
  const kindLabel = metadata?.kind === 'video' ? 'Video details' : 'Image details';

  return (
    <div
      className={`image-details-panel${isSheet ? ' image-details-panel-sheet' : ''}`}
      onClick={isSheet ? undefined : (event) => event.stopPropagation()}
      onMouseDown={isSheet ? undefined : (event) => event.stopPropagation()}
      onTouchStart={isSheet ? undefined : (event) => event.stopPropagation()}
    >
      {isSheet ? <div className="image-details-sheet-handle" aria-hidden /> : null}

      <div className="image-details-header">
        <div className="image-details-heading">
          <p className="image-details-eyebrow">{kindLabel}</p>
          <h2>{metadata?.filename ?? 'Details'}</h2>
        </div>
        {onClose ? (
          <Button
            variant="ghost"
            size="sm"
            className="image-details-close"
            aria-label="Close details"
            onClick={onClose}
          >
            <CloseIcon size={16} />
          </Button>
        ) : null}
      </div>

      {loading ? (
        <p className="image-details-status" role="status" aria-live="polite">
          Loading metadata…
        </p>
      ) : null}
      {error ? (
        <p className="image-details-error" role="alert">
          {error}
        </p>
      ) : null}
      {metadata ? <MetadataFields metadata={metadata} /> : null}
    </div>
  );
}
