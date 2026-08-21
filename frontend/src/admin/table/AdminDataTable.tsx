import { Fragment, type ReactNode } from 'react';
import type { AdminColumnDef } from './useAdminTableState';

interface AdminDataTableProps<T, K extends string> {
  rows: T[];
  columns: Array<AdminColumnDef<T, K>>;
  now?: number;
  getRowId: (row: T) => string;
  emptyMessage?: string;
  rowClassName?: (row: T) => string | undefined;
  afterRow?: (row: T) => ReactNode;
  selectable?: boolean;
  selectedIds?: Set<string>;
  allPageSelected?: boolean;
  onToggleRow?: (id: string) => void;
  onTogglePage?: (selectAll: boolean) => void;
}

export function AdminDataTable<T, K extends string>({
  rows,
  columns,
  now = Date.now(),
  getRowId,
  emptyMessage = 'No rows to show.',
  rowClassName,
  afterRow,
  selectable = false,
  selectedIds,
  allPageSelected = false,
  onToggleRow,
  onTogglePage,
}: AdminDataTableProps<T, K>) {
  if (rows.length === 0) {
    return <p className="admin-empty">{emptyMessage}</p>;
  }

  return (
    <div className="admin-data-table-wrap">
      <table className="admin-data-table">
        <thead>
          <tr>
            {selectable ? (
              <th className="admin-select-col">
                <input
                  type="checkbox"
                  checked={allPageSelected}
                  aria-label="Select all on this page"
                  onChange={(event) => onTogglePage?.(event.target.checked)}
                />
              </th>
            ) : null}
            {columns.map((column) => (
              <th
                key={column.id}
                className={[
                  column.align === 'right' ? 'is-right' : undefined,
                  column.hideBelow === 'tablet' ? 'hide-below-tablet' : undefined,
                  column.className,
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const id = getRowId(row);
            const selected = selectedIds?.has(id) ?? false;
            return (
              <Fragment key={id}>
                <tr className={rowClassName?.(row)}>
                  {selectable ? (
                    <td className="admin-select-col">
                      <input
                        type="checkbox"
                        checked={selected}
                        aria-label={`Select ${id}`}
                        onChange={() => onToggleRow?.(id)}
                      />
                    </td>
                  ) : null}
                  {columns.map((column) => (
                    <td
                      key={column.id}
                      className={[
                        column.align === 'right' ? 'is-right' : undefined,
                        column.hideBelow === 'tablet'
                          ? 'hide-below-tablet'
                          : undefined,
                        column.className,
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      {column.render(row, { now })}
                    </td>
                  ))}
                </tr>
                {afterRow?.(row)}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
