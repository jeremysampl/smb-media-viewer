import { useState } from 'react';
import { mediaUrl } from '../../api/client';
import { formatSize } from '../../browser/formatters';
import { IconButton } from '../../ui';
import type { FileViewerProps } from '../types';

export function AudioFileViewer({ entry, onClose }: FileViewerProps) {
  const [error, setError] = useState('');
  const src = entry.token ? mediaUrl(entry.token, 'raw') : '';
  const sizeLabel = entry.size != null ? formatSize(entry.size) : null;

  return (
    <div className="file-viewer" role="dialog" aria-modal="true" aria-label={entry.name}>
      <div className="file-viewer-backdrop" onClick={onClose} />
      <div className="file-viewer-panel file-viewer-panel-audio">
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
        <div className="file-viewer-body audio-viewer-body">
          <div className="audio-viewer-art" aria-hidden>
            <svg viewBox="0 0 64 64" width="72" height="72">
              <path
                fill="currentColor"
                d="M28 18v22.4c0 2.6-2.4 4.6-5.2 4.6S18 43 18 40.4s2-4.4 4.8-4.4c.8 0 1.6.2 2.2.4V23.2l16-3.2v14.8c0 2.6-2.4 4.6-5.2 4.6s-4.8-2-4.8-4.6 2-4.4 4.8-4.4c.8 0 1.6.2 2.2.4V18l-10 1.8z"
              />
            </svg>
          </div>
          <div className="audio-viewer-meta">
            <p className="audio-viewer-title">{entry.name}</p>
            <p className="audio-viewer-sub">
              {[entry.format, sizeLabel].filter(Boolean).join(' · ') || 'Audio'}
            </p>
          </div>
          {error ? <p className="file-viewer-error">{error}</p> : null}
          {src ? (
            <audio
              className="audio-viewer-player"
              controls
              autoPlay
              preload="metadata"
              src={src}
              onError={() =>
                setError('Could not play this file. The format may be unsupported in this browser.')
              }
            />
          ) : (
            <p className="file-viewer-error">Missing file token</p>
          )}
        </div>
      </div>
    </div>
  );
}
