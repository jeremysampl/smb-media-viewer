import type { ReactNode, SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & {
  size?: number;
};

function BaseIcon({ size = 18, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export function CloseIcon({ size = 18, ...rest }: IconProps) {
  return (
    <BaseIcon size={size} {...rest}>
      <path
        fill="currentColor"
        d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12 19 6.4 17.6 5 12 10.6 6.4 5Z"
      />
    </BaseIcon>
  );
}

export function ChevronDownIcon({ size = 16, ...rest }: IconProps) {
  return (
    <BaseIcon size={size} {...rest}>
      <path
        fill="currentColor"
        d="M6.7 9.3 12 14.6l5.3-5.3 1.4 1.4L12 17.4 5.3 10.7l1.4-1.4Z"
      />
    </BaseIcon>
  );
}

export function PlusIcon({ size = 18, ...rest }: IconProps) {
  return (
    <BaseIcon size={size} {...rest}>
      <path fill="currentColor" d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z" />
    </BaseIcon>
  );
}

export function MinusIcon({ size = 18, ...rest }: IconProps) {
  return (
    <BaseIcon size={size} {...rest}>
      <path fill="currentColor" d="M5 11h14v2H5v-2Z" />
    </BaseIcon>
  );
}

export function PrintIcon({ size = 18, ...rest }: IconProps) {
  return (
    <BaseIcon size={size} {...rest}>
      <path
        fill="currentColor"
        d="M7 3h10v4H7V3Zm12 6H5c-1.1 0-2 .9-2 2v5h4v5h10v-5h4v-5c0-1.1-.9-2-2-2Zm-3 10H8v-4h8v4Zm3-5.5c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1Z"
      />
    </BaseIcon>
  );
}

export function ExternalLinkIcon({ size = 18, ...rest }: IconProps) {
  return (
    <BaseIcon size={size} {...rest}>
      <path
        fill="currentColor"
        d="M14 3h7v7h-2V6.41l-9.29 9.3-1.42-1.42L17.59 5H14V3ZM5 5h5v2H7v10h10v-3h2v5H5V5Z"
      />
    </BaseIcon>
  );
}

export function CastIcon({ size = 18, ...rest }: IconProps) {
  return (
    <BaseIcon size={size} {...rest}>
      <path
        fill="currentColor"
        d="M1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4v2c4.97 0 9 4.03 9 9h2c0-6.08-4.93-11-11-11zM21 3H3c-1.1 0-2 .9-2 2v3h2V5h18v14h-7v2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"
      />
    </BaseIcon>
  );
}

export function SettingsIcon({ size = 18, ...rest }: IconProps) {
  return (
    <BaseIcon size={size} {...rest}>
      <path
        fill="currentColor"
        d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.61l-1.92-3.32a.5.5 0 0 0-.59-.22l-2.39.96a7.2 7.2 0 0 0-1.62-.94l-.36-2.54a.5.5 0 0 0-.49-.41h-3.84a.5.5 0 0 0-.49.41l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96a.5.5 0 0 0-.59.22L2.74 8.87a.5.5 0 0 0 .12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.86 14.5a.5.5 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.49.41h3.84c.24 0 .44-.17.49-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.5.5 0 0 0-.12-.61l-2.03-1.58ZM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2Z"
      />
    </BaseIcon>
  );
}

export function StopIcon({ size = 18, ...rest }: IconProps) {
  return (
    <BaseIcon size={size} {...rest}>
      <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
    </BaseIcon>
  );
}
