import { useEffect, useRef, useState } from 'react';
import { useIsMobile } from '../hooks/useIsMobile';
import { IconButton, SettingsIcon, Slider, StopIcon } from '../ui';
import type { CastItem, CastMode, CastVideoProgress } from './types';

interface CastNowPlayingBarProps {
  item?: CastItem;
  deviceName: string;
  mode: CastMode;
  playing: boolean;
  secondsLeft: number | null;
  intervalSec?: number;
  status?: string;
  error?: string;
  volume: number;
  muted: boolean;
  videoProgress: CastVideoProgress | null;
  onVolumeChange: (volume: number) => void;
  onToggleMute: () => void;
  onPrevious: () => void;
  onTogglePlaying: () => void;
  onSeek?: (timeSeconds: number) => void;
  onScrubStart?: () => void;
  onScrubEnd?: (resume: boolean) => void;
  onNext: () => void;
  onExpand: () => void;
  onDisconnect: () => void;
  onDismissError?: () => void;
}

function formatClock(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '0:00';
  const seconds = Math.floor(totalSeconds);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
  }
  return `${minutes}:${String(rest).padStart(2, '0')}`;
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
  intervalSec = 8,
  status,
  error,
  volume,
  muted,
  videoProgress,
  onVolumeChange,
  onToggleMute,
  onPrevious,
  onTogglePlaying,
  onSeek,
  onScrubStart,
  onScrubEnd,
  onNext,
  onExpand,
  onDisconnect,
  onDismissError,
}: CastNowPlayingBarProps) {
  const isVideo = item?.kind === 'video';
  const duration = videoProgress?.duration ?? 0;
  const currentTime = videoProgress?.currentTime ?? 0;
  const canSeek = Boolean(isVideo && duration > 0 && onSeek);
  const paused = videoProgress?.paused ?? !playing;
  const [dragging, setDragging] = useState(false);
  const [dragValue, setDragValue] = useState(0);
  const resumeAfterScrubRef = useRef(false);

  const displayTime = dragging ? dragValue : currentTime;
  const photoCountdownActive =
    !isVideo && mode === 'slideshow' && playing && secondsLeft !== null;
  const timelineMax = canSeek
    ? Math.max(1, duration)
    : photoCountdownActive
      ? Math.max(1, intervalSec)
      : 1;
  const timelineValue = canSeek
    ? Math.min(displayTime, duration || 1)
    : photoCountdownActive
      ? Math.max(0, intervalSec - secondsLeft)
      : 0;

  const finishScrub = (value: number) => {
    if (!dragging) return;
    setDragging(false);
    onSeek?.(value);
    onScrubEnd?.(resumeAfterScrubRef.current);
    resumeAfterScrubRef.current = false;
  };

  return (
    <div className="cast-now-playing" role="region" aria-label="Cast controls">
      {error ? (
        <div className="cast-now-playing__alert" role="alert">
          <span>{error}</span>
          {onDismissError ? (
            <button type="button" onClick={onDismissError}>
              Dismiss
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="cast-now-playing__row">
        <div className="cast-now-playing__media">
          {item ? (
            <img src={item.thumbnailUrl} alt="" />
          ) : (
            <span className="cast-now-playing__placeholder" />
          )}
          <span>
            <strong>{item?.name ?? 'Ready to pick a photo'}</strong>
            <small>
              {deviceName || 'Cast device'}
              {status ? ` · ${status}` : isVideo ? ' · Video' : ''}
            </small>
          </span>
        </div>

        <div className="cast-now-playing__controls">
          <div className="cast-now-playing__transport">
            <button type="button" aria-label="Previous" onClick={onPrevious}>
              ‹
            </button>
            {isVideo || mode === 'slideshow' ? (
              <button
                type="button"
                aria-label={paused ? 'Play' : 'Pause'}
                onClick={onTogglePlaying}
              >
                {paused ? '▶' : 'Ⅱ'}
              </button>
            ) : null}
            <button type="button" aria-label="Next" onClick={onNext}>
              ›
            </button>
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

      <div className="cast-now-playing__timeline">
        <span className="cast-now-playing__time">
          {canSeek || dragging ? formatClock(displayTime) : '—:—'}
        </span>
        <Slider
          className="cast-now-playing__seek"
          label={canSeek ? 'Seek' : 'Progress'}
          hideHeader
          min={0}
          max={timelineMax}
          step={canSeek ? 0.25 : 1}
          value={timelineValue}
          disabled={!canSeek}
          onChange={(next) => {
            if (!canSeek) return;
            if (!dragging) {
              resumeAfterScrubRef.current = !paused;
              setDragging(true);
              if (!paused) onScrubStart?.();
            }
            setDragValue(next);
          }}
          onPointerDown={() => {
            if (!canSeek || dragging) return;
            resumeAfterScrubRef.current = !paused;
            setDragging(true);
            setDragValue(currentTime);
            if (!paused) onScrubStart?.();
          }}
          onPointerUp={(event) => {
            if (!canSeek) return;
            finishScrub(Number((event.target as HTMLInputElement).value));
          }}
          onPointerCancel={(event) => {
            if (!canSeek) return;
            finishScrub(Number((event.target as HTMLInputElement).value));
          }}
          onBlur={(event) => {
            if (!canSeek || !dragging) return;
            finishScrub(Number((event.target as HTMLInputElement).value));
          }}
        />
        <span className="cast-now-playing__time">
          {canSeek
            ? formatClock(duration)
            : photoCountdownActive
              ? `${secondsLeft}s`
              : '—:—'}
        </span>
      </div>
    </div>
  );
}
