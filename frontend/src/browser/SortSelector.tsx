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
}

export function SortSelector({ sort, onChange }: SortSelectorProps) {
  return (
    <label className="toolbar-control">
      <span className="toolbar-control-label">Sort</span>
      <select
        className="toolbar-control-select"
        value={sort}
        onChange={(event) => onChange(event.target.value as SortMethod)}
        aria-label="Sort"
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
