import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import { useIsMobile } from '../hooks/useIsMobile';

export function adminPreviewUrl(absolutePath: string): string {
  return `/api/admin/preview?path=${encodeURIComponent(absolutePath)}`;
}

function parentPath(absolutePath: string): string {
  const normalized = absolutePath.replace(/\\/g, '/');
  const idx = normalized.lastIndexOf('/');
  if (idx <= 0) return normalized;
  return normalized.slice(0, idx);
}

interface JobFileDetailsProps {
  label: string;
  path: string;
  size?: number;
  formatBytes: (bytes: number) => string;
}

export function JobFileDetails({
  label,
  path,
  size,
  formatBytes,
}: JobFileDetailsProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<number | undefined>(undefined);
  const closeTimer = useRef<number | undefined>(undefined);
  const panelId = useId();
  const folder = parentPath(path);

  const clearCloseTimer = useCallback(() => {
    if (closeTimer.current !== undefined) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = undefined;
    }
  }, []);

  const close = useCallback(() => {
    clearCloseTimer();
    setOpen(false);
    setCopied(false);
  }, [clearCloseTimer]);

  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimer.current = window.setTimeout(() => {
      setOpen(false);
      setCopied(false);
    }, 160);
  }, [clearCloseTimer]);

  const updateAnchor = useCallback(() => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (rect) setAnchor(rect);
  }, []);

  useLayoutEffect(() => {
    if (!open || isMobile) {
      setAnchor(null);
      return undefined;
    }
    updateAnchor();
    window.addEventListener('resize', updateAnchor);
    // Capture scroll from nested overflow containers (job list).
    window.addEventListener('scroll', updateAnchor, true);
    return () => {
      window.removeEventListener('resize', updateAnchor);
      window.removeEventListener('scroll', updateAnchor, true);
    };
  }, [open, isMobile, updateAnchor]);

  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || cardRef.current?.contains(target)) {
        return;
      }
      close();
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open, close]);

  useEffect(() => {
    setPreviewFailed(false);
  }, [path, open]);

  useEffect(() => {
    return () => {
      if (hoverTimer.current !== undefined) window.clearTimeout(hoverTimer.current);
      if (closeTimer.current !== undefined) window.clearTimeout(closeTimer.current);
    };
  }, []);

  async function copyPath() {
    try {
      await navigator.clipboard.writeText(path);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  const preview = (
    <div className="admin-job-preview-media">
      {previewFailed ? (
        <div className="admin-job-preview-fallback">Preview unavailable</div>
      ) : (
        <img
          src={adminPreviewUrl(path)}
          alt=""
          loading="lazy"
          onError={() => setPreviewFailed(true)}
        />
      )}
    </div>
  );

  const pathBlock = (
    <>
      <p className="admin-job-preview-name">{label}</p>
      <p className="admin-job-preview-path">{path}</p>
      {size !== undefined ? (
        <p className="admin-job-preview-size">Source {formatBytes(size)}</p>
      ) : null}
      <button type="button" className="admin-job-copy" onClick={() => void copyPath()}>
        {copied ? 'Copied path' : 'Copy path'}
      </button>
    </>
  );

  let hoverStyle: CSSProperties | undefined;
  if (anchor) {
    const width = Math.min(420, window.innerWidth - 16);
    const left = Math.min(
      Math.max(8, anchor.left),
      Math.max(8, window.innerWidth - width - 8),
    );
    const spaceBelow = window.innerHeight - anchor.bottom;
    const openUp = spaceBelow < 220 && anchor.top > spaceBelow;
    hoverStyle = {
      position: 'fixed',
      left,
      width,
      zIndex: 90,
      ...(openUp
        ? { bottom: window.innerHeight - anchor.top + 8 }
        : { top: anchor.bottom + 8 }),
    };
  }

  return (
    <div
      className={`admin-job-file${open ? ' open' : ''}`}
      ref={rootRef}
      onMouseEnter={() => {
        if (isMobile) return;
        clearCloseTimer();
        if (hoverTimer.current !== undefined) window.clearTimeout(hoverTimer.current);
        hoverTimer.current = window.setTimeout(() => {
          updateAnchor();
          setOpen(true);
        }, 220);
      }}
      onMouseLeave={() => {
        if (isMobile) return;
        if (hoverTimer.current !== undefined) window.clearTimeout(hoverTimer.current);
        scheduleClose();
      }}
    >
      <button
        type="button"
        className="admin-job-file-trigger"
        aria-expanded={open}
        aria-controls={panelId}
        title={isMobile ? 'Show location and preview' : path}
        onClick={() => {
          if (!open) updateAnchor();
          setOpen((value) => !value);
        }}
      >
        <span className="admin-job-label">{label}</span>
        <span className="admin-job-folder" title={folder}>
          {folder}
        </span>
      </button>

      {!isMobile && open && anchor
        ? createPortal(
            <div
              ref={cardRef}
              className="admin-job-hover-card"
              id={panelId}
              role="tooltip"
              style={hoverStyle}
              onMouseEnter={clearCloseTimer}
              onMouseLeave={scheduleClose}
            >
              {preview}
              <div className="admin-job-preview-meta">{pathBlock}</div>
            </div>,
            document.body,
          )
        : null}

      {isMobile && open
        ? createPortal(
            <div
              className="admin-job-sheet-root"
              role="dialog"
              aria-modal="true"
              aria-labelledby={panelId}
            >
              <button
                type="button"
                className="admin-job-sheet-backdrop"
                aria-label="Close"
                onClick={close}
              />
              <div className="admin-job-sheet" id={panelId}>
                <div className="admin-job-sheet-handle" aria-hidden />
                {preview}
                <div className="admin-job-preview-meta">{pathBlock}</div>
                <button type="button" className="admin-job-sheet-close" onClick={close}>
                  Close
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
