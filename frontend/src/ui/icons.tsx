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
