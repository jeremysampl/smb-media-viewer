type PreviewMode = 'preview' | 'source';

interface PreviewSourceToggleProps {
  mode: PreviewMode;
  onChange: (mode: PreviewMode) => void;
  previewLabel?: string;
  sourceLabel?: string;
}

export function PreviewSourceToggle({
  mode,
  onChange,
  previewLabel = 'Preview',
  sourceLabel = 'Source',
}: PreviewSourceToggleProps) {
  return (
    <div className="viewer-mode-toggle" role="tablist" aria-label="View mode">
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'preview'}
        className={`viewer-mode-btn${mode === 'preview' ? ' active' : ''}`}
        onClick={() => onChange('preview')}
      >
        {previewLabel}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'source'}
        className={`viewer-mode-btn${mode === 'source' ? ' active' : ''}`}
        onClick={() => onChange('source')}
      >
        {sourceLabel}
      </button>
    </div>
  );
}

export type { PreviewMode };
