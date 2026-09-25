import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { resolveCastSelection, fetchCastVideoStatus, fetchCastConfig, createCastSession, heartbeatCastSession, endCastSession } from '../api/client';
import { CastNowPlayingBar } from './CastNowPlayingBar';
import { CastSetupDialog } from './CastSetupDialog';
import type { CastItem, CastSettings, CastVideoProgress } from './types';
import {
  CastContext,
  type CastContextValue,
  type OpenSetupOptions,
} from './CastContext';

const CAST_SCRIPT_ID = 'google-cast-sender';
const SETTINGS_KEY = 'smb-cast-settings';
const SESSION_KEY = 'smb-cast-session';
const MEDIA_ORIGIN_KEY = 'smb-cast-media-origin';

function isLoopbackHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function isSecureCastContext(): boolean {
  return window.isSecureContext || isLoopbackHost(window.location.hostname);
}

function normalizeOriginInput(raw: string): string | null {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed.includes('://') ? trimmed : `http://${trimmed}`);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (isLoopbackHost(url.hostname)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function buildLanCandidates(addresses: string[]): string[] {
  const port = window.location.port;
  const scheme = window.location.protocol === 'https:' ? 'https:' : 'http:';
  return addresses.map((address) => {
    if (!port || (scheme === 'http:' && port === '80') || (scheme === 'https:' && port === '443')) {
      return `${scheme}//${address}`;
    }
    return `${scheme}//${address}:${port}`;
  });
}

function decodeHtmlEntities(value: string): string {
  if (!value.includes('&')) return value;
  const textarea = document.createElement('textarea');
  textarea.innerHTML = value;
  return textarea.value;
}

function castDeviceName(session: cast.framework.CastSession): string {
  return decodeHtmlEntities(session.getCastDevice().friendlyName ?? 'Cast device');
}

function storedMediaOrigin(): string {
  try {
    return normalizeOriginInput(localStorage.getItem(MEDIA_ORIGIN_KEY) ?? '') ?? '';
  } catch {
    return '';
  }
}

function storedSettings(): CastSettings {
  const defaults: CastSettings = {
    mode: 'slideshow',
    intervalSec: 8,
    volume: 0.5,
    shuffle: false,
    repeat: true,
  };
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') };
  } catch {
    return defaults;
  }
}

function shuffledWithCurrentFirst(items: CastItem[], current?: CastItem): CastItem[] {
  const rest = items.filter((item) => item.path !== current?.path);
  for (let index = rest.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [rest[index], rest[swap]] = [rest[swap], rest[index]];
  }
  return current ? [current, ...rest] : rest;
}

function storedSession(): { queue: CastItem[]; index: number } {
  try {
    const value = JSON.parse(localStorage.getItem(SESSION_KEY) ?? '{}') as {
      queue?: CastItem[];
      index?: number;
    };
    const queue = Array.isArray(value.queue)
      ? value.queue.filter(
          (item): item is CastItem =>
            Boolean(item)
            && typeof item.path === 'string'
            && typeof item.url === 'string'
            && typeof item.contentType === 'string',
        )
      : [];
    const index =
      typeof value.index === 'number' && value.index >= 0 && value.index < queue.length
        ? value.index
        : 0;
    return { queue, index };
  } catch {
    return { queue: [], index: 0 };
  }
}

function castErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'string' && error.trim()) return error;
  if (error instanceof Error && error.message.trim()) return error.message;
  if (error && typeof error === 'object') {
    const record = error as { code?: unknown; description?: unknown; message?: unknown };
    const description =
      typeof record.description === 'string' ? record.description.trim() : '';
    if (description) return description;
    const code = typeof record.code === 'string' ? record.code.trim() : '';
    if (code) return code;
    const message = typeof record.message === 'string' ? record.message.trim() : '';
    if (message) return message;
  }
  return fallback;
}

function assertCastOk(
  result: chrome.cast.ErrorCode | undefined,
  fallback: string,
): void {
  if (result) throw new Error(castErrorMessage(result, fallback));
}

function absoluteMediaUrl(path: string, mediaOrigin: string): string {
  const origin = normalizeOriginInput(mediaOrigin)
    ?? (!isLoopbackHost(window.location.hostname) ? window.location.origin : null);
  if (!origin) {
    throw new Error(
      'Set a LAN media address (for example http://192.168.1.50:5174) so the Cast device can load files.',
    );
  }
  return new URL(path, origin).href;
}

