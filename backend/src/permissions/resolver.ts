import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import type { BrowseEntry, ShareInfo } from '../types.js';

let cachedShares: ShareInfo[] | null = null;
let lastLoadedAt = 0;
const RELOAD_MS = 60_000;

function parseList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => (entry.startsWith('@') ? entry.slice(1) : entry));
}

function parseBool(value: string | undefined): boolean {
  if (!value) return false;
  return ['yes', 'true', '1'].includes(value.trim().toLowerCase());
}

function isShareSection(name: string): boolean {
  const lower = name.toLowerCase();
  return !['global', 'homes', 'printers', 'print$'].includes(lower);
}

export async function loadShares(force = false): Promise<ShareInfo[]> {
  const now = Date.now();
  if (!force && cachedShares && now - lastLoadedAt < RELOAD_MS) {
    return cachedShares;
  }

  if (config.localDev) {
    cachedShares = [
      {
        name: config.devShareName,
        path: path.resolve(config.devMediaRoot),
        comment: 'Local development share',
        guestOk: true,
        validUsers: [],
        readList: [],
        writeList: [],
      },
    ];
    lastLoadedAt = now;
    return cachedShares;
  }

  const content = await fs.readFile(config.smbConfPath, 'utf8');
  const shares: ShareInfo[] = [];
  let current: Partial<ShareInfo> | null = null;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;

    const sectionMatch = line.match(/^\[(.+)\]$/);
    if (sectionMatch) {
      if (current?.name && current.path && isShareSection(current.name)) {
        shares.push({
          name: current.name,
          path: current.path,
          comment: current.comment,
          guestOk: current.guestOk ?? false,
          validUsers: current.validUsers ?? [],
          readList: current.readList ?? [],
          writeList: current.writeList ?? [],
        });
      }
      current = { name: sectionMatch[1] };
      continue;
    }

    if (!current) continue;
    const [key, ...rest] = line.split('=');
    if (!key || rest.length === 0) continue;
    const value = rest.join('=').trim();

    switch (key.trim().toLowerCase()) {
      case 'path':
        current.path = value;
        break;
      case 'comment':
        current.comment = value;
        break;
      case 'guest ok':
        current.guestOk = parseBool(value);
        break;
      case 'valid users':
        current.validUsers = parseList(value);
        break;
      case 'read list':
        current.readList = parseList(value);
        break;
      case 'write list':
        current.writeList = parseList(value);
        break;
      default:
        break;
    }
  }

  if (current?.name && current.path && isShareSection(current.name)) {
    shares.push({
      name: current.name,
      path: current.path,
      comment: current.comment,
      guestOk: current.guestOk ?? false,
      validUsers: current.validUsers ?? [],
      readList: current.readList ?? [],
      writeList: current.writeList ?? [],
    });
  }

  cachedShares = shares;
  lastLoadedAt = now;
  return shares;
}

let cachedGroups: Map<string, string[]> | null = null;

async function loadGroups(): Promise<Map<string, string[]>> {
  if (cachedGroups) return cachedGroups;

  const content = await fs.readFile(config.groupFilePath, 'utf8').catch(() => '');
  const groups = new Map<string, string[]>();

  for (const line of content.split(/\r?\n/)) {
    const parts = line.split(':');
    if (parts.length < 4) continue;
    const groupName = parts[0];
    const members = parts[3]
      .split(',')
      .map((member) => member.trim())
      .filter(Boolean);
    groups.set(groupName, members);
  }

  cachedGroups = groups;
  return groups;
}

function userInList(username: string, list: string[], groups: Map<string, string[]>): boolean {
  const lowerUser = username.toLowerCase();
  for (const entry of list) {
    if (entry.toLowerCase() === lowerUser) return true;
    const groupMembers = groups.get(entry);
    if (groupMembers?.some((member) => member.toLowerCase() === lowerUser)) {
      return true;
    }
  }
  return false;
}

export async function getAccessibleShares(username: string): Promise<ShareInfo[]> {
  const shares = await loadShares();
  const groups = await loadGroups();

  return shares.filter((share) => {
    if (share.guestOk) return true;

    const allLists = [...share.validUsers, ...share.readList, ...share.writeList];
    if (allLists.length === 0) return true;

    return userInList(username, allLists, groups);
  });
}

export async function resolveShareForPath(
  username: string,
  absolutePath: string,
): Promise<ShareInfo | null> {
  const accessible = await getAccessibleShares(username);
  const normalized = path.resolve(absolutePath);

  let best: ShareInfo | null = null;
  for (const share of accessible) {
    const sharePath = path.resolve(share.path);
    if (normalized === sharePath || normalized.startsWith(`${sharePath}${path.sep}`)) {
      if (!best || sharePath.length > best.path.length) {
        best = share;
      }
    }
  }
  return best;
}

export function normalizeBrowsePath(inputPath: string): string {
  const trimmed = inputPath.trim();
  if (!trimmed || trimmed === '/') return '';
  return trimmed.replace(/^\/+/, '').replace(/\/+$/, '');
}

export async function resolveAbsolutePath(
  username: string,
  browsePath: string,
): Promise<{ absolutePath: string; share: ShareInfo } | null> {
  const normalized = normalizeBrowsePath(browsePath);
  const accessible = await getAccessibleShares(username);

  if (!normalized) {
    return null;
  }

  const segments = normalized.split('/').filter(Boolean);
  const shareName = segments[0];
  const share = accessible.find((item) => item.name === shareName);
  if (!share) return null;

  const relative = segments.slice(1).join('/');
  const absolutePath = relative
    ? path.resolve(share.path, relative)
    : path.resolve(share.path);

  const shareRoot = path.resolve(share.path);
  if (!absolutePath.startsWith(`${shareRoot}${path.sep}`) && absolutePath !== shareRoot) {
    return null;
  }

  if (segments.some((segment) => segment === '..' || segment === '.')) {
    return null;
  }

  return { absolutePath, share };
}

export async function listShareRoots(username: string): Promise<BrowseEntry[]> {
  const shares = await getAccessibleShares(username);
  return shares.map((share) => ({
    name: share.name,
    path: share.name,
    type: 'folder' as const,
  }));
}
