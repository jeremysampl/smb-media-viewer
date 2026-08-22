import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { fetchRawBlob } from '../../api/client';
import { IconButton } from '../../ui';
import type { FileViewerProps } from '../types';

export function SpreadsheetFileViewer({ entry, onClose }: FileViewerProps) {
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [activeSheet, setActiveSheet] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!entry.token) {
      setError('Missing file token');
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError('');
    setWorkbook(null);
    setActiveSheet('');

    void (async () => {
      try {
        const blob = await fetchRawBlob(entry.token!);
        if (cancelled) return;
        const buffer = await blob.arrayBuffer();
        const book = XLSX.read(buffer, { type: 'array', cellDates: true });
        if (cancelled) return;
        setWorkbook(book);
        setActiveSheet(book.SheetNames[0] ?? '');
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load spreadsheet');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [entry.token, entry.path]);

  const sheetHtml = useMemo(() => {
    if (!workbook || !activeSheet) return '';
    const sheet = workbook.Sheets[activeSheet];
    if (!sheet) return '';
    return XLSX.utils.sheet_to_html(sheet, { id: 'spreadsheet-table', editable: false });
  }, [workbook, activeSheet]);

  const sheetNames = workbook?.SheetNames ?? [];

  return (
    <div className="file-viewer" role="dialog" aria-modal="true" aria-label={entry.name}>
      <div className="file-viewer-backdrop" onClick={onClose} />
      <div className="file-viewer-panel file-viewer-panel-spreadsheet">
        <header className="file-viewer-chrome">
          <div className="file-viewer-title">
            <span className="file-viewer-name">{entry.name}</span>
            {entry.format ? (
              <span className="file-viewer-format">{entry.format}</span>
            ) : null}
          </div>
          <IconButton label="Close" className="file-viewer-close" onClick={onClose}>
            ✕
          </IconButton>
        </header>
        {sheetNames.length > 1 ? (
          <div className="spreadsheet-tabs" role="tablist" aria-label="Sheets">
            {sheetNames.map((name) => (
              <button
                key={name}
                type="button"
                role="tab"
                aria-selected={name === activeSheet}
                className={`spreadsheet-tab${name === activeSheet ? ' active' : ''}`}
                onClick={() => setActiveSheet(name)}
              >
                {name}
              </button>
            ))}
          </div>
        ) : null}
        <div className="file-viewer-body spreadsheet-viewer-body">
          {loading ? <p className="file-viewer-status">Loading spreadsheet…</p> : null}
          {error ? <p className="file-viewer-error">{error}</p> : null}
          {!loading && !error && sheetHtml ? (
            <div
              className="spreadsheet-table-wrap"
              dangerouslySetInnerHTML={{ __html: sheetHtml }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
