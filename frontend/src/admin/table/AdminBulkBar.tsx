interface AdminBulkBarProps {
  selectedCount: number;
  folder: string;
  busy?: boolean;
  onClearSelected: () => void;
  onClearFolder: () => void;
  onClearAll: () => void;
  entityLabel: string;
}

export function AdminBulkBar({
  selectedCount,
  folder,
  busy = false,
  onClearSelected,
  onClearFolder,
  onClearAll,
  entityLabel,
}: AdminBulkBarProps) {
  const folderReady = folder.trim().length > 0;

  return (
    <div className="admin-bulk-bar" role="group" aria-label={`${entityLabel} clear actions`}>
      <button
        type="button"
        className="admin-bulk-btn"
        disabled={busy || selectedCount === 0}
        onClick={onClearSelected}
      >
        Clear selected ({selectedCount})
      </button>
      <button
        type="button"
        className="admin-bulk-btn"
        disabled={busy || !folderReady}
        title={
          folderReady
            ? `Clear ${entityLabel} under ${folder.trim()}`
            : 'Set a folder filter first'
        }
        onClick={onClearFolder}
      >
        Clear folder filter
      </button>
      <button
        type="button"
        className="admin-bulk-btn danger"
        disabled={busy}
        onClick={onClearAll}
      >
        Clear all {entityLabel}
      </button>
    </div>
  );
}
