import { useEffect, useLayoutEffect, useRef, useState } from 'react';

interface LazyThumbnailProps {
  src: string;
  alt: string;
  /** Extra rows to preload above/below the viewport */
  bufferRows?: number;
  /** Change this when grid order/layout changes so visibility is rechecked */
  layoutKey?: string | number;
}

const DEFAULT_CARD_HEIGHT = 160;
const MAX_RETRIES = 3;

function isNearViewport(element: HTMLElement, margin: number): boolean {
  const rect = element.getBoundingClientRect();
  return rect.bottom > -margin && rect.top < window.innerHeight + margin;
}

function marginFor(element: HTMLElement, bufferRows: number): number {
  const height = element.getBoundingClientRect().height;
  return bufferRows * (height > 0 ? height : DEFAULT_CARD_HEIGHT);
}

export function LazyThumbnail({
  src,
  alt,
  bufferRows = 2,
  layoutKey,
}: LazyThumbnailProps) {
  const ref = useRef<HTMLDivElement>(null);
  const retryCountRef = useRef(0);
  const [inView, setInView] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [awaitingRetry, setAwaitingRetry] = useState(false);
  const [giveUp, setGiveUp] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    retryCountRef.current = 0;
    setLoaded(false);
    setAwaitingRetry(false);
    setGiveUp(false);
    setRetryKey(0);
  }, [src]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;

    const update = () => {
      setInView(isNearViewport(element, marginFor(element, bufferRows)));
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          return;
        }
        // Keep loaded thumbs mounted while only slightly off-screen; drop when
        // clearly away so filter/sort reshuffles still refresh correctly.
        update();
      },
      { rootMargin: `${marginFor(element, bufferRows)}px 0px` },
    );
    observer.observe(element);
    update();

    return () => observer.disconnect();
  }, [bufferRows, layoutKey, src]);

  // After sort/filter layout changes, re-check visibility without blanking first
  // (blanking raced the observer and left some thumbs stuck unloaded).
  useLayoutEffect(() => {
    if (layoutKey === undefined) return undefined;

    const element = ref.current;
    if (element) {
      setInView(isNearViewport(element, marginFor(element, bufferRows)));
    }

    let cancelled = false;
    let innerFrame = 0;
    const outerFrame = window.requestAnimationFrame(() => {
      innerFrame = window.requestAnimationFrame(() => {
        if (cancelled) return;
        const node = ref.current;
        if (!node) return;
        setInView(isNearViewport(node, marginFor(node, bufferRows)));
      });
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(outerFrame);
      window.cancelAnimationFrame(innerFrame);
    };
  }, [layoutKey, bufferRows]);

  useEffect(() => {
    if (!awaitingRetry || giveUp) return undefined;
    const timer = window.setTimeout(() => {
      retryCountRef.current += 1;
      setAwaitingRetry(false);
      setLoaded(false);
      setRetryKey((value) => value + 1);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [awaitingRetry, giveUp]);

  const showImage = inView && !giveUp && !awaitingRetry;
  const imageRef = useRef<HTMLImageElement | null>(null);

  useLayoutEffect(() => {
    if (!showImage) return;
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth > 0) {
      setLoaded(true);
    }
  }, [showImage, src, retryKey]);

  return (
    <div
      ref={ref}
      className={`lazy-thumb${loaded && showImage ? ' is-loaded' : ' is-loading'}`}
    >
      {showImage ? (
        <img
          key={`${src}:${retryKey}`}
          ref={imageRef}
          src={src}
          alt={alt}
          draggable={false}
          decoding="async"
          onDragStart={(event) => event.preventDefault()}
          onLoad={() => setLoaded(true)}
          onError={() => {
            if (retryCountRef.current >= MAX_RETRIES) {
              setGiveUp(true);
              return;
            }
            setAwaitingRetry(true);
          }}
        />
      ) : (
        <div className="placeholder" aria-hidden />
      )}
    </div>
  );
}
