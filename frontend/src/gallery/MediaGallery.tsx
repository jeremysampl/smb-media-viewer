import { useEffect, useMemo, useState } from 'react';
import Lightbox from 'yet-another-react-lightbox';
import Video from 'yet-another-react-lightbox/plugins/video';
import 'yet-another-react-lightbox/styles.css';
import { mediaUrl } from '../api/client';
import type { BrowseEntry } from '../types';
import { ResolutionSelector, useQualityPreference } from '../browser/ResolutionSelector';

interface MediaGalleryProps {
  entries: BrowseEntry[];
  initialIndex: number;
  open: boolean;
  onClose: () => void;
}

export function MediaGallery({ entries, initialIndex, open, onClose }: MediaGalleryProps) {
  const { quality, setQuality, profiles } = useQualityPreference();
  const [index, setIndex] = useState(initialIndex);

  useEffect(() => {
    if (open) {
      setIndex(initialIndex);
    }
  }, [open, initialIndex]);

  const mediaEntries = useMemo(
    () => entries.filter((entry) => entry.type === 'image' || entry.type === 'video'),
    [entries],
  );

  const slides = useMemo(() => {
    return mediaEntries.map((entry) => {
      if (entry.type === 'video' && entry.token) {
        return {
          type: 'video' as const,
          sources: [
            {
              src: mediaUrl(entry.token, 'video', quality),
              type: 'video/mp4',
            },
          ],
          poster: mediaUrl(entry.token, 'poster'),
        };
      }

      return {
        src: entry.token ? mediaUrl(entry.token, 'image', quality) : '',
        alt: entry.name,
        title: entry.name,
      };
    });
  }, [mediaEntries, quality]);

  return (
    <>
      {open ? (
        <div className="gallery-quality-bar">
          <ResolutionSelector
            quality={quality}
            profiles={profiles}
            onChange={setQuality}
            compact
          />
        </div>
      ) : null}
      <Lightbox
        open={open}
        close={onClose}
        index={index}
        slides={slides}
        plugins={[Video]}
        on={{ view: ({ index: nextIndex }) => setIndex(nextIndex) }}
        controller={{ closeOnBackdropClick: true }}
        carousel={{ finite: mediaEntries.length <= 1 }}
        animation={{ swipe: 500 }}
      />
    </>
  );
}
