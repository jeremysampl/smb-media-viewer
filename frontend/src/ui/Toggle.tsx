import type { InputHTMLAttributes } from 'react';

export interface ToggleProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hideLabel?: boolean;
}

export function Toggle({ label, checked, onChange, hideLabel = false, ...rest }: ToggleProps) {
  return (
    <label className="slider-toggle">
      {!hideLabel ? <span className="slider-toggle-label">{label}</span> : null}
      <input
        {...rest}
        type="checkbox"
        className="slider-toggle-input"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        aria-label={hideLabel ? label : rest['aria-label']}
      />
      <span className="slider-toggle-track" aria-hidden>
        <span className="slider-toggle-thumb" />
      </span>
    </label>
  );
}
