import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { browse, downloadZip, mediaUrl } from '../api/client';
import type { BrowseEntry, QualityTier } from '../types';
import { useIsMobile } from '../hooks/useIsMobile';
import { Breadcrumbs } from './Breadcrumbs';
import { browsePathToUrl, urlSplatToBrowsePath } from './browsePath';
import { MediaGallery } from '../gallery/MediaGallery';
import { FileViewerHost } from '../viewer/FileViewerHost';
import { isViewableFileEntry } from '../viewer/kinds';
import { FileThumb } from '../files/FileThumb';
import { VirtualFileGrid } from './VirtualFileGrid';
import { ResolutionSelector, useQualityPreference } from './ResolutionSelector';
import { SortSelector, useSortPreference } from './SortSelector';
import { FileTypeSelector } from './FileTypeSelector';
import {
  FILE_TYPE_FILTER_GROUPS,
  FILE_TYPE_FILTER_TOP,
  filterEntriesByFileType,
  useFileTypeFilterPreference,
  type FileTypeFilter,
} from './fileTypeFilter';
import { GridDetailsToggle, useGridDetailsPreference } from './GridDetailsToggle';
import { DownloadDialog } from './DownloadDialog';
import { EntryContextMenu, type ContextMenuState } from './EntryContextMenu';
import { UserMenu } from './UserMenu';
import { formatDuration, formatEntryMeta } from './formatters';
import { SORT_OPTIONS, sortEntries } from './sortEntries';
import { Button, CastIcon, ChevronDownIcon, CloseIcon, IconButton, Modal } from '../ui';
import {
  gapForColumns,
  paddingForColumns,
  useMobileGridColumns,
} from './useMobileGridColumns';
import { useCast } from '../cast/CastContext';

interface BrowserPageProps {
  onLogout: () => Promise<void>;
  username: string;
  isAdmin?: boolean;
}

const LONG_PRESS_MS = 480;
const LONG_PRESS_MOVE_PX = 12;

function defaultZipNameForPath(browsePath: string): string {
  const segments = browsePath.split('/').filter(Boolean);
  return segments.at(-1) || 'Shares';
}

function fileTypeFilterLabel(filter: FileTypeFilter): string {
  const top = FILE_TYPE_FILTER_TOP.find((option) => option.id === filter);
  if (top) return top.label;
  for (const group of FILE_TYPE_FILTER_GROUPS) {
    const match = group.options.find((option) => option.id === filter);
    if (match) return match.label;
  }
  return filter;
}

