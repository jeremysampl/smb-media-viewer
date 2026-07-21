import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { mediaUrl } from '../api/client';
import type { BrowseEntry, QualityTier } from '../types';

interface MobileGalleryVideoSlideProps {
  entry: BrowseEntry;
  isActive: boolean;
  isNearby: boolean;
  quality: QualityTier;
  controlsVisible: boolean;
  /** Already-cached grid thumb/poster for adjacent slides (no full video fetch). */
  previewSrc?: string;
  /** True once this slide has been opened — keeps full media while swiping away. */
  loadFullMedia?: boolean;
  style?: CSSProperties;
}

export function MobileGalleryVideoSlide({
  entry,
  isActive,
  isNearby,
  quality,
  controlsVisible,
  previewSrc,
  loadFullMedia = false,
  style,
}: MobileGalleryVideoSlideProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [mediaReady, setMediaReady] = useState(false);
  const posterUrl =
    previewSrc || (entry.token ? mediaUrl(entry.token, 'poster') : '');
  const shouldLoadVideo = loadFullMedia;

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
  const posterSrc = isActive || isNearby || loadFullMedia ? posterUrl : '';

  return (
    <div className="mobile-gallery-video-frame" style={style}>
      {posterSrc ? (
        <img
          className={`mobile-gallery-video-poster${showPoster ? '' : ' hidden'}`}
          src={posterSrc}
          alt={entry.name}
          draggable={false}
        />
      ) : null}
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
