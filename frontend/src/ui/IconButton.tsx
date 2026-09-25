import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  size?: 'sm' | 'lg';
  children: ReactNode;
};

export function IconButton({
  label,
  size = 'sm',
  className = '',
  type = 'button',
  children,
  ...rest
}: IconButtonProps) {
  const classes = ['icon-btn', size === 'lg' ? 'icon-btn--lg' : '', className]
    .filter(Boolean)
    .join(' ');
  return (
    <button type={type} className={classes} aria-label={label} {...rest}>
      {children}
    </button>
  );
}
