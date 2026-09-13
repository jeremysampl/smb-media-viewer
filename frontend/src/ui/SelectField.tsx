import {
  useId,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';

export type SelectFieldLayout = 'stack' | 'inline' | 'ghost';

export type SelectFieldProps = Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  'onChange' | 'size'
> & {
  label: string;
  onChange: (value: string) => void;
  busy?: boolean;
  layout?: SelectFieldLayout;
  wide?: boolean;
  children: ReactNode;
};

export function SelectField({
  label,
  value,
  onChange,
  busy = false,
  layout = 'stack',
  wide = false,
  className = '',
  id,
  disabled,
  children,
  'aria-label': ariaLabel,
  ...rest
}: SelectFieldProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const classes = [
    'select-field',
    `select-field--${layout}`,
    wide ? 'select-field--wide' : '',
    busy ? 'is-busy' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <label className={classes} htmlFor={selectId}>
      <span className="select-field__label">
        <span className={busy ? 'is-hidden' : undefined}>{label}</span>
        <span
          className={`select-field__spinner${busy ? ' is-visible' : ''}`}
          aria-hidden={!busy}
        />
      </span>
      <select
        {...rest}
        id={selectId}
        className="select-field__control"
        value={value}
        disabled={disabled}
        aria-label={ariaLabel ?? label}
        aria-busy={busy || undefined}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </label>
  );
}
