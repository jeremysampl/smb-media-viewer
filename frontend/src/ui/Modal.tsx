import { useEffect, useId, type ReactNode } from 'react';

export interface ModalProps {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
  backdropClassName?: string;
  closeOnEscape?: boolean;
  header?: (titleId: string) => ReactNode;
}

export function Modal({
  open,
  title,
  children,
  onClose,
  className = '',
  backdropClassName = '',
  closeOnEscape = true,
  header,
}: ModalProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open || !closeOnEscape) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose, closeOnEscape]);

  if (!open) return null;

  return (
    <div
      className={`modal-backdrop ${backdropClassName}`.trim()}
      role="presentation"
      onClick={onClose}
    >
      <div
        className={`modal-card ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        {header ? header(titleId) : <h2 id={titleId}>{title}</h2>}
        {children}
      </div>
    </div>
  );
}
