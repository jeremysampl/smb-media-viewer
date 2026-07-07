import { useEffect, useState } from 'react';
import { browse, mediaUrl } from '../api/client';
import type { BrowseEntry } from '../types';
import { Breadcrumbs } from './Breadcrumbs';
import { MediaGallery } from '../gallery/MediaGallery';
import { ResolutionSelector, useQualityPreference } from './ResolutionSelector';

function formatSize(bytes?: number): string {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

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

  useEffect(() => {
    setLoading(true);
    setError('');
    browse(currentPath)
      .then((result) => setEntries(result.entries))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load folder'))
      .finally(() => setLoading(false));
  }, [currentPath]);

  function openEntry(entry: BrowseEntry) {
    if (entry.type === 'folder') {
      setCurrentPath(entry.path);
      return;
    }

    const mediaEntries = entries.filter(
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
          {entries.map((entry) => (
            <button
              key={entry.path}
              type="button"
              className={`file-card ${entry.type}`}
              onClick={() => openEntry(entry)}
            >
              <div className="thumb-wrap">
                {entry.type === 'folder' ? (
                  <div className="folder-icon" aria-hidden>
                    📁
                  </div>
                ) : entry.token && entry.type === 'image' ? (
                  <img
                    src={mediaUrl(entry.token, 'image', quality)}
                    alt={entry.name}
                    loading="lazy"
                  />
                ) : entry.token && entry.type === 'video' ? (
                  <img
                    src={mediaUrl(entry.token, 'poster')}
                    alt={entry.name}
                    loading="lazy"
                  />
                ) : (
                  <div className="placeholder" />
                )}
                {entry.type === 'video' ? <span className="badge">Video</span> : null}
              </div>
              <div className="meta">
                <span className="name">{entry.name}</span>
                {entry.size ? <span className="size">{formatSize(entry.size)}</span> : null}
              </div>
            </button>
          ))}
        </div>
      ) : null}

      <MediaGallery
        entries={entries}
        initialIndex={galleryIndex}
        open={galleryOpen}
        onClose={() => setGalleryOpen(false)}
      />
    </div>
  );
}
