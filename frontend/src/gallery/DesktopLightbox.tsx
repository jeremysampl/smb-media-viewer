import { useEffect, useMemo, useState } from 'react';
import Lightbox, { IconButton, createIcon, useLightboxState } from 'yet-another-react-lightbox';
import Video from 'yet-another-react-lightbox/plugins/video';
import Zoom from 'yet-another-react-lightbox/plugins/zoom';
import 'yet-another-react-lightbox/styles.css';
import { mediaUrl } from '../api/client';
import type { BrowseEntry, QualityTier } from '../types';
import { useQualityPreference } from '../browser/ResolutionSelector';
import { MediaDetailsPanel } from './MediaDetailsPanel';

interface DesktopLightboxProps {
  entries: BrowseEntry[];
  initialIndex: number;
  open: boolean;
  onClose: () => void;
}

const DetailsIcon = createIcon(
  'DetailsIcon',
  <path d="M11 7h2v2h-2zm0 4h2v6h-2zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" />,
);

function stopControlEvent(event: React.SyntheticEvent) {
  event.stopPropagation();
}

function GalleryQualitySelect({
  quality,
  profiles,
  onChange,
}: {
  quality: QualityTier;
  profiles: { id: QualityTier; label: string }[];
  onChange: (quality: QualityTier) => void;
}) {
  return (
    <label
      className="gallery-toolbar-quality"
      onClick={stopControlEvent}
      onMouseDown={stopControlEvent}
      onTouchStart={stopControlEvent}
    >
      <span className="sr-only">Quality</span>
      <select
        value={quality}
        aria-label="Quality"
        onChange={(event) => onChange(event.target.value as QualityTier)}
        onClick={stopControlEvent}
        onMouseDown={stopControlEvent}
        onTouchStart={stopControlEvent}
      >
        {profiles.map((profile) => (
          <option key={profile.id} value={profile.id}>
            {profile.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function DetailsButton({ onClick }: { onClick: () => void }) {
  const { currentSlide } = useLightboxState();
  const hasSlide = Boolean(currentSlide);

  return (
    <IconButton
      label="Details"
      icon={DetailsIcon}
      disabled={!hasSlide}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    />
  );
}

function previewFor(entry: BrowseEntry): string {
  if (!entry.token) return '';
  if (entry.type === 'video') return mediaUrl(entry.token, 'poster');
  return entry.thumbnailUrl ?? mediaUrl(entry.token, 'image', 'very_low');
}

export function DesktopLightbox({
  entries,
  initialIndex,
  open,
  onClose,
}: DesktopLightboxProps) {
  const { quality, setQuality, profiles } = useQualityPreference();
  const [index, setIndex] = useState(initialIndex);
  const [detailsOpen, setDetailsOpen] = useState(false);
  /** Paths that have been the active slide — keep full-quality src so swipe-away doesn't swap renderers/src. */
  const [hydratedPaths, setHydratedPaths] = useState<Set<string>>(() => new Set());

  const mediaEntries = useMemo(
    () => entries.filter((entry) => entry.type === 'image' || entry.type === 'video'),
    [entries],
  );

  useEffect(() => {
    if (!open) {
      setHydratedPaths(new Set());
      return;
    }
    setIndex(initialIndex);
    setDetailsOpen(false);
    const initial = mediaEntries[initialIndex];
    setHydratedPaths(initial ? new Set([initial.path]) : new Set());
  }, [open, initialIndex, mediaEntries]);

  useEffect(() => {
    setDetailsOpen(false);
  }, [index]);

  useEffect(() => {
    const entry = mediaEntries[index];
    if (!entry) return;
    setHydratedPaths((previous) => {
      if (previous.has(entry.path)) return previous;
      const next = new Set(previous);
      next.add(entry.path);
      return next;
    });
  }, [index, mediaEntries]);

  const currentEntry = mediaEntries[index];

  const slides = useMemo(() => {
    return mediaEntries.map((entry) => {
      const preview = previewFor(entry);
      const useFull = hydratedPaths.has(entry.path);

      if (entry.type === 'video' && entry.token) {
        return {
          type: 'video' as const,
          // Only hydrated (visited/current) slides get a video source — neighbors stay poster-only.
          sources: useFull
            ? [
                {
                  src: mediaUrl(entry.token, 'video', quality),
                  type: 'video/mp4',
                },
              ]
            : [],
          poster: preview || mediaUrl(entry.token, 'poster'),
        };
      }

      return {
        // Same ImageSlide chrome for every offset; only the URL differs until first view.
        src: entry.token
          ? useFull
            ? mediaUrl(entry.token, 'image', quality)
            : preview
          : '',
        alt: entry.name,
        title: entry.name,
      };
    });
  }, [mediaEntries, quality, hydratedPaths]);

  return (
    <Lightbox
      open={open}
      close={onClose}
      index={index}
      slides={slides}
      plugins={[Video, Zoom]}
      zoom={{ scrollToZoom: true, maxZoomPixelRatio: 4, maxZoom: 20 }}
      toolbar={{
        buttons: [
          <GalleryQualitySelect
            key="quality"
            quality={quality}
            profiles={profiles}
            onChange={setQuality}
          />,
          <DetailsButton key="details" onClick={() => setDetailsOpen((value) => !value)} />,
          'close',
        ],
      }}
      on={{ view: ({ index: nextIndex }) => setIndex(nextIndex) }}
      controller={{ closeOnBackdropClick: true }}
      carousel={{ finite: mediaEntries.length <= 1, preload: 1 }}
      animation={{ swipe: 500 }}
      render={{
        controls: () =>
          detailsOpen && currentEntry?.token ? (
            <MediaDetailsPanel
              token={currentEntry.token}
              onClose={() => setDetailsOpen(false)}
            />
          ) : null,
      }}
    />
  );
}
