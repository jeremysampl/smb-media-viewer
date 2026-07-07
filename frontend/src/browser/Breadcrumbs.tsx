interface BreadcrumbsProps {
  path: string;
  onNavigate: (path: string) => void;
}

export function Breadcrumbs({ path, onNavigate }: BreadcrumbsProps) {
  const segments = path ? path.split('/').filter(Boolean) : [];

  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <button type="button" onClick={() => onNavigate('')}>
        Shares
      </button>
      {segments.map((segment, index) => {
        const target = segments.slice(0, index + 1).join('/');
        const isLast = index === segments.length - 1;
        return (
          <span key={target} className="crumb">
            <span className="separator">/</span>
            {isLast ? (
              <span className="current">{segment}</span>
            ) : (
              <button type="button" onClick={() => onNavigate(target)}>
                {segment}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}
