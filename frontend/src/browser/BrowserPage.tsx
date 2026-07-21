import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { browse, mediaUrl } from '../api/client';
import type { BrowseEntry } from '../types';
import { useIsMobile } from '../hooks/useIsMobile';
import { Breadcrumbs } from './Breadcrumbs';
import { browsePathToUrl, urlSplatToBrowsePath } from './browsePath';
import { MediaGallery } from '../gallery/MediaGallery';
import { LazyThumbnail } from './LazyThumbnail';
import { ResolutionSelector, useQualityPreference } from './ResolutionSelector';
import { SortSelector, useSortPreference } from './SortSelector';
import { GridDetailsToggle, useGridDetailsPreference } from './GridDetailsToggle';
import { formatDuration, formatEntryMeta } from './formatters';
import { sortEntries } from './sortEntries';
import {
  gapForColumns,
  paddingForColumns,
  useMobileGridColumns,
} from './useMobileGridColumns';

interface BrowserPageProps {
  onLogout: () => Promise<void>;
  username: string;
}

export function BrowserPage({ onLogout, username }: BrowserPageProps) {
  const navigate = useNavigate();
  const params = useParams();
  const currentPath = urlSplatToBrowsePath(params['*']);
  const isMobile = useIsMobile();
  const { gridRef, columns, isPinching, shouldSuppressClick } = useMobileGridColumns(isMobile);
  const [entries, setEntries] = useState<BrowseEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const { quality, setQuality, profiles } = useQualityPreference();
  const { sort, setSort } = useSortPreference();
  const { showGridDetails, setShowGridDetails } = useGridDetailsPreference();
  const [indexBannerDismissed, setIndexBannerDismissed] = useState(false);
  const [indexingActive, setIndexingActive] = useState(false);

  function navigateToPath(path: string) {
    navigate(browsePathToUrl(path));
  }

  useEffect(() => {
    setIndexBannerDismissed(false);
    setIndexingActive(false);
  }, [currentPath]);

  useEffect(() => {
    const controller = new AbortController();

    setLoading(true);
    setError('');

    browse(currentPath, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setEntries(result.entries);
        }
      })
      .catch((err) => {
        if (controller.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
          return;
        }
        setError(err instanceof Error ? err.message : 'Failed to load folder');
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [currentPath]);

  const sortedEntries = useMemo(
    () => sortEntries(entries, sort),
    [entries, sort],
  );

  const needsIndexRefresh = useMemo(
    () =>
      entries.some(
        (entry) =>
          (entry.type === 'image' || entry.type === 'video') && !entry.captureTime,
      ),
    [entries],
  );

  // Soft-refresh while background indexing fills in captureTime / duration.
  // Keep existing tokens so thumbnail <img> src values do not change (avoids RAM spikes).
  useEffect(() => {
    if (loading || error || !needsIndexRefresh) {
      setIndexingActive(false);
      return undefined;
    }

    setIndexingActive(true);
    let cancelled = false;
    let attempts = 0;
    let stagnantRounds = 0;
    const maxAttempts = 12;

    const stop = () => {
      if (!cancelled) setIndexingActive(false);
      window.clearInterval(timer);
    };

    const timer = window.setInterval(() => {
      attempts += 1;
      if (attempts > maxAttempts) {
        stop();
        return;
      }

      browse(currentPath)
        .then((result) => {
          if (cancelled) return;

          const incomingByPath = new Map(
            result.entries.map((entry) => [entry.path, entry]),
          );

          setEntries((previous) => {
            let filled = 0;
            let changed = false;
            const next = previous.map((prior) => {
              const incoming = incomingByPath.get(prior.path);
              if (!incoming) return prior;

              const nextCapture = incoming.captureTime ?? prior.captureTime;
              const nextDuration = incoming.duration ?? prior.duration;
              if (
                nextCapture === prior.captureTime &&
                nextDuration === prior.duration
              ) {
                return prior;
              }

              if (!prior.captureTime && nextCapture) filled += 1;
              changed = true;

              // Capture-time arriving usually means the index thumb/poster is ready.
              // Bust the thumbnail URL once so LazyThumbnail remounts without
              // swapping the media token (which would reload every grid image).
              const thumbnailUrl =
                !prior.captureTime && nextCapture && prior.thumbnailUrl
                  ? `${prior.thumbnailUrl}${prior.thumbnailUrl.includes('?') ? '&' : '?'}v=1`
                  : prior.thumbnailUrl;

              return {
                ...prior,
                captureTime: nextCapture,
                duration: nextDuration,
                thumbnailUrl,
              };
            });

            if (filled === 0) {
              stagnantRounds += 1;
              if (stagnantRounds >= 3) {
                stop();
              }
            } else {
              stagnantRounds = 0;
            }

            return changed ? next : previous;
          });
        })
        .catch(() => undefined);
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      setIndexingActive(false);
    };
  }, [currentPath, loading, error, needsIndexRefresh]);

  function openEntry(entry: BrowseEntry) {
    if (shouldSuppressClick()) return;

    if (entry.type === 'folder') {
      navigateToPath(entry.path);
      return;
    }

    const mediaEntries = sortedEntries.filter(
      (item) => item.type === 'image' || item.type === 'video',
    );
    const index = mediaEntries.findIndex((item) => item.path === entry.path);
    setGalleryIndex(index >= 0 ? index : 0);
    setGalleryOpen(true);
  }

  const gridStyle = isMobile
    ? ({
        '--cols': columns,
        '--gap': `${gapForColumns(columns)}px`,
        '--card-padding': `${paddingForColumns(columns)}rem`,
      } as React.CSSProperties)
    : undefined;

  const denseGrid = isMobile && columns >= 4;
  const showIndexBanner =
    !loading && !error && indexingActive && !indexBannerDismissed;

  return (
    <div className="browser-page">
      <header className="top-bar">
        <div>
          <h1>Media Library</h1>
          <p className="subtitle">Signed in as {username}</p>
        </div>
        <div className="top-actions">
          <SortSelector sort={sort} onChange={setSort} />
          <GridDetailsToggle
            enabled={showGridDetails}
            onChange={setShowGridDetails}
          />
          <ResolutionSelector
            quality={quality}
            profiles={profiles}
            onChange={setQuality}
          />
          <button type="button" className="secondary" onClick={() => void onLogout()}>
            Sign out
          </button>
        </div>
      </header>

      <Breadcrumbs path={currentPath} onNavigate={navigateToPath} />

      {loading ? <p className="status">Loading...</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {showIndexBanner ? (
        <div className="index-snackbar" role="status" aria-live="polite">
          <p>
            Still reading capture dates from EXIF. Items may shift as that data
            arrives{sort === 'date_desc' || sort === 'date_asc' ? ' (especially with date sort)' : ''}.
          </p>
          <button
            type="button"
            className="index-snackbar-dismiss"
            aria-label="Dismiss"
            onClick={() => setIndexBannerDismissed(true)}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {!loading && !error ? (
        <div
          ref={gridRef}
          className={`file-grid${isMobile ? ' file-grid-mobile' : ''}${
            isPinching ? ' is-pinching' : ''
          }`}
          style={gridStyle}
        >
          {sortedEntries.map((entry) => {
            const isMedia = entry.type === 'image' || entry.type === 'video';
            const showMeta = (!isMedia || showGridDetails) && !denseGrid;

            return (
              <button
                key={entry.path}
                type="button"
                className={`file-card ${entry.type}${
                  isMedia && (!showGridDetails || denseGrid) ? ' compact' : ''
                }`}
                data-media-path={isMedia ? entry.path : undefined}
                onClick={() => openEntry(entry)}
              >
                <div className="thumb-wrap">
                  {entry.type === 'folder' ? (
                    <div className="folder-icon" aria-hidden>
                      📁
                    </div>
                  ) : entry.token && entry.type === 'image' ? (
                    <LazyThumbnail
                      src={entry.thumbnailUrl ?? mediaUrl(entry.token, 'image', 'very_low')}
                      alt={entry.name}
                    />
                  ) : entry.token && entry.type === 'video' ? (
                    <LazyThumbnail
                      src={entry.thumbnailUrl ?? mediaUrl(entry.token, 'poster')}
                      alt={entry.name}
                    />
                  ) : (
                    <div className="placeholder" />
                  )}
                  {entry.type === 'video' && entry.duration ? (
                    <span className="badge">{formatDuration(entry.duration)}</span>
                  ) : null}
                </div>
                {showMeta ? (
                  <div className="meta">
                    <span className="name">{entry.name}</span>
                    {isMedia && showGridDetails && (entry.size || entry.format) ? (
                      <span className="size">{formatEntryMeta(entry)}</span>
                    ) : null}
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      <MediaGallery
        entries={sortedEntries}
        initialIndex={galleryIndex}
        open={galleryOpen}
        onClose={() => setGalleryOpen(false)}
      />
    </div>
  );
}
