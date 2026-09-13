import { SelectField, type SelectFieldLayout } from '../ui';
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
  layout?: SelectFieldLayout;
}

export function FileTypeSelector({
  value,
  onChange,
  busy = false,
  layout = 'inline',
}: FileTypeSelectorProps) {
  return (
    <SelectField
      label="Type"
      value={value}
      busy={busy}
      layout={layout}
      wide
      onChange={(next) => {
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
    </SelectField>
  );
}
