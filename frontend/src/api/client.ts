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

export async function login(username: string, password: string): Promise<{ username: string }> {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export async function logout(): Promise<void> {
  await request('/auth/logout', { method: 'POST' });
}

export async function getMe(): Promise<{ username: string }> {
  return request('/auth/me');
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
  kind: 'image' | 'video' | 'poster',
  quality?: string,
): string {
  const base = `${API_BASE}/media/${token}/${kind}`;
  if (kind === 'poster') return base;
  return `${base}?quality=${quality ?? 'medium'}`;
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

