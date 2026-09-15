import { useState } from 'react';
import { getIsMobileUi } from '../hooks/useIsMobile';
import { Toggle, type SelectFieldLayout } from '../ui';

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
  layout?: Exclude<SelectFieldLayout, 'ghost'>;
}

export function GridDetailsToggle({
  enabled,
  onChange,
  layout = 'inline',
}: GridDetailsToggleProps) {
  return (
    <label className={`select-field select-field--${layout} details-toggle`}>
      <span className="select-field__label">Details</span>
      <Toggle
        label="Show file details in grid"
        hideLabel
        checked={enabled}
        onChange={onChange}
      />
    </label>
  );
}
