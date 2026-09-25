import { useState } from 'react';
import { SelectField, type SelectFieldLayout } from '../ui';
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
  layout?: SelectFieldLayout;
}

export function SortSelector({
  sort,
  onChange,
  busy = false,
  layout = 'inline',
}: SortSelectorProps) {
  return (
    <SelectField
      label="Sort"
      value={sort}
      busy={busy}
      layout={layout}
      onChange={(value) => onChange(value as SortMethod)}
    >
      {SORT_OPTIONS.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </SelectField>
  );
}