export function BrowserPage({ onLogout, username, isAdmin = false }: BrowserPageProps) {
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
  const [fileViewerEntry, setFileViewerEntry] = useState<BrowseEntry | null>(null);
  const { quality, setQuality, profiles } = useQualityPreference();
  const { sort, setSort } = useSortPreference();
  const { fileTypeFilter, setFileTypeFilter } = useFileTypeFilterPreference();
  const { showGridDetails, setShowGridDetails } = useGridDetailsPreference();
  const [indexBannerDismissed, setIndexBannerDismissed] = useState(false);
  const [indexingActive, setIndexingActive] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(() => new Set());
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const [downloadTargets, setDownloadTargets] = useState<string[]>([]);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [typeFilterBusy, setTypeFilterBusy] = useState(false);
  const [sortBusy, setSortBusy] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const cast = useCast();

  const longPressTimerRef = useRef<number | null>(null);
  const longPressOriginRef = useRef<{ x: number; y: number } | null>(null);
  const longPressPathRef = useRef<string | null>(null);
  /** Ignore the click that follows a long-press on that card. */
  const suppressClickPathRef = useRef<string | null>(null);

  function navigateToPath(path: string) {
    navigate(browsePathToUrl(path));
  }

  function handleSortChange(next: typeof sort) {
    setSortBusy(true);
    setSort(next);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function handleFileTypeFilterChange(next: typeof fileTypeFilter) {
    setTypeFilterBusy(true);
    setFileTypeFilter(next);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function clearLongPress() {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressOriginRef.current = null;
    longPressPathRef.current = null;
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedPaths(new Set());
    setDownloadOpen(false);
    setDownloadError('');
    setDownloadTargets([]);
    setContextMenu(null);
  }

  function beginSelectionWith(path: string) {
    setSelectMode(true);
    setSelectedPaths(new Set([path]));
    setContextMenu(null);
  }

  function toggleSelected(path: string) {
    setSelectedPaths((previous) => {
      const next = new Set(previous);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function selectAllVisible() {
    setSelectedPaths(new Set(sortedEntries.map((entry) => entry.path)));
  }

  function openDownload(paths: string[]) {
    if (paths.length === 0) return;
    setDownloadTargets(paths);
    setDownloadError('');
    setDownloadOpen(true);
    setContextMenu(null);
  }

  useEffect(() => {
    setIndexBannerDismissed(false);
    setIndexingActive(false);
    exitSelectMode();
  }, [currentPath]);

  useEffect(() => {
    if (!selectMode) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') exitSelectMode();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectMode]);

  useEffect(() => {
    if (!isMobile) setControlsOpen(false);
  }, [isMobile]);

  useEffect(() => {
    if (!controlsOpen) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [controlsOpen]);

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

  const sortedEntries = useMemo(() => {
    const filtered = filterEntriesByFileType(entries, fileTypeFilter);
    const dateSort = sort === 'date_asc' || sort === 'date_desc';
    // Freeze date sort on mtime while capture times are still filling in.
    return sortEntries(filtered, sort, {
      preferMtime: dateSort && indexingActive,
    });
  }, [entries, fileTypeFilter, sort, indexingActive]);

  const mediaEntries = useMemo(
    () =>
      sortedEntries.filter(
        (entry) => entry.type === 'image' || entry.type === 'video',
      ),
    [sortedEntries],
  );

  const gridLayoutKey = useMemo(() => {
    // Cheap order fingerprint for LazyThumbnail (avoid joining every path).
    let hash = 2166136261;
    for (const entry of sortedEntries) {
      const path = entry.path;
      for (let i = 0; i < path.length; i += 1) {
        hash ^= path.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
      hash ^= 10;
    }
    return `${fileTypeFilter}:${sortedEntries.length}:${hash >>> 0}`;
  }, [fileTypeFilter, sortedEntries]);

  useEffect(() => {
    if (!typeFilterBusy) return undefined;
    const timer = window.setTimeout(() => setTypeFilterBusy(false), 500);
    return () => window.clearTimeout(timer);
  }, [typeFilterBusy, gridLayoutKey]);

  useEffect(() => {
    if (!sortBusy) return undefined;
    const timer = window.setTimeout(() => setSortBusy(false), 500);
    return () => window.clearTimeout(timer);
  }, [sortBusy, gridLayoutKey]);

  const needsIndexRefresh = useMemo(
    () =>
      entries.some(
        (entry) =>
          (entry.type === 'image' || entry.type === 'video') &&
          entry.indexed === false,
      ),
    [entries],
  );

  const allVisibleSelected =
    sortedEntries.length > 0 &&
    sortedEntries.every((entry) => selectedPaths.has(entry.path));

  useEffect(() => {
    if (loading || error || !needsIndexRefresh) {
      setIndexingActive(false);
      return undefined;
    }

    setIndexingActive(true);
    let cancelled = false;
    let attempts = 0;
    let stagnantRounds = 0;
    // Large folders need more time; stop once the index marks files ready.
    const maxAttempts = 120;

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
            let stillPending = false;
            let changed = false;
            const next = previous.map((prior) => {
              const incoming = incomingByPath.get(prior.path);
              if (!incoming) {
                if (
                  (prior.type === 'image' || prior.type === 'video') &&
                  prior.indexed === false
                ) {
                  stillPending = true;
                }
                return prior;
              }

              const nextCapture = incoming.captureTime ?? prior.captureTime;
              const nextDuration = incoming.duration ?? prior.duration;
              const nextIndexed =
                incoming.indexed !== undefined ? incoming.indexed : prior.indexed;

              if (
                (prior.type === 'image' || prior.type === 'video') &&
                nextIndexed === false
              ) {
                stillPending = true;
              }

              if (
                nextCapture === prior.captureTime &&
                nextDuration === prior.duration &&
                nextIndexed === prior.indexed
              ) {
                return prior;
              }

              if (prior.indexed === false && nextIndexed === true) filled += 1;
              if (!prior.captureTime && nextCapture) filled += 1;
              changed = true;

              return {
                ...prior,
                captureTime: nextCapture,
                duration: nextDuration,
                indexed: nextIndexed,
                thumbnailUrl: prior.thumbnailUrl,
              };
            });

            if (!stillPending) {
              stop();
            } else if (filled === 0) {
              stagnantRounds += 1;
              if (stagnantRounds >= 6) {
                stop();
              }
            } else {
              stagnantRounds = 0;
            }

            return changed ? next : previous;
          });
        })
        .catch(() => undefined);
    }, 4000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      setIndexingActive(false);
    };
  }, [currentPath, loading, error, needsIndexRefresh]);

  function viewEntry(entry: BrowseEntry) {
    if (entry.type === 'folder') {
      navigateToPath(entry.path);
      return;
    }
    if (entry.type === 'file') {
      if (isViewableFileEntry(entry)) {
        setFileViewerEntry(entry);
      }
      return;
    }

    if (
      cast.connected
      && cast.mode === 'manual'
      && (entry.type === 'image' || entry.type === 'video')
    ) {
      void cast.castManualSelection(
        mediaEntries.map((item) => item.path),
        entry.path,
      );
    }
    const index = mediaEntries.findIndex((item) => item.path === entry.path);
    setGalleryIndex(index >= 0 ? index : 0);
    setGalleryOpen(true);
  }

  function openEntry(entry: BrowseEntry) {
    if (shouldSuppressClick()) return;

    // Long-press may still fire a click on that card; swallow only that one.
    if (suppressClickPathRef.current) {
      const suppressedPath = suppressClickPathRef.current;
      suppressClickPathRef.current = null;
      if (suppressedPath === entry.path) return;
    }

    if (selectMode) {
      toggleSelected(entry.path);
      return;
    }

    viewEntry(entry);
  }

  function handleCardPointerDown(entry: BrowseEntry, event: React.PointerEvent) {
    if (!isMobile || selectMode) return;
    if (event.pointerType === 'mouse') return;
    if (event.isPrimary === false) return;

    clearLongPress();
    longPressOriginRef.current = { x: event.clientX, y: event.clientY };
    longPressPathRef.current = entry.path;
    longPressTimerRef.current = window.setTimeout(() => {
      const path = longPressPathRef.current;
      clearLongPress();
      if (!path) return;
      suppressClickPathRef.current = path;
      beginSelectionWith(path);
      navigator.vibrate?.(15);
    }, LONG_PRESS_MS);
  }

  function handleCardPointerMove(event: React.PointerEvent) {
    const origin = longPressOriginRef.current;
    if (!origin) return;
    const dx = event.clientX - origin.x;
    const dy = event.clientY - origin.y;
    if (dx * dx + dy * dy > LONG_PRESS_MOVE_PX * LONG_PRESS_MOVE_PX) {
      clearLongPress();
    }
  }

  function handleCardContextMenu(entry: BrowseEntry, event: React.MouseEvent) {
    event.preventDefault();
    if (isMobile) return;
    event.stopPropagation();
    setContextMenu({ x: event.clientX, y: event.clientY, entry });
  }

  async function handleDownloadConfirm(zipName: string, downloadQuality: QualityTier) {
    setDownloadBusy(true);
    setDownloadError('');
    try {
      await downloadZip({
        paths: downloadTargets,
        zipName,
        quality: downloadQuality,
      });
      setDownloadOpen(false);
      setDownloadTargets([]);
      if (selectMode) exitSelectMode();
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setDownloadBusy(false);
    }
  }

  const gridStyle = isMobile
    ? ({
        '--cols': columns,
        '--gap': `${gapForColumns(columns)}px`,
        '--card-padding': `${paddingForColumns(columns)}rem`,
      } as React.CSSProperties)
    : undefined;

  const showIndexBanner =
    !loading && !error && indexingActive && !indexBannerDismissed;
  const showSelectionChrome = selectMode;

  return (
    <div
      className={`browser-page${selectMode ? ' selecting' : ''}${
        showSelectionChrome ? ' has-selection-dock' : ''
      }${cast.connected ? ' has-cast-bar' : ''}`}
    >
      <header className="top-bar">
        <div className="top-bar-brand">
          <img
            className="top-bar-mark"
            src="/favicon.svg"
            alt=""
            width={36}
            height={36}
            aria-hidden
          />
          <div className="top-bar-copy">
            <p className="top-bar-eyebrow">SMB Media Viewer</p>
            <h1>Media Library</h1>
          </div>
        </div>
        <div className="top-bar-actions">
          {!isMobile ? (
            <IconButton
              label={cast.connected ? 'Add to Cast' : 'Cast media'}
              disabled={!cast.ready}
              title={
                cast.ready
                  ? (cast.connected ? 'Add to Cast' : 'Cast media')
                  : (cast.unavailableReason ?? 'Google Cast is not available')
              }
              onClick={() => void cast.openSetup({
                paths: currentPath ? [currentPath] : [],
                append: cast.connected,
              })}
            >
              <CastIcon />
            </IconButton>
          ) : null}
          <UserMenu username={username} onLogout={onLogout} isAdmin={isAdmin} />
        </div>
      </header>

      <div className="browser-nav">
        <Breadcrumbs path={currentPath} onNavigate={navigateToPath} />

        {isMobile ? (
          <div className="browser-nav-mobile-tools">
            <button
              type="button"
              className="browser-options-btn"
              aria-haspopup="dialog"
              aria-expanded={controlsOpen}
              onClick={() => setControlsOpen(true)}
            >
              <span className="browser-options-btn-icon" aria-hidden>
                <svg viewBox="0 0 24 24" width="18" height="18">
                  <path
                    fill="currentColor"
                    d="M4 6.75h16v1.5H4v-1.5Zm2.5 4.5h11v1.5h-11v-1.5Zm2.5 4.5h6v1.5h-6v-1.5Z"
                  />
                </svg>
              </span>
              <span className="browser-options-btn-copy">
                <span className="browser-options-btn-title">Library options</span>
                <span className="browser-options-btn-meta">
                  {SORT_OPTIONS.find((option) => option.id === sort)?.label ?? sort}
                  {' · '}
                  {fileTypeFilterLabel(fileTypeFilter)}
                  {' · '}
                  {profiles.find((profile) => profile.id === quality)?.label ?? quality}
                </span>
              </span>
              <span className="browser-options-btn-chevron" aria-hidden>
                <ChevronDownIcon size={16} />
              </span>
            </button>
            <IconButton
              label={cast.connected ? 'Add to Cast' : 'Cast media'}
              className="browser-cast-btn"
              disabled={!cast.ready}
              title={
                cast.ready
                  ? (cast.connected ? 'Add to Cast' : 'Cast media')
                  : (cast.unavailableReason ?? 'Google Cast is not available')
              }
              onClick={() => void cast.openSetup({
                paths: currentPath ? [currentPath] : [],
                append: cast.connected,
              })}
            >
              <CastIcon />
            </IconButton>
          </div>
        ) : (
          <div className="toolbar-group" role="group" aria-label="Library controls">
            <SortSelector sort={sort} onChange={handleSortChange} busy={sortBusy} />
            <FileTypeSelector
              value={fileTypeFilter}
              onChange={handleFileTypeFilterChange}
              busy={typeFilterBusy}
            />
            <ResolutionSelector
              quality={quality}
              profiles={profiles}
              onChange={setQuality}
            />
            <GridDetailsToggle
              enabled={showGridDetails}
              onChange={setShowGridDetails}
            />
          </div>
        )}
      </div>

      <Modal
        open={isMobile && controlsOpen}
        title="Library options"
        onClose={() => setControlsOpen(false)}
        className="browser-controls-sheet"
        backdropClassName="browser-controls-backdrop"
        header={(titleId) => (
          <>
            <div className="browser-controls-sheet-handle" aria-hidden />
            <div className="browser-controls-sheet-header">
              <h2 id={titleId}>Library options</h2>
              <button
                type="button"
                className="browser-controls-close"
                aria-label="Close options"
                onClick={() => setControlsOpen(false)}
              >
                <CloseIcon size={16} />
              </button>
            </div>
          </>
        )}
      >
        <div className="toolbar-group toolbar-group-sheet" role="group" aria-label="Library controls">
          <SortSelector
            sort={sort}
            onChange={handleSortChange}
            busy={sortBusy}
            layout="stack"
          />
          <FileTypeSelector
            value={fileTypeFilter}
            onChange={handleFileTypeFilterChange}
            busy={typeFilterBusy}
            layout="stack"
          />
          <ResolutionSelector
            quality={quality}
            profiles={profiles}
            onChange={setQuality}
            layout="stack"
          />
          <GridDetailsToggle
            enabled={showGridDetails}
            onChange={setShowGridDetails}
            layout="stack"
          />
        </div>
        <Button className="browser-controls-done" onClick={() => setControlsOpen(false)}>
          Done
        </Button>
      </Modal>

      {loading ? <p className="status">Loading...</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {showIndexBanner ? (
        <div className="index-snackbar" role="status" aria-live="polite">
          <p>
            Still reading media info for this folder. Date order may shift until
            that finishes{sort === 'date_desc' || sort === 'date_asc' ? ' (especially with date sort)' : ''}.
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="index-snackbar-dismiss"
            aria-label="Dismiss"
            onClick={() => setIndexBannerDismissed(true)}
          >
            Dismiss
          </Button>
        </div>
      ) : null}

      {!loading && !error ? (
        <VirtualFileGrid
          entries={sortedEntries}
          isMobile={isMobile}
          mobileColumns={columns}
          isPinching={isPinching}
          showGridDetails={showGridDetails}
          className={`file-grid${isMobile ? ' file-grid-mobile' : ''}${
            isPinching ? ' is-pinching' : ''
          }`}
          style={gridStyle}
          aria-busy={typeFilterBusy || sortBusy}
          gridRef={gridRef}
          renderCard={(entry) => {
            const isMedia = entry.type === 'image' || entry.type === 'video';
            const showMeta =
              entry.type === 'folder' ||
              entry.type === 'file' ||
              showGridDetails;
            const selected = selectedPaths.has(entry.path);

            return (
              <button
                key={entry.path}
                type="button"
                className={`file-card ${entry.type}${
                  isMedia && !showGridDetails ? ' compact' : ''
                }${selected ? ' is-selected' : ''}`}
                data-media-path={isMedia ? entry.path : undefined}
                aria-pressed={selectMode ? selected : undefined}
                onClick={() => openEntry(entry)}
                onContextMenu={(event) => handleCardContextMenu(entry, event)}
                onDragStart={(event) => event.preventDefault()}
                draggable={false}
                onPointerDown={(event) => handleCardPointerDown(entry, event)}
                onPointerMove={handleCardPointerMove}
                onPointerUp={clearLongPress}
                onPointerCancel={clearLongPress}
                onPointerLeave={clearLongPress}
              >
                {selectMode ? (
                  <span
                    className={`selection-check${selected ? ' checked' : ''}`}
                    aria-hidden
                  >
                    {selected ? '✓' : ''}
                  </span>
                ) : null}
                <div className="thumb-wrap">
                  {entry.type === 'folder' ? (
                    <div className="folder-icon" aria-hidden>
                      📁
                    </div>
                  ) : entry.type === 'file' ? (
                    <FileThumb
                      filename={entry.name}
                      format={entry.format}
                    />
                  ) : entry.token &&
                    (entry.type === 'image' || entry.type === 'video') ? (
                    <FileThumb
                      key={`${entry.path}:${sort}:${fileTypeFilter}`}
                      filename={entry.name}
                      format={entry.format}
                      alt={entry.name}
                      lazy
                      layoutKey={gridLayoutKey}
                      src={
                        entry.thumbnailUrl ??
                        (entry.type === 'image'
                          ? mediaUrl(entry.token, 'image', 'very_low')
                          : mediaUrl(entry.token, 'poster'))
                      }
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
                    {(isMedia || entry.type === 'file') &&
                    showGridDetails &&
                    (entry.size || entry.format) ? (
                      <span className="size">{formatEntryMeta(entry)}</span>
                    ) : null}
                  </div>
                ) : null}
              </button>
            );
          }}
        />
      ) : null}

      {showSelectionChrome ? (
        <>
          <div className="selection-chip selection-chip-start" role="status">
            <span className="selection-chip-count">{selectedPaths.size}</span>
            <button
              type="button"
              className={`selection-chip-icon-btn${allVisibleSelected ? ' is-active' : ''}`}
              aria-label={allVisibleSelected ? 'Clear selection' : 'Select all'}
              aria-pressed={allVisibleSelected}
              disabled={sortedEntries.length === 0}
              onClick={() => {
                if (allVisibleSelected) setSelectedPaths(new Set());
                else selectAllVisible();
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M7 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm0 2v12h12V7H7Zm2.3 6.3 1.4-1.4 1.8 1.8 4.2-4.2 1.4 1.4-5.6 5.6-3.2-3.2Z"
                />
              </svg>
            </button>
          </div>

          <button
            type="button"
            className="selection-chip selection-chip-end"
            aria-label="Cancel selection"
            onClick={exitSelectMode}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12 19 6.4 17.6 5 12 10.6 6.4 5Z"
              />
            </svg>
          </button>

          <div className="selection-dock" role="region" aria-label="Selection actions">
            <button
              type="button"
              className="selection-dock-action"
              disabled={selectedPaths.size === 0 || !cast.ready}
              onClick={() => void cast.openSetup({
                paths: [...selectedPaths],
                append: cast.connected,
              })}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path fill="currentColor" d="M3 18v3h3a3 3 0 0 0-3-3Zm0-4v2a5 5 0 0 1 5 5h2a7 7 0 0 0-7-7Zm0-4v2c5 0 9 4 9 9h2c0-6.1-4.9-11-11-11Zm3-5v2h12v10h-2v2h4V5H6Z" />
              </svg>
              <span>{cast.connected ? 'Add to Cast' : 'Cast'}</span>
            </button>
            <button
              type="button"
              className="selection-dock-action"
              disabled={selectedPaths.size === 0}
              onClick={() => openDownload([...selectedPaths])}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M11 3h2v10.2l3.1-3.1 1.4 1.4L12 17.1 6.5 11.5l1.4-1.4L11 13.2V3Zm-6 14h14v4H5v-4Z"
                />
              </svg>
              <span>Download</span>
            </button>
          </div>
        </>
      ) : null}

      {contextMenu && !isMobile ? (
        <EntryContextMenu
          menu={contextMenu}
          selectMode={selectMode}
          selected={selectedPaths.has(contextMenu.entry.path)}
          selectedCount={selectedPaths.size}
          onClose={() => setContextMenu(null)}
          onSelect={() => {
            if (selectMode) toggleSelected(contextMenu.entry.path);
            else beginSelectionWith(contextMenu.entry.path);
          }}
          onDeselect={() => toggleSelected(contextMenu.entry.path)}
          onSelectAll={selectAllVisible}
          onClearSelection={exitSelectMode}
          onView={() => viewEntry(contextMenu.entry)}
          onDownloadOne={() => openDownload([contextMenu.entry.path])}
          onDownloadSelected={() => openDownload([...selectedPaths])}
          onCastOne={() => void cast.openSetup({
            paths: [contextMenu.entry.path],
            append: cast.connected,
          })}
          onCastSelected={() => void cast.openSetup({
            paths: [...selectedPaths],
            append: cast.connected,
          })}
          castConnected={cast.connected}
        />
      ) : null}

      <MediaGallery
        entries={mediaEntries}
        initialIndex={galleryIndex}
        open={galleryOpen}
        onClose={() => setGalleryOpen(false)}
        onIndexChange={(nextIndex) => {
          if (!cast.connected || cast.mode !== 'manual') return;
          const entry = mediaEntries[nextIndex];
          if (entry?.type !== 'image' && entry?.type !== 'video') return;
          void cast.castManualSelection(
            mediaEntries.map((item) => item.path),
            entry.path,
          );
        }}
      />

      <FileViewerHost
        entry={fileViewerEntry}
        open={Boolean(fileViewerEntry)}
        onClose={() => setFileViewerEntry(null)}
      />

      <DownloadDialog
        open={downloadOpen}
        defaultZipName={defaultZipNameForPath(currentPath)}
        selectedCount={downloadTargets.length}
        quality={quality === 'very_low' ? 'medium' : quality}
        profiles={profiles}
        busy={downloadBusy}
        error={downloadError}
        onClose={() => {
          if (!downloadBusy) {
            setDownloadOpen(false);
            setDownloadError('');
            setDownloadTargets([]);
          }
        }}
        onConfirm={(zipName, downloadQuality) => {
          void handleDownloadConfirm(zipName, downloadQuality);
        }}
      />
    </div>
  );
}
