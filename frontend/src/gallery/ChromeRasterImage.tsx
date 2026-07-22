import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ImgHTMLAttributes,
} from 'react';
import {
  computeChromeRasterLayout,
  shouldRasterizeForZoom,
  shouldUseChromeImageRaster,
  type ChromeRasterVariant,
} from './chromeImageRaster';

type ImgProps = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  'width' | 'height' | 'style' | 'className' | 'src' | 'alt'
>;

interface ChromeRasterImageProps extends ImgProps {
  src: string;
  alt: string;
  className?: string;
  /** Applied to the outer shell (e.g. mobile pinch-zoom transform). */
  style?: CSSProperties;
  /** Explicit container size (YARL slide rect). If omitted, measures the shell. */
  containerWidth?: number;
  containerHeight?: number;
  /** Current CSS zoom (1 = fit). Mobile only applies will-change pre-scale while zoomed. */
  zoom?: number;
  /**
   * mobile: fill parent; keep geometry stable across zoom; GPU pre-scale only while zoomed.
   * desktop: shell sized to contain-fit box for YARL centering/zoom; pre-scale at rest.
   */
  variant?: ChromeRasterVariant;
  /** Notify parent of intrinsic size (YARL zoom needs slide width/height). */
  onNaturalSize?: (width: number, height: number) => void;
}

/**
 * Cross-fade quality/src changes: keep the current bitmap + layout until the next
 * URL has decoded, so zoomed views don't flash/stretch while the new tier loads.
 */
export function ChromeRasterImage({
  src,
  alt,
  className,
  style,
  containerWidth,
  containerHeight,
  zoom = 1,
  variant = 'mobile',
  onNaturalSize,
  onLoad,
  ...imgProps
}: ChromeRasterImageProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const [shownSrc, setShownSrc] = useState(src);
  const [natural, setNatural] = useState({ width: 0, height: 0 });
  const [box, setBox] = useState({ width: 0, height: 0 });
  const chrome = shouldUseChromeImageRaster();
  const containShell = variant === 'desktop';
  const useGpuRaster =
    chrome && (variant === 'desktop' || shouldRasterizeForZoom(zoom));
  const pendingSrc = src !== shownSrc ? src : null;

  useLayoutEffect(() => {
    if (containerWidth && containerHeight) {
      setBox({ width: containerWidth, height: containerHeight });
      return undefined;
    }

    const node = shellRef.current;
    if (!node) return undefined;

    const update = () => {
      setBox({ width: node.clientWidth, height: node.clientHeight });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [containerWidth, containerHeight, shownSrc]);

  const commitLoaded = useCallback(
    (image: HTMLImageElement, nextSrc: string) => {
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      if (width > 0 && height > 0) {
        setNatural((previous) => {
          // Same photo / aspect: keep layout numbers stable across quality tiers.
          if (
            previous.width > 0 &&
            previous.height > 0 &&
            Math.abs(previous.width / previous.height - width / height) < 0.01
          ) {
            return previous;
          }
          return { width, height };
        });
        onNaturalSize?.(width, height);
      }
      setShownSrc(nextSrc);
    },
    [onNaturalSize],
  );

  const handleShownLoad = useCallback(
    (event: React.SyntheticEvent<HTMLImageElement>) => {
      commitLoaded(event.currentTarget, shownSrc);
      onLoad?.(event);
    },
    [commitLoaded, onLoad, shownSrc],
  );

  const handlePendingLoad = useCallback(
    (event: React.SyntheticEvent<HTMLImageElement>) => {
      if (!pendingSrc) return;
      commitLoaded(event.currentTarget, pendingSrc);
    },
    [commitLoaded, pendingSrc],
  );

  const pendingRef = useCallback(
    (image: HTMLImageElement | null) => {
      if (!image || !pendingSrc) return;
      if (image.complete && image.naturalWidth > 0) {
        commitLoaded(image, pendingSrc);
      }
    },
    [commitLoaded, pendingSrc],
  );

  const fitContainerWidth =
    containShell && natural.width > 0 && box.width > 0
      ? natural.width * Math.min(box.width / natural.width, box.height / natural.height)
      : box.width;
  const fitContainerHeight =
    containShell && natural.width > 0 && box.width > 0
      ? natural.height * Math.min(box.width / natural.width, box.height / natural.height)
      : box.height;

  const placement =
    natural.width > 0 && fitContainerWidth > 0 && fitContainerHeight > 0
      ? computeChromeRasterLayout(
          natural.width,
          natural.height,
          fitContainerWidth,
          fitContainerHeight,
          {
            variant,
            shellIsDisplayBox: containShell,
            forceDisplayOnly: !useGpuRaster,
          },
        )
      : null;

  const shellSize = containShell
    ? placement
      ? { width: placement.displayWidth, height: placement.displayHeight }
      : null
    : null;

  const layerStyle: CSSProperties | undefined = placement
    ? {
        position: 'absolute',
        left: placement.offsetX,
        top: placement.offsetY,
        width: placement.rasterWidth,
        height: placement.rasterHeight,
        transform: `translate3d(0, 0, 0) scale(${placement.rasterScale})`,
        transformOrigin: '0 0',
        ...(useGpuRaster
          ? { willChange: 'transform', backfaceVisibility: 'hidden' as const }
          : {}),
      }
    : undefined;

  const shellStyle: CSSProperties = {
    ...style,
    ...(shellSize
      ? { width: shellSize.width, height: shellSize.height }
      : undefined),
  };

  return (
    <div
      ref={shellRef}
      className={`chrome-raster-shell chrome-raster-shell--${containShell ? 'contain' : 'fill'}`}
      style={shellStyle}
    >
      <div
        className={`chrome-raster-layer${placement ? ' is-placed' : ''}${
          useGpuRaster ? ' is-rasterized' : ''
        }`}
        style={layerStyle}
      >
        <img
          {...imgProps}
          className={className}
          src={shownSrc}
          alt={alt}
          draggable={imgProps.draggable ?? false}
          onLoad={handleShownLoad}
        />
        {pendingSrc ? (
          <img
            ref={pendingRef}
            className={`${className ?? ''} chrome-raster-pending`.trim()}
            src={pendingSrc}
            alt=""
            aria-hidden
            draggable={false}
            onLoad={handlePendingLoad}
          />
        ) : null}
      </div>
    </div>
  );
}
