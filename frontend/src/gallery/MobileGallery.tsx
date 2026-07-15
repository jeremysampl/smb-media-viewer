import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { mediaUrl } from '../api/client';
import type { BrowseEntry, QualityTier } from '../types';
import { useQualityPreference } from '../browser/ResolutionSelector';
import { MediaDetailsPanel } from './MediaDetailsPanel';
import { MobileGalleryVideoSlide } from './MobileGalleryVideoSlide';
import { getThumbnailRect, rectFromDomRect, type FlyoutRect } from './getThumbnailRect';
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
const TAP_MOVE_LIMIT = 12;
const SWIPE_ANIM_MS = 450;
const FLYOUT_ANIM_MS = 380;
const SLIDE_GAP = 16;

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
    <label className="mobile-gallery-quality" onClick={(event) => event.stopPropagation()}>
      <span className="sr-only">Quality</span>
      <select
        value={quality}
        aria-label="Quality"
        onChange={(event) => onChange(event.target.value as QualityTier)}
        onClick={(event) => event.stopPropagation()}
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
  quality: QualityTier,
): FlyoutLayer | null {
  if (!entry.token) return null;
  const kind = entry.type === 'video' ? 'video' : 'image';
  const src =
    kind === 'video'
      ? mediaUrl(entry.token, 'video', quality)
      : mediaUrl(entry.token, 'image', quality);
  const poster = kind === 'video' ? mediaUrl(entry.token, 'poster') : undefined;
  return { kind, src, poster, rect };
}

function getActiveImage(stage: HTMLDivElement | null, activeIndex: number) {
  return stage?.querySelector(
    `.mobile-gallery-slide-item[data-index="${activeIndex}"] .mobile-gallery-media`,
  ) as HTMLImageElement | null;
}

function getActiveMedia(stage: HTMLDivElement | null, activeIndex: number) {
  return getActiveImage(stage, activeIndex) as HTMLImageElement | HTMLVideoElement | null;
}

