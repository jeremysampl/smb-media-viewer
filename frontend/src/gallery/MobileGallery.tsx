import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { mediaUrl } from '../api/client';
import type { BrowseEntry, QualityTier } from '../types';
import { useQualityPreference } from '../browser/ResolutionSelector';
import { SelectField } from '../ui';
import { ChromeRasterImage } from './ChromeRasterImage';
import { MediaDetailsPanel } from './MediaDetailsPanel';
import { prefetchMediaMetadata } from './mediaMetadataCache';
import { MobileGalleryVideoSlide } from './MobileGalleryVideoSlide';
import {
  getThumbnailNaturalSize,
  getThumbnailRect,
  mediaContentRect,
  objectFitContainRect,
  rectFromDomRect,
  type FlyoutRect,
} from './getThumbnailRect';
import {
  DEFAULT_IMAGE_ZOOM,
  ZOOM_SNAP_THRESHOLD,
  canStartPinchZoom,
  clampImageZoom,
  computePinchZoom,
  imageZoomTransform,
  touchCenter,
  touchDistance,
  type ImageZoomState,
  type PinchState,
} from './mobileImageZoom';

interface MobileGalleryProps {
  entries: BrowseEntry[];
  initialIndex: number;
  open: boolean;
  onClose: () => void;
}

const SWIPE_THRESHOLD = 72;
const DISMISS_THRESHOLD = 110;
const DETAILS_OPEN_THRESHOLD = 72;
const TAP_MOVE_LIMIT = 12;
const SWIPE_ANIM_MS = 450;
const FLYOUT_ANIM_MS = 380;
const SLIDE_GAP = 16;
/** Only mount current ± this many slides (keeps big folders from building a huge track). */
const SLIDE_WINDOW = 1;
const DETAILS_SHEET_VH = 0.46;
const DETAILS_SHEET_LANDSCAPE_VH = 0.4;
const DETAILS_SHEET_LANDSCAPE_MAX_PX = 340;

interface TouchState {
  startX: number;
  startY: number;
  startTime: number;
  axis: 'x' | 'y' | 'pan' | null;
  offsetX: number;
  offsetY: number;
  startPanX: number;
  startPanY: number;
}

interface FlyoutLayer {
  src: string;
  poster?: string;
  kind: 'image' | 'video';
  rect: FlyoutRect;
}

interface TrackMetrics {
  stageWidth: number;
}

function computeMetrics(stageWidth: number): TrackMetrics {
  return { stageWidth };
}

function trackStep(stageWidth: number) {
  return stageWidth + SLIDE_GAP;
}

function computeTrackLayout(stageWidth: number, activeIndex: number, dragOffsetX: number) {
  const step = trackStep(stageWidth);
  const trackX = -activeIndex * step + dragOffsetX;
  return { slideWidth: stageWidth, gap: SLIDE_GAP, trackX };
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
      className="mobile-gallery-quality"
      onClick={(event) => event.stopPropagation()}
    >
      <SelectField
        label="Quality"
        value={quality}
        layout="ghost"
        onClick={(event) => event.stopPropagation()}
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

function detailsSheetMaxHeight() {
  const { innerWidth, innerHeight } = window;
  const landscape = innerWidth > innerHeight;
  if (landscape) {
    return Math.round(
      Math.min(innerHeight * DETAILS_SHEET_LANDSCAPE_VH, DETAILS_SHEET_LANDSCAPE_MAX_PX),
    );
  }
  // Tablets in portrait: don't let the sheet dominate a tall screen.
  if (innerWidth >= 768) {
    return Math.round(Math.min(innerHeight * DETAILS_SHEET_VH, 420));
  }
  return Math.round(innerHeight * DETAILS_SHEET_VH);
}

function clampSheetHeight(value: number, max: number) {
  return Math.max(0, Math.min(max, value));
}

function flyoutStyle(rect: FlyoutRect): React.CSSProperties {
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    borderRadius: rect.borderRadius,
  };
}

function viewportFlyoutRect(): FlyoutRect {
  return {
    left: 0,
    top: 0,
    width: window.innerWidth,
    height: window.innerHeight,
    borderRadius: 0,
  };
}

