import { useEffect, useMemo, useState } from 'react';
import { fetchRawText } from '../../api/client';
import { IconButton } from '../../ui';
import {
  PreviewSourceToggle,
  type PreviewMode,
} from '../PreviewSourceToggle';
import type { FileViewerProps } from '../types';
import { renderLatexPreview } from './renderLatex';

export function LatexFileViewer({ entry, onClose }: FileViewerProps) {
  const [text, setText] = useState<string | null>(null);
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
    setText(null);

    fetchRawText(entry.token)
      .then((content) => {
        if (!cancelled) setText(content);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load file');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [entry.token, entry.path]);

  const previewHtml = useMemo(
    () => (text != null && entry.token ? renderLatexPreview(text, entry.token) : ''),
    [text, entry.token],
  );

  return (
    <div className="file-viewer" role="dialog" aria-modal="true" aria-label={entry.name}>
      <div className="file-viewer-backdrop" onClick={onClose} />
      <div className="file-viewer-panel file-viewer-panel-doc">
        <header className="file-viewer-chrome">
          <div className="file-viewer-title">
            <span className="file-viewer-name">{entry.name}</span>
            {entry.format ? (
              <span className="file-viewer-format">{entry.format}</span>
            ) : null}
          </div>
          <div className="file-viewer-actions">
            <PreviewSourceToggle mode={mode} onChange={setMode} />
            <IconButton label="Close" className="file-viewer-close" onClick={onClose}>
              ✕
            </IconButton>
          </div>
        </header>
        <div className="file-viewer-body">
          {loading ? <p className="file-viewer-status">Loading…</p> : null}
          {error ? <p className="file-viewer-error">{error}</p> : null}
          {text !== null && mode === 'source' ? (
            <pre className="file-viewer-text">
              <code>{text}</code>
            </pre>
          ) : null}
          {text !== null && mode === 'preview' ? (
            <article
              className="doc-preview latex-preview"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
