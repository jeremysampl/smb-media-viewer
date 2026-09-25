import { useMemo, useState } from 'react';
import {
  stopAdminCastSessions,
  type AdminStatus,
} from '../api/client';
import { Button } from '../ui';
import { formatDuration, formatRelativeTime } from './format';
import { AdminDataPanel } from './table/AdminDataPanel';
import type { AdminColumnDef } from './table/useAdminTableState';

type CastRow = AdminStatus['castSessions'][number];

interface CastsPanelProps {
  status: AdminStatus;
  now: number;
  onChanged?: () => void;
}

export function CastsPanel({ status, now, onChanged }: CastsPanelProps) {
  const [busyId, setBusyId] = useState<string | 'all' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const rows = status.castSessions ?? [];

  async function stopSessions(ids: string[], all = false) {
    setBusyId(all ? 'all' : ids[0] ?? 'all');
    setMessage(null);
    try {
      const result = await stopAdminCastSessions(all ? { all: true } : { ids });
      setMessage(
        result.stopped === 1
          ? 'Stop requested for 1 cast session.'
          : `Stop requested for ${result.stopped} cast sessions.`,
      );
      onChanged?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to stop cast sessions');
    } finally {
      setBusyId(null);
    }
  }

  const columns = useMemo<AdminColumnDef<CastRow, string>[]>(
    () => [
      {
        id: 'status',
        label: 'Status',
        sortValue: (row) => (row.stopRequested ? 'stopping' : 'active'),
        render: (row) => (
          <span className={`admin-job-badge ${row.stopRequested ? 'failed' : 'active'}`}>
            {row.stopRequested ? 'stopping' : 'active'}
          </span>
        ),
      },
      {
        id: 'user',
        label: 'User',
        sortValue: (row) => row.username.toLowerCase(),
        searchText: (row) => row.username,
        render: (row) => row.username,
      },
      {
        id: 'device',
        label: 'Device',
        sortValue: (row) => row.deviceName.toLowerCase(),
        searchText: (row) => row.deviceName,
        render: (row) => row.deviceName,
      },
      {
        id: 'nowPlaying',
        label: 'Now playing',
        sortValue: (row) => (row.currentItem ?? '').toLowerCase(),
        searchText: (row) => `${row.currentItem ?? ''} ${row.itemCount}`,
        render: (row) => (
          <span>
            {row.currentItem ?? '—'}
            <small className="admin-cast-meta"> · {row.itemCount} in queue</small>
          </span>
        ),
      },
      {
        id: 'started',
        label: 'Started',
        align: 'right',
        sortValue: (row) => row.startedAt,
        render: (row, ctx) => (
          <span>
            {formatRelativeTime(row.startedAt, ctx.now)}
            <small className="admin-cast-meta">
              {' · '}
              {formatDuration((ctx.now - row.startedAt) / 1000)}
            </small>
          </span>
        ),
      },
      {
        id: 'seen',
        label: 'Last seen',
        align: 'right',
        hideBelow: 'tablet',
        sortValue: (row) => row.lastSeenAt,
        render: (row, ctx) => formatRelativeTime(row.lastSeenAt, ctx.now),
      },
      {
        id: 'actions',
        label: '',
        align: 'right',
        sortValue: () => 0,
        render: (row) => (
          <Button
            size="sm"
            variant="secondary"
            disabled={Boolean(busyId) || row.stopRequested}
            onClick={() => void stopSessions([row.id])}
          >
            {row.stopRequested ? 'Stopping…' : busyId === row.id ? 'Stopping…' : 'Stop'}
          </Button>
        ),
      },
    ],
    [busyId],
  );

  return (
    <div className="admin-casts">
      <div className="admin-casts-toolbar">
        <p className="admin-casts-help">
          Active Cast senders report in while connected. Stopping asks the browser to end the session
          and revokes media access for that cast.
        </p>
        <Button
          size="sm"
          variant="secondary"
          disabled={Boolean(busyId) || rows.length === 0}
          onClick={() => void stopSessions([], true)}
        >
          {busyId === 'all' ? 'Stopping…' : 'Stop all'}
        </Button>
      </div>
      {message ? <p className="status">{message}</p> : null}
      <AdminDataPanel
        title="Cast sessions"
        now={now}
        rows={rows}
        columns={columns}
        defaultSort={{ key: 'started', dir: 'desc' }}
        getRowId={(row) => row.id}
        getSearchText={(row) =>
          `${row.username} ${row.deviceName} ${row.currentItem ?? ''} ${row.mediaOrigin}`
        }
        pageSize={50}
        emptyMessage="No active cast sessions."
      />
    </div>
  );
}
