import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  FILE_TYPE_FILTER_GROUPS,
  FILE_TYPE_FILTER_TOP,
  entryMatchesFileTypeFilter,
  isFileTypeFilter,
  type FileTypeFilter,
} from '../../browser/fileTypeFilter';
import type { BrowseEntry } from '../../types';

export type SortDir = 'asc' | 'desc';

export interface SortSpec<K extends string = string> {
  key: K;
  dir: SortDir;
}

export interface AdminFileTypeInfo {
  type: BrowseEntry['type'];
  format?: string;
}

export interface AdminColumnDef<T, K extends string = string> {
  id: K;
  label: string;
  /** Sort key. */
  sortValue?: (row: T) => string | number | null | undefined;
  /** Extra text for search. */
  searchText?: (row: T) => string | null | undefined;
  align?: 'left' | 'right';
  className?: string;
  hideBelow?: 'tablet';
  render: (row: T, ctx: { now: number }) => ReactNode;
}

export interface AdminChipOption<V extends string> {
  value: V;
  label: string;
}

function compareValues(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
  dir: SortDir,
): number {
  const emptyA = a === null || a === undefined || a === '';
  const emptyB = b === null || b === undefined || b === '';
  if (emptyA && emptyB) return 0;
  if (emptyA) return 1;
  if (emptyB) return -1;

  let result = 0;
  if (typeof a === 'number' && typeof b === 'number') {
    result = a - b;
  } else {
    result = String(a).localeCompare(String(b), undefined, {
      numeric: true,
      sensitivity: 'base',
    });
  }
  return dir === 'asc' ? result : -result;
}

export function useAdminTableState<T, K extends string>(options: {
  rows: T[];
  columns: Array<AdminColumnDef<T, K>>;
  defaultSort: SortSpec<K>;
  getRowId: (row: T) => string;
  getSearchText?: (row: T) => string;
  getFileType?: (row: T) => AdminFileTypeInfo;
  getFolderPath?: (row: T) => string | null | undefined;
  chipFilter?: {
    options: Array<AdminChipOption<string>>;
    matches: (row: T, value: string) => boolean;
    defaultValue?: string;
  };
  /** Page size. Use 0 to show all filtered rows. */
  pageSize?: number;
  /** Rows are already one page from the server. */
  serverDriven?: boolean;
  serverTotal?: number;
}) {
  const {
    rows,
    columns,
    defaultSort,
    getRowId,
    getSearchText,
    getFileType,
    getFolderPath,
    chipFilter,
    pageSize: initialPageSize = 50,
    serverDriven = false,
    serverTotal,
  } = options;

  const [search, setSearch] = useState('');
  const [folder, setFolder] = useState('');
  const [fileType, setFileType] = useState<FileTypeFilter>('any');
  const [sort, setSort] = useState<SortSpec<K>>(defaultSort);
  const [chip, setChip] = useState(chipFilter?.defaultValue ?? 'all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const sortOptions = useMemo(
    () =>
      columns
        .filter((column) => column.sortValue)
        .map((column) => ({
          key: column.id,
          label: column.label,
        })),
    [columns],
  );

  const folderOptions = useMemo(() => {
    if (!getFolderPath) return [] as string[];
    const folders = new Set<string>();
    for (const row of rows) {
      const value = getFolderPath(row)?.trim();
      if (value) folders.add(value.replace(/\\/g, '/').replace(/\/+$/, ''));
    }
    return [...folders].sort((a, b) => a.localeCompare(b)).slice(0, 200);
  }, [rows, getFolderPath]);

  const filteredSorted = useMemo(() => {
    if (serverDriven) return rows;

    const query = search.trim().toLowerCase();
    const folderPrefix = folder.trim().replace(/\\/g, '/').replace(/\/+$/, '');
    let next = rows;

    if (chipFilter && chip !== 'all') {
      next = next.filter((row) => chipFilter.matches(row, chip));
    }

    if (getFileType && fileType !== 'any') {
      next = next.filter((row) => {
        const info = getFileType(row);
        return entryMatchesFileTypeFilter(
          {
            name: '',
            path: '',
            type: info.type,
            format: info.format,
          },
          fileType,
        );
      });
    }

    if (folderPrefix && getFolderPath) {
      next = next.filter((row) => {
        const path = (getFolderPath(row) ?? '').replace(/\\/g, '/');
        return path === folderPrefix || path.startsWith(`${folderPrefix}/`);
      });
    }

    if (query) {
      next = next.filter((row) => {
        const parts = [
          getSearchText?.(row) ?? '',
          ...columns.map((column) => column.searchText?.(row) ?? ''),
        ];
        return parts.join(' ').toLowerCase().includes(query);
      });
    }

    const column = columns.find((entry) => entry.id === sort.key);
    if (!column?.sortValue) return next;

    return [...next].sort((a, b) =>
      compareValues(column.sortValue!(a), column.sortValue!(b), sort.dir),
    );
  }, [
    rows,
    columns,
    search,
    folder,
    fileType,
    sort,
    chip,
    chipFilter,
    getSearchText,
    getFileType,
    getFolderPath,
    serverDriven,
  ]);

  const filteredTotal = serverDriven
    ? (serverTotal ?? rows.length)
    : filteredSorted.length;

  const pageCount = Math.max(
    1,
    pageSize > 0 ? Math.ceil(filteredTotal / pageSize) : 1,
  );

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount));
  }, [pageCount]);

  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [search, folder, fileType, chip, sort.key, sort.dir, pageSize]);

  const pageRows = useMemo(() => {
    if (serverDriven || pageSize <= 0) return filteredSorted;
    const start = (page - 1) * pageSize;
    return filteredSorted.slice(start, start + pageSize);
  }, [filteredSorted, page, pageSize, serverDriven]);

  function setFileTypeSafe(value: string) {
    if (isFileTypeFilter(value)) setFileType(value);
  }

  function setSortKey(key: K) {
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: defaultSort.key === key ? defaultSort.dir : 'desc' },
    );
  }

  function toggleRow(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePage(selectAll: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      for (const row of pageRows) {
        const id = getRowId(row);
        if (selectAll) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  const pageSelectedCount = pageRows.filter((row) =>
    selected.has(getRowId(row)),
  ).length;

  return {
    search,
    setSearch,
    folder,
    setFolder,
    folderOptions,
    fileType,
    setFileType: setFileTypeSafe,
    sort,
    setSort,
    setSortKey,
    sortOptions,
    chip,
    setChip,
    chipOptions: chipFilter?.options ?? [],
    page,
    setPage,
    pageSize,
    setPageSize,
    pageCount,
    rows: pageRows,
    filteredRows: filteredSorted,
    total: filteredTotal,
    shown: pageRows.length,
    selected,
    selectedIds: [...selected],
    selectedCount: selected.size,
    pageSelectedCount,
    allPageSelected:
      pageRows.length > 0 && pageSelectedCount === pageRows.length,
    toggleRow,
    togglePage,
    clearSelection,
  };
}

export const ADMIN_MEDIA_FILE_TYPE_TOP = FILE_TYPE_FILTER_TOP.filter(
  (option) => option.id === 'any' || option.id === 'media',
);

export const ADMIN_MEDIA_FILE_TYPE_GROUPS = FILE_TYPE_FILTER_GROUPS.filter(
  (group) => group.label === 'Images' || group.label === 'Videos',
);