function buildFlyoutLayer(
  entry: BrowseEntry,
  rect: FlyoutRect,
  _quality: QualityTier,
): FlyoutLayer | null {
  if (!entry.token) return null;
  // Morph with a cached thumb/poster <img> so we never animate an empty/unloaded
  // full-res frames and broken <video src=poster> during the open animation.
  const src =
    entry.type === 'video'
      ? mediaUrl(entry.token, 'poster')
      : entry.thumbnailUrl ?? mediaUrl(entry.token, 'image', 'very_low');
  return { kind: 'image', src, rect };
}

function stageFlyoutRect(
  stage: HTMLDivElement | null,
  mediaPath?: string,
): FlyoutRect {
  const rect = stage?.getBoundingClientRect();
  if (!rect || rect.width <= 0 || rect.height <= 0) {
    return viewportFlyoutRect();
  }
  // Use the object-fit:contain paint box so open ends on the same framing
  // the gallery uses (then cover on a matching-aspect frame is a no-op crop).
  const natural = mediaPath ? getThumbnailNaturalSize(mediaPath) : null;
  if (natural) {
    return rectFromDomRect(
      objectFitContainRect(rect, natural.width, natural.height),
      0,
    );
  }
  return rectFromDomRect(rect, 0);
}

function activeMediaFlyoutRect(
  stage: HTMLDivElement | null,
  activeIndex: number,
): DOMRect | null {
  const media = getActiveMedia(stage, activeIndex);
  if (media) return mediaContentRect(media);

  // Fallback: full stage (keeps close animation alive if media isn't measurable yet).
  const stageRect = stage?.getBoundingClientRect();
  if (!stageRect || stageRect.width <= 0 || stageRect.height <= 0) return null;
  return stageRect;
}

function getActiveSlide(stage: HTMLDivElement | null, activeIndex: number) {
  return stage?.querySelector(
    `.mobile-gallery-slide-item[data-index="${activeIndex}"]`,
  ) as HTMLElement | null;
}

function getActiveImage(stage: HTMLDivElement | null, activeIndex: number) {
  return getActiveSlide(stage, activeIndex)?.querySelector(
    '.mobile-gallery-media',
  ) as HTMLImageElement | null;
}

function getActiveVideoPoster(stage: HTMLDivElement | null, activeIndex: number) {
  return getActiveSlide(stage, activeIndex)?.querySelector(
    '.gallery-thumb-overlay-host__img',
  ) as HTMLImageElement | null;
}

function getActiveVideoPlayer(stage: HTMLDivElement | null, activeIndex: number) {
  return getActiveSlide(stage, activeIndex)?.querySelector(
    '.mobile-gallery-video-player',
  ) as HTMLVideoElement | null;
}

function getActiveMedia(stage: HTMLDivElement | null, activeIndex: number) {
  const image = getActiveImage(stage, activeIndex);
  if (image) return image;

  const video = getActiveVideoPlayer(stage, activeIndex);
  if (video && video.videoWidth > 0 && video.classList.contains('ready')) {
    return video;
  }

  return getActiveVideoPoster(stage, activeIndex);
}

function getImageZoomContext(stage: HTMLDivElement | null, activeIndex: number) {
  const stageRect = stage?.getBoundingClientRect();
  const stageWidth = stageRect?.width ?? 0;
  const stageHeight = stageRect?.height ?? 0;

  const image = getActiveImage(stage, activeIndex);
  if (image?.naturalWidth && image.naturalHeight) {
    return {
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      stageWidth,
      stageHeight,
    };
  }

  const video = getActiveVideoPlayer(stage, activeIndex);
  if (video?.videoWidth && video.videoHeight) {
    return {
      naturalWidth: video.videoWidth,
      naturalHeight: video.videoHeight,
      stageWidth,
      stageHeight,
    };
  }

  const poster = getActiveVideoPoster(stage, activeIndex);
  return {
    naturalWidth: poster?.naturalWidth ?? 0,
    naturalHeight: poster?.naturalHeight ?? 0,
    stageWidth,
    stageHeight,
  };
}

function isZoomableEntry(entry: BrowseEntry | undefined) {
  return entry?.type === 'image' || entry?.type === 'video';
}

