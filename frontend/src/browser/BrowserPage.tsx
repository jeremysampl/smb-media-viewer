import { useEffect, useMemo, useState } from 'react';
import { browse, mediaUrl } from '../api/client';
import type { BrowseEntry } from '../types';
import { Breadcrumbs } from './Breadcrumbs';
import { MediaGallery } from '../gallery/MediaGallery';
import { LazyThumbnail } from './LazyThumbnail';
import { ResolutionSelector, useQualityPreference } from './ResolutionSelector';
import { SortSelector, useSortPreference } from './SortSelector';
import { GridDetailsToggle, useGridDetailsPreference } from './GridDetailsToggle';
import { formatDuration, formatEntryMeta } from './formatters';
import { sortEntries } from './sortEntries';

interface BrowserPageProps {
  onLogout: () => Promise<void>;
  username: string;
}

export function BrowserPage({ onLogout, username }: BrowserPageProps) {
  const [currentPath, setCurrentPath] = useState('');
  const [entries, setEntries] = useState<BrowseEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const { quality, setQuality, profiles } = useQualityPreference();
  const { sort, setSort } = useSortPreference();
  const { showGridDetails, setShowGridDetails } = useGridDetailsPreference();

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

  function openEntry(entry: BrowseEntry) {
    if (entry.type === 'folder') {
      setCurrentPath(entry.path);
      return;
    }

    const mediaEntries = sortedEntries.filter(
      (item) => item.type === 'image' || item.type === 'video',
    );
    const index = mediaEntries.findIndex((item) => item.path === entry.path);
    setGalleryIndex(index >= 0 ? index : 0);
    setGalleryOpen(true);
  }

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

      <Breadcrumbs path={currentPath} onNavigate={setCurrentPath} />

      {loading ? <p className="status">Loading...</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {!loading && !error ? (
        <div className="file-grid">
          {sortedEntries.map((entry) => {
            const isMedia = entry.type === 'image' || entry.type === 'video';
            const showMeta = !isMedia || showGridDetails;

            return (
            <button
              key={entry.path}
              type="button"
              className={`file-card ${entry.type}${isMedia && !showGridDetails ? ' compact' : ''}`}
              onClick={() => openEntry(entry)}
            >
              <div className="thumb-wrap">
                {entry.type === 'folder' ? (
                  <div className="folder-icon" aria-hidden>
                    📁
                  </div>
                ) : entry.token && entry.type === 'image' ? (
                  <LazyThumbnail
                    src={mediaUrl(entry.token, 'image', quality)}
                    alt={entry.name}
                  />
                ) : entry.token && entry.type === 'video' ? (
                  <LazyThumbnail
                    src={mediaUrl(entry.token, 'poster')}
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
