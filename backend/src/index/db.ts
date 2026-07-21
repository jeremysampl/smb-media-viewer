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
        thumb_key = excluded.thumb_key,
        capture_time = excluded.capture_time,
        duration = excluded.duration,
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
