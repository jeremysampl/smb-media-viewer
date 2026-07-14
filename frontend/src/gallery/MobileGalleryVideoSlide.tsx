import { useEffect, useRef, useState } from 'react';
import { mediaUrl } from '../api/client';
import type { BrowseEntry, QualityTier } from '../types';

interface MobileGalleryVideoSlideProps {
  entry: BrowseEntry;
  isActive: boolean;
  isNearby: boolean;
  quality: QualityTier;
  controlsVisible: boolean;
}

export function MobileGalleryVideoSlide({
  entry,
  isActive,
  isNearby,
  quality,
  controlsVisible,
}: MobileGalleryVideoSlideProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [mediaReady, setMediaReady] = useState(false);
  const posterUrl = entry.token ? mediaUrl(entry.token, 'poster') : '';
  const shouldLoadVideo = isActive || isNearby;

  useEffect(() => {
    setMediaReady(false);
  }, [entry.path]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !shouldLoadVideo) return;
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      setMediaReady(true);
    }
  }, [shouldLoadVideo, entry.path, isActive]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;

    if (isActive && mediaReady) {
      void video.play().catch(() => undefined);
    } else {
      video.pause();
      if (!isActive) {
        video.currentTime = 0;
      }
    }

    return undefined;
  }, [isActive, mediaReady, entry.path]);

  if (!entry.token) return null;

  const showPoster = !isActive || !mediaReady;

  return (
    <div className="mobile-gallery-video-frame">
      <img
        className={`mobile-gallery-video-poster${showPoster ? '' : ' hidden'}`}
        src={posterUrl}
        alt={entry.name}
        draggable={false}
      />
      {shouldLoadVideo ? (
        <video
          ref={videoRef}
          className={`mobile-gallery-video-player${isActive && mediaReady ? ' ready' : ''}`}
          src={mediaUrl(entry.token, 'video', quality)}
          controls={controlsVisible && isActive && mediaReady}
          playsInline
          muted={!isActive}
          preload="auto"
          onLoadedData={() => setMediaReady(true)}
          onCanPlay={() => setMediaReady(true)}
        />
      ) : null}
    </div>
  );
}