function getImageZoomContext(stage: HTMLDivElement | null, activeIndex: number) {
  const stageRect = stage?.getBoundingClientRect();
  const image = getActiveImage(stage, activeIndex);
  return {
    naturalWidth: image?.naturalWidth ?? 0,
    naturalHeight: image?.naturalHeight ?? 0,
    stageWidth: stageRect?.width ?? 0,
    stageHeight: stageRect?.height ?? 0,
  };
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
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isClosing, setIsClosing] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [flyout, setFlyout] = useState<FlyoutLayer | null>(null);
  const [metrics, setMetrics] = useState<TrackMetrics>({ stageWidth: 0 });
  const [imageZoom, setImageZoom] = useState<ImageZoomState>(DEFAULT_IMAGE_ZOOM);

  const stageRef = useRef<HTMLDivElement>(null);
  const touchRef = useRef<TouchState | null>(null);
  const pinchRef = useRef<PinchState | null>(null);
  const mediaEntries = useMemo(
    () => entries.filter((entry) => entry.type === 'image' || entry.type === 'video'),
    [entries],
  );

  const currentEntry = mediaEntries[index];

  const indexRef = useRef(index);
  const isClosingRef = useRef(isClosing);
  const isOpeningRef = useRef(isOpening);
  const mediaCountRef = useRef(0);
  const metricsRef = useRef(metrics);
  const imageZoomRef = useRef(imageZoom);
  const dragOffsetRef = useRef(dragOffset);
  const currentEntryRef = useRef(currentEntry);

  indexRef.current = index;
  isClosingRef.current = isClosing;
  isOpeningRef.current = isOpening;
  mediaCountRef.current = mediaEntries.length;
  metricsRef.current = metrics;
  imageZoomRef.current = imageZoom;
  dragOffsetRef.current = dragOffset;
  currentEntryRef.current = currentEntry;

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
      const entry = mediaEntries[indexRef.current];
      if (!entry?.token) {
        onClose();
        return;
      }

      const thumbRect = getThumbnailRect(entry.path);
      if (!thumbRect) {
        onClose();
        return;
      }

      const kind = entry.type === 'video' ? 'video' : 'image';
      const src =
        kind === 'video'
          ? mediaUrl(entry.token, 'video', quality)
          : mediaUrl(entry.token, 'image', quality);
      const poster = kind === 'video' ? mediaUrl(entry.token, 'poster') : undefined;

      setIsClosing(true);
      setIsOpening(false);
      setIsDragging(false);
      setDragOffset({ x: 0, y: 0 });
      resetImageZoom();
      setFlyout({
        kind,
        src,
        poster,
        rect: rectFromDomRect(fromRect, 0),
      });

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
    [mediaEntries, onClose, quality, resetImageZoom],
  );

  const animateClose = useCallback(() => {
    const mediaRect = getActiveMedia(stageRef.current, indexRef.current)?.getBoundingClientRect();
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

  useLayoutEffect(() => {
    if (!open) {
      setIsOpening(false);
      return;
    }

    updateMetrics();

    const entry = mediaEntries[initialIndex];
    setIndex(initialIndex);
    setDetailsOpen(false);
    setControlsVisible(true);
    setIsClosing(false);
    setIsDragging(false);
    setDragOffset({ x: 0, y: 0 });
    resetImageZoom();

    if (!entry) {
      setIsOpening(false);
      setFlyout(null);
      return;
    }

    const thumbRect = getThumbnailRect(entry.path);
    const openingLayer = thumbRect
      ? buildFlyoutLayer(entry, rectFromDomRect(thumbRect, 12), quality)
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
        const mediaRect = getActiveMedia(stageRef.current, initialIndex)?.getBoundingClientRect();
        const targetRect = mediaRect
          ? rectFromDomRect(mediaRect, 0)
          : viewportFlyoutRect();
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
  }, [open, initialIndex, mediaEntries, quality, updateMetrics, resetImageZoom]);

  useEffect(() => {
    resetImageZoom();
    setDetailsOpen(false);
  }, [index, resetImageZoom]);

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
        currentEntryRef.current?.type === 'image' &&
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

      if (imageZoomRef.current.scale > 1 && currentEntryRef.current?.type === 'image') {
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

      if (event.touches.length >= 2 && currentEntryRef.current?.type === 'image') {
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

      if (state.axis === 'y' && offsetY > 0) {
        state.offsetY = offsetY;
        setIsDragging(true);
        setDragOffset({ x: 0, y: offsetY });
        return;
      }

      if (state.axis === 'x') {
        state.offsetX = offsetX;
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

      if (state.axis === 'pan') {
        return;
      }

      const duration = Date.now() - state.startTime;
      const moved =
        Math.abs(state.offsetX) > TAP_MOVE_LIMIT || Math.abs(state.offsetY) > TAP_MOVE_LIMIT;

      setIsDragging(false);

      if (!moved && duration < 320) {
        setControlsVisible((value) => !value);
        return;
      }

      if (state.axis === 'y' && state.offsetY > DISMISS_THRESHOLD) {
        const mediaRect = getActiveMedia(stageRef.current, indexRef.current)?.getBoundingClientRect();
        if (mediaRect) {
          runFlyoutClose(mediaRect);
        } else {
          onClose();
        }
        return;
      }

      if (state.axis === 'y') {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => setDragOffset({ x: 0, y: 0 }));
        });
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
  }, [open, completeHorizontalSwipe, onClose, runFlyoutClose, resetImageZoom, clampActiveImageZoom]);

  if (!open || !currentEntry) return null;

  const stageWidth = metrics.stageWidth > 0 ? metrics.stageWidth : window.innerWidth;
  const layout = computeTrackLayout(stageWidth, index, dragOffset.x);
  const isVerticalDismiss = dragOffset.y > 0;
  const dragScale = Math.max(0.72, 1 - dragOffset.y / (window.innerHeight * 1.35));
  const trackTransform = `translate3d(${layout.trackX}px, 0, 0)`;
  const hasTrackTransition = !isClosing && !isOpening && !isDragging;

  const backdropOpacity = isClosing
    ? 0
    : Math.max(0, 1 - dragOffset.y / (window.innerHeight * 0.9));
  const backdropClass =
    isOpening && !isClosing ? ' mobile-gallery-backdrop-opening' : '';
  const backdropStyle: React.CSSProperties | undefined =
    isOpening && !isClosing ? undefined : { opacity: backdropOpacity };

  const content = (
    <div
      className={`mobile-gallery${controlsVisible ? ' controls-visible' : ''}${
        isClosing ? ' closing' : ''
      }${isOpening ? ' opening' : ''}`}
      role="dialog"
      aria-modal="true"
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
          ←
        </button>
        <div className="mobile-gallery-tools">
          <GalleryQualitySelect
            quality={quality}
            profiles={profiles}
            onChange={setQuality}
          />
          <button
            type="button"
            className="mobile-gallery-details-btn"
            aria-label="Details"
            onClick={(event) => {
              event.stopPropagation();
              setDetailsOpen((value) => !value);
            }}
          >
            ⓘ
          </button>
        </div>
      </div>

      <div ref={stageRef} className="mobile-gallery-stage">
        <div
          className={`mobile-gallery-track${isClosing || isOpening ? ' hidden' : ''}`}
          style={{
            gap: layout.gap,
            transform: trackTransform,
            transition: hasTrackTransition
              ? `transform ${SWIPE_ANIM_MS}ms cubic-bezier(0.33, 1, 0.68, 1)`
              : 'none',
          }}
        >
          {mediaEntries.map((entry, slideIndex) => {
            const isActive = slideIndex === index;
            const isNearby = Math.abs(slideIndex - index) <= 1;
            const slideStyle: React.CSSProperties = {
              width: layout.slideWidth,
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

            return (
              <div
                key={entry.path}
                className="mobile-gallery-slide-item"
                data-index={slideIndex}
                style={slideStyle}
              >
                {!isNearby ? null : entry.type === 'video' && entry.token ? (
                  <MobileGalleryVideoSlide
                    entry={entry}
                    isActive={isActive}
                    isNearby={Math.abs(slideIndex - index) === 1}
                    quality={quality}
                    controlsVisible={controlsVisible}
                  />
                ) : entry.token ? (
                  <img
                    className="mobile-gallery-media"
                    src={mediaUrl(entry.token, 'image', quality)}
                    alt={entry.name}
                    draggable={false}
                    style={
                      isActive
                        ? { transform: imageZoomTransform(imageZoom) }
                        : undefined
                    }
                  />
                ) : null}
              </div>
            );
          })}
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

      {detailsOpen && currentEntry.token ? (
        <MediaDetailsPanel
          token={currentEntry.token}
          onClose={() => setDetailsOpen(false)}
        />
      ) : null}
    </div>
  );

  return createPortal(content, document.body);
}
