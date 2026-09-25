import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { acquireThumbSlot } from './thumbLoadGate';

interface LazyThumbnailProps {
  src: string;
  alt: string;
  /** Extra rows to preload above/below the viewport. */
  bufferRows?: number;
  /** Bump when grid order/layout changes to recheck visibility. */
  layoutKey?: string | number;
  /** Scroll container for visibility checks (defaults to the viewport). */
  root?: Element | null;
}

const DEFAULT_CARD_HEIGHT = 160;
const MAX_RETRIES = 3;

function isNearRoot(element: HTMLElement, root: Element | null | undefined, margin: number): boolean {
  const rect = element.getBoundingClientRect();
  if (!root) {
    return rect.bottom > -margin && rect.top < window.innerHeight + margin;
  }
  const rootRect = root.getBoundingClientRect();
  return rect.bottom > rootRect.top - margin && rect.top < rootRect.bottom + margin;
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
  root = null,
}: LazyThumbnailProps) {
  const ref = useRef<HTMLDivElement>(null);
  const retryCountRef = useRef(0);
  const releaseSlotRef = useRef<(() => void) | null>(null);
  const [inView, setInView] = useState(false);
  const [slotReady, setSlotReady] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [awaitingRetry, setAwaitingRetry] = useState(false);
  const [giveUp, setGiveUp] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const releaseSlot = () => {
    releaseSlotRef.current?.();
    releaseSlotRef.current = null;
  };

  useEffect(() => {
    retryCountRef.current = 0;
    setLoaded(false);
    setAwaitingRetry(false);
    setGiveUp(false);
    setRetryKey(0);
    setSlotReady(false);
    releaseSlot();
  }, [src]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;

    let frame = 0;
    const update = () => {
      setInView(isNearRoot(element, root, marginFor(element, bufferRows)));
    };
    const scheduleUpdate = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        update();
      });
    };

    const margin = marginFor(element, bufferRows);
    const observer = new IntersectionObserver(
      ([entry]) => {
        // Prefer geometry check: IO can miss abs-positioned / transformed moves
        // inside nested scrollers (virtual lists).
        if (entry.isIntersecting) {
          setInView(true);
          return;
        }
        update();
      },
      {
        root,
        rootMargin: `${margin}px 0px`,
      },
    );
    observer.observe(element);
    update();

    const scrollTarget: Element | Window = root ?? window;
    scrollTarget.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate);

    return () => {
      observer.disconnect();
      scrollTarget.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [bufferRows, layoutKey, src, root]);

  useLayoutEffect(() => {
    if (layoutKey === undefined) return undefined;

    const element = ref.current;
    if (element) {
      setInView(isNearRoot(element, root, marginFor(element, bufferRows)));
    }

    let cancelled = false;
    let innerFrame = 0;
    const outerFrame = window.requestAnimationFrame(() => {
      innerFrame = window.requestAnimationFrame(() => {
        if (cancelled) return;
        const node = ref.current;
        if (!node) return;
        setInView(isNearRoot(node, root, marginFor(node, bufferRows)));
      });
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(outerFrame);
      window.cancelAnimationFrame(innerFrame);
    };
  }, [layoutKey, bufferRows, root]);

  // Hold a slot only while the request is in flight.
  useEffect(() => {
    if (!inView || giveUp || awaitingRetry || loaded) {
      releaseSlot();
      if (!loaded) setSlotReady(false);
      return undefined;
    }

    let cancelled = false;
    void acquireThumbSlot().then((release) => {
      if (cancelled) {
        release();
        return;
      }
      releaseSlotRef.current = release;
      setSlotReady(true);
    });

    return () => {
      cancelled = true;
      releaseSlot();
      setSlotReady(false);
    };
  }, [inView, giveUp, awaitingRetry, loaded, src, retryKey]);

  useEffect(() => {
    if (!awaitingRetry || giveUp) return undefined;
    const timer = window.setTimeout(() => {
      retryCountRef.current += 1;
      setAwaitingRetry(false);
      setLoaded(false);
      setRetryKey((value) => value + 1);
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [awaitingRetry, giveUp]);

  const showImage = inView && !giveUp && !awaitingRetry && (slotReady || loaded);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const markLoaded = () => {
    releaseSlot();
    setLoaded(true);
  };

  useLayoutEffect(() => {
    if (!showImage || loaded) return;
    const image = imageRef.current;
    if (image?.complete && image.naturalWidth > 0) {
      markLoaded();
    }
  }, [showImage, src, retryKey, loaded]);

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
          onLoad={markLoaded}
          onError={() => {
            releaseSlot();
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
