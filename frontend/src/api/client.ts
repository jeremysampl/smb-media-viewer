import type { BrowseResponse, MediaMetadata, QualityProfile } from '../types';

const API_BASE = '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = (body as { error?: string }).error ?? response.statusText;
    throw new Error(message || 'Request failed');
  }

  return response.json() as Promise<T>;
}

export async function login(
  username: string,
  password: string,
): Promise<{ username: string; admin: boolean }> {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export async function logout(): Promise<void> {
  await request('/auth/logout', { method: 'POST' });
}

export async function getMe(): Promise<{ username: string; admin: boolean }> {
  return request('/auth/me');
}

export interface AdminStatus {
  generatedAt: number;
  system: {
    process: {
      uptimeSeconds: number;
      pid: number;
      memory: {
        rss: number;
        heapUsed: number;
        heapTotal: number;
        external: number;
      };
      cpuPercent: number;
    };
    host: {
      hostname: string;
      platform: string;
      uptimeSeconds: number;
      loadAverage: [number, number, number];
      cpuCount: number;
      memory: {
        total: number;
        free: number;
        used: number;
        usedPercent: number;
      };
    };
  };
  cache: {
    usedBytes: number;
    maxBytes: number;
    usedPercent: number;
    fileCount: number;
    measuredAt: number;
  };
  index: {
    concurrency: number;
    activeWorkers: number;
    queued: number;
    semaphoreActive: number;
    semaphorePending: number;
    completed: number;
    failed: number;
    progress: number | null;
    indexedFiles: number;
    jobs: Array<{
      path: string;
      label: string;
      size: number;
      kind: 'image' | 'video';
      priority: 'high' | 'low';
      status: 'queued' | 'active';
    }>;
  };
  mediaJobs: Array<{
    id: string;
    kind: 'image_resize' | 'video_transcode' | 'image_index' | 'video_index' | 'office_convert';
    label: string;
    path: string;
    size?: number;
    outputSize?: number;
    quality?: string;
    priority?: 'high' | 'low';
    startedAt: number;
    progress: number | null;
  }>;
  recentJobs: Array<{
    id: string;
    kind: 'image_resize' | 'video_transcode' | 'image_index' | 'video_index' | 'office_convert';
    label: string;
    path: string;
    size?: number;
    outputSize?: number;
    quality?: string;
    priority?: 'high' | 'low';
    startedAt: number;
    finishedAt: number;
    durationMs: number;
    progress: number | null;
    outcome: 'completed' | 'failed';
    error?: string;
  }>;
}

export async function getAdminStatus(): Promise<AdminStatus> {
  return request('/admin/status');
}

export interface AdminCacheEntry {
  id: string;
  cachePath: string;
  sourcePath: string | null;
  label: string;
  kind: 'image' | 'video' | 'unknown';
  quality: string | null;
  size: number;
  createdAt: number;
  lastAccessAt: number;
  accessCount: number;
}

export interface AdminListQuery {
  page?: number;
  pageSize?: number;
  sort?: string;
  order?: 'asc' | 'desc';
  search?: string;
  kind?: string;
  folder?: string;
}

function toQueryString(query: AdminListQuery): string {
  const params = new URLSearchParams();
  if (query.page) params.set('page', String(query.page));
  if (query.pageSize) params.set('pageSize', String(query.pageSize));
  if (query.sort) params.set('sort', query.sort);
  if (query.order) params.set('order', query.order);
  if (query.search) params.set('search', query.search);
  if (query.kind && query.kind !== 'all') params.set('kind', query.kind);
  if (query.folder) params.set('folder', query.folder);
  const text = params.toString();
  return text ? `?${text}` : '';
}

export async function getAdminCacheEntries(query: AdminListQuery = {}): Promise<{
  generatedAt: number;
  page: number;
  pageSize: number;
  total: number;
  folders: string[];
  entries: AdminCacheEntry[];
}> {
  return request(`/admin/cache/entries${toQueryString(query)}`);
}

export async function clearAdminCache(body: {
  mode: 'all' | 'ids' | 'folder';
  ids?: string[];
  folder?: string;
}): Promise<{ ok: boolean; deleted: number }> {
  return request('/admin/cache/clear', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export interface AdminIndexEntry {
  id: string;
  path: string;
  label: string;
  kind: 'image' | 'video';
  size: number;
  mtimeMs: number;
  captureTime: string | null;
  duration: number | null;
  indexedAt: number;
  hasThumb: boolean;
}

export async function getAdminIndexEntries(
  query: AdminListQuery = {},
): Promise<{
  generatedAt: number;
  page: number;
  pageSize: number;
  total: number;
  folders: string[];
  entries: AdminIndexEntry[];
}> {
  return request(`/admin/index/entries${toQueryString(query)}`);
}

export async function clearAdminIndex(body: {
  mode: 'all' | 'ids' | 'folder';
  ids?: string[];
  folder?: string;
}): Promise<{ ok: boolean; deleted: number }> {
  return request('/admin/index/clear', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function getShares(): Promise<BrowseResponse> {
  return request('/shares');
}

export async function browse(path: string, signal?: AbortSignal): Promise<BrowseResponse> {
  const query = path ? `?path=${encodeURIComponent(path)}` : '';
  return request(`/browse${query}`, { signal });
}

export async function getQualityProfiles(): Promise<{ profiles: QualityProfile[] }> {
  return request('/quality');
}

export function mediaUrl(
  token: string,
  kind: 'image' | 'video' | 'poster' | 'raw' | 'pdf-preview',
  quality?: string,
): string {
  const base = `${API_BASE}/media/${token}/${kind}`;
  if (kind === 'poster' || kind === 'raw' || kind === 'pdf-preview') return base;
  return `${base}?quality=${quality ?? 'medium'}`;
}

export async function fetchRawText(token: string): Promise<string> {
  const response = await fetch(mediaUrl(token, 'raw'), {
    credentials: 'include',
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = (body as { error?: string }).error ?? response.statusText;
    throw new Error(message || 'Failed to load file');
  }
  return response.text();
}

export async function fetchRawBlob(token: string): Promise<Blob> {
  const response = await fetch(mediaUrl(token, 'raw'), {
    credentials: 'include',
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = (body as { error?: string }).error ?? response.statusText;
    throw new Error(message || 'Failed to load file');
  }
  return response.blob();
}

export async function fetchOfficePdfBlob(token: string): Promise<Blob> {
  const response = await fetch(mediaUrl(token, 'pdf-preview'), {
    credentials: 'include',
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = (body as { error?: string }).error ?? response.statusText;
    throw new Error(message || 'Failed to convert document');
  }
  return response.blob();
}

export async function getMediaMetadata(token: string): Promise<MediaMetadata> {
  return request(`/media/${token}/metadata`);
}

export async function downloadZip(options: {
  paths: string[];
  zipName: string;
  quality: string;
}): Promise<void> {
  const response = await fetch(`${API_BASE}/download/zip`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = (body as { error?: string }).error ?? response.statusText;
    throw new Error(message || 'Download failed');
  }

  const blob = await response.blob();
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const utfMatch = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  const plainMatch = /filename="?([^";]+)"?/i.exec(disposition);
  const filename = decodeURIComponent(
    utfMatch?.[1] ?? plainMatch?.[1] ?? `${options.zipName || 'download'}.zip`,
  );

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
