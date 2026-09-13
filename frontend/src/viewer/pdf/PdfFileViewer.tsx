import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  GlobalWorkerOptions,
  getDocument,
  TextLayer,
  type PDFDocumentProxy,
} from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { fetchRawBlob } from '../../api/client';
import { touchCenter, touchDistance } from '../../gallery/mobileImageZoom';
import { useIsMobile } from '../../hooks/useIsMobile';
import {
  CloseIcon,
  ExternalLinkIcon,
  IconButton,
  MinusIcon,
  PlusIcon,
  PrintIcon,
} from '../../ui';
import type { FileViewerProps } from '../types';

GlobalWorkerOptions.workerSrc = pdfWorker;

export interface PdfFileViewerProps extends FileViewerProps {
  fetchBlob?: (token: string) => Promise<Blob>;
  loadingMessage?: string;
}

const MIN_SCALE = 0.4;
const MAX_SCALE = 4;
const ZOOM_STEP = 1.2;
const TAP_MOVE_PX = 12;
const TAP_MAX_MS = 320;

type ScaleMode = 'fit-width' | 'fit-height' | 'fit-page' | 'custom';

const ZOOM_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

function clampScale(value: number, minScale = MIN_SCALE) {
  return Math.min(MAX_SCALE, Math.max(minScale, value));
}

/** Keep the viewport point under (clientX, clientY) fixed when content scale changes */
function zoomScrollAroundPoint(
  scroller: HTMLElement,
  clientX: number,
  clientY: number,
  fromScale: number,
  toScale: number,
) {
  if (fromScale <= 0 || toScale <= 0 || fromScale === toScale) return;
  const rect = scroller.getBoundingClientRect();
  const factor = toScale / fromScale;
  const anchorX = scroller.scrollLeft + (clientX - rect.left);
  const anchorY = scroller.scrollTop + (clientY - rect.top);
  scroller.scrollLeft = anchorX * factor - (clientX - rect.left);
  scroller.scrollTop = anchorY * factor - (clientY - rect.top);
}

function PdfPage({
  pdf,
  pageNumber,
  scale,
  onGoToPage,
}: {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  onGoToPage?: (page: number) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const annotationLayerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(pageNumber <= 2);
  const [height, setHeight] = useState(240);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setVisible(true);
      },
      { root: host.closest('.file-viewer-body'), rootMargin: '240px 0px' },
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return undefined;
    let cancelled = false;
    let renderTask: { cancel: () => void; promise: Promise<void> } | null = null;
    let textLayer: TextLayer | null = null;

    void (async () => {
      const page = await pdf.getPage(pageNumber);
      if (cancelled) return;
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      if (!canvas) return;
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) return;

      const outputScale = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      setHeight(viewport.height);

      const transform =
        outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0];

      renderTask = page.render({
        canvas,
        canvasContext: context,
        viewport,
        ...(transform ? { transform } : {}),
      });
      try {
        await renderTask.promise;
      } catch {
        // Cancelled when scale changes mid-render.
      }

      if (cancelled) return;
      const textHost = textLayerRef.current;
      if (textHost) {
        textHost.replaceChildren();
        const textContent = await page.getTextContent();
        if (cancelled) return;
        textLayer = new TextLayer({
          textContentSource: textContent,
          container: textHost,
          viewport,
        });
        try {
          await textLayer.render();
        } catch {
          // Cancelled when scale changes mid-render.
        }
      }

      if (cancelled) return;
      const annotationHost = annotationLayerRef.current;
      if (!annotationHost) return;
      annotationHost.replaceChildren();
      annotationHost.style.width = `${viewport.width}px`;
      annotationHost.style.height = `${viewport.height}px`;

      const annotations = await page.getAnnotations({ intent: 'display' });
      if (cancelled) return;

      for (const annotation of annotations) {
        if (annotation.subtype !== 'Link') continue;
        const rect = viewport.convertToViewportRectangle(annotation.rect);
        const left = Math.min(rect[0], rect[2]);
        const top = Math.min(rect[1], rect[3]);
        const width = Math.abs(rect[2] - rect[0]);
        const height = Math.abs(rect[3] - rect[1]);
        if (width < 1 || height < 1) continue;

        const link = document.createElement('a');
        link.className = 'pdf-annotation-link';
        link.style.left = `${left}px`;
        link.style.top = `${top}px`;
        link.style.width = `${width}px`;
        link.style.height = `${height}px`;

        if (typeof annotation.url === 'string' && annotation.url) {
          link.href = annotation.url;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.title = annotation.url;
        } else if (annotation.dest != null && onGoToPage) {
          link.href = '#';
          link.addEventListener('click', (event) => {
            event.preventDefault();
            void (async () => {
              try {
                const dest =
                  typeof annotation.dest === 'string'
                    ? await pdf.getDestination(annotation.dest)
                    : annotation.dest;
                if (!dest || !Array.isArray(dest) || dest.length === 0) return;
                const pageRef = dest[0];
                const index =
                  typeof pageRef === 'object'
                    ? await pdf.getPageIndex(pageRef)
                    : Number(pageRef) - 1;
                if (Number.isFinite(index) && index >= 0) {
                  onGoToPage(index + 1);
                }
              } catch {
                // Ignore broken destinations.
              }
            })();
          });
        } else {
          continue;
        }

        annotationHost.appendChild(link);
      }
    })();

    return () => {
      cancelled = true;
      try {
        renderTask?.cancel();
      } catch {
        // already finished
      }
      try {
        textLayer?.cancel();
      } catch {
        // already finished
      }
    };
  }, [pdf, pageNumber, scale, visible, onGoToPage]);

  return (
    <div
      ref={hostRef}
      className="pdf-page"
      style={{ minHeight: height }}
      data-page={pageNumber}
    >
      <div className="pdf-page-layer" style={{ width: '100%', height }}>
        <canvas ref={canvasRef} className="pdf-page-canvas" />
        <div ref={textLayerRef} className="textLayer" />
        <div ref={annotationLayerRef} className="annotationLayer" />
      </div>
    </div>
  );
}

