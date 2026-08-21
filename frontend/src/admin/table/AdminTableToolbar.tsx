import type { FileTypeFilter } from '../../browser/fileTypeFilter';
import {
  ADMIN_MEDIA_FILE_TYPE_GROUPS,
  ADMIN_MEDIA_FILE_TYPE_TOP,
  type AdminChipOption,
  type SortDir,
  type SortSpec,
} from './useAdminTableState';

interface AdminTableToolbarProps<K extends string> {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  folder?: string;
  onFolderChange?: (value: string) => void;
  folderOptions?: string[];
  showFolder?: boolean;
  fileType?: FileTypeFilter;
  onFileTypeChange?: (value: string) => void;
  showFileType?: boolean;
  sort: SortSpec<K>;
  sortOptions: Array<{ key: K; label: string }>;
  onSortKeyChange: (key: K) => void;
  onSortDirChange: (dir: SortDir) => void;
  chip?: string;
  chipOptions?: Array<AdminChipOption<string>>;
  onChipChange?: (value: string) => void;
}

export function AdminTableToolbar<K extends string>({
  search,
  onSearchChange,
  searchPlaceholder = 'Search…',
  folder = '',
  onFolderChange,
  folderOptions = [],
  showFolder = false,
  fileType = 'any',
  onFileTypeChange,
  showFileType = false,
  sort,
  sortOptions,
  onSortKeyChange,
  onSortDirChange,
  chip,
  chipOptions = [],
  onChipChange,
}: AdminTableToolbarProps<K>) {
  const folderListId = 'admin-folder-suggestions';

  return (
    <div className="admin-table-toolbar">
      {chipOptions.length > 0 && onChipChange ? (
        <div className="admin-filter-row" role="group" aria-label="Quick filters">
          {chipOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`admin-chip${chip === option.value ? ' active' : ''}`}
              aria-pressed={chip === option.value}
              onClick={() => onChipChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="admin-table-controls">
        <label className="admin-table-control">
          <span className="admin-table-control-label">Search</span>
          <input
            type="search"
            value={search}
            placeholder={searchPlaceholder}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </label>

        {showFolder && onFolderChange ? (
          <label className="admin-table-control admin-table-control-wide">
            <span className="admin-table-control-label">Folder</span>
            <input
              type="text"
              list={folderOptions.length > 0 ? folderListId : undefined}
              value={folder}
              placeholder="Filter by folder path…"
              onChange={(event) => onFolderChange(event.target.value)}
            />
            {folderOptions.length > 0 ? (
              <datalist id={folderListId}>
                {folderOptions.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            ) : null}
          </label>
        ) : null}

        {showFileType && onFileTypeChange ? (
          <label className="admin-table-control">
            <span className="admin-table-control-label">Type</span>
            <select
              value={fileType}
              aria-label="File type"
              onChange={(event) => onFileTypeChange(event.target.value)}
            >
              {ADMIN_MEDIA_FILE_TYPE_TOP.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
              {ADMIN_MEDIA_FILE_TYPE_GROUPS.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.options.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        ) : null}

        <label className="admin-table-control">
          <span className="admin-table-control-label">Sort</span>
          <select
            value={sort.key}
            aria-label="Sort by"
            onChange={(event) => onSortKeyChange(event.target.value as K)}
          >
            {sortOptions.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="admin-table-control admin-table-control-narrow">
          <span className="admin-table-control-label">Order</span>
          <select
            value={sort.dir}
            aria-label="Sort order"
            onChange={(event) => onSortDirChange(event.target.value as SortDir)}
          >
            <option value="desc">Newest / high first</option>
            <option value="asc">Oldest / low first</option>
          </select>
        </label>
      </div>
    </div>
  );
}
