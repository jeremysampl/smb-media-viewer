import { useState } from 'react';
import { SORT_OPTIONS, type SortMethod } from './sortEntries';

const STORAGE_KEY = 'smb-media-sort';

export function useSortPreference(): {
  sort: SortMethod;
  setSort: (sort: SortMethod) => void;
} {
  const [sort, setSortState] = useState<SortMethod>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return (stored as SortMethod) || 'date_desc';
  });

  function setSort(next: SortMethod) {
    setSortState(next);
    localStorage.setItem(STORAGE_KEY, next);
  }

  return { sort, setSort };
}

interface SortSelectorProps {
  sort: SortMethod;
  onChange: (sort: SortMethod) => void;
  busy?: boolean;
}

export function SortSelector({ sort, onChange, busy = false }: SortSelectorProps) {
  return (
    <label className={`toolbar-control${busy ? ' is-busy' : ''}`}>
      <span className="toolbar-control-label">
        <span className={busy ? 'is-hidden' : undefined}>Sort</span>
        <span
          className={`toolbar-control-spinner${busy ? ' is-visible' : ''}`}
          aria-hidden={!busy}
        />
      </span>
      <select
        className="toolbar-control-select"
        value={sort}
        aria-label="Sort"
        aria-busy={busy}
        onChange={(event) => onChange(event.target.value as SortMethod)}
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
