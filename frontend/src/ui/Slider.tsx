import type { InputHTMLAttributes } from 'react';

export interface SliderProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> {
  label: string;
  value: number;
  valueLabel?: string;
  onChange: (value: number) => void;
  hideHeader?: boolean;
}

export function Slider({
  label,
  value,
  valueLabel = String(value),
  onChange,
  className = '',
  hideHeader = false,
  ...rest
}: SliderProps) {
  return (
    <label className={`ui-slider${hideHeader ? ' ui-slider--bare' : ''} ${className}`.trim()}>
      {!hideHeader ? (
        <span className="ui-slider__header">
          <span>{label}</span>
          <output>{valueLabel}</output>
        </span>
      ) : null}
      <input
        {...rest}
        type="range"
        value={value}
        aria-label={hideHeader ? (rest['aria-label'] ?? label) : rest['aria-label']}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
