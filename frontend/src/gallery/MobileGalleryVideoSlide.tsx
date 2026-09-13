import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { mediaUrl } from '../api/client';
import type { BrowseEntry, QualityTier } from '../types';
import { GalleryThumbWithLoader } from './GalleryVideoLoader';
import { useVideoPrepareStatus } from './useVideoPrepareStatus';

interface MobileGalleryVideoSlideProps {
  entry: BrowseEntry;
  isActive: boolean;
  isNearby: boolean;
  quality: QualityTier;
  controlsVisible: boolean;
  /** Grid thumb/poster for adjacent slides (no full video fetch). */
  previewSrc?: string;
  /** True after open so full media stays loaded while swiping away. */
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
  const shouldPrepare = Boolean(entry.token && (loadFullMedia || isActive));
  const prepare = useVideoPrepareStatus(entry.token, quality, shouldPrepare);
  const shouldLoadVideo = shouldPrepare && prepare.ready;
  const showPrepareLoader = prepare.known && prepare.processing;

  useEffect(() => {
    setMediaReady(false);
  }, [entry.path, quality]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !shouldLoadVideo) return;
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      setMediaReady(true);
    }
  }, [shouldLoadVideo, entry.path, isActive, quality]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;

    if (isActive && mediaReady) {
      const play = async () => {
        try {
          video.muted = true;
          await video.play();
          if (isActive) video.muted = false;
        } catch {
          // Controls stay available for a manual tap
        }
      };
      void play();
    } else {
      video.pause();
      if (!isActive) {
        video.currentTime = 0;
        video.muted = true;
      }
    }

    return undefined;
  }, [isActive, mediaReady, entry.path]);

  if (!entry.token) return null;

  const showPoster = !isActive || !mediaReady || showPrepareLoader;
  const posterSrc = isActive || isNearby || loadFullMedia ? posterUrl : '';
  const videoSrc = mediaUrl(entry.token, 'video', quality);

  return (
    <div className="mobile-gallery-video-frame" style={style}>
      {posterSrc ? (
        <GalleryThumbWithLoader
          src={posterSrc}
          alt={entry.name}
          hidden={!showPoster}
          showLoader={showPrepareLoader}
          progress={prepare.progress}
        />
      ) : null}
      {shouldLoadVideo ? (
        <video
          key={`${entry.path}:${quality}:${videoSrc}`}
          ref={videoRef}
          className={`mobile-gallery-video-player${isActive && mediaReady ? ' ready' : ''}`}
          controls={controlsVisible && isActive && mediaReady}
          playsInline
          muted
          preload="auto"
          onLoadedData={() => setMediaReady(true)}
          onCanPlay={() => setMediaReady(true)}
          onError={() => setMediaReady(false)}
        >
          <source src={videoSrc} type="video/mp4" />
        </video>
      ) : null}
    </div>
  );
}
