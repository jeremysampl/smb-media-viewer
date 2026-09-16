import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Lightbox, {
  IconButton,
  createIcon,
  isImageSlide,
  useLightboxState,
} from 'yet-another-react-lightbox';
import Video from 'yet-another-react-lightbox/plugins/video';
import Zoom from 'yet-another-react-lightbox/plugins/zoom';
import 'yet-another-react-lightbox/styles.css';
import { mediaUrl } from '../api/client';
import type { BrowseEntry, QualityTier } from '../types';
import { useQualityPreference } from '../browser/ResolutionSelector';
import { SelectField } from '../ui';
import { ChromeRasterImage } from './ChromeRasterImage';
import { shouldUseChromeImageRaster } from './chromeImageRaster';
import { GalleryThumbWithLoader } from './GalleryVideoLoader';
import { MediaDetailsPanel } from './MediaDetailsPanel';
import { useVideoPrepareStatus } from './useVideoPrepareStatus';

interface DesktopLightboxProps {
  entries: BrowseEntry[];
  initialIndex: number;
  open: boolean;
  onClose: () => void;
  onIndexChange?: (index: number) => void;
  className?: string;
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
    <div
      className="gallery-toolbar-quality"
      onClick={stopControlEvent}
      onMouseDown={stopControlEvent}
      onTouchStart={stopControlEvent}
    >
      <SelectField
        label="Quality"
        value={quality}
        layout="ghost"
        onClick={stopControlEvent}
        onMouseDown={stopControlEvent}
        onTouchStart={stopControlEvent}
        onChange={(value) => onChange(value as QualityTier)}
      >
        {profiles.map((profile) => (
          <option key={profile.id} value={profile.id}>
            {profile.label}
          </option>
        ))}
      </SelectField>
    </div>
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

type GallerySlide = {
  type?: 'video';
  sources?: Array<{ src: string; type: string }>;
  poster?: string;
  src?: string;
  alt?: string;
  title?: string;
  width?: number;
  height?: number;
  entryPath: string;
};

function buildSlide(
  entry: BrowseEntry,
  useFull: boolean,
  quality: QualityTier,
  options?: {
    size?: { width: number; height: number };
    videoReady?: boolean;
  },
): GallerySlide {
  const preview = previewFor(entry);

  if (entry.type === 'video' && entry.token) {
    const poster = preview || mediaUrl(entry.token, 'poster');
    // Only mark as a video slide once the MP4 is ready. Empty <video> sources
    // make Firefox show "No video with supported format and MIME type found".
    if (useFull && options?.videoReady) {
      return {
        type: 'video',
        sources: [{ src: mediaUrl(entry.token, 'video', quality), type: 'video/mp4' }],
        poster,
        entryPath: entry.path,
      };
    }
    return {
      src: poster,
      alt: entry.name,
      title: entry.name,
      entryPath: entry.path,
    };
  }

  return {
    src: entry.token
      ? useFull
        ? mediaUrl(entry.token, 'image', quality)
        : preview
      : '',
    alt: entry.name,
    title: entry.name,
    ...(options?.size ? { width: options.size.width, height: options.size.height } : {}),
    entryPath: entry.path,
  };
}

function stubSlide(entry: BrowseEntry): GallerySlide {
  return {
    src: previewFor(entry),
    alt: entry.name,
    title: entry.name,
    entryPath: entry.path,
  };
}

export function DesktopLightbox({
  entries,
  initialIndex,
  open,
  onClose,
  onIndexChange,
  className = '',
}: DesktopLightboxProps) {
  const { quality, setQuality, profiles } = useQualityPreference();
  const [index, setIndex] = useState(initialIndex);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [hydratedPaths, setHydratedPaths] = useState<Set<string>>(() => new Set());
  const [imageSizeByPath, setImageSizeByPath] = useState<
    Record<string, { width: number; height: number }>
  >({});
  const useChromeRaster = shouldUseChromeImageRaster();
  const slidesRef = useRef<GallerySlide[]>([]);
  const stubsReadyFor = useRef<BrowseEntry[] | null>(null);

  const mediaEntries = useMemo(
    () => entries.filter((entry) => entry.type === 'image' || entry.type === 'video'),
    [entries],
  );
  const mediaEntriesRef = useRef(mediaEntries);
  mediaEntriesRef.current = mediaEntries;

  useEffect(() => {
    if (!open) {
      setHydratedPaths(new Set());
      slidesRef.current = [];
      stubsReadyFor.current = null;
      return;
    }
    setIndex(initialIndex);
    setDetailsOpen(false);
    const initial = mediaEntriesRef.current[initialIndex];
    setHydratedPaths(initial ? new Set([initial.path]) : new Set());
  }, [open, initialIndex]);

  useEffect(() => {
    setDetailsOpen(false);
  }, [index]);

  useEffect(() => {
    setHydratedPaths((previous) => {
      const next = new Set<string>();
      for (let offset = -1; offset <= 1; offset += 1) {
        const entry = mediaEntries[index + offset];
        if (!entry) continue;
        if (offset === 0 || previous.has(entry.path)) next.add(entry.path);
      }
      if (next.size === previous.size) {
        let same = true;
        for (const path of next) {
          if (!previous.has(path)) {
            same = false;
            break;
          }
        }
        if (same) return previous;
      }
      return next;
    });
  }, [index, mediaEntries]);

  const rememberNaturalSize = useCallback((path: string, width: number, height: number) => {
    setImageSizeByPath((previous) => {
      const existing = previous[path];
      if (existing && existing.width === width && existing.height === height) {
        return previous;
      }
      return { ...previous, [path]: { width, height } };
    });
  }, []);

  const currentEntry = mediaEntries[index];
  const prepareCurrentVideo = useVideoPrepareStatus(
    currentEntry?.type === 'video' ? currentEntry.token : undefined,
    quality,
    Boolean(open && currentEntry?.type === 'video' && currentEntry.token),
  );

  // Keep a full-length slides array for YARL indexing, but only rebuild nearby slots.
  const slides = useMemo(() => {
    if (stubsReadyFor.current !== mediaEntries) {
      slidesRef.current = mediaEntries.map(stubSlide);
      stubsReadyFor.current = mediaEntries;
    }

    const slidesList = slidesRef.current;
    for (let offset = -1; offset <= 1; offset += 1) {
      const slideIndex = index + offset;
      const entry = mediaEntries[slideIndex];
      if (!entry) continue;
      const useFull = hydratedPaths.has(entry.path);
      const isCurrentVideo =
        entry.type === 'video' && entry.path === currentEntry?.path;
      slidesList[slideIndex] = buildSlide(entry, useFull, quality, {
        size: imageSizeByPath[entry.path],
        videoReady: isCurrentVideo ? prepareCurrentVideo.ready : false,
      });
    }

    // New array so YARL sees an update; elements reuse object identity for distant slides.
    return slidesList.slice();
  }, [
    mediaEntries,
    quality,
    hydratedPaths,
    imageSizeByPath,
    index,
    currentEntry?.path,
    prepareCurrentVideo.ready,
  ]);

  return (
    <Lightbox
      open={open}
      close={onClose}
      index={index}
      className={className || undefined}
      slides={slides as never}
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
      on={{
        view: ({ index: nextIndex }) => {
          setIndex(nextIndex);
          onIndexChange?.(nextIndex);
        },
      }}
      controller={{ closeOnBackdropClick: true }}
      carousel={{ finite: mediaEntries.length <= 1, preload: 1 }}
      animation={{ swipe: 500 }}
      render={{
        slide: ({ slide, rect, zoom }) => {
          const entryPath =
            ('entryPath' in slide && typeof slide.entryPath === 'string'
              ? slide.entryPath
              : null) ?? (isImageSlide(slide) ? slide.src : null);
          const isPendingVideo =
            currentEntry?.type === 'video' &&
            currentEntry.path === entryPath &&
            !prepareCurrentVideo.ready &&
            isImageSlide(slide);

          if (isPendingVideo) {
            return (
              <div
                className="gallery-video-prepare-slide"
                style={{ width: rect.width, height: rect.height }}
              >
                <GalleryThumbWithLoader
                  src={slide.src}
                  alt={slide.alt ?? currentEntry.name}
                  showLoader={
                    prepareCurrentVideo.known && prepareCurrentVideo.processing
                  }
                  progress={prepareCurrentVideo.progress}
                />
              </div>
            );
          }

          if (!useChromeRaster || !isImageSlide(slide)) return undefined;
          return (
            <ChromeRasterImage
              variant="desktop"
              src={slide.src}
              alt={slide.alt ?? ''}
              className="yarl__slide_image"
              containerWidth={rect.width}
              containerHeight={rect.height}
              zoom={zoom}
              onNaturalSize={(width, height) => {
                rememberNaturalSize(entryPath ?? slide.src, width, height);
              }}
            />
          );
        },
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
