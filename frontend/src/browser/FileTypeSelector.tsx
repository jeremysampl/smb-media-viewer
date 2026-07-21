import {
  FILE_TYPE_FILTER_GROUPS,
  FILE_TYPE_FILTER_TOP,
  isFileTypeFilter,
  type FileTypeFilter,
} from './fileTypeFilter';

interface FileTypeSelectorProps {
  value: FileTypeFilter;
  onChange: (value: FileTypeFilter) => void;
  busy?: boolean;
}

export function FileTypeSelector({ value, onChange, busy = false }: FileTypeSelectorProps) {
  return (
    <label className={`toolbar-control${busy ? ' is-busy' : ''}`}>
      <span className="toolbar-control-label">
        <span className={busy ? 'is-hidden' : undefined}>Type</span>
        <span
          className={`toolbar-control-spinner${busy ? ' is-visible' : ''}`}
          aria-hidden={!busy}
        />
      </span>
      <select
        className="toolbar-control-select toolbar-control-select-wide"
        value={value}
        aria-label="File type"
        aria-busy={busy}
        onChange={(event) => {
          const next = event.target.value;
          if (isFileTypeFilter(next)) onChange(next);
        }}
      >
        {FILE_TYPE_FILTER_TOP.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
        {FILE_TYPE_FILTER_GROUPS.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}
