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
  type PDFDocumentProxy,
} from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { fetchRawBlob } from '../../api/client';
import { touchCenter, touchDistance } from '../../gallery/mobileImageZoom';
import { IconButton } from '../../ui';
import type { FileViewerProps } from '../types';

GlobalWorkerOptions.workerSrc = pdfWorker;

const MIN_SCALE = 0.4;
const MAX_SCALE = 4;
const ZOOM_STEP = 1.2;

function clampScale(value: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}

/** Keep the viewport point under (clientX, clientY) fixed when content scale changes. */
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
}: {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
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
    })();

    return () => {
      cancelled = true;
      try {
        renderTask?.cancel();
      } catch {
        // already finished
      }
    };
  }, [pdf, pageNumber, scale, visible]);

  return (
    <div
      ref={hostRef}
      className="pdf-page"
      style={{ minHeight: height }}
      data-page={pageNumber}
    >
      <canvas ref={canvasRef} className="pdf-page-canvas" />
    </div>
  );
}

export function PdfFileViewer({ entry, onClose }: FileViewerProps) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [scale, setScale] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [liveScale, setLiveScale] = useState<number | null>(null);

  const bodyRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const pinchRef = useRef<{
    distance: number;
    scale: number;
    originX: number;
    originY: number;
  } | null>(null);
  const liveScaleRef = useRef<number | null>(null);
  const fitWidthScaleRef = useRef(1);
  const scaleModeRef = useRef<'fit' | 'custom'>('fit');
  const pendingScrollAnchorRef = useRef<{
    clientX: number;
    clientY: number;
    fromScale: number;
    toScale: number;
  } | null>(null);
  const displayScale = liveScale ?? scale;

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
    scaleModeRef.current = 'fit';

    void (async () => {
      try {
        const blob = await fetchRawBlob(entry.token!);
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
  }, [entry.token, entry.path]);

  const measureFitWidth = useCallback(async () => {
    if (!pdf || !bodyRef.current) return;
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const available = Math.max(120, bodyRef.current.clientWidth - 24);
    const next = clampScale(available / base.width);
    fitWidthScaleRef.current = next;
    if (scaleModeRef.current === 'fit') {
      setScale(next);
    }
  }, [pdf]);

  useLayoutEffect(() => {
    void measureFitWidth();
  }, [measureFitWidth]);

  useEffect(() => {
    const node = bodyRef.current;
    if (!node) return undefined;
    const observer = new ResizeObserver(() => {
      void measureFitWidth();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [measureFitWidth]);

  // Keep scroll anchored after pages resize to the committed scale.
  useEffect(() => {
    const pages = pagesRef.current;
    const scroller = bodyRef.current;
    if (!pages || !scroller) return undefined;
    const observer = new ResizeObserver(() => {
      const pending = pendingScrollAnchorRef.current;
      if (!pending) return;
      pendingScrollAnchorRef.current = null;
      zoomScrollAroundPoint(
        scroller,
        pending.clientX,
        pending.clientY,
        pending.fromScale,
        pending.toScale,
      );
    });
    observer.observe(pages);
    return () => observer.disconnect();
  }, [pdf]);

  const zoomBy = useCallback((factor: number) => {
    const scroller = bodyRef.current;
    scaleModeRef.current = 'custom';
    setLiveScale(null);
    liveScaleRef.current = null;
    setScale((current) => {
      const next = clampScale(current * factor);
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
  }, []);

  const fitWidth = useCallback(() => {
    scaleModeRef.current = 'fit';
    setLiveScale(null);
    liveScaleRef.current = null;
    setScale(fitWidthScaleRef.current);
    const scroller = bodyRef.current;
    if (scroller) scroller.scrollLeft = 0;
  }, []);

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

  useEffect(() => {
    const node = bodyRef.current;
    if (!node) return undefined;

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 2) return;
      const a = event.touches[0];
      const b = event.touches[1];
      if (!a || !b) return;
      const center = touchCenter(a, b);
      const rect = node.getBoundingClientRect();
      const base = liveScaleRef.current ?? scale;
      pinchRef.current = {
        distance: touchDistance(a, b),
        scale: base,
        // Content coords under the pinch midpoint.
        originX: node.scrollLeft + (center.x - rect.left),
        originY: node.scrollTop + (center.y - rect.top),
      };
    };

    const onTouchMove = (event: TouchEvent) => {
      const pinch = pinchRef.current;
      if (!pinch || event.touches.length < 2) return;
      event.preventDefault();
      const a = event.touches[0];
      const b = event.touches[1];
      if (!a || !b || pinch.distance <= 0) return;

      const next = clampScale(pinch.scale * (touchDistance(a, b) / pinch.distance));
      liveScaleRef.current = next;
      setLiveScale(next);

      const center = touchCenter(a, b);
      const rect = node.getBoundingClientRect();
      const pages = pagesRef.current;
      if (pages) {
        // Scale around the original pinch point.
        pages.style.transformOrigin = `${pinch.originX}px ${pinch.originY}px`;
        pages.style.transform = `scale(${next / scale})`;
      }

      // Keep that point under the finger midpoint.
      node.scrollLeft = pinch.originX - (center.x - rect.left);
      node.scrollTop = pinch.originY - (center.y - rect.top);
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (!pinchRef.current) return;
      if (event.touches.length >= 2) return;

      const pinch = pinchRef.current;
      pinchRef.current = null;
      const finalScale = liveScaleRef.current ?? scale;
      liveScaleRef.current = null;
      setLiveScale(null);

      const pages = pagesRef.current;
      if (pages) {
        pages.style.transform = '';
        pages.style.transformOrigin = '';
      }

      if (Math.abs(finalScale - scale) < 0.001) return;

      scaleModeRef.current = 'custom';
      const rect = node.getBoundingClientRect();
      // Anchor scroll to the pinch point after the real scale commits.
      const clientX = rect.left + (pinch.originX - node.scrollLeft);
      const clientY = rect.top + (pinch.originY - node.scrollTop);
      pendingScrollAnchorRef.current = {
        clientX,
        clientY,
        fromScale: scale,
        toScale: finalScale,
      };
      setScale(finalScale);
    };

    node.addEventListener('touchstart', onTouchStart, { passive: true });
    node.addEventListener('touchmove', onTouchMove, { passive: false });
    node.addEventListener('touchend', onTouchEnd);
    node.addEventListener('touchcancel', onTouchEnd);
    return () => {
      node.removeEventListener('touchstart', onTouchStart);
      node.removeEventListener('touchmove', onTouchMove);
      node.removeEventListener('touchend', onTouchEnd);
      node.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [scale]);

  const pages = pdf
    ? Array.from({ length: pageCount }, (_, index) => index + 1)
    : [];

  return (
    <div className="file-viewer" role="dialog" aria-modal="true" aria-label={entry.name}>
      <div className="file-viewer-backdrop" onClick={onClose} />
      <div className="file-viewer-panel file-viewer-panel-pdf">
        <header className="file-viewer-chrome file-viewer-chrome-pdf">
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
              ✕
            </IconButton>
          </div>
          <div className="file-viewer-actions">
            <IconButton
              label="Zoom out"
              className="file-viewer-tool"
              disabled={!pdf}
              onClick={() => zoomBy(1 / ZOOM_STEP)}
            >
              −
            </IconButton>
            <button
              type="button"
              className="file-viewer-tool file-viewer-zoom-label"
              aria-label="Fit to width"
              disabled={!pdf}
              onClick={fitWidth}
              title="Fit width"
            >
              {Math.round(displayScale * 100)}%
            </button>
            <IconButton
              label="Zoom in"
              className="file-viewer-tool"
              disabled={!pdf}
              onClick={() => zoomBy(ZOOM_STEP)}
            >
              +
            </IconButton>
            <button
              type="button"
              className="file-viewer-tool"
              aria-label="Print"
              disabled={!blobUrl}
              onClick={printPdf}
            >
              Print
            </button>
            <button
              type="button"
              className="file-viewer-tool hide-below-narrow"
              aria-label="Open in new tab"
              disabled={!blobUrl}
              onClick={openExternal}
            >
              Open
            </button>
          </div>
        </header>
        <div
          ref={bodyRef}
          className={`file-viewer-body pdf-viewer-body${liveScale ? ' is-pinching' : ''}`}
        >
          {loading ? <p className="file-viewer-status">Loading PDF…</p> : null}
          {error ? <p className="file-viewer-error">{error}</p> : null}
          {pdf ? (
            <div ref={pagesRef} className="pdf-pages">
              {pages.map((pageNumber) => (
                <PdfPage
                  key={`${pageNumber}:${scale.toFixed(3)}`}
                  pdf={pdf}
                  pageNumber={pageNumber}
                  scale={scale}
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
