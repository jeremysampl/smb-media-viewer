export type LoaderProps = {
  label?: string;
  /** 0–1 when known; null for an indeterminate bar; omit for spinner only */
  progress?: number | null;
  compact?: boolean;
  className?: string;
};

function progressPercent(progress: number | null | undefined): number | null {
  if (progress === undefined || progress === null || !Number.isFinite(progress)) {
    return null;
  }
  return Math.max(0, Math.min(100, progress <= 1 ? progress * 100 : progress));
}

export function Loader({
  label,
  progress,
  compact = false,
  className = '',
}: LoaderProps) {
  const showBar = progress !== undefined;
  const pct = showBar ? progressPercent(progress) : null;
  const classes = [
    'ui-loader',
    compact ? 'ui-loader--compact' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} role="status" aria-live="polite" aria-busy="true">
      <div className="ui-loader__spinner" aria-hidden />
      {label ? <p className="ui-loader__label">{label}</p> : null}
      {showBar ? (
        <div
          className="ui-loader__bar"
          role="progressbar"
          aria-valuenow={pct ?? undefined}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="ui-loader__track">
            {pct === null ? (
              <div className="ui-loader__indeterminate" />
            ) : (
              <div className="ui-loader__fill" style={{ width: `${pct}%` }} />
            )}
          </div>
          {pct !== null ? (
            <span className="ui-loader__pct">{Math.round(pct)}%</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
