import { useEffect, type ReactNode } from 'react';
import { AdminBulkBar } from './AdminBulkBar';
import { AdminDataTable } from './AdminDataTable';
import { AdminPagination } from './AdminPagination';
import { AdminTableToolbar } from './AdminTableToolbar';
import {
  useAdminTableState,
  type AdminChipOption,
  type AdminColumnDef,
  type AdminFileTypeInfo,
  type SortSpec,
} from './useAdminTableState';

export interface AdminServerQuery<K extends string> {
  search: string;
  folder: string;
  fileType: string;
  chip: string;
  sort: SortSpec<K>;
  page: number;
  pageSize: number;
}

interface AdminDataPanelProps<T, K extends string> {
  title: string;
  headerRight?: ReactNode;
  rows: T[];
  columns: Array<AdminColumnDef<T, K>>;
  defaultSort: SortSpec<K>;
  getRowId: (row: T) => string;
  getSearchText?: (row: T) => string;
  getFileType?: (row: T) => AdminFileTypeInfo;
  getFolderPath?: (row: T) => string | null | undefined;
  showFileType?: boolean;
  showFolder?: boolean;
  folderOptions?: string[];
  searchPlaceholder?: string;
  chipFilter?: {
    options: Array<AdminChipOption<string>>;
    matches: (row: T, value: string) => boolean;
    defaultValue?: string;
  };
  emptyMessage?: string;
  rowClassName?: (row: T) => string | undefined;
  afterRow?: (row: T) => ReactNode;
  now?: number;
  pageSize?: number;
  serverDriven?: boolean;
  serverTotal?: number;
  onServerQueryChange?: (query: AdminServerQuery<K>) => void;
  selectable?: boolean;
  entityLabel?: string;
  clearBusy?: boolean;
  onClearSelected?: (ids: string[]) => void | Promise<unknown>;
  onClearFolder?: (folder: string) => void | Promise<unknown>;
  onClearAll?: () => void | Promise<unknown>;
}

export function AdminDataPanel<T, K extends string>({
  title,
  headerRight,
  rows,
  columns,
  defaultSort,
  getRowId,
  getSearchText,
  getFileType,
  getFolderPath,
  showFileType = Boolean(getFileType),
  showFolder = Boolean(getFolderPath),
  folderOptions: folderOptionsProp,
  searchPlaceholder,
  chipFilter,
  emptyMessage,
  rowClassName,
  afterRow,
  now = Date.now(),
  pageSize = 50,
  serverDriven = false,
  serverTotal,
  onServerQueryChange,
  selectable = false,
  entityLabel = 'items',
  clearBusy = false,
  onClearSelected,
  onClearFolder,
  onClearAll,
}: AdminDataPanelProps<T, K>) {
  const table = useAdminTableState({
    rows,
    columns,
    defaultSort,
    getRowId,
    getSearchText,
    getFileType,
    getFolderPath,
    chipFilter,
    pageSize,
    serverDriven,
    serverTotal,
  });

  const folderOptions = folderOptionsProp ?? table.folderOptions;
  const showClear =
    selectable && (onClearSelected || onClearFolder || onClearAll);

  useEffect(() => {
    if (!onServerQueryChange) return;
    onServerQueryChange({
      search: table.search,
      folder: table.folder,
      fileType: table.fileType,
      chip: table.chip,
      sort: table.sort,
      page: table.page,
      pageSize: table.pageSize,
    });
  }, [
    onServerQueryChange,
    table.search,
    table.folder,
    table.fileType,
    table.chip,
    table.sort,
    table.page,
    table.pageSize,
  ]);

  return (
    <section className="admin-card admin-card-wide">
      <div className="admin-card-header">
        <h2>{title}</h2>
        {headerRight}
      </div>

      <AdminTableToolbar
        search={table.search}
        onSearchChange={table.setSearch}
        searchPlaceholder={searchPlaceholder}
        folder={table.folder}
        onFolderChange={table.setFolder}
        folderOptions={folderOptions}
        showFolder={showFolder}
        fileType={table.fileType}
        onFileTypeChange={table.setFileType}
        showFileType={showFileType}
        sort={table.sort}
        sortOptions={table.sortOptions}
        onSortKeyChange={table.setSortKey}
        onSortDirChange={(dir) => table.setSort({ ...table.sort, dir })}
        chip={table.chip}
        chipOptions={table.chipOptions}
        onChipChange={table.setChip}
      />

      {showClear ? (
        <AdminBulkBar
          selectedCount={table.selectedCount}
          folder={table.folder}
          busy={clearBusy}
          entityLabel={entityLabel}
          onClearSelected={() => {
            if (!onClearSelected || table.selectedCount === 0) return;
            if (
              !window.confirm(
                `Clear ${table.selectedCount} selected ${entityLabel}?`,
              )
            ) {
              return;
            }
            void Promise.resolve(onClearSelected(table.selectedIds)).then(() =>
              table.clearSelection(),
            );
          }}
          onClearFolder={() => {
            const folder = table.folder.trim();
            if (!onClearFolder || !folder) return;
            if (
              !window.confirm(
                `Clear all ${entityLabel} under:\n${folder}`,
              )
            ) {
              return;
            }
            void Promise.resolve(onClearFolder(folder)).then(() =>
              table.clearSelection(),
            );
          }}
          onClearAll={() => {
            if (!onClearAll) return;
            if (
              !window.confirm(
                `Clear ALL ${entityLabel}? This cannot be undone.`,
              )
            ) {
              return;
            }
            void Promise.resolve(onClearAll()).then(() => table.clearSelection());
          }}
        />
      ) : null}

      <AdminDataTable
        rows={table.rows}
        columns={columns}
        now={now}
        getRowId={getRowId}
        emptyMessage={emptyMessage}
        rowClassName={rowClassName}
        afterRow={afterRow}
        selectable={selectable}
        selectedIds={table.selected}
        allPageSelected={table.allPageSelected}
        onToggleRow={table.toggleRow}
        onTogglePage={table.togglePage}
      />

      <AdminPagination
        page={table.page}
        pageSize={table.pageSize}
        total={table.total}
        onPageChange={table.setPage}
        onPageSizeChange={table.setPageSize}
      />
    </section>
  );
}
