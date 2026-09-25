import { useState } from 'react';
import { prefersRasterPreview } from '@smb/file-types';
import { FileTypeIcon } from '../browser/FileTypeIcon';
import { LazyThumbnail } from '../browser/LazyThumbnail';

interface FileThumbProps {
  filename: string;
  format?: string;
  alt?: string;
  className?: string;
  /** Raster URL for images/videos */
  src?: string | null;
  lazy?: boolean;
  layoutKey?: string;
}

/** Library/admin thumb: raster for media, FileTypeIcon otherwise */
export function FileThumb({
  filename,
  format,
  alt = '',
  className,
  src,
  lazy = false,
  layoutKey,
}: FileThumbProps) {
  const [failed, setFailed] = useState(false);
  const wantRaster = Boolean(src) && prefersRasterPreview(filename) && !failed;

  if (wantRaster && src) {
    if (lazy) {
      return <LazyThumbnail src={src} alt={alt} layoutKey={layoutKey} />;
    }
    return (
      <img
        className={className}
        src={src}
        alt={alt}
        loading="lazy"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <FileTypeIcon filename={filename} format={format} className={className} />
  );
}
