import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { getAdminStatus, type AdminStatus } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { UserMenu } from '../browser/UserMenu';
import { Button } from '../ui';
import { CachePanel } from './CachePanel';
import { formatBytes, formatDuration } from './format';
import { IndexPanel } from './IndexPanel';
import { JobsPanel } from './JobsPanel';
import { ProgressBar } from './ProgressBar';

type AdminSection = 'overview' | 'jobs' | 'cache' | 'index';

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="admin-metric">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function AdminPage() {
  const { username, admin, loading: authLoading, logout } = useAuth();
  const [status, setStatus] = useState<AdminStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState<AdminSection>('overview');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!admin) return undefined;

    let cancelled = false;
    let timer: number | undefined;

    const load = async () => {
      try {
        const next = await getAdminStatus();
        if (cancelled) return;
        setStatus(next);
        setNow(Date.now());
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load admin status');
      } finally {
        if (!cancelled) {
          timer = window.setTimeout(() => {
            void load();
          }, 2000);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [admin]);

  if (authLoading) return <p className="status">Loading...</p>;
  if (!username) return <Navigate to="/login" replace />;
  if (!admin) return <Navigate to="/" replace />;

  const index = status?.index;
  const system = status?.system;
  const cache = status?.cache;
  const hostRamPct = system ? system.host.memory.usedPercent / 100 : null;
  const cachePct = cache ? cache.usedPercent / 100 : null;
  const processCpuPct = system
    ? Math.min(1, system.process.cpuPercent / (100 * Math.max(1, system.host.cpuCount)))
    : null;

  return (
    <div className="admin-page">
      <header className="top-bar">
        <div className="top-bar-brand">
          <div className="top-bar-copy">
            <p className="admin-eyebrow">
              <Link to="/">← Back to library</Link>
            </p>
            <h1>Admin Dashboard</h1>
          </div>
        </div>
        <UserMenu username={username} onLogout={logout} isAdmin />
      </header>

      <div className="admin-section-nav" role="tablist" aria-label="Admin sections">
        {(
          [
            ['overview', 'Overview'],
            ['jobs', 'Jobs'],
            ['cache', 'Cache'],
            ['index', 'Index'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={section === id}
            className={section === id ? 'active' : undefined}
            onClick={() => setSection(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? <p className="error">{error}</p> : null}
      {!status && !error ? <p className="status">Loading status...</p> : null}

      {status && section === 'overview' ? (
        <div className="admin-grid">
          <section className="admin-card">
            <h2>Host</h2>
            <ProgressBar
              value={hostRamPct}
              label={
                system
                  ? `RAM ${formatBytes(system.host.memory.used)} / ${formatBytes(system.host.memory.total)} (${system.host.memory.usedPercent}%)`
                  : undefined
              }
            />
            <dl className="admin-metrics">
              <Metric label="Hostname" value={system?.host.hostname ?? '—'} />
              <Metric label="CPUs" value={String(system?.host.cpuCount ?? '—')} />
              <Metric
                label="Load (1/5/15)"
                value={
                  system
                    ? system.host.loadAverage.map((n) => n.toFixed(2)).join(' / ')
                    : '—'
                }
              />
              <Metric
                label="Host uptime"
                value={formatDuration(system?.host.uptimeSeconds ?? NaN)}
              />
              <Metric label="Platform" value={system?.host.platform ?? '—'} />
            </dl>
          </section>

          <section className="admin-card">
            <h2>Backend process</h2>
            <ProgressBar
              value={processCpuPct}
              label={
                system
                  ? `CPU ${system.process.cpuPercent.toFixed(1)}% of one core`
                  : undefined
              }
            />
            <ProgressBar
              value={
                system
                  ? system.process.memory.rss / Math.max(1, system.host.memory.total)
                  : null
              }
              label={
                system
                  ? `RSS ${formatBytes(system.process.memory.rss)} · heap ${formatBytes(system.process.memory.heapUsed)}`
                  : undefined
              }
            />
            <dl className="admin-metrics">
              <Metric label="PID" value={String(system?.process.pid ?? '—')} />
              <Metric
                label="Process uptime"
                value={formatDuration(system?.process.uptimeSeconds ?? NaN)}
              />
            </dl>
          </section>

          <section className="admin-card">
            <h2>Transcode cache</h2>
            <ProgressBar
              value={cachePct}
              label={
                cache
                  ? `${formatBytes(cache.usedBytes)} / ${formatBytes(cache.maxBytes)} (${cache.usedPercent}%)`
                  : undefined
              }
            />
            <dl className="admin-metrics">
              <Metric label="Cached files" value={String(cache?.fileCount ?? '—')} />
            </dl>
            <Button variant="link" className="admin-inline-link" onClick={() => setSection('cache')}>
              Browse cache →
            </Button>
          </section>

          <section className="admin-card">
            <h2>Index queue</h2>
            <ProgressBar
              value={index?.progress ?? null}
              label={
                index
                  ? index.progress === null && index.queued === 0 && index.activeWorkers === 0
                    ? `Idle · ${index.indexedFiles.toLocaleString()} indexed · ${index.completed} done this session`
                    : `${index.activeWorkers}/${index.concurrency} workers · ${index.queued} queued · ${index.completed} done · ${index.failed} failed`
                  : undefined
              }
            />
            <dl className="admin-metrics">
              <Metric
                label="Semaphore"
                value={
                  index
                    ? `${index.semaphoreActive} active · ${index.semaphorePending} waiting`
                    : '—'
                }
              />
              <Metric
                label="Indexed files"
                value={index ? index.indexedFiles.toLocaleString() : '—'}
              />
            </dl>
            <Button variant="link" className="admin-inline-link" onClick={() => setSection('index')}>
              Browse index →
            </Button>
          </section>
        </div>
      ) : null}

      {status && section === 'jobs' ? <JobsPanel status={status} now={now} /> : null}
      {section === 'cache' ? <CachePanel active={section === 'cache'} now={now} /> : null}
      {section === 'index' ? (
        <IndexPanel
          active={section === 'index'}
          now={now}
          indexedTotal={status?.index.indexedFiles}
        />
      ) : null}
    </div>
  );
}
