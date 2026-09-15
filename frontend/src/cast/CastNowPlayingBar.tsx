import { useEffect, useRef, useState } from 'react';
import { useIsMobile } from '../hooks/useIsMobile';
import { IconButton, SettingsIcon, Slider, StopIcon } from '../ui';
import type { CastItem, CastMode } from './types';

interface CastNowPlayingBarProps {
  item?: CastItem;
  deviceName: string;
  mode: CastMode;
  playing: boolean;
  secondsLeft: number | null;
  volume: number;
  muted: boolean;
  onVolumeChange: (volume: number) => void;
  onToggleMute: () => void;
  onPrevious: () => void;
  onTogglePlaying: () => void;
  onNext: () => void;
  onExpand: () => void;
  onDisconnect: () => void;
}

function VolumeIcon({ muted, volume }: { muted: boolean; volume: number }) {
  if (muted || volume <= 0) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M4.5 9.5v5h3.2L12 18.8V5.2L7.7 9.5H4.5zm11.1 1.1 1.4-1.4 1.4 1.4 1.4-1.4 1.4 1.4-1.4 1.4 1.4 1.4-1.4 1.4-1.4-1.4-1.4 1.4-1.4-1.4 1.4-1.4-1.4-1.4z"
        />
      </svg>
    );
  }
  if (volume < 0.5) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M4.5 9.5v5h3.2L12 18.8V5.2L7.7 9.5H4.5zm9.2 2.5a2.4 2.4 0 0 1 0 2.1v-2.1z"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M4.5 9.5v5h3.2L12 18.8V5.2L7.7 9.5H4.5zm9.2.8a3.5 3.5 0 0 1 0 5.4v-1.6a1.9 1.9 0 0 0 0-2.2V10.3zm2.7-2.3a6.4 6.4 0 0 1 0 10v-1.6a4.8 4.8 0 0 0 0-6.8V8z"
      />
    </svg>
  );
}

function CastVolumeControl({
  volume,
  muted,
  onVolumeChange,
  onToggleMute,
}: {
  volume: number;
  muted: boolean;
  onVolumeChange: (volume: number) => void;
  onToggleMute: () => void;
}) {
  const isMobile = useIsMobile();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isMobile || !open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [isMobile, open]);

  return (
    <div
      ref={rootRef}
      className={`cast-volume${isMobile && open ? ' is-open' : ''}${!isMobile ? ' is-hoverable' : ''}`}
    >
      <button
        type="button"
        className="cast-volume__button"
        aria-label={muted || volume <= 0 ? 'Unmute' : 'Mute'}
        aria-expanded={isMobile ? open : undefined}
        onClick={() => {
          if (isMobile && !open) {
            setOpen(true);
            return;
          }
          onToggleMute();
        }}
      >
        <VolumeIcon muted={muted} volume={volume} />
      </button>
      <div className="cast-volume__popover">
        <div className="cast-volume__slider-wrap">
          <Slider
            className="cast-volume__slider"
            label="TV volume"
            hideHeader
            min={0}
            max={100}
            step={1}
            value={Math.round(volume * 100)}
            onChange={(next) => onVolumeChange(next / 100)}
          />
        </div>
      </div>
    </div>
  );
}

export function CastNowPlayingBar({
  item,
  deviceName,
  mode,
  playing,
  secondsLeft,
  volume,
  muted,
  onVolumeChange,
  onToggleMute,
  onPrevious,
  onTogglePlaying,
  onNext,
  onExpand,
  onDisconnect,
}: CastNowPlayingBarProps) {
  return (
    <div className="cast-now-playing" role="region" aria-label="Cast controls">
      <div className="cast-now-playing__media">
        {item ? <img src={item.thumbnailUrl} alt="" /> : <span className="cast-now-playing__placeholder" />}
        <span>
          <strong>{item?.name ?? 'Ready to pick a photo'}</strong>
          <small>
            {deviceName || 'Cast device'}
            {mode === 'slideshow' && secondsLeft !== null ? ` · Next in ${secondsLeft}s` : ''}
          </small>
        </span>
      </div>
      <div className="cast-now-playing__controls">
        <div className="cast-now-playing__transport">
          <button type="button" aria-label="Previous photo" onClick={onPrevious}>‹</button>
          {mode === 'slideshow' ? (
            <button type="button" aria-label={playing ? 'Pause slideshow' : 'Play slideshow'} onClick={onTogglePlaying}>
              {playing ? 'Ⅱ' : '▶'}
            </button>
          ) : null}
          <button type="button" aria-label="Next photo" onClick={onNext}>›</button>
          <CastVolumeControl
            volume={volume}
            muted={muted}
            onVolumeChange={onVolumeChange}
            onToggleMute={onToggleMute}
          />
        </div>
        <div className="cast-now-playing__actions">
          <IconButton label="Cast settings" onClick={onExpand}>
            <SettingsIcon />
          </IconButton>
          <IconButton
            label="Stop casting"
            className="cast-now-playing__stop"
            onClick={onDisconnect}
          >
            <StopIcon />
          </IconButton>
        </div>
      </div>
    </div>
  );
}
