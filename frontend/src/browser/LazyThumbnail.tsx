import { useEffect, useRef, useState } from 'react';

interface LazyThumbnailProps {
  src: string;
  alt: string;
  /** Extra rows to preload above/below the viewport */
  bufferRows?: number;
}

const DEFAULT_CARD_HEIGHT = 220;

export function LazyThumbnail({ src, alt, bufferRows = 2 }: LazyThumbnailProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!shouldLoad && element) {
      const margin = bufferRows * DEFAULT_CARD_HEIGHT;
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setShouldLoad(true);
            observer.disconnect();
          }
        },
        { rootMargin: `${margin}px 0px` },
      );
      observer.observe(element);
      return () => observer.disconnect();
    }
    return undefined;
  }, [shouldLoad, bufferRows]);

  return (
    <div ref={ref} className="lazy-thumb">
      {shouldLoad ? (
        <img src={src} alt={alt} decoding="async" />
      ) : (
        <div className="placeholder" aria-hidden />
      )}
    </div>
  );
}
