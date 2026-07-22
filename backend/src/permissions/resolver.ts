import { spawn } from 'node:child_process';
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
      // Order matters: @"users" / +"users" / "jeremy"
      let cleaned = entry.replace(/^["']+|["']+$/g, '');
      if (cleaned.startsWith('@') || cleaned.startsWith('+')) {
        cleaned = cleaned.slice(1);
      }
      cleaned = cleaned.replace(/^["']+|["']+$/g, '');
      return cleaned;
    })
    .filter(Boolean);
}

function parseBool(value: string | undefined): boolean {
  if (!value) return false;
  return ['yes', 'true', '1'].includes(value.trim().toLowerCase());
}

function isShareSection(name: string): boolean {
  const lower = name.toLowerCase();
  return !['global', 'homes', 'printers', 'print$'].includes(lower);
}

function runCommand(command: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      resolve({ code: 1, stdout: '', stderr: String(error) });
    });
    child.on('close', (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

function parseSmbSections(content: string): ShareInfo[] {
  const shares: ShareInfo[] = [];
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

    if (!current) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim().toLowerCase();
    const value = line.slice(eq + 1).trim();

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
  return shares;
}

async function expandIncludeGlobs(includePath: string, fromFile: string): Promise<string[]> {
  const resolved = path.isAbsolute(includePath)
    ? includePath
    : path.resolve(path.dirname(fromFile), includePath);

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

  // Handle include lines by merging included files, then parse sections from this file
  // without re-processing includes as share keys.
  const withoutIncludes: string[] = [];
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) {
      withoutIncludes.push(rawLine);
      continue;
    }
    const eq = line.indexOf('=');
    if (eq >= 0 && line.slice(0, eq).trim().toLowerCase() === 'include') {
      const value = line.slice(eq + 1).trim();
      const targets = await expandIncludeGlobs(value, realPath);
      for (const target of targets) {
        await parseSmbConfFile(target, shares, visited);
      }
      continue;
    }
    withoutIncludes.push(rawLine);
  }

  shares.push(...parseSmbSections(withoutIncludes.join('\n')));
}

/** Prefer Samba's effective config (includes expanded) when testparm is available. */
async function loadSharesFromTestparm(): Promise<ShareInfo[] | null> {
  // `-s` prints the full effective smb.conf without interactive pause.
  const full = await runCommand('testparm', ['-s', config.smbConfPath]);
  if (full.code !== 0 || !full.stdout.trim()) {
    const fallback = await runCommand('testparm', ['-s']);
    if (fallback.code !== 0 || !fallback.stdout.trim()) {
      console.warn(
        `[shares] testparm unavailable or failed (${(full.stderr || fallback.stderr).trim()}); falling back to smb.conf parse`,
      );
      return null;
    }
    return parseSmbSections(fallback.stdout);
  }
  return parseSmbSections(full.stdout);
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

  let shares = (await loadSharesFromTestparm()) ?? [];
  if (shares.length === 0) {
    const parsed: ShareInfo[] = [];
    await parseSmbConfFile(config.smbConfPath, parsed, new Set());
    shares = parsed;
  }

  cachedShares = shares;
  lastLoadedAt = now;
  console.info(
    `[shares] Loaded ${shares.length} share(s): ${shares
      .map((s) => {
        const acl = [
          ...s.validUsers.map((u) => `u:${u}`),
          ...s.readList.map((u) => `r:${u}`),
          ...s.writeList.map((u) => `w:${u}`),
        ].join(',');
        return acl ? `${s.name}{${acl}}` : s.name;
      })
      .join(', ') || '(none)'}`,
  );
  return shares;
}

let cachedGroups: Map<string, string[]> | null = null;
/** username(lower) → group names(lower) */
const membershipCache = new Map<string, string[]>();

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

async function resolveUserGroups(username: string): Promise<string[]> {
  const cacheKey = username.toLowerCase();
  const cached = membershipCache.get(cacheKey);
  if (cached) return cached;

  const groups = new Set<string>();
  const groupFile = await loadGroups();

  const groupContent = await fs.readFile(config.groupFilePath, 'utf8').catch(() => '');
  const gidToName = new Map<string, string>();
  for (const line of groupContent.split(/\r?\n/)) {
    const parts = line.split(':');
    if (parts.length < 3) continue;
    gidToName.set(parts[2], parts[0]);
  }

  const passwd = await fs.readFile(config.passwdFilePath, 'utf8').catch(() => '');
  let foundInPasswd = false;
  for (const line of passwd.split(/\r?\n/)) {
    const parts = line.split(':');
    if (parts.length < 4) continue;
    if (parts[0].toLowerCase() !== cacheKey) continue;
    foundInPasswd = true;
    const groupName = gidToName.get(parts[3]);
    if (groupName) groups.add(groupName.toLowerCase());
    break;
  }

  for (const [groupName, members] of groupFile) {
    if (members.some((member) => member.toLowerCase() === cacheKey)) {
      groups.add(groupName.toLowerCase());
    }
  }

  const idResult = await runCommand('id', ['-Gn', '--', username]);
  if (idResult.code === 0 && idResult.stdout.trim()) {
    for (const name of idResult.stdout.trim().split(/\s+/)) {
      if (name) groups.add(name.toLowerCase());
    }
  } else if (!foundInPasswd) {
    const getent = await runCommand('getent', ['passwd', username]);
    if (getent.code === 0 && getent.stdout.trim()) {
      const parts = getent.stdout.trim().split(':');
      if (parts.length >= 4) {
        const groupName = gidToName.get(parts[3]);
        if (groupName) groups.add(groupName.toLowerCase());
      }
    }
  }

  const result = [...groups];
  membershipCache.set(cacheKey, result);

  if (result.length === 0) {
    console.warn(
      `[shares] No Unix groups found for "${username}". ` +
        'Ensure /etc/passwd and /etc/group from the host are mounted into the backend.',
    );
  } else {
    console.info(`[shares] User "${username}" groups: ${result.join(', ')}`);
  }

  return result;
}

function userInList(username: string, list: string[], userGroups: string[]): boolean {
  const lowerUser = username.toLowerCase();
  const groupSet = new Set(userGroups.map((g) => g.toLowerCase()));

  for (const entry of list) {
    const lowerEntry = entry.toLowerCase();
    if (!lowerEntry) continue;
    if (lowerEntry === lowerUser) return true;
    // DOMAIN\user → compare local part too
    const slash = lowerEntry.lastIndexOf('\\');
    if (slash >= 0 && lowerEntry.slice(slash + 1) === lowerUser) return true;
    if (groupSet.has(lowerEntry)) return true;
  }
  return false;
}

export async function getAccessibleShares(username: string): Promise<ShareInfo[]> {
  const shares = await loadShares();
  const userGroups = await resolveUserGroups(username);

  const accessible = shares.filter((share) => {
    if (share.guestOk) return true;

    const allLists = [...share.validUsers, ...share.readList, ...share.writeList];
    if (allLists.length === 0) return true;

    return userInList(username, allLists, userGroups);
  });

  if (accessible.length === 0 && shares.length > 0) {
    console.warn(
      `[shares] User "${username}" matched 0 of ${shares.length} share(s). ` +
        `login="${username}" groups=[${userGroups.join(',') || 'none'}]`,
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
