import { useEffect, useRef, useState } from 'react';

interface LazyThumbnailProps {
  src: string;
  alt: string;
  /** Extra rows to preload above/below the viewport */
  bufferRows?: number;
}

const DEFAULT_CARD_HEIGHT = 220;
const MAX_RETRIES = 3;

export function LazyThumbnail({ src, alt, bufferRows = 2 }: LazyThumbnailProps) {
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

    const margin = bufferRows * DEFAULT_CARD_HEIGHT;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setInView(entry.isIntersecting);
      },
      { rootMargin: `${margin}px 0px` },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [bufferRows]);

  // Drop decoded bitmap when scrolled far away to reclaim memory.
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
          decoding="async"
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