async function waitForCastVideo(
  token: string,
  quality: string,
  onProgress?: (progress: number | null) => void,
): Promise<void> {
  const started = Date.now();
  let prepare = true;
  while (Date.now() - started < 10 * 60 * 1000) {
    const status = await fetchCastVideoStatus(token, quality, prepare);
    prepare = false;
    onProgress?.(status.progress);
    if (status.state === 'ready') return;
    await new Promise((resolve) => window.setTimeout(resolve, 700));
  }
  throw new Error('Timed out while preparing the video for Cast.');
}

function formatPrepareStatus(progress: number | null): string {
  if (progress != null && progress > 0 && progress < 1) {
    return `Preparing video for Cast… ${Math.round(progress * 100)}%`;
  }
  return 'Preparing video for Cast…';
}

export function CastProvider({ children }: { children: ReactNode }) {
  const initialSession = useMemo(storedSession, []);
  const [ready, setReady] = useState(false);
  const [unavailableReason, setUnavailableReason] = useState<string | null>(() => (
    isSecureCastContext()
      ? null
      : 'Chrome only enables Cast on https:// or localhost. Use localhost with a LAN media address, or mark this LAN URL as secure in Chrome flags.'
  ));
  const [connected, setConnected] = useState(false);
  const [deviceName, setDeviceName] = useState('');
  const [muted, setMuted] = useState(false);
  const [queue, setQueue] = useState<CastItem[]>(initialSession.queue);
  const [index, setIndex] = useState(initialSession.index);
  const [playing, setPlaying] = useState(false);
  const [settings, setSettings] = useState<CastSettings>(storedSettings);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupLoading, setSetupLoading] = useState(false);
  const [draftQueue, setDraftQueue] = useState<CastItem[]>(initialSession.queue);
  const [draftSettings, setDraftSettings] = useState<CastSettings>(storedSettings);
  const [mediaOrigin, setMediaOriginState] = useState(storedMediaOrigin);
  const [mediaOriginCandidates, setMediaOriginCandidates] = useState<string[]>([]);
  const [publicOriginFromEnv, setPublicOriginFromEnv] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [videoProgress, setVideoProgress] = useState<CastVideoProgress | null>(null);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const queueRef = useRef(queue);
  const indexRef = useRef(index);
  const settingsRef = useRef(settings);
  const draftQueueRef = useRef(draftQueue);
  const draftSettingsRef = useRef(draftSettings);
  const mediaOriginRef = useRef(mediaOrigin);
  const castSessionIdRef = useRef<string | null>(null);
  const manualRequestRef = useRef(0);
  const mediaListenerRef = useRef<((isAlive: boolean) => void) | null>(null);
  const remotePlayerRef = useRef<cast.framework.RemotePlayer | null>(null);
  const remoteControllerRef = useRef<cast.framework.RemotePlayerController | null>(null);
  const remoteUiUnbindRef = useRef<(() => void) | null>(null);
  const playingRef = useRef(false);
  const scrubbingRef = useRef(false);
  const connectedRef = useRef(false);
  queueRef.current = queue;
  indexRef.current = index;
  settingsRef.current = settings;
  draftQueueRef.current = draftQueue;
  draftSettingsRef.current = draftSettings;
  mediaOriginRef.current = mediaOrigin;
  playingRef.current = playing;
  connectedRef.current = connected;

  const setMediaOrigin = useCallback((origin: string) => {
    const normalized = normalizeOriginInput(origin) ?? '';
    setMediaOriginState(normalized);
    mediaOriginRef.current = normalized;
    localStorage.setItem(MEDIA_ORIGIN_KEY, normalized);
  }, []);

  const clearMediaListener = useCallback(() => {
    mediaListenerRef.current?.(false);
    mediaListenerRef.current = null;
    remoteUiUnbindRef.current?.();
    remoteUiUnbindRef.current = null;
    setVideoProgress(null);
  }, []);

  const bindRemotePlayerUi = useCallback(() => {
    remoteUiUnbindRef.current?.();
    if (!window.cast?.framework) {
      remoteUiUnbindRef.current = null;
      return;
    }
    const player = new cast.framework.RemotePlayer();
    const controller = new cast.framework.RemotePlayerController(player);
    remotePlayerRef.current = player;
    remoteControllerRef.current = controller;

    const sync = () => {
      if (scrubbingRef.current) return;
      const duration = Number(player.duration);
      const currentTime = Number(player.currentTime);
      setVideoProgress({
        currentTime: Number.isFinite(currentTime) ? Math.max(0, currentTime) : 0,
        duration: Number.isFinite(duration) && duration > 0 ? duration : 0,
        paused: Boolean(player.isPaused),
      });
      if (
        player.playerState === chrome.cast.media.PlayerState.PLAYING
        || player.playerState === chrome.cast.media.PlayerState.BUFFERING
      ) {
        setPlaying(true);
      } else if (player.playerState === chrome.cast.media.PlayerState.PAUSED) {
        setPlaying(false);
      }
    };

    controller.addEventListener(cast.framework.RemotePlayerEventType.ANY_CHANGE, sync);
    sync();
    remoteUiUnbindRef.current = () => {
      controller.removeEventListener(cast.framework.RemotePlayerEventType.ANY_CHANGE, sync);
    };
  }, []);

  const clearBackendSession = useCallback(() => {
    const id = castSessionIdRef.current;
    castSessionIdRef.current = null;
    if (!id) return;
    void endCastSession(id).catch(() => undefined);
  }, []);

  const ensureBackendSession = useCallback(async (friendlyName: string) => {
    const current = queueRef.current[indexRef.current];
    const result = await createCastSession({
      deviceName: friendlyName,
      mediaOrigin: mediaOriginRef.current,
      itemCount: queueRef.current.length,
      currentItem: current?.name ?? null,
      sessionId: castSessionIdRef.current ?? undefined,
    });
    castSessionIdRef.current = result.session.id;
    return result.session.id;
  }, []);

  const syncSession = useCallback(() => {
    if (!window.cast?.framework) return;
    const context = cast.framework.CastContext.getInstance();
    const session = context.getCurrentSession();
    const sessionState = context.getSessionState();
    const isConnected = Boolean(session) && (
      sessionState === cast.framework.SessionState.SESSION_STARTED
      || sessionState === cast.framework.SessionState.SESSION_RESUMED
    );
    setConnected(isConnected);
    if (isConnected && session) {
      setDeviceName(castDeviceName(session));
      setMuted(session.isMute());
      if (queueRef.current.length > 0) {
        void resolveCastSelection(
          queueRef.current.map((item) => item.path),
          castSessionIdRef.current ?? undefined,
        )
          .then(({ items }) => {
            const refreshed = new Map(items.map((item) => [item.path, item]));
            setQueue((previous) => previous.map((item) => refreshed.get(item.path) ?? item));
          })
          .catch(() => undefined);
      }
    } else {
      setDeviceName('');
      setMuted(false);
      setPlaying(false);
      setEndsAt(null);
      clearMediaListener();
      clearBackendSession();
    }
  }, [clearBackendSession, clearMediaListener]);

  useEffect(() => {
    let cancelled = false;
    void fetchCastConfig()
      .then((config) => {
        if (cancelled) return;
        const lanCandidates = buildLanCandidates(config.lanAddresses ?? []);
        const candidates = [...new Set([
          ...(config.candidates ?? []),
          ...lanCandidates,
        ].filter(Boolean))];
        setMediaOriginCandidates(candidates);
        setPublicOriginFromEnv(Boolean(config.publicOriginFromEnv));
        if (!mediaOriginRef.current) {
          const preferred =
            normalizeOriginInput(config.publicOrigin ?? '')
            ?? (!isLoopbackHost(window.location.hostname) ? window.location.origin : null)
            ?? candidates[0]
            ?? '';
          if (preferred) setMediaOrigin(preferred);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [setMediaOrigin]);

  useEffect(() => {
    let disposed = false;
    const initialize = (available: boolean) => {
      if (disposed) return;
      if (!available || !window.cast?.framework || !window.chrome?.cast) {
        setReady(false);
        setUnavailableReason((previous) => previous ?? (
          isSecureCastContext()
            ? 'Google Cast is not available in this browser.'
            : 'Chrome only enables Cast on https:// or localhost. Use localhost with a LAN media address, or mark this LAN URL as secure in Chrome flags.'
        ));
        return;
      }
      const context = cast.framework.CastContext.getInstance();
      context.setOptions({
        receiverApplicationId: chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
        autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
      });
      context.addEventListener(cast.framework.CastContextEventType.SESSION_STATE_CHANGED, syncSession);
      setUnavailableReason(null);
      setReady(true);
      syncSession();
    };

    const castWindow = window as typeof window & {
      __onGCastApiAvailable?: (available: boolean) => void;
    };
    castWindow.__onGCastApiAvailable = initialize;
    if (window.cast?.framework && window.chrome?.cast) initialize(true);
    else if (!document.getElementById(CAST_SCRIPT_ID)) {
      const script = document.createElement('script');
      script.id = CAST_SCRIPT_ID;
      script.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
      script.async = true;
      document.head.appendChild(script);
    }
    return () => {
      disposed = true;
      if (window.cast?.framework) {
        cast.framework.CastContext.getInstance().removeEventListener(
          cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
          syncSession,
        );
      }
    };
  }, [syncSession]);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  const setLiveVolume = useCallback((volume: number) => {
    const next = Math.min(1, Math.max(0, volume));
    setSettings((previous) => ({ ...previous, volume: next }));
    setMuted(false);
    if (!window.cast?.framework) return;
    const session = cast.framework.CastContext.getInstance().getCurrentSession();
    if (!session) return;
    void session.setMute(false).then((result) => {
      if (result) console.warn('Cast unmute failed:', result);
    });
    void session.setVolume(next).then((result) => {
      if (result) console.warn('Cast volume update failed:', result);
    });
  }, []);

  const toggleMute = useCallback(() => {
    if (!window.cast?.framework) return;
    const session = cast.framework.CastContext.getInstance().getCurrentSession();
    if (!session) return;
    const next = !session.isMute();
    setMuted(next);
    void session.setMute(next).then((result) => {
      if (result) {
        console.warn('Cast mute update failed:', result);
        setMuted(session.isMute());
      }
    });
  }, []);

  useEffect(() => {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ queue, index }));
  }, [queue, index]);

  const loadItem = useCallback(async (
    item: CastItem,
    nextIndex: number,
    options?: { preservePause?: boolean },
  ) => {
    const session = window.cast?.framework
      ? cast.framework.CastContext.getInstance().getCurrentSession()
      : null;
    if (!session) throw new Error('No Cast session is connected.');

    const stayPaused = Boolean(options?.preservePause) && !playingRef.current;

    clearMediaListener();
    setError('');
    if (item.kind === 'video' && !item.directPlay) {
      setStatus('Preparing video for Cast…');
      const quality =
        item.quality
        ?? new URL(item.url, 'http://local').searchParams.get('quality')
        ?? 'full';
      try {
        await waitForCastVideo(item.token, quality, (progress) => {
          setStatus(formatPrepareStatus(progress));
        });
      } finally {
        setStatus('');
      }
    }

    const mediaInfo = new chrome.cast.media.MediaInfo(
      absoluteMediaUrl(item.url, mediaOriginRef.current),
      item.contentType || (item.kind === 'video' ? 'video/mp4' : 'image/jpeg'),
    );
    const metadata = new chrome.cast.media.GenericMediaMetadata();
    metadata.title = item.name;
    metadata.images = [new chrome.cast.Image(absoluteMediaUrl(item.thumbnailUrl, mediaOriginRef.current))];
    mediaInfo.metadata = metadata;
    if (item.kind === 'video') {
      mediaInfo.streamType = chrome.cast.media.StreamType.BUFFERED;
    }

    const request = new chrome.cast.media.LoadRequest(mediaInfo);
    request.autoplay = !stayPaused;
    assertCastOk(await session.loadMedia(request), 'Could not load media on the Cast device.');

    setIndex(nextIndex);
    setStatus('');
    setError('');

    if (item.kind === 'video') {
      bindRemotePlayerUi();
      if (stayPaused) {
        const media = session.getMediaSession();
        if (media) {
          media.pause(
            new chrome.cast.media.PauseRequest(),
            () => undefined,
            () => undefined,
          );
        }
        setPlaying(false);
        setVideoProgress((previous) => (
          previous ? { ...previous, paused: true } : previous
        ));
      } else {
        setPlaying(true);
      }
      setEndsAt(null);

      if (settingsRef.current.mode !== 'slideshow') {
        return;
      }

      let active = true;
      let sawPlayback = false;
      const player = remotePlayerRef.current ?? new cast.framework.RemotePlayer();
      const controller = remoteControllerRef.current
        ?? new cast.framework.RemotePlayerController(player);
      const attachedMedia = { current: session.getMediaSession() as chrome.cast.media.Media | null };

      const advanceAfterVideo = () => {
        if (!active) return;
        clearMediaListener();
        if (settingsRef.current.mode !== 'slideshow') return;
        if (!cast.framework.CastContext.getInstance().getCurrentSession()) return;
        void goToRef.current(1);
      };

      const mediaFinished = (media: chrome.cast.media.Media | null | undefined) => {
        if (!media) return false;
        if (media.playerState !== chrome.cast.media.PlayerState.IDLE) return false;
        if (media.idleReason === chrome.cast.media.IdleReason.FINISHED) return true;
        const duration = media.media?.duration;
        return (
          typeof duration === 'number'
          && duration > 0
          && media.getEstimatedTime() >= duration - 0.75
        );
      };

      const onMediaUpdate = (isAlive?: boolean) => {
        if (!active) return;
        if (isAlive === false) {
          if (sawPlayback) advanceAfterVideo();
          return;
        }
        const media = session.getMediaSession();
        if (!media) return;
        if (
          media.playerState === chrome.cast.media.PlayerState.PLAYING
          || media.playerState === chrome.cast.media.PlayerState.PAUSED
          || media.playerState === chrome.cast.media.PlayerState.BUFFERING
        ) {
          sawPlayback = true;
          return;
        }
        if (sawPlayback && mediaFinished(media)) advanceAfterVideo();
      };

      const onSessionMedia = () => {
        if (!active) return;
        attachedMedia.current?.removeUpdateListener(onMediaUpdate);
        attachedMedia.current = session.getMediaSession();
        attachedMedia.current?.addUpdateListener(onMediaUpdate);
        onMediaUpdate(true);
      };

      const onPlayerState = () => {
        if (!active) return;
        if (
          player.playerState === chrome.cast.media.PlayerState.PLAYING
          || player.playerState === chrome.cast.media.PlayerState.PAUSED
          || player.playerState === chrome.cast.media.PlayerState.BUFFERING
        ) {
          sawPlayback = true;
          return;
        }
        if (
          sawPlayback
          && player.playerState === chrome.cast.media.PlayerState.IDLE
        ) {
          advanceAfterVideo();
        }
      };

      session.addEventListener(cast.framework.SessionEventType.MEDIA_SESSION, onSessionMedia);
      attachedMedia.current?.addUpdateListener(onMediaUpdate);
      controller.addEventListener(
        cast.framework.RemotePlayerEventType.PLAYER_STATE_CHANGED,
        onPlayerState,
      );
      onMediaUpdate(true);
      onPlayerState();

      mediaListenerRef.current = (keepAlive) => {
        active = keepAlive;
        session.removeEventListener(cast.framework.SessionEventType.MEDIA_SESSION, onSessionMedia);
        attachedMedia.current?.removeUpdateListener(onMediaUpdate);
        controller.removeEventListener(
          cast.framework.RemotePlayerEventType.PLAYER_STATE_CHANGED,
          onPlayerState,
        );
      };
      return;
    }

    if (settingsRef.current.mode !== 'slideshow') {
      setPlaying(false);
      setEndsAt(null);
      return;
    }

    if (stayPaused) {
      setPlaying(false);
      setEndsAt(null);
      return;
    }

    setPlaying(true);
    setEndsAt(Date.now() + settingsRef.current.intervalSec * 1000);
  }, [bindRemotePlayerUi, clearMediaListener]);

  const goToRef = useRef<(delta: number) => Promise<void>>(async () => undefined);

  const goTo = useCallback(async (delta: number) => {
    const items = queueRef.current;
    if (items.length === 0) return;
    let next = indexRef.current + delta;
    if (next >= items.length) {
      if (!settingsRef.current.repeat) {
        setPlaying(false);
        setEndsAt(null);
        return;
      }
      next = 0;
    }
    if (next < 0) next = settingsRef.current.repeat ? items.length - 1 : 0;
    try {
      await loadItem(items[next], next, { preservePause: true });
    } catch (loadError) {
      setError(castErrorMessage(loadError, 'Could not show media'));
      setPlaying(false);
      setEndsAt(null);
    }
  }, [loadItem]);
  goToRef.current = goTo;

  useEffect(() => {
    if (!connected || !playing || settings.mode !== 'slideshow' || !endsAt) {
      setSecondsLeft(null);
      return undefined;
    }
    const update = () => setSecondsLeft(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
    update();
    const ticker = window.setInterval(update, 250);
    const timer = window.setTimeout(() => void goTo(1), Math.max(0, endsAt - Date.now()));
    return () => {
      window.clearInterval(ticker);
      window.clearTimeout(timer);
    };
  }, [connected, playing, settings.mode, endsAt, goTo]);

  useEffect(() => {
    if (!connected || !playing || settings.mode !== 'slideshow' || !navigator.wakeLock) {
      void wakeLockRef.current?.release();
      wakeLockRef.current = null;
      return undefined;
    }
    void navigator.wakeLock.request('screen').then((lock) => {
      wakeLockRef.current = lock;
    }).catch(() => undefined);
    return () => {
      void wakeLockRef.current?.release();
      wakeLockRef.current = null;
    };
  }, [connected, playing, settings.mode]);

  useEffect(() => {
    if (!connected || queue.length === 0) return undefined;
    const timer = window.setInterval(() => {
      const currentPath = queueRef.current[indexRef.current]?.path;
      void resolveCastSelection(queueRef.current.map((item) => item.path))
        .then(({ items }) => {
          const refreshed = new Map(items.map((item) => [item.path, item]));
          setQueue((previous) => previous.map((item) => refreshed.get(item.path) ?? item));
          if (currentPath) {
            const currentIndex = queueRef.current.findIndex((item) => item.path === currentPath);
            if (currentIndex >= 0) setIndex(currentIndex);
          }
        })
        .catch(() => undefined);
    }, 3 * 60 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [connected, queue.length]);

  const openSetup = useCallback(async ({ paths = [], append = false }: OpenSetupOptions = {}) => {
    setError('');
    setStatus('');
    setDraftQueue(queueRef.current);
    setDraftSettings(settingsRef.current);
    setSetupOpen(true);
    if (paths.length === 0) {
      if (queueRef.current.length === 0) return;
      setSetupLoading(true);
      try {
        const resolved = await resolveCastSelection(queueRef.current.map((item) => item.path));
        const byPath = new Map(resolved.items.map((item) => [item.path, item]));
        setDraftQueue(
          queueRef.current
            .map((item) => byPath.get(item.path))
            .filter((item): item is CastItem => Boolean(item)),
        );
      } catch (resolveError) {
        setError(castErrorMessage(resolveError, 'Could not prepare media'));
      } finally {
        setSetupLoading(false);
      }
      return;
    }
    setSetupLoading(true);
    try {
      const resolved = await resolveCastSelection(paths);
      setDraftQueue(() => {
        if (!append) return resolved.items;
        const merged = new Map(queueRef.current.map((item) => [item.path, item]));
        for (const item of resolved.items) merged.set(item.path, item);
        return [...merged.values()];
      });
      if (resolved.items.length === 0) {
        setError('No photos or videos were found in this selection.');
      }
    } catch (resolveError) {
      setError(castErrorMessage(resolveError, 'Could not prepare media'));
    } finally {
      setSetupLoading(false);
    }
  }, []);

  const apply = useCallback(async () => {
    if (!window.cast?.framework || !window.chrome?.cast) {
      setError(
        unavailableReason
        ?? 'Google Cast is not available in this browser.',
      );
      return;
    }
    if (!normalizeOriginInput(mediaOriginRef.current) && isLoopbackHost(window.location.hostname)) {
      setError(
        'Set a LAN media address first (for example http://192.168.1.50:5174) so the TV can reach your files.',
      );
      return;
    }
    try {
      const context = cast.framework.CastContext.getInstance();
      const startingFresh = !connectedRef.current;
      const current = queueRef.current[indexRef.current];
      const nextSettings = draftSettingsRef.current;
      let nextQueue = draftQueueRef.current;
      if (nextQueue.length === 0) {
        setError('Add at least one photo or video to the queue.');
        return;
      }
      // New Cast session: always start at the top of the queue.
      // Re-apply while already connected: keep the current item when possible.
      let nextIndex = startingFresh
        ? 0
        : Math.max(0, nextQueue.findIndex((item) => item.path === current?.path));
      if (nextSettings.shuffle && nextSettings.mode === 'slideshow') {
        nextQueue = shuffledWithCurrentFirst(
          nextQueue,
          startingFresh ? undefined : current,
        );
        nextIndex = 0;
      }
      settingsRef.current = nextSettings;
      queueRef.current = nextQueue;
      indexRef.current = nextIndex;
      setSettings(nextSettings);
      setQueue(nextQueue);
      setIndex(nextIndex);

      if (!context.getCurrentSession()) {
        assertCastOk(await context.requestSession(), 'Could not connect to the Cast device.');
      }
      syncSession();
      const session = context.getCurrentSession();
      if (!session) throw new Error('Could not connect to the Cast device.');
      const friendlyName = castDeviceName(session);
      const sessionId = await ensureBackendSession(friendlyName);
      const resolved = await resolveCastSelection(
        nextQueue.map((item) => item.path),
        sessionId,
      );
      const byPath = new Map(resolved.items.map((item) => [item.path, item]));
      nextQueue = nextQueue
        .map((item) => byPath.get(item.path))
        .filter((item): item is CastItem => Boolean(item));
      if (nextQueue.length === 0) {
        throw new Error('No photos or videos were found in this selection.');
      }
      nextIndex = Math.min(nextIndex, nextQueue.length - 1);
      queueRef.current = nextQueue;
      indexRef.current = nextIndex;
      setQueue(nextQueue);
      setIndex(nextIndex);
      assertCastOk(await session.setVolume(nextSettings.volume), 'Could not set Cast volume.');
      setConnected(true);
      setDeviceName(friendlyName);
      setMuted(session.isMute());
      setSetupOpen(false);
      setError('');
      setStatus('');
      await loadItem(nextQueue[nextIndex], nextIndex);
    } catch (applyError) {
      setStatus('');
      setError(castErrorMessage(applyError, 'Could not start casting'));
    }
  }, [ensureBackendSession, loadItem, syncSession, unavailableReason]);

  const castManualSelection = useCallback(async (paths: string[], activePath: string) => {
    if (!connected) {
      await openSetup({ paths });
      setDraftSettings((previous) => ({ ...previous, mode: 'manual' }));
      return;
    }
    const requestId = manualRequestRef.current + 1;
    manualRequestRef.current = requestId;
    try {
      const resolved = await resolveCastSelection(
        paths,
        castSessionIdRef.current ?? undefined,
      );
      if (manualRequestRef.current !== requestId) return;
      const nextIndex = Math.max(0, resolved.items.findIndex((item) => item.path === activePath));
      const item = resolved.items[nextIndex];
      if (!item) return;
      const nextSettings = { ...settingsRef.current, mode: 'manual' as const };
      settingsRef.current = nextSettings;
      queueRef.current = resolved.items;
      indexRef.current = nextIndex;
      setSettings(nextSettings);
      setQueue(resolved.items);
      await loadItem(item, nextIndex, { preservePause: true });
    } catch (manualError) {
      if (manualRequestRef.current !== requestId) return;
      setError(castErrorMessage(manualError, 'Could not show media'));
    }
  }, [connected, loadItem, openSetup]);

  const disconnect = useCallback(() => {
    clearMediaListener();
    clearBackendSession();
    setConnected(false);
    setPlaying(false);
    setEndsAt(null);
    setDeviceName('');
    setMuted(false);
    setStatus('');
    setError('');
    setVideoProgress(null);
    setIndex(0);
    indexRef.current = 0;
    if (window.cast?.framework) {
      cast.framework.CastContext.getInstance().endCurrentSession(true);
    }
  }, [clearBackendSession, clearMediaListener]);

  const seekVideo = useCallback((timeSeconds: number) => {
    const player = remotePlayerRef.current;
    const controller = remoteControllerRef.current;
    if (!player || !controller || !player.canSeek) return;
    player.currentTime = Math.max(0, timeSeconds);
    controller.seek();
    setVideoProgress((previous) => (
      previous
        ? { ...previous, currentTime: Math.max(0, timeSeconds), paused: previous.paused }
        : previous
    ));
  }, []);

  const scrubStart = useCallback(() => {
    scrubbingRef.current = true;
    const player = remotePlayerRef.current;
    const controller = remoteControllerRef.current;
    if (!player || !controller || player.isPaused) return;
    controller.playOrPause();
    setPlaying(false);
    setVideoProgress((previous) => (
      previous ? { ...previous, paused: true } : previous
    ));
  }, []);

  const scrubEnd = useCallback((resume: boolean) => {
    scrubbingRef.current = false;
    if (!resume) return;
    const player = remotePlayerRef.current;
    const controller = remoteControllerRef.current;
    if (!player || !controller || !player.isPaused) return;
    controller.playOrPause();
    setPlaying(true);
    setVideoProgress((previous) => (
      previous ? { ...previous, paused: false } : previous
    ));
  }, []);

  const togglePlayback = useCallback(() => {
    const current = queueRef.current[indexRef.current];
    if (current?.kind === 'video') {
      remoteControllerRef.current?.playOrPause();
      return;
    }
    setPlaying((value) => {
      const next = !value;
      setEndsAt(next ? Date.now() + settingsRef.current.intervalSec * 1000 : null);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!connected) return undefined;
    let cancelled = false;
    const beat = async () => {
      const id = castSessionIdRef.current;
      if (!id) return;
      try {
        const current = queueRef.current[indexRef.current];
        const result = await heartbeatCastSession(id, {
          deviceName: deviceName || undefined,
          mediaOrigin: mediaOriginRef.current,
          itemCount: queueRef.current.length,
          currentItem: current?.name ?? null,
        });
        if (cancelled) return;
        if (result.stop) disconnect();
      } catch {
        // Ignore transient heartbeat failures; admin stop still cuts media tokens.
      }
    };
    void beat();
    const timer = window.setInterval(() => void beat(), 15000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [connected, deviceName, disconnect]);

  const showMediaOriginField = isLoopbackHost(
    typeof window !== 'undefined' ? window.location.hostname : 'localhost',
  ) && !publicOriginFromEnv;

  const value = useMemo<CastContextValue>(() => ({
    ready,
    unavailableReason,
    connected,
    mode: settings.mode,
    mediaOrigin,
    mediaOriginCandidates,
    showMediaOriginField,
    setMediaOrigin,
    openSetup,
    castManualSelection,
  }), [
    ready,
    unavailableReason,
    connected,
    settings.mode,
    mediaOrigin,
    mediaOriginCandidates,
    showMediaOriginField,
    setMediaOrigin,
    openSetup,
    castManualSelection,
  ]);

  const currentItem = queue[index];

  return (
    <CastContext.Provider value={value}>
      {children}
      <CastSetupDialog
        open={setupOpen}
        connected={connected}
        loading={setupLoading}
        error={error}
        status={status}
        items={draftQueue}
        settings={draftSettings}
        mediaOrigin={mediaOrigin}
        mediaOriginCandidates={mediaOriginCandidates}
        showMediaOriginField={showMediaOriginField}
        onMediaOriginChange={setMediaOrigin}
        onSettingsChange={setDraftSettings}
        onItemsChange={setDraftQueue}
        onDismissError={() => setError('')}
        onClose={() => {
          setSetupOpen(false);
          setError('');
        }}
        onApply={() => void apply()}
      />
      {connected ? (
        <CastNowPlayingBar
          item={currentItem}
          deviceName={deviceName}
          mode={settings.mode}
          playing={playing}
          secondsLeft={secondsLeft}
          intervalSec={settings.intervalSec}
          status={status}
          error={setupOpen ? '' : error}
          volume={settings.volume}
          muted={muted}
          videoProgress={currentItem?.kind === 'video' ? videoProgress : null}
          onVolumeChange={setLiveVolume}
          onToggleMute={toggleMute}
          onPrevious={() => void goTo(-1)}
          onTogglePlaying={togglePlayback}
          onSeek={seekVideo}
          onScrubStart={scrubStart}
          onScrubEnd={scrubEnd}
          onNext={() => void goTo(1)}
          onExpand={() => void openSetup()}
          onDisconnect={disconnect}
          onDismissError={() => setError('')}
        />
      ) : null}
    </CastContext.Provider>
  );
}