export function PdfFileViewer({
  entry,
  onClose,
  fetchBlob = fetchRawBlob,
  loadingMessage = 'Loading PDF…',
}: PdfFileViewerProps) {
  const isMobile = useIsMobile();
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [scale, setScale] = useState(1);
  const [scaleMode, setScaleMode] = useState<ScaleMode>('fit-width');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [liveScale, setLiveScale] = useState<number | null>(null);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [zoomMenuOpen, setZoomMenuOpen] = useState(false);

  const bodyRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const zoomMenuRef = useRef<HTMLDivElement>(null);
  const pinchRef = useRef<{
    distance: number;
    scale: number;
    originX: number;
    originY: number;
  } | null>(null);
  const tapRef = useRef<{
    x: number;
    y: number;
    time: number;
    suppressed: boolean;
  } | null>(null);
  const liveScaleRef = useRef<number | null>(null);
  const fitWidthScaleRef = useRef(1);
  const fitHeightScaleRef = useRef(1);
  const fitPageScaleRef = useRef(1);
  const scaleModeRef = useRef<ScaleMode>('fit-width');
  const pendingScrollAnchorRef = useRef<{
    clientX: number;
    clientY: number;
    fromScale: number;
    toScale: number;
  } | null>(null);
  const pinchCommitRef = useRef(false);
  const liveScaleRafRef = useRef<number | null>(null);
  const displayScale = liveScale ?? scale;

  useEffect(() => {
    scaleModeRef.current = scaleMode;
  }, [scaleMode]);

  /** Floor so the page never letterboxes on both axes at once (= fit page) */
  const minZoomScale = useCallback(() => {
    return Math.max(MIN_SCALE, fitPageScaleRef.current);
  }, []);

  useEffect(() => {
    if (!entry.token) {
      setError('Missing file token');
      setLoading(false);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;
    let doc: PDFDocumentProxy | null = null;

    setLoading(true);
    setError('');
    setPdf(null);
    setPageCount(0);
    setScaleMode('fit-width');
    scaleModeRef.current = 'fit-width';
    setChromeVisible(true);
    setZoomMenuOpen(false);

    void (async () => {
      try {
        const blob = await fetchBlob(entry.token!);
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);

        const data = await blob.arrayBuffer();
        if (cancelled) return;
        const loadingTask = getDocument({ data });
        doc = await loadingTask.promise;
        if (cancelled) {
          void doc.destroy();
          return;
        }
        setPdf(doc);
        setPageCount(doc.numPages);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load PDF');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      void doc?.destroy();
    };
  }, [entry.token, entry.path, fetchBlob]);

  const measureFits = useCallback(async () => {
    if (!pdf || !bodyRef.current) return;
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const pad = 24;
    const availW = Math.max(120, bodyRef.current.clientWidth - pad);
    const availH = Math.max(120, bodyRef.current.clientHeight - pad);
    const widthScale = availW / base.width;
    const heightScale = availH / base.height;
    const pageScale = Math.min(widthScale, heightScale);
    fitWidthScaleRef.current = widthScale;
    fitHeightScaleRef.current = heightScale;
    fitPageScaleRef.current = pageScale;

    const floor = Math.max(MIN_SCALE, pageScale);
    const mode = scaleModeRef.current;
    if (mode === 'fit-width') setScale(clampScale(widthScale, floor));
    else if (mode === 'fit-height') setScale(clampScale(heightScale, floor));
    else if (mode === 'fit-page') setScale(clampScale(pageScale, floor));
    else setScale((current) => clampScale(current, floor));
  }, [pdf]);

  useLayoutEffect(() => {
    void measureFits();
  }, [measureFits]);

  useEffect(() => {
    const node = bodyRef.current;
    if (!node) return undefined;
    const observer = new ResizeObserver(() => {
      void measureFits();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [measureFits]);

  // Clear live pinch transform only after layout matches the committed scale
  useEffect(() => {
    const pages = pagesRef.current;
    const scroller = bodyRef.current;
    if (!pages || !scroller) return undefined;

    const commitPinchLayout = () => {
      const pending = pendingScrollAnchorRef.current;
      if (!pending) return;
      pendingScrollAnchorRef.current = null;
      pinchCommitRef.current = false;

      pages.style.transform = '';
      pages.style.transformOrigin = '';
      pages.style.willChange = '';
      liveScaleRef.current = null;
      setLiveScale(null);

      zoomScrollAroundPoint(
        scroller,
        pending.clientX,
        pending.clientY,
        pending.fromScale,
        pending.toScale,
      );
    };

    const observer = new ResizeObserver(() => {
      if (!pendingScrollAnchorRef.current) return;
      commitPinchLayout();
    });
    observer.observe(pages);
    return () => observer.disconnect();
  }, [pdf]);

  const applyScaleValue = useCallback(
    (next: number, mode: ScaleMode = 'custom') => {
      const scroller = bodyRef.current;
      const floor = minZoomScale();
      const clamped = clampScale(next, floor);
      scaleModeRef.current = mode;
      setScaleMode(mode);
      setLiveScale(null);
      liveScaleRef.current = null;
      setZoomMenuOpen(false);
      setScale((current) => {
        if (scroller && mode === 'custom') {
          const rect = scroller.getBoundingClientRect();
          pendingScrollAnchorRef.current = {
            clientX: rect.left + rect.width / 2,
            clientY: rect.top + rect.height / 2,
            fromScale: current,
            toScale: clamped,
          };
        }
        return clamped;
      });
      if (mode !== 'custom' && scroller) {
        scroller.scrollLeft = 0;
        if (mode === 'fit-height' || mode === 'fit-page') {
          scroller.scrollTop = 0;
        }
      }
    },
    [minZoomScale],
  );

  const zoomBy = useCallback(
    (factor: number) => {
      const scroller = bodyRef.current;
      const floor = minZoomScale();
      scaleModeRef.current = 'custom';
      setScaleMode('custom');
      setLiveScale(null);
      liveScaleRef.current = null;
      setZoomMenuOpen(false);
      setScale((current) => {
        const next = clampScale(current * factor, floor);
        if (scroller) {
          const rect = scroller.getBoundingClientRect();
          pendingScrollAnchorRef.current = {
            clientX: rect.left + rect.width / 2,
            clientY: rect.top + rect.height / 2,
            fromScale: current,
            toScale: next,
          };
        }
        return next;
      });
    },
    [minZoomScale],
  );

  const printPdf = useCallback(() => {
    if (!blobUrl) return;
    const frame = document.createElement('iframe');
    frame.className = 'pdf-print-frame';
    frame.src = blobUrl;
    document.body.appendChild(frame);
    const cleanup = () => {
      window.setTimeout(() => {
        frame.remove();
      }, 1000);
    };
    frame.addEventListener('load', () => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      } catch {
        window.open(blobUrl, '_blank', 'noopener,noreferrer');
      }
      cleanup();
    });
  }, [blobUrl]);

  const openExternal = useCallback(() => {
    if (!blobUrl) return;
    window.open(blobUrl, '_blank', 'noopener,noreferrer');
  }, [blobUrl]);

  const goToPage = useCallback((page: number) => {
    const target = bodyRef.current?.querySelector(`[data-page="${page}"]`);
    if (target instanceof HTMLElement) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  useEffect(() => {
    if (!zoomMenuOpen) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (zoomMenuRef.current?.contains(target)) return;
      setZoomMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setZoomMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [zoomMenuOpen]);

  useEffect(() => {
    if (!isMobile) setChromeVisible(true);
  }, [isMobile]);

  useEffect(() => {
    const node = bodyRef.current;
    if (!node) return undefined;

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length === 1) {
        const touch = event.touches[0];
        if (touch) {
          tapRef.current = {
            x: touch.clientX,
            y: touch.clientY,
            time: Date.now(),
            suppressed: false,
          };
        }
      }
      if (event.touches.length >= 2 && tapRef.current) {
        tapRef.current.suppressed = true;
      }
      if (event.touches.length !== 2) return;
      const a = event.touches[0];
      const b = event.touches[1];
      if (!a || !b) return;
      const center = touchCenter(a, b);
      const rect = node.getBoundingClientRect();
      const floor = minZoomScale();
      const base = clampScale(liveScaleRef.current ?? scale, floor);
      pinchRef.current = {
        distance: Math.max(touchDistance(a, b), 1),
        scale: base,
        originX: node.scrollLeft + (center.x - rect.left),
        originY: node.scrollTop + (center.y - rect.top),
      };
    };

    const onTouchMove = (event: TouchEvent) => {
      const tap = tapRef.current;
      if (tap && event.touches.length === 1) {
        const touch = event.touches[0];
        if (
          touch &&
          (Math.abs(touch.clientX - tap.x) > TAP_MOVE_PX ||
            Math.abs(touch.clientY - tap.y) > TAP_MOVE_PX)
        ) {
          tap.suppressed = true;
        }
      }

      const pinch = pinchRef.current;
      if (!pinch || event.touches.length < 2) return;
      event.preventDefault();
      const a = event.touches[0];
      const b = event.touches[1];
      if (!a || !b || pinch.distance <= 0) return;

      const floor = minZoomScale();
      const raw = pinch.scale * (touchDistance(a, b) / pinch.distance);
      // Clamp live so release never has to snap back from an invalid zoom
      const next = clampScale(raw, floor);
      liveScaleRef.current = next;
      if (liveScaleRafRef.current == null) {
        liveScaleRafRef.current = window.requestAnimationFrame(() => {
          liveScaleRafRef.current = null;
          const latest = liveScaleRef.current;
          if (latest != null) setLiveScale(latest);
        });
      }

      const center = touchCenter(a, b);
      const rect = node.getBoundingClientRect();
      const pages = pagesRef.current;
      if (pages) {
        pages.style.transformOrigin = `${pinch.originX}px ${pinch.originY}px`;
        pages.style.transform = `scale(${next / scale})`;
        pages.style.willChange = 'transform';
      }

      node.scrollLeft = pinch.originX - (center.x - rect.left);
      node.scrollTop = pinch.originY - (center.y - rect.top);
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (pinchRef.current) {
        if (event.touches.length >= 2) return;

        const pinch = pinchRef.current;
        pinchRef.current = null;
        const floor = minZoomScale();
        const finalScale = clampScale(liveScaleRef.current ?? scale, floor);
        if (liveScaleRafRef.current != null) {
          window.cancelAnimationFrame(liveScaleRafRef.current);
          liveScaleRafRef.current = null;
        }

        const pages = pagesRef.current;
        if (Math.abs(finalScale - scale) < 0.001) {
          liveScaleRef.current = null;
          setLiveScale(null);
          if (pages) {
            pages.style.transform = '';
            pages.style.transformOrigin = '';
            pages.style.willChange = '';
          }
          tapRef.current = null;
          return;
        }

        // Keep CSS transform until page layout catches up (no flash / snap)
        scaleModeRef.current = 'custom';
        setScaleMode('custom');
        const rect = node.getBoundingClientRect();
        const clientX = rect.left + (pinch.originX - node.scrollLeft);
        const clientY = rect.top + (pinch.originY - node.scrollTop);
        pendingScrollAnchorRef.current = {
          clientX,
          clientY,
          fromScale: scale,
          toScale: finalScale,
        };
        pinchCommitRef.current = true;
        liveScaleRef.current = finalScale;
        setLiveScale(finalScale);
        setScale(finalScale);

        window.setTimeout(() => {
          if (!pinchCommitRef.current || !pendingScrollAnchorRef.current) return;
          const pending = pendingScrollAnchorRef.current;
          pendingScrollAnchorRef.current = null;
          pinchCommitRef.current = false;
          if (pages) {
            pages.style.transform = '';
            pages.style.transformOrigin = '';
            pages.style.willChange = '';
          }
          liveScaleRef.current = null;
          setLiveScale(null);
          zoomScrollAroundPoint(
            node,
            pending.clientX,
            pending.clientY,
            pending.fromScale,
            pending.toScale,
          );
        }, 180);

        tapRef.current = null;
        return;
      }

      if (event.touches.length > 0) return;
      const tap = tapRef.current;
      tapRef.current = null;
      if (!isMobile || !tap || tap.suppressed) return;
      if (Date.now() - tap.time > TAP_MAX_MS) return;

      if (zoomMenuOpen) {
        setZoomMenuOpen(false);
        return;
      }
      setChromeVisible((value) => !value);
    };

    node.addEventListener('touchstart', onTouchStart, { passive: true });
    node.addEventListener('touchmove', onTouchMove, { passive: false });
    node.addEventListener('touchend', onTouchEnd);
    node.addEventListener('touchcancel', onTouchEnd);
    return () => {
      if (liveScaleRafRef.current != null) {
        window.cancelAnimationFrame(liveScaleRafRef.current);
        liveScaleRafRef.current = null;
      }
      node.removeEventListener('touchstart', onTouchStart);
      node.removeEventListener('touchmove', onTouchMove);
      node.removeEventListener('touchend', onTouchEnd);
      node.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [scale, isMobile, zoomMenuOpen, minZoomScale]);

  const pages = pdf
    ? Array.from({ length: pageCount }, (_, index) => index + 1)
    : [];

  const zoomFloor = minZoomScale();

  return (
    <div
      className={`file-viewer${isMobile ? ' is-mobile' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={entry.name}
    >
      <div className="file-viewer-backdrop" onClick={onClose} />
      <div
        className={[
          'file-viewer-panel',
          'file-viewer-panel-pdf',
          isMobile ? 'is-mobile-pdf' : '',
          isMobile && !chromeVisible ? 'is-chrome-hidden' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <header
          className={[
            'file-viewer-chrome',
            'file-viewer-chrome-pdf',
            isMobile && !chromeVisible ? 'is-hidden' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <div className="file-viewer-title-row">
            <div className="file-viewer-title">
              <span className="file-viewer-name">{entry.name}</span>
              {pageCount > 0 ? (
                <span className="file-viewer-format">
                  {pageCount} page{pageCount === 1 ? '' : 's'}
                </span>
              ) : entry.format ? (
                <span className="file-viewer-format">{entry.format}</span>
              ) : null}
            </div>
            <IconButton
              label="Close"
              className="file-viewer-close"
              onClick={onClose}
            >
              <CloseIcon size={16} />
            </IconButton>
          </div>
        </header>
        <div
          ref={bodyRef}
          className={`file-viewer-body pdf-viewer-body${liveScale ? ' is-pinching' : ''}`}
        >
          {loading ? <p className="file-viewer-status">{loadingMessage}</p> : null}
          {error ? <p className="file-viewer-error">{error}</p> : null}
          {pdf ? (
            <div ref={pagesRef} className="pdf-pages">
              {pages.map((pageNumber) => (
                <PdfPage
                  key={pageNumber}
                  pdf={pdf}
                  pageNumber={pageNumber}
                  scale={scale}
                  onGoToPage={goToPage}
                />
              ))}
            </div>
          ) : null}
        </div>
        <div
          className={[
            'file-viewer-toolbar',
            isMobile && !chromeVisible ? 'is-hidden' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <div className="file-viewer-zoom-group" role="group" aria-label="Zoom">
            <IconButton
              label="Zoom out"
              className="file-viewer-tool file-viewer-zoom-btn"
              disabled={!pdf}
              onClick={() => zoomBy(1 / ZOOM_STEP)}
            >
              <MinusIcon size={16} />
            </IconButton>
            <div className="file-viewer-zoom-menu-wrap" ref={zoomMenuRef}>
              <button
                type="button"
                className="file-viewer-tool file-viewer-zoom-label"
                aria-label="Zoom options"
                aria-haspopup="menu"
                aria-expanded={zoomMenuOpen}
                disabled={!pdf}
                onClick={() => setZoomMenuOpen((open) => !open)}
                title="Zoom options"
              >
                {Math.round(displayScale * 100)}%
              </button>
              {zoomMenuOpen ? (
                <div className="file-viewer-zoom-menu" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    className={scaleMode === 'fit-width' ? 'is-active' : undefined}
                    onClick={() => applyScaleValue(fitWidthScaleRef.current, 'fit-width')}
                  >
                    Fit width
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className={scaleMode === 'fit-height' ? 'is-active' : undefined}
                    onClick={() => applyScaleValue(fitHeightScaleRef.current, 'fit-height')}
                  >
                    Fit height
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className={scaleMode === 'fit-page' ? 'is-active' : undefined}
                    onClick={() => applyScaleValue(fitPageScaleRef.current, 'fit-page')}
                  >
                    Fit page
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className={
                      scaleMode === 'custom' && Math.abs(scale - 1) < 0.01
                        ? 'is-active'
                        : undefined
                    }
                    onClick={() => applyScaleValue(1)}
                  >
                    Actual size
                  </button>
                  <div className="file-viewer-zoom-menu-sep" role="separator" />
                  {ZOOM_PRESETS.filter((preset) => preset >= zoomFloor - 0.001).map(
                    (preset) => (
                      <button
                        key={preset}
                        type="button"
                        role="menuitem"
                        className={
                          scaleMode === 'custom' && Math.abs(scale - preset) < 0.01
                            ? 'is-active'
                            : undefined
                        }
                        onClick={() => applyScaleValue(preset)}
                      >
                        {Math.round(preset * 100)}%
                      </button>
                    ),
                  )}
                </div>
              ) : null}
            </div>
            <IconButton
              label="Zoom in"
              className="file-viewer-tool file-viewer-zoom-btn"
              disabled={!pdf}
              onClick={() => zoomBy(ZOOM_STEP)}
            >
              <PlusIcon size={16} />
            </IconButton>
          </div>
          <div className="file-viewer-toolbar-actions">
            <button
              type="button"
              className="file-viewer-tool file-viewer-action-btn"
              aria-label="Print"
              disabled={!blobUrl}
              onClick={printPdf}
            >
              <PrintIcon size={16} />
              <span className="file-viewer-action-label">Print</span>
            </button>
            <button
              type="button"
              className="file-viewer-tool file-viewer-action-btn"
              aria-label="Open in new tab"
              disabled={!blobUrl}
              onClick={openExternal}
            >
              <ExternalLinkIcon size={16} />
              <span className="file-viewer-action-label">Open</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
