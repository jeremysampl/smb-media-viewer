import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Direct-play rules for Full quality.
 * Cast is more permissive than the browser lightbox (Chromecast handles HEVC/AC-3
 * more often than desktop Chrome).
 */
export type DirectPlayTarget = 'browser' | 'cast';

export type DirectPlayAssessment = {
  ok: boolean;
  contentType: string;
  reason: string;
};

interface ProbeStream {
  codec_type?: string;
  codec_name?: string;
  codec_tag_string?: string;
}

interface ProbeResult {
  format?: { format_name?: string };
  streams?: ProbeStream[];
}

const playabilityCache = new Map<
  string,
  { mtimeMs: number; assessment: DirectPlayAssessment }
>();

const MP4_FORMAT_TOKENS = new Set([
  'mp4',
  'm4v',
  'mov',
  'isom',
  'iso2',
  'iso3',
  'iso4',
  'iso5',
  'iso6',
  'mp41',
  'mp42',
  'mp71',
  'qt',
  'quicktime',
  '3gp',
  '3g2',
]);

const BROWSER_VIDEO = new Set(['h264', 'vp8', 'vp9', 'av1', 'mpeg4']);
const CAST_VIDEO = new Set(['h264', 'hevc', 'h265', 'vp8', 'vp9', 'av1', 'mpeg4']);

const BROWSER_AUDIO = new Set(['aac', 'mp3', 'opus', 'vorbis', 'flac', 'mp2']);
const CAST_AUDIO = new Set(['aac', 'mp3', 'opus', 'vorbis', 'flac', 'mp2', 'ac3', 'eac3']);

function extensionHint(sourcePath: string): string {
  return path.extname(sourcePath).toLowerCase();
}

function contentTypeForPath(sourcePath: string, formatName?: string): string {
  const ext = extensionHint(sourcePath);
  const tokens = (formatName ?? '')
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  if (ext === '.webm' || tokens.includes('webm')) return 'video/webm';
  return 'video/mp4';
}

type ContainerKind = 'mp4' | 'webm' | null;

function detectContainer(
  formatName: string | undefined,
  ext: string,
): ContainerKind {
  const tokens = (formatName ?? '')
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);

  if (
    tokens.some((token) =>
      ['avi', 'flv', 'asf', 'wmv', 'mpegts', 'mpegvideo', 'rm', 'rmvb', 'ogg', 'ogv'].includes(
        token,
      ),
    )
  ) {
    if (!tokens.includes('matroska') && !tokens.includes('webm')) return null;
  }

  if (tokens.includes('webm') || ext === '.webm') return 'webm';
  // Plain MKV without webm; unreliable in browser/Cast
  if (tokens.includes('matroska') && !tokens.includes('webm')) return null;

  if (tokens.some((token) => MP4_FORMAT_TOKENS.has(token))) return 'mp4';
  if (ext === '.mp4' || ext === '.m4v' || ext === '.mov' || ext === '.3gp') return 'mp4';

  return null;
}

function hasPlayableAudio(
  streams: ProbeStream[] | undefined,
  allowed: Set<string>,
): { ok: boolean; codec?: string } {
  const audioStreams = (streams ?? []).filter((stream) => stream.codec_type === 'audio');
  if (audioStreams.length === 0) return { ok: true };

  for (const stream of audioStreams) {
    const codec = stream.codec_name?.toLowerCase();
    if (codec && allowed.has(codec)) {
      return { ok: true, codec };
    }
  }

  return {
    ok: false,
    codec: audioStreams[0]?.codec_name,
  };
}

export function assessProbeForDirectPlay(
  probe: ProbeResult,
  sourcePath: string,
  target: DirectPlayTarget = 'browser',
): DirectPlayAssessment {
  const ext = extensionHint(sourcePath);
  const container = detectContainer(probe.format?.format_name, ext);
  const contentType = contentTypeForPath(sourcePath, probe.format?.format_name);
  const allowedVideo = target === 'cast' ? CAST_VIDEO : BROWSER_VIDEO;
  const allowedAudio = target === 'cast' ? CAST_AUDIO : BROWSER_AUDIO;

  if (!container) {
    const label = probe.format?.format_name || ext || 'unknown';
    return {
      ok: false,
      contentType,
      reason: `container ${label}`,
    };
  }

  const videoStream = probe.streams?.find((stream) => stream.codec_type === 'video');
  if (!videoStream?.codec_name) {
    return { ok: false, contentType, reason: 'missing video stream' };
  }
  const videoCodec = videoStream.codec_name.toLowerCase();
  if (!allowedVideo.has(videoCodec)) {
    return {
      ok: false,
      contentType,
      reason: `video codec ${videoStream.codec_name}`,
    };
  }

  const audio = hasPlayableAudio(probe.streams, allowedAudio);
  if (!audio.ok) {
    return {
      ok: false,
      contentType,
      reason: `audio codec ${audio.codec ?? 'unknown'}`,
    };
  }

  return {
    ok: true,
    contentType,
    reason: `${videoCodec}+${audio.codec ?? 'silent'} ${container}`,
  };
}

function runFfprobeJson(sourcePath: string): Promise<ProbeResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'ffprobe',
      [
        '-v',
        'quiet',
        '-print_format',
        'json',
        '-show_entries',
        'format=format_name:stream=index,codec_type,codec_name,codec_tag_string',
        '-of',
        'json',
        sourcePath,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );

    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `ffprobe exited with code ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout) as ProbeResult);
      } catch (error) {
        reject(error);
      }
    });
  });
}

function cacheKey(sourcePath: string, target: DirectPlayTarget): string {
  return `${target}:${sourcePath}`;
}

/** Probe whether Full quality can stream the original without remux/transcode. */
export async function assessDirectPlayVideo(
  sourcePath: string,
  target: DirectPlayTarget = 'browser',
): Promise<DirectPlayAssessment> {
  let mtimeMs = 0;
  try {
    mtimeMs = (await fs.stat(sourcePath)).mtimeMs;
  } catch {
    return { ok: false, contentType: 'video/mp4', reason: 'stat failed' };
  }

  const key = cacheKey(sourcePath, target);
  const cached = playabilityCache.get(key);
  if (cached && cached.mtimeMs === mtimeMs) {
    return cached.assessment;
  }

  try {
    const probe = await runFfprobeJson(sourcePath);
    const assessment = assessProbeForDirectPlay(probe, sourcePath, target);
    playabilityCache.set(key, { mtimeMs, assessment });
    return assessment;
  } catch {
    const assessment: DirectPlayAssessment = {
      ok: false,
      contentType: 'video/mp4',
      reason: 'probe failed',
    };
    playabilityCache.set(key, { mtimeMs, assessment });
    return assessment;
  }
}
