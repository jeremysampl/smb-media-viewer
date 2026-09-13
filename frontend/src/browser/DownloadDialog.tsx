import { useEffect, useId, useState } from 'react';
import type { QualityProfile, QualityTier } from '../types';
import { Button, SelectField } from '../ui';

interface DownloadDialogProps {
  open: boolean;
  defaultZipName: string;
  selectedCount: number;
  quality: QualityTier;
  profiles: QualityProfile[];
  busy: boolean;
  error: string;
  onClose: () => void;
  onConfirm: (zipName: string, quality: QualityTier) => void;
}

export function DownloadDialog({
  open,
  defaultZipName,
  selectedCount,
  quality,
  profiles,
  busy,
  error,
  onClose,
  onConfirm,
}: DownloadDialogProps) {
  const titleId = useId();
  const [zipName, setZipName] = useState(defaultZipName);
  const [downloadQuality, setDownloadQuality] = useState<QualityTier>(quality);

  useEffect(() => {
    if (!open) return;
    setZipName(defaultZipName);
    setDownloadQuality(quality);
  }, [open, defaultZipName, quality]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId}>Download selected</h2>
        <p className="subtitle">
          {selectedCount} item{selectedCount === 1 ? '' : 's'} will be packed into a zip.
          Image/video quality applies only to media; other files stay original.
        </p>

        <label>
          Zip name
          <input
            value={zipName}
            onChange={(event) => setZipName(event.target.value)}
            disabled={busy}
            autoFocus
          />
        </label>

        <SelectField
          label="Media quality"
          value={downloadQuality}
          layout="stack"
          disabled={busy}
          onChange={(value) => setDownloadQuality(value as QualityTier)}
        >
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.label}
              {profile.id === 'full' ? ' (originals)' : ''}
            </option>
          ))}
        </SelectField>

        {error ? <p className="error">{error}</p> : null}

        <div className="modal-actions">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            disabled={busy || !zipName.trim()}
            onClick={() => onConfirm(zipName.trim(), downloadQuality)}
          >
            {busy ? 'Preparing…' : 'Download zip'}
          </Button>
        </div>
      </div>
    </div>
  );
}
