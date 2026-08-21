import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  clearAdminIndex,
  getAdminIndexEntries,
  type AdminIndexEntry,
  type AdminListQuery,
} from '../api/client';
import { JobFileDetails } from './JobFileDetails';
import { formatBytes, formatDuration, formatRelativeTime } from './format';
import {
  AdminDataPanel,
  type AdminServerQuery,
} from './table/AdminDataPanel';
import type { AdminColumnDef } from './table/useAdminTableState';

interface IndexPanelProps {
  active: boolean;
  now: number;
  indexedTotal?: number;
}

function parentFolder(path: string): string | null {
  const normalized = path.replace(/\\/g, '/');
  const idx = normalized.lastIndexOf('/');
  if (idx <= 0) return null;
  return normalized.slice(0, idx);
}

export function IndexPanel({ active, now, indexedTotal }: IndexPanelProps) {
  const [entries, setEntries] = useState<AdminIndexEntry[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [clearBusy, setClearBusy] = useState(false);
  const [query, setQuery] = useState<AdminListQuery>({
    page: 1,
    pageSize: 50,
    sort: 'indexedAt',
    order: 'desc',
    kind: 'all',
  });
  const debounceRef = useRef<number | undefined>(undefined);
  const requestId = useRef(0);

  const load = useCallback(async (nextQuery: AdminListQuery) => {
    const id = ++requestId.current;
    try {
      setLoading(true);
      const result = await getAdminIndexEntries(nextQuery);
      if (id !== requestId.current) return;
      setEntries(result.entries);
      setFolders(result.folders);
      setTotal(result.total);
      setError(null);
    } catch (err) {
      if (id !== requestId.current) return;
      setError(err instanceof Error ? err.message : 'Failed to load index entries');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return undefined;
    void load(query);
    const timer = window.setInterval(() => {
      void load(query);
    }, 20_000);
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

  async function runClear(body: {
    mode: 'all' | 'ids' | 'folder';
    ids?: string[];
    folder?: string;
  }) {
    setClearBusy(true);
    try {
      await clearAdminIndex(body);
      setError(null);
      await load(query);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear index');
    } finally {
      setClearBusy(false);
    }
  }

  const columns = useMemo<AdminColumnDef<AdminIndexEntry, string>[]>(
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
        searchText: (row) => `${row.label} ${row.path}`,
        render: (row) => (
          <JobFileDetails
            label={row.label}
            path={row.path}
            size={row.size}
            formatBytes={formatBytes}
          />
        ),
      },
      {
        id: 'size',
        label: 'Size',
        align: 'right',
        sortValue: (row) => row.size,
        render: (row) => formatBytes(row.size),
      },
      {
        id: 'duration',
        label: 'Duration',
        align: 'right',
        sortValue: (row) => row.duration ?? -1,
        hideBelow: 'tablet',
        render: (row) =>
          row.duration !== null && row.duration !== undefined
            ? formatDuration(row.duration)
            : '—',
      },
      {
        id: 'thumb',
        label: 'Thumb',
        sortValue: (row) => (row.hasThumb ? 1 : 0),
        hideBelow: 'tablet',
        render: (row) => (row.hasThumb ? 'yes' : 'no'),
      },
      {
        id: 'indexedAt',
        label: 'Indexed',
        align: 'right',
        sortValue: (row) => row.indexedAt,
        render: (row, ctx) => formatRelativeTime(row.indexedAt, ctx.now),
      },
    ],
    [],
  );

  return (
    <>
      {error ? <p className="error">{error}</p> : null}
      <AdminDataPanel
        title="Index"
        now={now}
        rows={entries}
        columns={columns}
        defaultSort={{ key: 'indexedAt', dir: 'desc' }}
        getRowId={(row) => row.id}
        getFolderPath={(row) => parentFolder(row.path)}
        folderOptions={folders}
        showFolder
        showFileType={false}
        serverDriven
        serverTotal={total}
        onServerQueryChange={onServerQueryChange}
        pageSize={query.pageSize ?? 50}
        selectable
        entityLabel="indexed files"
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
        searchPlaceholder="Search indexed files…"
        emptyMessage={loading ? 'Loading index…' : 'No indexed files yet.'}
        headerRight={
          <span className="admin-panel-note">
            {total.toLocaleString()} match
            {indexedTotal !== undefined
              ? ` · ${indexedTotal.toLocaleString()} total in DB`
              : ''}
          </span>
        }
      />
    </>
  );
}
