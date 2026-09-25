import { Loader } from '../ui';

interface GalleryVideoLoaderProps {
  progress: number | null;
  label?: string;
}

export function GalleryVideoLoader({
  progress,
  label = 'Preparing video…',
}: GalleryVideoLoaderProps) {
  return (
    <div className="gallery-media-loader">
      <Loader compact label={label} progress={progress} />
    </div>
  );
}

/** Poster/thumb box with an optional preparing overlay sized to the image */
export function GalleryThumbWithLoader({
  src,
  alt,
  hidden = false,
  showLoader = false,
  progress = null,
  className = '',
}: {
  src: string;
  alt: string;
  hidden?: boolean;
  showLoader?: boolean;
  progress?: number | null;
  className?: string;
}) {
  return (
    <div
      className={[
        'gallery-thumb-overlay-host',
        hidden ? 'is-hidden' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <img
        className="gallery-thumb-overlay-host__img"
        src={src}
        alt={alt}
        draggable={false}
      />
      {showLoader ? <GalleryVideoLoader progress={progress} /> : null}
    </div>
  );
}
