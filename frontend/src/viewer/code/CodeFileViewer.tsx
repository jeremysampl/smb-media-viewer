import { useEffect, useState } from 'react';
import { fetchRawText } from '../../api/client';
import { CloseIcon, IconButton } from '../../ui';
import {
  PreviewSourceToggle,
  type PreviewMode,
} from '../PreviewSourceToggle';
import type { FileViewerProps } from '../types';
import { highlightCode } from './highlightCode';

export function CodeFileViewer({ entry, onClose }: FileViewerProps) {
  const [text, setText] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState('');
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
    setHighlighted('');

    void (async () => {
      try {
        const content = await fetchRawText(entry.token!);
        if (cancelled) return;
        setText(content);
        const html = await highlightCode(content, entry.name);
        if (!cancelled) setHighlighted(html);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load file');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [entry.token, entry.path, entry.name]);

  return (
    <div className="file-viewer" role="dialog" aria-modal="true" aria-label={entry.name}>
      <div className="file-viewer-backdrop" onClick={onClose} />
      <div className="file-viewer-panel file-viewer-panel-code">
        <header className="file-viewer-chrome">
          <div className="file-viewer-title">
            <span className="file-viewer-name">{entry.name}</span>
            {entry.format ? (
              <span className="file-viewer-format">{entry.format}</span>
            ) : null}
          </div>
          <div className="file-viewer-actions">
            <PreviewSourceToggle
              mode={mode}
              onChange={setMode}
              previewLabel="Highlighted"
              sourceLabel="Raw"
            />
            <IconButton label="Close" className="file-viewer-close" onClick={onClose}>
              <CloseIcon size={16} />
            </IconButton>
          </div>
        </header>
        <div className="file-viewer-body code-viewer-body">
          {loading ? <p className="file-viewer-status">Loading…</p> : null}
          {error ? <p className="file-viewer-error">{error}</p> : null}
          {text !== null && mode === 'source' ? (
            <pre className="file-viewer-text">
              <code>{text}</code>
            </pre>
          ) : null}
          {text !== null && mode === 'preview' ? (
            <div
              className="code-preview"
              dangerouslySetInnerHTML={{ __html: highlighted || `<pre><code></code></pre>` }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
