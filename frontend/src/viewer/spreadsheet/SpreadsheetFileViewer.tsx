import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { fetchRawBlob, fetchRawText } from '../../api/client';
import { IconButton } from '../../ui';
import {
  PreviewSourceToggle,
  type PreviewMode,
} from '../PreviewSourceToggle';
import type { FileViewerProps } from '../types';

function isDelimitedText(format?: string): boolean {
  const upper = (format ?? '').toUpperCase();
  return upper === 'CSV' || upper === 'TSV';
}

export function SpreadsheetFileViewer({ entry, onClose }: FileViewerProps) {
  const showSourceToggle = isDelimitedText(entry.format);
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [rawText, setRawText] = useState<string | null>(null);
  const [activeSheet, setActiveSheet] = useState('');
  const [mode, setMode] = useState<PreviewMode>('preview');
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
    setRawText(null);
    setActiveSheet('');
    setMode('preview');

    void (async () => {
      try {
        if (showSourceToggle) {
          const text = await fetchRawText(entry.token!);
          if (cancelled) return;
          setRawText(text);
          const book = XLSX.read(text, {
            type: 'string',
            raw: false,
            FS: entry.format?.toUpperCase() === 'TSV' ? '\t' : ',',
          });
          setWorkbook(book);
          setActiveSheet(book.SheetNames[0] ?? '');
        } else {
          const blob = await fetchRawBlob(entry.token!);
          if (cancelled) return;
          const buffer = await blob.arrayBuffer();
          const book = XLSX.read(buffer, { type: 'array', cellDates: true });
          if (cancelled) return;
          setWorkbook(book);
          setActiveSheet(book.SheetNames[0] ?? '');
        }
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
  }, [entry.token, entry.path, entry.format, showSourceToggle]);

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
          <div className="file-viewer-actions">
            {showSourceToggle ? (
              <PreviewSourceToggle
                mode={mode}
                onChange={setMode}
                previewLabel="Table"
                sourceLabel="Raw"
              />
            ) : null}
            <IconButton label="Close" className="file-viewer-close" onClick={onClose}>
              ✕
            </IconButton>
          </div>
        </header>
        {mode === 'preview' && sheetNames.length > 1 ? (
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
          {!loading && !error && mode === 'source' && rawText !== null ? (
            <pre className="file-viewer-text">
              <code>{rawText}</code>
            </pre>
          ) : null}
          {!loading && !error && mode === 'preview' && sheetHtml ? (
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
