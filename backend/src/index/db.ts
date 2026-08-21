import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from '../config.js';

export interface MediaIndexRow {
  absolutePath: string;
  mtimeMs: number;
  size: number;
  kind: 'image' | 'video';
  thumbKey: string | null;
  captureTime: string | null;
  duration: number | null;
}

let db: DatabaseSync | null = null;

function ensureIndexDir(): void {
  fs.mkdirSync(config.indexDir, { recursive: true });
  fs.mkdirSync(path.join(config.indexDir, 'thumbs'), { recursive: true });
}

export function getIndexDb(): DatabaseSync {
  if (db) return db;

  ensureIndexDir();
  const dbPath = path.join(config.indexDir, 'media.db');
  db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    CREATE TABLE IF NOT EXISTS media_index (
      absolute_path TEXT PRIMARY KEY,
      mtime_ms REAL NOT NULL,
      size INTEGER NOT NULL,
      kind TEXT NOT NULL,
      thumb_key TEXT,
      capture_time TEXT,
      duration REAL,
      indexed_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_media_index_mtime
      ON media_index (mtime_ms);
  `);

  return db;
}

export function getMediaIndexRows(
  absolutePaths: string[],
): Map<string, MediaIndexRow> {
  const result = new Map<string, MediaIndexRow>();
  if (absolutePaths.length === 0) return result;

  const database = getIndexDb();
  const stmt = database.prepare(`
    SELECT absolute_path, mtime_ms, size, kind, thumb_key, capture_time, duration
    FROM media_index
    WHERE absolute_path = ?
  `);

  for (const absolutePath of absolutePaths) {
    const row = stmt.get(absolutePath) as
      | {
          absolute_path: string;
          mtime_ms: number;
          size: number;
          kind: 'image' | 'video';
          thumb_key: string | null;
          capture_time: string | null;
          duration: number | null;
        }
      | undefined;

    if (!row) continue;
    result.set(absolutePath, {
      absolutePath: row.absolute_path,
      mtimeMs: row.mtime_ms,
      size: row.size,
      kind: row.kind,
      thumbKey: row.thumb_key,
      captureTime: row.capture_time,
      duration: row.duration,
    });
  }

  return result;
}

export function upsertMediaIndexRow(row: {
  absolutePath: string;
  mtimeMs: number;
  size: number;
  kind: 'image' | 'video';
  thumbKey: string | null;
  captureTime: string | null;
  duration: number | null;
}): void {
  const database = getIndexDb();
  database
    .prepare(
      `
      INSERT INTO media_index (
        absolute_path, mtime_ms, size, kind, thumb_key, capture_time, duration, indexed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(absolute_path) DO UPDATE SET
        mtime_ms = excluded.mtime_ms,
        size = excluded.size,
        kind = excluded.kind,
        thumb_key = COALESCE(excluded.thumb_key, media_index.thumb_key),
        capture_time = COALESCE(excluded.capture_time, media_index.capture_time),
        duration = COALESCE(excluded.duration, media_index.duration),
        indexed_at = excluded.indexed_at
    `,
    )
    .run(
      row.absolutePath,
      row.mtimeMs,
      row.size,
      row.kind,
      row.thumbKey,
      row.captureTime,
      row.duration,
      Date.now(),
    );
}

export function getThumbPath(thumbKey: string): string {
  return path.join(config.indexDir, 'thumbs', `${thumbKey}.webp`);
}

export function getMediaIndexCount(): number {
  const database = getIndexDb();
  const row = database.prepare('SELECT COUNT(*) AS count FROM media_index').get() as
    | { count: number }
    | undefined;
  return Number(row?.count ?? 0);
}

export function getMediaIndexRow(absolutePath: string): MediaIndexRow | null {
  const rows = getMediaIndexRows([absolutePath]);
  return rows.get(absolutePath) ?? null;
}

export interface MediaIndexListRow extends MediaIndexRow {
  indexedAt: number;
}

const INDEX_SORT_COLUMNS: Record<string, string> = {
  indexedAt: 'indexed_at',
  size: 'size',
  kind: 'kind',
  mtimeMs: 'mtime_ms',
  duration: 'duration',
  label: 'absolute_path',
  thumb: 'thumb_key',
};

export interface IndexListQuery {
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

function buildIndexWhere(query: IndexListQuery): {
  whereSql: string;
  params: Array<string | number>;
} {
  const clauses: string[] = [];
  const params: Array<string | number> = [];

  if (query.kind === 'image' || query.kind === 'video') {
    clauses.push('kind = ?');
    params.push(query.kind);
  }

  const folder = query.folder?.trim();
  if (folder) {
    const match = folderMatchClause('absolute_path', folder);
    clauses.push(match.sql);
    params.push(...match.params);
  }

  const search = query.search?.trim();
  if (search) {
    clauses.push('absolute_path LIKE ?');
    params.push(`%${search}%`);
  }

  return {
    whereSql: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
    params,
  };
}

export function queryMediaIndexEntries(query: IndexListQuery = {}): {
  entries: MediaIndexListRow[];
  total: number;
  page: number;
  pageSize: number;
} {
  const database = getIndexDb();
  const page = Math.max(1, Math.floor(query.page ?? 1));
  const pageSize = Math.min(200, Math.max(10, Math.floor(query.pageSize ?? 50)));
  const sortCol = INDEX_SORT_COLUMNS[query.sort ?? ''] ?? 'indexed_at';
  const order = query.order === 'asc' ? 'ASC' : 'DESC';
  const { whereSql, params } = buildIndexWhere(query);

  const totalRow = database
    .prepare(`SELECT COUNT(*) AS count FROM media_index ${whereSql}`)
    .get(...params) as { count: number };
  const total = Number(totalRow.count ?? 0);
  const offset = (page - 1) * pageSize;

  const rows = database
    .prepare(
      `
      SELECT absolute_path, mtime_ms, size, kind, thumb_key, capture_time, duration, indexed_at
      FROM media_index
      ${whereSql}
      ORDER BY ${sortCol} ${order}
      LIMIT ? OFFSET ?
    `,
    )
    .all(...params, pageSize, offset) as Array<{
    absolute_path: string;
    mtime_ms: number;
    size: number;
    kind: 'image' | 'video';
    thumb_key: string | null;
    capture_time: string | null;
    duration: number | null;
    indexed_at: number;
  }>;

  return {
    page,
    pageSize,
    total,
    entries: rows.map((row) => ({
      absolutePath: row.absolute_path,
      mtimeMs: row.mtime_ms,
      size: row.size,
      kind: row.kind,
      thumbKey: row.thumb_key,
      captureTime: row.capture_time,
      duration: row.duration,
      indexedAt: row.indexed_at,
    })),
  };
}

export function listIndexSourceFolders(limit = 200): string[] {
  const database = getIndexDb();
  const rows = database
    .prepare(
      `
      SELECT absolute_path
      FROM media_index
      ORDER BY absolute_path ASC
      LIMIT ?
    `,
    )
    .all(Math.max(1, limit * 20)) as Array<{ absolute_path: string }>;

  const folders = new Set<string>();
  for (const row of rows) {
    const normalized = row.absolute_path.replace(/\\/g, '/');
    const idx = normalized.lastIndexOf('/');
    if (idx > 0) folders.add(normalized.slice(0, idx));
    if (folders.size >= limit) break;
  }
  return [...folders].sort((a, b) => a.localeCompare(b));
}

export function clearMediaIndexEntries(input: {
  mode: 'all' | 'ids' | 'folder';
  ids?: string[];
  folder?: string;
}): { deleted: number } {
  const database = getIndexDb();

  if (input.mode === 'all') {
    const rows = database
      .prepare('SELECT thumb_key FROM media_index WHERE thumb_key IS NOT NULL')
      .all() as Array<{ thumb_key: string }>;
    for (const row of rows) {
      try {
        fs.unlinkSync(getThumbPath(row.thumb_key));
      } catch {
        // ignore
      }
    }
    const result = database.prepare('DELETE FROM media_index').run();
    try {
      fs.rmSync(path.join(config.indexDir, 'thumbs'), {
        recursive: true,
        force: true,
      });
      fs.mkdirSync(path.join(config.indexDir, 'thumbs'), { recursive: true });
    } catch {
      // ignore
    }
    return { deleted: Number(result.changes ?? 0) };
  }

  let paths: string[] = [];
  if (input.mode === 'ids') {
    paths = input.ids ?? [];
  } else if (input.mode === 'folder') {
    const folder = input.folder?.trim();
    if (!folder) return { deleted: 0 };
    const match = folderMatchClause('absolute_path', folder);
    const rows = database
      .prepare(`SELECT absolute_path FROM media_index WHERE ${match.sql}`)
      .all(...match.params) as Array<{ absolute_path: string }>;
    paths = rows.map((row) => row.absolute_path);
  }

  if (paths.length === 0) return { deleted: 0 };

  const selectThumb = database.prepare(
    'SELECT thumb_key FROM media_index WHERE absolute_path = ?',
  );
  const deleteRow = database.prepare(
    'DELETE FROM media_index WHERE absolute_path = ?',
  );
  let deleted = 0;
  for (const absolutePath of paths) {
    const row = selectThumb.get(absolutePath) as
      | { thumb_key: string | null }
      | undefined;
    if (row?.thumb_key) {
      try {
        fs.unlinkSync(getThumbPath(row.thumb_key));
      } catch {
        // ignore
      }
    }
    const result = deleteRow.run(absolutePath);
    deleted += Number(result.changes ?? 0);
  }
  return { deleted };
}
