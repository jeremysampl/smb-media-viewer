import { useLayoutEffect, useRef } from 'react';

interface BreadcrumbsProps {
  path: string;
  onNavigate: (path: string) => void;
}

export function Breadcrumbs({ path, onNavigate }: BreadcrumbsProps) {
  const segments = path ? path.split('/').filter(Boolean) : [];
  const scrollerRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollLeft = scroller.scrollWidth;
  }, [path]);

  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb" ref={scrollerRef}>
      <ol className="breadcrumbs-track">
        <li className="breadcrumbs-item">
          <button
            type="button"
            className={`breadcrumb-chip${segments.length === 0 ? ' current' : ''}`}
            onClick={() => onNavigate('')}
            aria-current={segments.length === 0 ? 'page' : undefined}
          >
            Shares
          </button>
        </li>
        {segments.map((segment, index) => {
          const target = segments.slice(0, index + 1).join('/');
          const isLast = index === segments.length - 1;
          return (
            <li key={target} className="breadcrumbs-item">
              <span className="breadcrumb-sep" aria-hidden>
                /
              </span>
              {isLast ? (
                <span className="breadcrumb-chip current" aria-current="page">
                  {segment}
                </span>
              ) : (
                <button
                  type="button"
                  className="breadcrumb-chip"
                  onClick={() => onNavigate(target)}
                >
                  {segment}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
