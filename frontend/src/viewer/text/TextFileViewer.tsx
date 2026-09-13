import { useEffect, useState } from 'react';
import { fetchRawText } from '../../api/client';
import { CloseIcon, IconButton } from '../../ui';
import type { FileViewerProps } from '../types';

export function TextFileViewer({ entry, onClose }: FileViewerProps) {
  const [text, setText] = useState<string | null>(null);
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

  return (
    <div className="file-viewer" role="dialog" aria-modal="true" aria-label={entry.name}>
      <div className="file-viewer-backdrop" onClick={onClose} />
      <div className="file-viewer-panel">
        <header className="file-viewer-chrome">
          <div className="file-viewer-title">
            <span className="file-viewer-name">{entry.name}</span>
            {entry.format ? (
              <span className="file-viewer-format">{entry.format}</span>
            ) : null}
          </div>
          <IconButton
            label="Close"
            className="file-viewer-close"
            onClick={onClose}
          >
              <CloseIcon size={16} />
            </IconButton>
        </header>
        <div className="file-viewer-body">
          {loading ? <p className="file-viewer-status">Loading…</p> : null}
          {error ? <p className="file-viewer-error">{error}</p> : null}
          {text !== null ? (
            <pre className="file-viewer-text">
              <code>{text}</code>
            </pre>
          ) : null}
        </div>
      </div>
    </div>
  );
}
