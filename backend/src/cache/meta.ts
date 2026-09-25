import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from '../config.js';
import {
  getDisplayFileKind,
  isDisplayFileKind,
  type DisplayFileKind,
} from '../media/fileTypes.js';

export type CacheEntryKind = DisplayFileKind;

export interface CacheMetaRow {
  cachePath: string;
  sourcePath: string | null;
  kind: CacheEntryKind;
  quality: string | null;
  size: number;
  createdAt: number;
  lastAccessAt: number;
  accessCount: number;
}

let db: DatabaseSync | null = null;

function ensureCacheDir(): void {
  fs.mkdirSync(config.cacheDir, { recursive: true });
}

function getMetaDb(): DatabaseSync {
  if (db) return db;
  ensureCacheDir();
  const dbPath = path.join(config.cacheDir, 'cache-meta.db');
  db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    CREATE TABLE IF NOT EXISTS cache_entries (
      cache_path TEXT PRIMARY KEY,
      source_path TEXT,
      kind TEXT NOT NULL,
      quality TEXT,
      size INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      last_access_at INTEGER NOT NULL,
      access_count INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_cache_last_access
      ON cache_entries (last_access_at);
  `);
  return db;
}

function inferKindFromPath(cachePath: string): CacheEntryKind {
  const normalized = cachePath.replace(/\\/g, '/').toLowerCase();
  if (normalized.includes('/images/')) return 'image';
  if (normalized.includes('/videos/')) return 'video';
  if (normalized.includes('/office-pdf/')) return 'office';
  return getDisplayFileKind(cachePath);
}

export function registerCacheEntry(input: {
  cachePath: string;
  sourcePath: string;
  kind: CacheEntryKind;
  quality: string;
  size: number;
}): void {
  const database = getMetaDb();
  const now = Date.now();
  const cachePath = path.resolve(input.cachePath);
  database
    .prepare(
      `
      INSERT INTO cache_entries (
        cache_path, source_path, kind, quality, size,
        created_at, last_access_at, access_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0)
      ON CONFLICT(cache_path) DO UPDATE SET
        source_path = excluded.source_path,
        kind = excluded.kind,
        quality = excluded.quality,
        size = excluded.size
    `,
    )
    .run(
      cachePath,
      input.sourcePath,
      input.kind,
      input.quality,
      input.size,
      now,
      now,
    );
}

/** Bump open count / last access and touch mtime for LRU */
export function recordCacheAccess(cachePath: string): void {
  const resolved = path.resolve(cachePath);
  const now = Date.now();
  const database = getMetaDb();

  const updated = database
    .prepare(
      `
      UPDATE cache_entries
      SET last_access_at = ?, access_count = access_count + 1
      WHERE cache_path = ?
    `,
    )
    .run(now, resolved);

  if (updated.changes === 0) {
    let size = 0;
    try {
      size = fs.statSync(resolved).size;
    } catch {
      return;
    }
    database
      .prepare(
        `
        INSERT INTO cache_entries (
          cache_path, source_path, kind, quality, size,
          created_at, last_access_at, access_count
        ) VALUES (?, NULL, ?, NULL, ?, ?, ?, 1)
      `,
      )
      .run(resolved, inferKindFromPath(resolved), size, now, now);
  }

  try {
    const epochSeconds = now / 1000;
    fs.utimesSync(resolved, epochSeconds, epochSeconds);
  } catch {
    // ignore
  }
}

export function removeCacheEntries(cachePaths: string[]): void {
  if (cachePaths.length === 0) return;
  const database = getMetaDb();
  const stmt = database.prepare('DELETE FROM cache_entries WHERE cache_path = ?');
  for (const cachePath of cachePaths) {
    stmt.run(path.resolve(cachePath));
  }
}

const CACHE_SORT_COLUMNS: Record<string, string> = {
  lastAccessAt: 'last_access_at',
  createdAt: 'created_at',
  accessCount: 'access_count',
  size: 'size',
  kind: 'kind',
  quality: 'quality',
  label: 'source_path',
};

export interface CacheListQuery {
  page?: number;
  pageSize?: number;
  sort?: string;
  order?: 'asc' | 'desc';
  search?: string;
  kind?: string;
  folder?: string;
}

function normalizeFolderPrefix(folder: string): string {
  return folder.trim().replace(/\\/g, '/').replace(/\/+$/, '');
}

function folderMatchClause(
  column: string,
  folder: string,
): { sql: string; params: string[] } {
  const prefix = normalizeFolderPrefix(folder);
  const winPrefix = prefix.replace(/\//g, '\\');
  return {
    sql: `(
      ${column} = ? OR ${column} LIKE ?
      OR ${column} = ? OR ${column} LIKE ?
    )`,
    params: [prefix, `${prefix}/%`, winPrefix, `${winPrefix}\\%`],
  };
}

function buildCacheWhere(query: CacheListQuery): {
  whereSql: string;
  params: Array<string | number>;
} {
  const clauses: string[] = [];
  const params: Array<string | number> = [];

  if (query.kind && query.kind !== 'all' && isDisplayFileKind(query.kind)) {
    clauses.push('kind = ?');
    params.push(query.kind);
  }

  const folder = query.folder?.trim();
  if (folder) {
    const match = folderMatchClause("COALESCE(source_path, '')", folder);
    clauses.push(match.sql);
    params.push(...match.params);
  }

  const search = query.search?.trim();
  if (search) {
    clauses.push(
      "(source_path LIKE ? OR cache_path LIKE ? OR COALESCE(quality, '') LIKE ?)",
    );
    const like = `%${search}%`;
    params.push(like, like, like);
  }

  return {
    whereSql: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
    params,
  };
}

export function queryCacheEntries(query: CacheListQuery = {}): {
  entries: CacheMetaRow[];
  total: number;
  page: number;
  pageSize: number;
} {
  const database = getMetaDb();
  const page = Math.max(1, Math.floor(query.page ?? 1));
  const pageSize = Math.min(200, Math.max(10, Math.floor(query.pageSize ?? 50)));
  const sortCol = CACHE_SORT_COLUMNS[query.sort ?? ''] ?? 'last_access_at';
  const order = query.order === 'asc' ? 'ASC' : 'DESC';
  const { whereSql, params } = buildCacheWhere(query);

  const totalRow = database
    .prepare(`SELECT COUNT(*) AS count FROM cache_entries ${whereSql}`)
    .get(...params) as { count: number };
  const total = Number(totalRow.count ?? 0);
  const offset = (page - 1) * pageSize;

  const rows = database
    .prepare(
      `
      SELECT cache_path, source_path, kind, quality, size,
             created_at, last_access_at, access_count
      FROM cache_entries
      ${whereSql}
      ORDER BY ${sortCol} ${order}
      LIMIT ? OFFSET ?
    `,
    )
    .all(...params, pageSize, offset) as Array<{
    cache_path: string;
    source_path: string | null;
    kind: string;
    quality: string | null;
    size: number;
    created_at: number;
    last_access_at: number;
    access_count: number;
  }>;

  return {
    page,
    pageSize,
    total,
    entries: rows.map((row) => {
      const sourcePath = row.source_path;
      const kind: CacheEntryKind = isDisplayFileKind(row.kind)
        ? row.kind
        : getDisplayFileKind(sourcePath ?? row.cache_path);

      return {
        cachePath: row.cache_path,
        sourcePath,
        kind,
        quality: row.quality,
        size: row.size,
        createdAt: row.created_at,
        lastAccessAt: row.last_access_at,
        accessCount: row.access_count,
      };
    }),
  };
}

/** Parent folders of cached sources for the folder filter */
export function listCacheSourceFolders(limit = 200): string[] {
  const database = getMetaDb();
  const rows = database
    .prepare(
      `
      SELECT DISTINCT source_path AS source_path
      FROM cache_entries
      WHERE source_path IS NOT NULL AND source_path != ''
      ORDER BY source_path ASC
      LIMIT ?
    `,
    )
    .all(Math.max(1, limit)) as Array<{ source_path: string }>;

  const folders = new Set<string>();
  for (const row of rows) {
    const normalized = row.source_path.replace(/\\/g, '/');
    const idx = normalized.lastIndexOf('/');
    if (idx > 0) folders.add(normalized.slice(0, idx));
  }
  return [...folders].sort((a, b) => a.localeCompare(b)).slice(0, limit);
}

async function unlinkQuiet(filePath: string): Promise<boolean> {
  try {
    await fsp.unlink(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function clearCacheEntries(input: {
  mode: 'all' | 'ids' | 'folder';
  ids?: string[];
  folder?: string;
}): Promise<{ deleted: number }> {
  const database = getMetaDb();

  if (input.mode === 'all') {
    const rows = database
      .prepare('SELECT cache_path FROM cache_entries')
      .all() as Array<{ cache_path: string }>;
    let deleted = 0;
    for (const row of rows) {
      if (await unlinkQuiet(row.cache_path)) deleted += 1;
    }
    // Also wipe known cache subdirs (orphans not in meta)
    for (const sub of ['images', 'videos', 'office-pdf']) {
      const root = path.join(config.cacheDir, sub);
      try {
        await fsp.rm(root, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
    database.exec('DELETE FROM cache_entries');
    return { deleted: Math.max(deleted, rows.length) };
  }

  let paths: string[] = [];
  if (input.mode === 'ids') {
    paths = (input.ids ?? []).map((id) => path.resolve(id));
  } else if (input.mode === 'folder') {
    const folder = input.folder?.trim();
    if (!folder) return { deleted: 0 };
    const match = folderMatchClause("COALESCE(source_path, '')", folder);
    const rows = database
      .prepare(`SELECT cache_path FROM cache_entries WHERE ${match.sql}`)
      .all(...match.params) as Array<{ cache_path: string }>;
    paths = rows.map((row) => row.cache_path);
  }

  let deleted = 0;
  for (const cachePath of paths) {
    if (await unlinkQuiet(cachePath)) deleted += 1;
  }
  removeCacheEntries(paths);
  return { deleted };
}
