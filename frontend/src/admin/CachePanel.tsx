import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  clearAdminCache,
  getAdminCacheEntries,
  type AdminCacheEntry,
  type AdminListQuery,
} from '../api/client';
import { JobFileDetails } from './JobFileDetails';
import { formatBytes, formatRelativeTime } from './format';
import {
  AdminDataPanel,
  type AdminServerQuery,
} from './table/AdminDataPanel';
import type { AdminColumnDef } from './table/useAdminTableState';

interface CachePanelProps {
  active: boolean;
  now: number;
}

function parentFolder(path: string | null): string | null {
  if (!path) return null;
  const normalized = path.replace(/\\/g, '/');
  const idx = normalized.lastIndexOf('/');
  if (idx <= 0) return null;
  return normalized.slice(0, idx);
}

export function CachePanel({ active, now }: CachePanelProps) {
  const [entries, setEntries] = useState<AdminCacheEntry[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [clearBusy, setClearBusy] = useState(false);
  const [query, setQuery] = useState<AdminListQuery>({
    page: 1,
    pageSize: 50,
    sort: 'lastAccessAt',
    order: 'desc',
    kind: 'all',
  });
  const debounceRef = useRef<number | undefined>(undefined);
  const requestId = useRef(0);

  const load = useCallback(async (nextQuery: AdminListQuery) => {
    const id = ++requestId.current;
    try {
      setLoading(true);
      const result = await getAdminCacheEntries(nextQuery);
      if (id !== requestId.current) return;
      setEntries(result.entries);
      setFolders(result.folders);
      setTotal(result.total);
      setError(null);
    } catch (err) {
      if (id !== requestId.current) return;
      setError(err instanceof Error ? err.message : 'Failed to load cache entries');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return undefined;
    void load(query);
    const timer = window.setInterval(() => {
      void load(query);
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [active, query, load]);

  const onServerQueryChange = useCallback((next: AdminServerQuery<string>) => {
    const mapped: AdminListQuery = {
      page: next.page,
      pageSize: next.pageSize,
      sort: next.sort.key,
      order: next.sort.dir,
      search: next.search,
      folder: next.folder,
      kind: next.chip === 'image' || next.chip === 'video' ? next.chip : 'all',
    };

    if (debounceRef.current !== undefined) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      setQuery((current) => {
        const same =
          current.page === mapped.page &&
          current.pageSize === mapped.pageSize &&
          current.sort === mapped.sort &&
          current.order === mapped.order &&
          (current.search ?? '') === (mapped.search ?? '') &&
          (current.folder ?? '') === (mapped.folder ?? '') &&
          (current.kind ?? 'all') === (mapped.kind ?? 'all');
        return same ? current : mapped;
      });
    }, 200);
  }, []);

  async function runClear(
    body: { mode: 'all' | 'ids' | 'folder'; ids?: string[]; folder?: string },
  ) {
    setClearBusy(true);
    try {
      const result = await clearAdminCache(body);
      setError(null);
      await load(query);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear cache');
      return null;
    } finally {
      setClearBusy(false);
    }
  }

  const columns = useMemo<AdminColumnDef<AdminCacheEntry, string>[]>(
    () => [
      {
        id: 'kind',
        label: 'Kind',
        sortValue: (row) => row.kind,
        render: (row) => row.kind,
      },
      {
        id: 'file',
        label: 'File',
        sortValue: (row) => row.label.toLowerCase(),
        searchText: (row) => `${row.label} ${row.sourcePath ?? ''} ${row.cachePath}`,
        render: (row) =>
          row.sourcePath ? (
            <JobFileDetails
              label={row.label}
              path={row.sourcePath}
              size={row.size}
              formatBytes={formatBytes}
            />
          ) : (
            <span className="admin-job-label" title={row.cachePath}>
              {row.label}
            </span>
          ),
      },
      {
        id: 'quality',
        label: 'Quality',
        sortValue: (row) => row.quality ?? '',
        hideBelow: 'tablet',
        render: (row) => row.quality ?? '—',
      },
      {
        id: 'size',
        label: 'Size',
        align: 'right',
        sortValue: (row) => row.size,
        render: (row) => formatBytes(row.size),
      },
      {
        id: 'accessCount',
        label: 'Opens',
        align: 'right',
        sortValue: (row) => row.accessCount,
        render: (row) => row.accessCount.toLocaleString(),
      },
      {
        id: 'lastAccessAt',
        label: 'Last opened',
        align: 'right',
        sortValue: (row) => row.lastAccessAt,
        render: (row, ctx) => formatRelativeTime(row.lastAccessAt, ctx.now),
      },
      {
        id: 'createdAt',
        label: 'Cached',
        align: 'right',
        sortValue: (row) => row.createdAt,
        hideBelow: 'tablet',
        render: (row, ctx) => formatRelativeTime(row.createdAt, ctx.now),
      },
    ],
    [],
  );

  return (
    <>
      {error ? <p className="error">{error}</p> : null}
      <AdminDataPanel
        title="Cache"
        now={now}
        rows={entries}
        columns={columns}
        defaultSort={{ key: 'lastAccessAt', dir: 'desc' }}
        getRowId={(row) => row.id}
        getFolderPath={(row) => parentFolder(row.sourcePath)}
        folderOptions={folders}
        showFolder
        showFileType={false}
        serverDriven
        serverTotal={total}
        onServerQueryChange={onServerQueryChange}
        pageSize={query.pageSize ?? 50}
        selectable
        entityLabel="cache files"
        clearBusy={clearBusy}
        onClearSelected={(ids) => runClear({ mode: 'ids', ids })}
        onClearFolder={(folder) => runClear({ mode: 'folder', folder })}
        onClearAll={() => runClear({ mode: 'all' })}
        chipFilter={{
          defaultValue: 'all',
          options: [
            { value: 'all', label: 'All' },
            { value: 'image', label: 'Images' },
            { value: 'video', label: 'Videos' },
          ],
          matches: () => true,
        }}
        searchPlaceholder="Search cached files…"
        emptyMessage={loading ? 'Loading cache entries…' : 'No cached media files yet.'}
        headerRight={
          <span className="admin-panel-note">
            Opens and last-opened update when a cached file is served
          </span>
        }
      />
    </>
  );
}
