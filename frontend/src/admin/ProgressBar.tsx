export function ProgressBar({
  value,
  label,
}: {
  value: number | null;
  label?: string;
}) {
  const pct =
    value === null || !Number.isFinite(value)
      ? null
      : Math.max(0, Math.min(100, value * (value <= 1 ? 100 : 1)));

  return (
    <div
      className="admin-progress"
      role="progressbar"
      aria-valuenow={pct ?? undefined}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="admin-progress-track">
        {pct === null ? (
          <div className="admin-progress-indeterminate" />
        ) : (
          <div className="admin-progress-fill" style={{ width: `${pct}%` }} />
        )}
      </div>
      {label ? <span className="admin-progress-label">{label}</span> : null}
    </div>
  );
}
