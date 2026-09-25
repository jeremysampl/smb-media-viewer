export interface CastSessionRecord {
  id: string;
  username: string;
  deviceName: string;
  mediaOrigin: string;
  itemCount: number;
  currentItem: string | null;
  startedAt: number;
  lastSeenAt: number;
  stopRequested: boolean;
}

const STALE_MS = 90_000;
const sessions = new Map<string, CastSessionRecord>();
let nextId = 1;

function pruneStale(now = Date.now()): void {
  for (const [id, session] of sessions) {
    if (now - session.lastSeenAt > STALE_MS) sessions.delete(id);
  }
}

export function createCastSession(input: {
  username: string;
  deviceName: string;
  mediaOrigin?: string;
  itemCount?: number;
  currentItem?: string | null;
}): CastSessionRecord {
  pruneStale();
  const now = Date.now();
  const session: CastSessionRecord = {
    id: String(nextId++),
    username: input.username,
    deviceName: input.deviceName.trim() || 'Cast device',
    mediaOrigin: input.mediaOrigin?.trim() || '',
    itemCount: Math.max(0, input.itemCount ?? 0),
    currentItem: input.currentItem ?? null,
    startedAt: now,
    lastSeenAt: now,
    stopRequested: false,
  };
  sessions.set(session.id, session);
  return session;
}

export function getCastSession(id: string): CastSessionRecord | undefined {
  pruneStale();
  return sessions.get(id);
}

export function touchCastSession(
  id: string,
  username: string,
  patch?: {
    deviceName?: string;
    mediaOrigin?: string;
    itemCount?: number;
    currentItem?: string | null;
  },
): CastSessionRecord | null {
  pruneStale();
  const session = sessions.get(id);
  if (!session || session.username !== username) return null;
  session.lastSeenAt = Date.now();
  if (patch?.deviceName !== undefined) {
    session.deviceName = patch.deviceName.trim() || session.deviceName;
  }
  if (patch?.mediaOrigin !== undefined) session.mediaOrigin = patch.mediaOrigin.trim();
  if (patch?.itemCount !== undefined) session.itemCount = Math.max(0, patch.itemCount);
  if (patch?.currentItem !== undefined) session.currentItem = patch.currentItem;
  return session;
}

export function endCastSession(id: string, username?: string): boolean {
  const session = sessions.get(id);
  if (!session) return false;
  if (username && session.username !== username) return false;
  sessions.delete(id);
  return true;
}

export function requestStopCastSessions(ids?: string[]): { stopped: number } {
  pruneStale();
  let stopped = 0;
  if (!ids || ids.length === 0) {
    for (const session of sessions.values()) {
      if (!session.stopRequested) {
        session.stopRequested = true;
        stopped += 1;
      }
    }
    return { stopped };
  }
  for (const id of ids) {
    const session = sessions.get(id);
    if (!session || session.stopRequested) continue;
    session.stopRequested = true;
    stopped += 1;
  }
  return { stopped };
}

export function listCastSessions(): CastSessionRecord[] {
  pruneStale();
  return [...sessions.values()].sort((a, b) => b.startedAt - a.startedAt);
}

export function isCastSessionAllowed(sessionId: string | undefined): boolean {
  if (!sessionId) return true;
  pruneStale();
  const session = sessions.get(sessionId);
  if (!session) return false;
  return !session.stopRequested;
}
