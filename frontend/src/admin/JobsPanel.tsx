import { useMemo, useState } from 'react';
import type { AdminStatus } from '../api/client';
import { JobFileDetails } from './JobFileDetails';
import { formatBytes, formatDuration, formatRelativeTime, extensionOf } from './format';
import { AdminDataPanel } from './table/AdminDataPanel';
import type { AdminColumnDef } from './table/useAdminTableState';
import { ProgressBar } from './ProgressBar';

type JobTab = 'live' | 'recent';

type JobRow = {
  id: string;
  kind: string;
  label: string;
  path: string;
  size?: number;
  outputSize?: number;
  status: string;
  priority?: string;
  quality?: string;
  progress?: number | null;
  startedAt?: number;
  finishedAt?: number;
  durationMs?: number;
  error?: string;
  recentAt: number;
};

function jobKindLabel(kind: string): string {
  switch (kind) {
    case 'image_resize':
      return 'Image resize';
    case 'video_transcode':
      return 'Video transcode';
    case 'image_index':
    case 'image':
      return 'Image index';
    case 'video_index':
    case 'video':
      return 'Video index';
    default:
      return kind;
  }
}

function isIndexKind(kind: string): boolean {
  return (
    kind === 'image' ||
    kind === 'video' ||
    kind === 'image_index' ||
    kind === 'video_index'
  );
}

interface JobsPanelProps {
  status: AdminStatus;
  now: number;
}

export function JobsPanel({ status, now }: JobsPanelProps) {
  const [jobTab, setJobTab] = useState<JobTab>('live');

  const liveRows = useMemo<JobRow[]>(() => {
    const indexLive = status.index.jobs.map((job) => ({
      id: `${job.status}:${job.path}`,
      kind: job.kind,
      label: job.label,
      path: job.path,
      size: job.size,
      status: job.status,
      priority: job.priority,
      progress: job.status === 'active' ? null : undefined,
      recentAt: now,
    }));
    const mediaLive = status.mediaJobs.map((job) => ({
      id: job.id,
      kind: job.kind,
      label: job.label,
      path: job.path,
      size: job.size,
      outputSize: job.outputSize,
      status: 'active',
      quality: job.quality,
      progress: job.progress,
      startedAt: job.startedAt,
      recentAt: job.startedAt,
    }));
    return [...mediaLive, ...indexLive];
  }, [status, now]);

  const recentRows = useMemo<JobRow[]>(
    () =>
      status.recentJobs.map((job) => ({
        id: job.id,
        kind: job.kind,
        label: job.label,
        path: job.path,
        size: job.size,
        outputSize: job.outputSize,
        status: job.outcome,
        priority: job.priority,
        quality: job.quality,
        finishedAt: job.finishedAt,
        durationMs: job.durationMs,
        error: job.error,
        recentAt: job.finishedAt,
      })),
    [status.recentJobs],
  );

  const rows = jobTab === 'live' ? liveRows : recentRows;

  const columns = useMemo<AdminColumnDef<JobRow, string>[]>(
    () => [
      {
        id: 'status',
        label: 'Status',
        sortValue: (row) => row.status,
        render: (row) => (
          <span className={`admin-job-badge ${row.status}`}>
            {row.status === 'completed' ? 'done' : row.status}
          </span>
        ),
      },
      {
        id: 'kind',
        label: 'Kind',
        sortValue: (row) => jobKindLabel(row.kind),
        searchText: (row) => jobKindLabel(row.kind),
        render: (row) => jobKindLabel(row.kind),
      },
      {
        id: 'file',
        label: 'File',
        sortValue: (row) => row.label.toLowerCase(),
        searchText: (row) => `${row.label} ${row.path}`,
        render: (row) => (
          <JobFileDetails
            label={row.label}
            path={row.path}
            size={row.size}
            formatBytes={formatBytes}
          />
        ),
      },
      {
        id: 'size',
        label: 'Size',
        align: 'right',
        sortValue: (row) => row.outputSize ?? row.size ?? -1,
        hideBelow: 'tablet',
        render: (row) =>
          row.outputSize !== undefined
            ? `out ${formatBytes(row.outputSize)}`
            : row.size !== undefined
              ? formatBytes(row.size)
              : '—',
      },
      {
        id: 'recentAt',
        label: jobTab === 'live' ? 'Started' : 'Finished',
        align: 'right',
        sortValue: (row) => row.recentAt,
        render: (row, ctx) => {
          const parts = [
            row.quality,
            row.priority,
            row.durationMs !== undefined
              ? formatDuration(row.durationMs / 1000)
              : row.startedAt !== undefined
                ? formatDuration((ctx.now - row.startedAt) / 1000)
                : null,
            formatRelativeTime(row.recentAt, ctx.now),
          ];
          return parts.filter(Boolean).join(' · ');
        },
      },
    ],
    [jobTab],
  );

  return (
    <AdminDataPanel
      title="Jobs"
      now={now}
      rows={rows}
      columns={columns}
      defaultSort={{ key: 'recentAt', dir: 'desc' }}
      getRowId={(row) => row.id}
      getSearchText={(row) => `${row.label} ${row.path} ${jobKindLabel(row.kind)}`}
      getFolderPath={(row) => {
        const normalized = row.path.replace(/\\/g, '/');
        const idx = normalized.lastIndexOf('/');
        return idx > 0 ? normalized.slice(0, idx) : null;
      }}
      getFileType={(row) => ({
        type: isIndexKind(row.kind)
          ? row.kind.includes('video')
            ? 'video'
            : 'image'
          : row.kind.includes('video')
            ? 'video'
            : 'image',
        format: extensionOf(row.path),
      })}
      pageSize={50}
      showFolder
      chipFilter={{
        defaultValue: 'all',
        options: [
          { value: 'all', label: 'All' },
          { value: 'index', label: 'Index' },
          { value: 'media', label: 'Media' },
        ],
        matches: (row, value) => {
          if (value === 'all') return true;
          if (value === 'index') return isIndexKind(row.kind);
          return !isIndexKind(row.kind);
        },
      }}
      searchPlaceholder="Search jobs by name or path…"
      emptyMessage={
        jobTab === 'live'
          ? 'No jobs running or queued.'
          : 'No completed jobs yet this session.'
      }
      rowClassName={(row) =>
        row.status === 'failed' ? 'failed' : row.status === 'completed' ? 'completed' : undefined
      }
      afterRow={(row) => (
        <>
          {row.status === 'active' && row.progress !== undefined ? (
            <tr className="admin-row-extra">
              <td colSpan={columns.length}>
                <ProgressBar
                  value={row.progress}
                  label={
                    row.progress === null
                      ? 'In progress…'
                      : `${Math.round(row.progress * 100)}%`
                  }
                />
              </td>
            </tr>
          ) : null}
          {row.error ? (
            <tr className="admin-row-extra">
              <td colSpan={columns.length}>
                <p className="admin-job-error" title={row.error}>
                  {row.error}
                </p>
              </td>
            </tr>
          ) : null}
        </>
      )}
      headerRight={
        <div className="admin-segmented" role="tablist" aria-label="Job view">
          <button
            type="button"
            role="tab"
            aria-selected={jobTab === 'live'}
            className={jobTab === 'live' ? 'active' : undefined}
            onClick={() => setJobTab('live')}
          >
            Live
            <span className="admin-count">{liveRows.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={jobTab === 'recent'}
            className={jobTab === 'recent' ? 'active' : undefined}
            onClick={() => setJobTab('recent')}
          >
            Completed
            <span className="admin-count">{recentRows.length}</span>
          </button>
        </div>
      }
    />
  );
}
