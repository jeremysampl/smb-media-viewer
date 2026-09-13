import { Button, SelectField } from '../../ui';

interface AdminPaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
}

export function AdminPagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [25, 50, 100],
}: AdminPaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to = Math.min(total, safePage * pageSize);

  return (
    <div className="admin-pagination">
      <p className="admin-table-count">
        {total === 0
          ? 'No rows'
          : `${from.toLocaleString()}–${to.toLocaleString()} of ${total.toLocaleString()}`}
      </p>
      <div className="admin-pagination-controls">
        {onPageSizeChange ? (
          <SelectField
            className="admin-page-size"
            label="Per page"
            value={String(pageSize)}
            layout="inline"
            onChange={(value) => onPageSizeChange(Number(value))}
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </SelectField>
        ) : null}
        <div className="admin-page-nav">
          <Button
            variant="secondary"
            size="sm"
            className="admin-page-btn"
            disabled={safePage <= 1}
            onClick={() => onPageChange(safePage - 1)}
          >
            Previous
          </Button>
          <span className="admin-page-indicator">
            Page {safePage} / {pageCount}
          </span>
          <Button
            variant="secondary"
            size="sm"
            className="admin-page-btn"
            disabled={safePage >= pageCount}
            onClick={() => onPageChange(safePage + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