export function MobileGallery({
  entries,
  initialIndex,
  open,
  onClose,
}: MobileGalleryProps) {
  const { quality, setQuality, profiles } = useQualityPreference();
  const [index, setIndex] = useState(initialIndex);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [sheetDragY, setSheetDragY] = useState(0);
  const [isSheetDragging, setIsSheetDragging] = useState(false);
  const [renderDetailsSheet, setRenderDetailsSheet] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isClosing, setIsClosing] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [flyout, setFlyout] = useState<FlyoutLayer | null>(null);
  const [metrics, setMetrics] = useState<TrackMetrics>({ stageWidth: 0 });
  const [imageZoom, setImageZoom] = useState<ImageZoomState>(DEFAULT_IMAGE_ZOOM);
  const [hydratedPaths, setHydratedPaths] = useState<Set<string>>(() => new Set());

  const stageRef = useRef<HTMLDivElement>(null);
  const detailsSheetRef = useRef<HTMLDivElement>(null);
  const touchRef = useRef<TouchState | null>(null);
  const sheetTouchRef = useRef<{
    startX: number;
    startY: number;
    offsetY: number;
    dragging: boolean;
  } | null>(null);
  const pinchRef = useRef<PinchState | null>(null);
  const mediaEntries = useMemo(
    () => entries.filter((entry) => entry.type === 'image' || entry.type === 'video'),
    [entries],
  );
  const mediaEntriesRef = useRef(mediaEntries);
  mediaEntriesRef.current = mediaEntries;

  const currentEntry = mediaEntries[index];

  const indexRef = useRef(index);
  const isClosingRef = useRef(isClosing);
  const isOpeningRef = useRef(isOpening);
  const detailsOpenRef = useRef(detailsOpen);
  const mediaCountRef = useRef(0);
  const metricsRef = useRef(metrics);
  const imageZoomRef = useRef(imageZoom);
  const dragOffsetRef = useRef(dragOffset);
  const currentEntryRef = useRef(currentEntry);

  indexRef.current = index;
  isClosingRef.current = isClosing;
  isOpeningRef.current = isOpening;
  detailsOpenRef.current = detailsOpen;
  mediaCountRef.current = mediaEntries.length;
  metricsRef.current = metrics;
  imageZoomRef.current = imageZoom;
  dragOffsetRef.current = dragOffset;
  currentEntryRef.current = currentEntry;

  const resetDetailsSheet = useCallback(() => {
    setDetailsOpen(false);
    setSheetDragY(0);
    setIsSheetDragging(false);
    setRenderDetailsSheet(false);
  }, []);

  const prefetchNearbyDetails = useCallback(
    (centerIndex: number) => {
      for (const offset of [-1, 0, 1]) {
        const token = mediaEntries[centerIndex + offset]?.token;
        if (token) prefetchMediaMetadata(token);
      }
    },
    [mediaEntries],
  );

  const clampActiveImageZoom = useCallback((zoom: ImageZoomState) => {
    const context = getImageZoomContext(stageRef.current, indexRef.current);
    return clampImageZoom(
      zoom,
      context.naturalWidth,
      context.naturalHeight,
      context.stageWidth,
      context.stageHeight,
    );
  }, []);

  const resetImageZoom = useCallback(() => {
    setImageZoom(DEFAULT_IMAGE_ZOOM);
  }, []);

  const updateMetrics = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    setMetrics(computeMetrics(stage.clientWidth));
  }, []);

  const runFlyoutClose = useCallback(
    (fromRect: DOMRect) => {
      const entry = mediaEntriesRef.current[indexRef.current];
      if (!entry?.token) {
        onClose();
        return;
      }

      const thumbRect = getThumbnailRect(entry.path);
      if (!thumbRect) {
        onClose();
        return;
      }

      // Reuse the same thumb/poster as open to avoid decode jank on first close.
      const closingLayer = buildFlyoutLayer(
        entry,
        rectFromDomRect(fromRect, 0),
        quality,
      );
      if (!closingLayer) {
        onClose();
        return;
      }

      setIsClosing(true);
      setIsOpening(false);
      setIsDragging(false);
      setDragOffset({ x: 0, y: 0 });
      resetDetailsSheet();
      resetImageZoom();
      setFlyout(closingLayer);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setFlyout((current) =>
            current
              ? {
                  ...current,
                  rect: rectFromDomRect(thumbRect, 12),
                }
              : null,
          );
        });
      });

      window.setTimeout(() => {
        onClose();
        setIsClosing(false);
        setFlyout(null);
      }, FLYOUT_ANIM_MS);
    },
    [onClose, quality, resetDetailsSheet, resetImageZoom],
  );

  const animateClose = useCallback(() => {
    const mediaRect = activeMediaFlyoutRect(stageRef.current, indexRef.current);
    if (!mediaRect) {
      onClose();
      return;
    }
    runFlyoutClose(mediaRect);
  }, [onClose, runFlyoutClose]);

  const completeHorizontalSwipe = useCallback((nextIndex: number, offsetX: number) => {
    const stageWidth = metricsRef.current.stageWidth || window.innerWidth;
    const step = trackStep(stageWidth);
    const current = indexRef.current;
    if (nextIndex < 0 || nextIndex >= mediaCountRef.current) {
      setDragOffset({ x: 0, y: 0 });
      return;
    }

    const delta = nextIndex - current;
    const carryOffset = offsetX - delta * step;
    setIndex(nextIndex);
    setDragOffset({ x: carryOffset, y: 0 });
    requestAnimationFrame(() => {
      setDragOffset({ x: 0, y: 0 });
    });
  }, []);

  const qualityRef = useRef(quality);
  qualityRef.current = quality;

  useLayoutEffect(() => {
    if (!open) {
      setIsOpening(false);
      setHydratedPaths(new Set());
      return;
    }

    updateMetrics();

    const entry = mediaEntriesRef.current[initialIndex];
    setIndex(initialIndex);
    setDetailsOpen(false);
    setSheetDragY(0);
    setIsSheetDragging(false);
    setRenderDetailsSheet(false);
    setControlsVisible(true);
    setIsClosing(false);
    setIsDragging(false);
    setDragOffset({ x: 0, y: 0 });
    resetImageZoom();
    setHydratedPaths(entry ? new Set([entry.path]) : new Set());

    if (!entry) {
      setIsOpening(false);
      setFlyout(null);
      return;
    }

    const thumbRect = getThumbnailRect(entry.path);
    const openingLayer = thumbRect
      ? buildFlyoutLayer(entry, rectFromDomRect(thumbRect, 12), qualityRef.current)
      : null;

    if (!openingLayer) {
      setIsOpening(false);
      setFlyout(null);
      return;
    }

    setIsOpening(true);
    setFlyout(openingLayer);

    let openTimer: number | undefined;
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // Don't measure the underlying <img>; it may still be unloaded (0x0)
        // which made the flyout animate toward a tiny rect (looked like zooming out).
        // Target the contain paint box (via thumb natural size) so cover matches.
        const targetRect = stageFlyoutRect(stageRef.current, entry.path);
        setFlyout((current) =>
          current ? { ...current, rect: targetRect } : null,
        );
      });
    });

    openTimer = window.setTimeout(() => {
      setIsOpening(false);
      setFlyout(null);
    }, FLYOUT_ANIM_MS);

    return () => {
      cancelAnimationFrame(raf);
      if (openTimer !== undefined) window.clearTimeout(openTimer);
    };
  }, [open, initialIndex, updateMetrics, resetImageZoom]);

  useEffect(() => {
    resetImageZoom();
    setHydratedPaths((previous) => {
      const next = new Set<string>();
      for (let offset = -SLIDE_WINDOW; offset <= SLIDE_WINDOW; offset += 1) {
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
  }, [index, mediaEntries, resetImageZoom]);

  useEffect(() => {
    if (!open) return;
    if (!detailsOpen && sheetDragY === 0) return;
    prefetchNearbyDetails(index);
  }, [open, detailsOpen, sheetDragY, index, prefetchNearbyDetails]);

  useEffect(() => {
    if (detailsOpen || isSheetDragging || sheetDragY !== 0) {
      setRenderDetailsSheet(true);
      return undefined;
    }
    if (!renderDetailsSheet) return undefined;
    const timer = window.setTimeout(() => setRenderDetailsSheet(false), 320);
    return () => window.clearTimeout(timer);
  }, [detailsOpen, isSheetDragging, sheetDragY, renderDetailsSheet]);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    updateMetrics();
    window.addEventListener('resize', updateMetrics);
    return () => window.removeEventListener('resize', updateMetrics);
  }, [open, updateMetrics]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !open) return undefined;

    const onTouchStart = (event: TouchEvent) => {
      if (isClosingRef.current || isOpeningRef.current) return;

      if (
        event.touches.length === 2 &&
        currentEntryRef.current &&
        isZoomableEntry(currentEntryRef.current) &&
        canStartPinchZoom(touchRef.current, dragOffsetRef.current.x)
      ) {
        touchRef.current = null;
        const t1 = event.touches[0];
        const t2 = event.touches[1];
        if (!t1 || !t2) return;

        const center = touchCenter(t1, t2);
        const zoom = imageZoomRef.current;
        pinchRef.current = {
          startDistance: touchDistance(t1, t2),
          startScale: zoom.scale,
          startPanX: zoom.panX,
          startPanY: zoom.panY,
          startCenterX: center.x,
          startCenterY: center.y,
        };
        return;
      }

      const touch = event.touches[0];
      if (!touch) return;

      if (imageZoomRef.current.scale > 1 && isZoomableEntry(currentEntryRef.current)) {
        pinchRef.current = null;
        touchRef.current = {
          startX: touch.clientX,
          startY: touch.clientY,
          startTime: Date.now(),
          axis: 'pan',
          offsetX: 0,
          offsetY: 0,
          startPanX: imageZoomRef.current.panX,
          startPanY: imageZoomRef.current.panY,
        };
        return;
      }

      pinchRef.current = null;
      touchRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        startTime: Date.now(),
        axis: null,
        offsetX: 0,
        offsetY: 0,
        startPanX: 0,
        startPanY: 0,
      };
    };

    const onTouchMove = (event: TouchEvent) => {
      if (isClosingRef.current || isOpeningRef.current) return;

      if (event.touches.length >= 2 && isZoomableEntry(currentEntryRef.current)) {
        if (!canStartPinchZoom(touchRef.current, dragOffsetRef.current.x)) {
          return;
        }

        const t1 = event.touches[0];
        const t2 = event.touches[1];
        const stage = stageRef.current;
        if (!t1 || !t2 || !stage) return;

        if (!pinchRef.current) {
          touchRef.current = null;
          setIsDragging(false);
          const center = touchCenter(t1, t2);
          const zoom = imageZoomRef.current;
          pinchRef.current = {
            startDistance: touchDistance(t1, t2),
            startScale: zoom.scale,
            startPanX: zoom.panX,
            startPanY: zoom.panY,
            startCenterX: center.x,
            startCenterY: center.y,
          };
        }

        event.preventDefault();
        const stageRect = stage.getBoundingClientRect();
        const center = touchCenter(t1, t2);
        const context = getImageZoomContext(stage, indexRef.current);
        const nextZoom = computePinchZoom(
          pinchRef.current,
          touchDistance(t1, t2),
          center.x,
          center.y,
          stageRect.left + stageRect.width / 2,
          stageRect.top + stageRect.height / 2,
          context.naturalWidth,
          context.naturalHeight,
          context.stageWidth,
          context.stageHeight,
        );
        setImageZoom(nextZoom);
        return;
      }

      const state = touchRef.current;
      if (!state) return;

      const touch = event.touches[0];
      if (!touch) return;

      if (state.axis === 'pan') {
        event.preventDefault();
        const offsetX = touch.clientX - state.startX;
        const offsetY = touch.clientY - state.startY;
        state.offsetX = offsetX;
        state.offsetY = offsetY;
        const zoom = imageZoomRef.current;
        const context = getImageZoomContext(stageRef.current, indexRef.current);
        const nextZoom = clampImageZoom(
          {
            scale: zoom.scale,
            panX: state.startPanX + offsetX,
            panY: state.startPanY + offsetY,
          },
          context.naturalWidth,
          context.naturalHeight,
          context.stageWidth,
          context.stageHeight,
        );
        setImageZoom(nextZoom);
        return;
      }

      const offsetX = touch.clientX - state.startX;
      const offsetY = touch.clientY - state.startY;
      state.offsetX = offsetX;
      state.offsetY = offsetY;

      if (!state.axis) {
        if (Math.abs(offsetX) < 8 && Math.abs(offsetY) < 8) return;
        state.axis = Math.abs(offsetY) > Math.abs(offsetX) ? 'y' : 'x';
        if (state.axis === 'x') {
          pinchRef.current = null;
        }
      }

      event.preventDefault();

      if (state.axis === 'y') {
        const detailsOpenNow = detailsOpenRef.current;
        if (detailsOpenNow || offsetY < 0) {
          if (!detailsOpenNow && offsetY < 0) {
            prefetchNearbyDetails(indexRef.current);
          }
          setIsSheetDragging(true);
          setIsDragging(true);
          setSheetDragY(offsetY);
          setDragOffset({ x: 0, y: 0 });
          return;
        }

        if (offsetY > 0) {
          state.offsetY = offsetY;
          setIsSheetDragging(false);
          setIsDragging(true);
          setDragOffset({ x: 0, y: offsetY });
        }
        return;
      }

      if (state.axis === 'x') {
        state.offsetX = offsetX;
        setIsSheetDragging(false);
        setIsDragging(true);
        setDragOffset({ x: offsetX, y: 0 });
        pinchRef.current = null;
      }
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (pinchRef.current && event.touches.length < 2) {
        pinchRef.current = null;
        if (imageZoomRef.current.scale < ZOOM_SNAP_THRESHOLD) {
          resetImageZoom();
        } else {
          setImageZoom(clampActiveImageZoom(imageZoomRef.current));
        }
      }

      const state = touchRef.current;
      if (!state) return;

      if (event.touches.length > 0) {
        return;
      }

      touchRef.current = null;
      if (isClosingRef.current || isOpeningRef.current) return;

      const duration = Date.now() - state.startTime;
      const moved =
        Math.abs(state.offsetX) > TAP_MOVE_LIMIT || Math.abs(state.offsetY) > TAP_MOVE_LIMIT;

      if (state.axis === 'pan') {
        if (!moved && duration < 320) {
          setControlsVisible((value) => !value);
        }
        return;
      }

      setIsDragging(false);
      setIsSheetDragging(false);

      if (!moved && duration < 320) {
        setControlsVisible((value) => !value);
        setSheetDragY(0);
        return;
      }

      if (state.axis === 'y') {
        const detailsOpenNow = detailsOpenRef.current;

        if (detailsOpenNow) {
          if (state.offsetY > DETAILS_OPEN_THRESHOLD) {
            setDetailsOpen(false);
          }
          setSheetDragY(0);
          return;
        }

        if (state.offsetY < -DETAILS_OPEN_THRESHOLD) {
          setDetailsOpen(true);
          setSheetDragY(0);
          prefetchNearbyDetails(indexRef.current);
          return;
        }

        if (state.offsetY > DISMISS_THRESHOLD) {
          setSheetDragY(0);
          const mediaRect = activeMediaFlyoutRect(stageRef.current, indexRef.current);
          if (mediaRect) {
            runFlyoutClose(mediaRect);
          } else {
            onClose();
          }
          return;
        }

        setSheetDragY(0);
        if (state.offsetY > 0) {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => setDragOffset({ x: 0, y: 0 }));
          });
        }
        return;
      }

      if (state.axis === 'x') {
        if (state.offsetX < -SWIPE_THRESHOLD) {
          completeHorizontalSwipe(indexRef.current + 1, state.offsetX);
        } else if (state.offsetX > SWIPE_THRESHOLD) {
          completeHorizontalSwipe(indexRef.current - 1, state.offsetX);
        } else {
          setDragOffset({ x: 0, y: 0 });
        }
        return;
      }

      setDragOffset({ x: 0, y: 0 });
    };

    stage.addEventListener('touchstart', onTouchStart, { passive: true });
    stage.addEventListener('touchmove', onTouchMove, { passive: false });
    stage.addEventListener('touchend', onTouchEnd);
    stage.addEventListener('touchcancel', onTouchEnd);

    return () => {
      stage.removeEventListener('touchstart', onTouchStart);
      stage.removeEventListener('touchmove', onTouchMove);
      stage.removeEventListener('touchend', onTouchEnd);
      stage.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [open, completeHorizontalSwipe, onClose, runFlyoutClose, resetImageZoom, clampActiveImageZoom, prefetchNearbyDetails]);

  useEffect(() => {
    const sheet = detailsSheetRef.current;
    if (!sheet || !open || !detailsOpen) return undefined;

    const onTouchStart = (event: TouchEvent) => {
      if (isClosingRef.current || isOpeningRef.current) return;
      const touch = event.touches[0];
      if (!touch) return;
      sheetTouchRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        offsetY: 0,
        dragging: false,
      };
    };

    const onTouchMove = (event: TouchEvent) => {
      const state = sheetTouchRef.current;
      const touch = event.touches[0];
      if (!state || !touch) return;

      const offsetX = touch.clientX - state.startX;
      const offsetY = touch.clientY - state.startY;
      const scroller = sheet.querySelector(
        '.image-details-panel-sheet',
      ) as HTMLElement | null;
      const atTop = !scroller || scroller.scrollTop <= 0;

      if (!state.dragging) {
        if (Math.abs(offsetX) < 8 && Math.abs(offsetY) < 8) return;
        if (offsetY > 0 && Math.abs(offsetY) >= Math.abs(offsetX) && atTop) {
          state.dragging = true;
          setIsSheetDragging(true);
        } else {
          sheetTouchRef.current = null;
          return;
        }
      }

      event.preventDefault();
      state.offsetY = Math.max(0, offsetY);
      setSheetDragY(state.offsetY);
    };

    const onTouchEnd = () => {
      const state = sheetTouchRef.current;
      sheetTouchRef.current = null;
      if (!state?.dragging) return;

      setIsSheetDragging(false);
      if (state.offsetY > DETAILS_OPEN_THRESHOLD) {
        setDetailsOpen(false);
      }
      setSheetDragY(0);
    };

    sheet.addEventListener('touchstart', onTouchStart, { passive: true });
    sheet.addEventListener('touchmove', onTouchMove, { passive: false });
    sheet.addEventListener('touchend', onTouchEnd);
    sheet.addEventListener('touchcancel', onTouchEnd);

    return () => {
      sheet.removeEventListener('touchstart', onTouchStart);
      sheet.removeEventListener('touchmove', onTouchMove);
      sheet.removeEventListener('touchend', onTouchEnd);
      sheet.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [open, detailsOpen]);

  if (!open || !currentEntry) return null;

  const stageWidth = metrics.stageWidth > 0 ? metrics.stageWidth : window.innerWidth;
  const layout = computeTrackLayout(stageWidth, index, dragOffset.x);
  const sheetMax = detailsSheetMaxHeight();
  const baseSheetHeight = detailsOpen ? sheetMax : 0;
  const sheetHeight = isSheetDragging
    ? detailsOpen
      ? clampSheetHeight(sheetMax - sheetDragY, sheetMax)
      : clampSheetHeight(-sheetDragY, sheetMax)
    : baseSheetHeight;
  const showDetailsSheet = sheetHeight > 0;
  const detailsContentVisible = renderDetailsSheet && Boolean(currentEntry.token);
  const isVerticalDismiss = dragOffset.y > 0 && !detailsOpen && !isSheetDragging;
  const dragScale = Math.max(0.72, 1 - dragOffset.y / (window.innerHeight * 1.35));
  const trackTransform = `translate3d(${layout.trackX}px, 0, 0)`;
  const hasTrackTransition = !isClosing && !isOpening && !isDragging;
  const step = trackStep(stageWidth);
  const windowFrom = Math.max(0, index - SLIDE_WINDOW);
  const windowTo = Math.min(mediaEntries.length - 1, index + SLIDE_WINDOW);

  const backdropOpacity = isClosing
    ? 0
    : Math.max(0, 1 - dragOffset.y / (window.innerHeight * 0.9));
  const backdropClass =
    isOpening && !isClosing ? ' mobile-gallery-backdrop-opening' : '';
  const backdropStyle: React.CSSProperties | undefined =
    isOpening && !isClosing ? undefined : { opacity: backdropOpacity };

  const slideNodes = [];
  for (let slideIndex = windowFrom; slideIndex <= windowTo; slideIndex += 1) {
    const entry = mediaEntries[slideIndex];
    if (!entry) continue;

    const isActive = slideIndex === index;
    const distance = Math.abs(slideIndex - index);
    const isAdjacent = distance === 1;
    const slideStyle: React.CSSProperties = {
      width: layout.slideWidth,
      left: slideIndex * step,
    };

    if (isActive) {
      const y = dragOffset.y;
      const scale = y > 0 ? dragScale : 1;
      if (y > 0) {
        slideStyle.transform = `translate3d(0, ${y}px, 0) scale(${scale})`;
        slideStyle.zIndex = 2;
      } else if (hasTrackTransition) {
        slideStyle.transform = 'translate3d(0, 0, 0) scale(1)';
      }
      if (hasTrackTransition) {
        slideStyle.transition = `transform ${SWIPE_ANIM_MS}ms cubic-bezier(0.33, 1, 0.68, 1)`;
      }
    } else if (isVerticalDismiss) {
      slideStyle.visibility = 'hidden';
    }

    const previewSrc =
      entry.thumbnailUrl ??
      (entry.token
        ? entry.type === 'video'
          ? mediaUrl(entry.token, 'poster')
          : mediaUrl(entry.token, 'image', 'very_low')
        : '');

    slideNodes.push(
      <div
        key={entry.path}
        className="mobile-gallery-slide-item"
        data-index={slideIndex}
        style={slideStyle}
      >
        {entry.type === 'video' && entry.token ? (
          <MobileGalleryVideoSlide
            entry={entry}
            isActive={isActive}
            isNearby={isAdjacent}
            quality={quality}
            controlsVisible={controlsVisible}
            previewSrc={previewSrc}
            loadFullMedia={hydratedPaths.has(entry.path)}
            style={
              isActive ? { transform: imageZoomTransform(imageZoom) } : undefined
            }
          />
        ) : entry.token ? (
          <ChromeRasterImage
            className="mobile-gallery-media"
            src={
              hydratedPaths.has(entry.path)
                ? mediaUrl(entry.token, 'image', quality)
                : previewSrc
            }
            alt={entry.name}
            zoom={isActive ? imageZoom.scale : 1}
            style={
              isActive ? { transform: imageZoomTransform(imageZoom) } : undefined
            }
          />
        ) : null}
      </div>,
    );
  }

  const content = (
    <div
      className={`mobile-gallery${controlsVisible ? ' controls-visible' : ''}${
        isClosing ? ' closing' : ''
      }${isOpening ? ' opening' : ''}${isSheetDragging ? ' sheet-dragging' : ''}${
        detailsOpen || sheetHeight > 0 ? ' details-open' : ''
      }`}
      role="dialog"
      aria-modal="true"
      style={
        {
          '--details-sheet-height': `${sheetHeight}px`,
        } as React.CSSProperties
      }
    >
      <div
        className={`mobile-gallery-backdrop${backdropClass}`}
        style={backdropStyle}
      />

      <div className={`mobile-gallery-chrome${controlsVisible && !isOpening ? '' : ' hidden'}`}>
        <button
          type="button"
          className="mobile-gallery-back"
          aria-label="Back"
          onClick={(event) => {
            event.stopPropagation();
            animateClose();
          }}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path
              fill="currentColor"
              d="M14.7 5.3 8 12l6.7 6.7 1.4-1.4L10.8 12l5.3-5.3-1.4-1.4Z"
            />
          </svg>
        </button>
        <div className="mobile-gallery-tools">
          <GalleryQualitySelect
            quality={quality}
            profiles={profiles}
            onChange={setQuality}
          />
          <button
            type="button"
            className={`mobile-gallery-details-btn${detailsOpen ? ' active' : ''}`}
            aria-label="Details"
            aria-pressed={detailsOpen}
            onClick={(event) => {
              event.stopPropagation();
              setSheetDragY(0);
              setIsSheetDragging(false);
              setDetailsOpen((value) => {
                const next = !value;
                if (next) prefetchNearbyDetails(index);
                return next;
              });
            }}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path
                fill="currentColor"
                d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm1 15h-2v-6h2Zm0-8h-2V7h2Z"
              />
            </svg>
          </button>
        </div>
      </div>

      <div ref={stageRef} className="mobile-gallery-stage">
        <div
          className={`mobile-gallery-track${isClosing || isOpening ? ' hidden' : ''}`}
          style={{
            transform: trackTransform,
            transition: hasTrackTransition
              ? `transform ${SWIPE_ANIM_MS}ms cubic-bezier(0.33, 1, 0.68, 1)`
              : 'none',
          }}
        >
          {slideNodes}
        </div>
      </div>

      {flyout ? (
        <div
          className="mobile-gallery-flyout"
          style={flyoutStyle(flyout.rect)}
        >
          {flyout.kind === 'video' ? (
            <video
              className="mobile-gallery-flyout-media"
              src={flyout.src}
              poster={flyout.poster}
              playsInline
              muted
              autoPlay
            />
          ) : (
            <img
              className="mobile-gallery-flyout-media"
              src={flyout.src}
              alt=""
              draggable={false}
            />
          )}
        </div>
      ) : null}

      <div
        ref={detailsSheetRef}
        className={`mobile-gallery-details-sheet${showDetailsSheet ? ' visible' : ''}`}
        aria-hidden={!showDetailsSheet}
      >
        {detailsContentVisible && currentEntry.token ? (
          <MediaDetailsPanel token={currentEntry.token} variant="sheet" />
        ) : null}
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
