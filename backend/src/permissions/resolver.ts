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
    .map((entry) => {
      // Samba @group / +group → group name
      if (entry.startsWith('@') || entry.startsWith('+')) return entry.slice(1);
      return entry;
    });
}

function parseBool(value: string | undefined): boolean {
  if (!value) return false;
  return ['yes', 'true', '1'].includes(value.trim().toLowerCase());
}

function isShareSection(name: string): boolean {
  const lower = name.toLowerCase();
  return !['global', 'homes', 'printers', 'print$'].includes(lower);
}

async function expandIncludeGlobs(includePath: string, fromFile: string): Promise<string[]> {
  const resolved = path.isAbsolute(includePath)
    ? includePath
    : path.resolve(path.dirname(fromFile), includePath);

  // Minimal glob: trailing * patterns used by Samba/OMV (e.g. *.conf).
  if (!resolved.includes('*')) return [resolved];

  const dir = path.dirname(resolved);
  const pattern = path.basename(resolved);
  const star = pattern.indexOf('*');
  if (star < 0) return [resolved];
  const prefix = pattern.slice(0, star);
  const suffix = pattern.slice(star + 1);

  try {
    const names = await fs.readdir(dir);
    return names
      .filter((name) => name.startsWith(prefix) && name.endsWith(suffix))
      .map((name) => path.join(dir, name))
      .sort();
  } catch {
    return [];
  }
}

async function parseSmbConfFile(
  filePath: string,
  shares: ShareInfo[],
  visited: Set<string>,
): Promise<void> {
  const realPath = path.resolve(filePath);
  if (visited.has(realPath)) return;
  visited.add(realPath);

  let content: string;
  try {
    content = await fs.readFile(realPath, 'utf8');
  } catch (error) {
    console.warn(`[shares] Unable to read ${realPath}:`, error);
    return;
  }

  let current: Partial<ShareInfo> | null = null;

  const flush = () => {
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
  };

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;

    const sectionMatch = line.match(/^\[(.+)\]$/);
    if (sectionMatch) {
      flush();
      current = { name: sectionMatch[1] };
      continue;
    }

    const [keyRaw, ...rest] = line.split('=');
    if (!keyRaw || rest.length === 0) continue;
    const key = keyRaw.trim().toLowerCase();
    const value = rest.join('=').trim();

    if (key === 'include') {
      const targets = await expandIncludeGlobs(value, realPath);
      for (const target of targets) {
        await parseSmbConfFile(target, shares, visited);
      }
      continue;
    }

    if (!current) continue;

    switch (key) {
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

  flush();
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

  const shares: ShareInfo[] = [];
  await parseSmbConfFile(config.smbConfPath, shares, new Set());

  cachedShares = shares;
  lastLoadedAt = now;
  console.info(
    `[shares] Loaded ${shares.length} share(s): ${shares.map((s) => s.name).join(', ') || '(none)'}`,
  );
  return shares;
}

let cachedGroups: Map<string, string[]> | null = null;
let cachedPrimaryGroup: Map<string, string> | null = null;

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

/** Map username → primary group name using host /etc/passwd + /etc/group. */
async function loadPrimaryGroups(): Promise<Map<string, string>> {
  if (cachedPrimaryGroup) return cachedPrimaryGroup;

  const passwdPath = config.passwdFilePath;
  const passwd = await fs.readFile(passwdPath, 'utf8').catch(() => '');
  const groupContent = await fs.readFile(config.groupFilePath, 'utf8').catch(() => '');

  const gidToName = new Map<string, string>();
  for (const line of groupContent.split(/\r?\n/)) {
    const parts = line.split(':');
    if (parts.length < 3) continue;
    gidToName.set(parts[2], parts[0]);
  }

  const primary = new Map<string, string>();
  for (const line of passwd.split(/\r?\n/)) {
    const parts = line.split(':');
    if (parts.length < 4) continue;
    const username = parts[0];
    const gid = parts[3];
    const groupName = gidToName.get(gid);
    if (groupName) primary.set(username.toLowerCase(), groupName);
  }

  cachedPrimaryGroup = primary;
  return primary;
}

function userInList(
  username: string,
  list: string[],
  groups: Map<string, string[]>,
  primaryGroup: string | undefined,
): boolean {
  const lowerUser = username.toLowerCase();
  for (const entry of list) {
    if (entry.toLowerCase() === lowerUser) return true;
    if (primaryGroup && entry.toLowerCase() === primaryGroup.toLowerCase()) {
      return true;
    }
    const groupMembers = groups.get(entry);
    if (groupMembers?.some((member) => member.toLowerCase() === lowerUser)) {
      return true;
    }
    // /etc/group keys are case-sensitive; try exact map lookup variants
    for (const [groupName, members] of groups) {
      if (groupName.toLowerCase() !== entry.toLowerCase()) continue;
      if (members.some((member) => member.toLowerCase() === lowerUser)) return true;
    }
  }
  return false;
}

export async function getAccessibleShares(username: string): Promise<ShareInfo[]> {
  const shares = await loadShares();
  const groups = await loadGroups();
  const primaryGroups = await loadPrimaryGroups();
  const primaryGroup = primaryGroups.get(username.toLowerCase());

  const accessible = shares.filter((share) => {
    if (share.guestOk) return true;

    const allLists = [...share.validUsers, ...share.readList, ...share.writeList];
    if (allLists.length === 0) return true;

    return userInList(username, allLists, groups, primaryGroup);
  });

  if (accessible.length === 0 && shares.length > 0) {
    console.warn(
      `[shares] User "${username}" matched 0 of ${shares.length} share(s) after ACL filter` +
        (primaryGroup ? ` (primary group: ${primaryGroup})` : ' (primary group unknown)'),
    );
  }

  return accessible;
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
