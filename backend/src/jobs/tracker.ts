import path from 'node:path';

export type TrackedJobKind =
  | 'image_resize'
  | 'video_transcode'
  | 'image_index'
  | 'video_index'
  | 'office_convert';

export type TrackedJobOutcome = 'completed' | 'failed';

export interface TrackedJob {
  id: string;
  kind: TrackedJobKind;
  label: string;
  path: string;
  /** Source file size (bytes). */
  size?: number;
  /** Size of the cached output after resize/transcode. */
  outputSize?: number;
  quality?: string;
  priority?: 'high' | 'low';
  startedAt: number;
  /** 0-1 when known (ffmpeg time/duration), else null. */
  progress: number | null;
}

export interface FinishedJob extends TrackedJob {
  finishedAt: number;
  durationMs: number;
  outcome: TrackedJobOutcome;
  error?: string;
}

const HISTORY_LIMIT = 100;

const active = new Map<string, TrackedJob>();
const recent: FinishedJob[] = [];
let nextId = 1;

function pushRecent(job: FinishedJob): void {
  recent.unshift(job);
  if (recent.length > HISTORY_LIMIT) {
    recent.length = HISTORY_LIMIT;
  }
}

export function startTrackedJob(input: {
  kind: TrackedJobKind;
  path: string;
  size?: number;
  quality?: string;
  priority?: 'high' | 'low';
  startedAt?: number;
}): string {
  const id = String(nextId++);
  active.set(id, {
    id,
    kind: input.kind,
    label: path.basename(input.path),
    path: input.path,
    size: input.size,
    quality: input.quality,
    priority: input.priority,
    startedAt: input.startedAt ?? Date.now(),
    progress: null,
  });
  return id;
}

export function updateTrackedJobProgress(id: string, progress: number): void {
  const job = active.get(id);
  if (!job) return;
  job.progress = Math.max(0, Math.min(1, progress));
}

export function setTrackedJobOutputSize(id: string, outputSize: number): void {
  const job = active.get(id);
  if (!job) return;
  job.outputSize = outputSize;
}

export function finishTrackedJob(
  id: string,
  outcome: TrackedJobOutcome = 'completed',
  error?: string,
): void {
  const job = active.get(id);
  if (!job) return;
  active.delete(id);
  const finishedAt = Date.now();
  pushRecent({
    ...job,
    progress: outcome === 'completed' ? 1 : job.progress,
    finishedAt,
    durationMs: Math.max(0, finishedAt - job.startedAt),
    outcome,
    error,
  });
}

/** Add a finished job that skipped the active map (index queue). */
export function recordFinishedJob(input: {
  kind: TrackedJobKind;
  path: string;
  size?: number;
  outputSize?: number;
  quality?: string;
  priority?: 'high' | 'low';
  startedAt: number;
  outcome: TrackedJobOutcome;
  error?: string;
}): void {
  const finishedAt = Date.now();
  pushRecent({
    id: String(nextId++),
    kind: input.kind,
    label: path.basename(input.path),
    path: input.path,
    size: input.size,
    outputSize: input.outputSize,
    quality: input.quality,
    priority: input.priority,
    startedAt: input.startedAt,
    progress: input.outcome === 'completed' ? 1 : null,
    finishedAt,
    durationMs: Math.max(0, finishedAt - input.startedAt),
    outcome: input.outcome,
    error: input.error,
  });
}

export function listTrackedJobs(): TrackedJob[] {
  return [...active.values()].sort((a, b) => a.startedAt - b.startedAt);
}

export function listRecentJobs(): FinishedJob[] {
  return [...recent];
}

export async function withTrackedJob<T>(
  input: {
    kind: TrackedJobKind;
    path: string;
    size?: number;
    quality?: string;
  },
  work: (jobId: string) => Promise<T>,
): Promise<T> {
  const id = startTrackedJob(input);
  try {
    const result = await work(id);
    finishTrackedJob(id, 'completed');
    return result;
  } catch (error) {
    finishTrackedJob(
      id,
      'failed',
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  }
}
