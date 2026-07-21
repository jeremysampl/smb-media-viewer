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
  bufferRows = 1,
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

    const observer = new IntersectionObserver(
      ([entry]) => {
        setInView(entry.isIntersecting);
      },
      { rootMargin: `${marginFor(element, bufferRows)}px 0px` },
    );
    observer.observe(element);

    // Initial callback can be delayed; measure immediately too.
    setInView(isNearViewport(element, marginFor(element, bufferRows)));

    return () => observer.disconnect();
  }, [bufferRows, layoutKey, src]);

  // Sort/reorder: drop decoded images first, then re-measure after layout settles.
  useLayoutEffect(() => {
    if (layoutKey === undefined) return undefined;

    setInView(false);
    setLoaded(false);

    let cancelled = false;
    let innerFrame = 0;
    const outerFrame = window.requestAnimationFrame(() => {
      innerFrame = window.requestAnimationFrame(() => {
        if (cancelled) return;
        const element = ref.current;
        if (!element) return;
        setInView(isNearViewport(element, marginFor(element, bufferRows)));
      });
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(outerFrame);
      window.cancelAnimationFrame(innerFrame);
    };
  }, [layoutKey, bufferRows]);

  useEffect(() => {
    if (!inView) {
      setLoaded(false);
    }
  }, [inView]);

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

  return (
    <div
      ref={ref}
      className={`lazy-thumb${loaded && showImage ? ' is-loaded' : ' is-loading'}`}
    >
      {showImage ? (
        <img
          key={`${src}:${retryKey}`}
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
