import { useState } from 'react';
import { getIsMobileUi } from '../hooks/useIsMobile';

const STORAGE_KEY = 'smb-grid-show-details';

function getDefaultShowDetails(): boolean {
  if (typeof window === 'undefined') return true;
  return !getIsMobileUi();
}

export function useGridDetailsPreference(): {
  showGridDetails: boolean;
  setShowGridDetails: (value: boolean) => void;
} {
  const [showGridDetails, setShowGridDetailsState] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) return stored === 'true';
    return getDefaultShowDetails();
  });

  function setShowGridDetails(value: boolean) {
    setShowGridDetailsState(value);
    localStorage.setItem(STORAGE_KEY, String(value));
  }

  return { showGridDetails, setShowGridDetails };
}

interface GridDetailsToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

export function GridDetailsToggle({ enabled, onChange }: GridDetailsToggleProps) {
  return (
    <label className="toolbar-control toolbar-toggle">
      <span className="toolbar-control-label">Details</span>
      <span className="slider-toggle">
        <input
          type="checkbox"
          className="slider-toggle-input"
          checked={enabled}
          onChange={(event) => onChange(event.target.checked)}
          aria-label="Show file details in grid"
        />
        <span className="slider-toggle-track" aria-hidden>
          <span className="slider-toggle-thumb" />
        </span>
      </span>
    </label>
  );
}
