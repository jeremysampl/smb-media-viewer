import { Button } from '../../ui';

interface AdminBulkBarProps {
  selectedCount: number;
  folder: string;
  busy?: boolean;
  onClearSelected: () => void | Promise<unknown>;
  onClearFolder: () => void | Promise<unknown>;
  onClearAll: () => void | Promise<unknown>;
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
      <Button
        variant="secondary"
        size="sm"
        className="admin-bulk-btn"
        disabled={busy || selectedCount === 0}
        onClick={onClearSelected}
      >
        Clear selected ({selectedCount})
      </Button>
      <Button
        variant="secondary"
        size="sm"
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
      </Button>
      <Button
        variant="danger"
        size="sm"
        className="admin-bulk-btn"
        disabled={busy}
        onClick={onClearAll}
      >
        Clear all {entityLabel}
      </Button>
    </div>
  );
}
