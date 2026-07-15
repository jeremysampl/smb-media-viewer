import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pickVideoCaptureTime } from './captureTime.js';

export interface VideoMetadata {
  kind: 'video';
  filename: string;
  size: number;
  mtime: string;
  format?: string;
  duration?: number;
  dimensions?: { width: number; height: number };
  videoCodec?: string;
  audioCodec?: string;
  bitrate?: number;
  frameRate?: string;
  audioChannels?: number;
  audioSampleRate?: number;
  captureTime?: string;
  location?: {
    latitude: number;
    longitude: number;
    altitude?: number;
  };
}

interface FfprobeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  channels?: number;
  sample_rate?: string;
  tags?: Record<string, string>;
}

interface FfprobeResult {
  format?: {
    format_name?: string;
    duration?: string;
    bit_rate?: string;
    tags?: Record<string, string>;
  };
  streams?: FfprobeStream[];
}

function runFfprobe(sourcePath: string): Promise<FfprobeResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'ffprobe',
      [
        '-v',
        'quiet',
        '-print_format',
        'json',
        '-show_format',
        '-show_streams',
        sourcePath,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `ffprobe exited with code ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout) as FfprobeResult);
      } catch (error) {
        reject(error);
      }
    });
  });
}

function parseFrameRate(value?: string): string | undefined {
  if (!value || value === '0/0') return undefined;
  const [num, den] = value.split('/').map(Number);
  if (!num || !den) return value;
  return `${(num / den).toFixed(2)} fps`;
}

function parseGpsCoordinate(
  ref: string | undefined,
  values: string | undefined,
): number | undefined {
  if (!ref || !values) return undefined;
  const parts = values
    .replace(/,/g, ' ')
    .trim()
    .split(/\s+/)
    .map(Number)
    .filter((value) => !Number.isNaN(value));
  if (parts.length < 3) return undefined;
  const [degrees, minutes, seconds] = parts;
  let decimal = degrees + minutes / 60 + seconds / 3600;
  if (ref === 'S' || ref === 'W') decimal *= -1;
  return decimal;
}

export async function getVideoBrowseInfo(sourcePath: string): Promise<{
  duration?: number;
  captureTime?: string;
}> {
  return new Promise((resolve) => {
    const child = spawn(
      'ffprobe',
      [
        '-v',
        'quiet',
        '-print_format',
        'json',
        '-show_entries',
        'format=duration:format_tags:stream_tags',
        '-of',
        'json',
        sourcePath,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );

    let stdout = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.on('error', () => resolve({}));
    child.on('close', () => {
      try {
        const parsed = JSON.parse(stdout) as {
          format?: { duration?: string; tags?: Record<string, string> };
          streams?: Array<{ tags?: Record<string, string> }>;
        };
        const duration = parsed.format?.duration
          ? Number(parsed.format.duration)
          : undefined;
        const streamTags = (parsed.streams ?? []).map((stream) => stream.tags);
        resolve({
          duration: Number.isFinite(duration) ? duration : undefined,
          captureTime: pickVideoCaptureTime(parsed.format?.tags, ...streamTags),
        });
      } catch {
        resolve({});
      }
    });
  });
}

export async function getVideoDuration(sourcePath: string): Promise<number | undefined> {
  const info = await getVideoBrowseInfo(sourcePath);
  return info.duration;
}

export async function getVideoMetadata(sourcePath: string): Promise<VideoMetadata> {
  const stats = await fs.stat(sourcePath);
  const filename = path.basename(sourcePath);
  const probe = await runFfprobe(sourcePath);

  const videoStream = probe.streams?.find((stream) => stream.codec_type === 'video');
  const audioStream = probe.streams?.find((stream) => stream.codec_type === 'audio');
  const tags = probe.format?.tags;
  const streamTags = (probe.streams ?? []).map((stream) => stream.tags);

  const metadata: VideoMetadata = {
    kind: 'video',
    filename,
    size: stats.size,
    mtime: stats.mtime.toISOString(),
    format: probe.format?.format_name,
    duration: probe.format?.duration ? Number(probe.format.duration) : undefined,
    bitrate: probe.format?.bit_rate ? Number(probe.format.bit_rate) : undefined,
    videoCodec: videoStream?.codec_name,
    audioCodec: audioStream?.codec_name,
    frameRate: parseFrameRate(videoStream?.r_frame_rate),
    audioChannels: audioStream?.channels,
    audioSampleRate: audioStream?.sample_rate
      ? Number(audioStream.sample_rate)
      : undefined,
    captureTime: pickVideoCaptureTime(tags, ...streamTags),
  };

  if (videoStream?.width && videoStream.height) {
    metadata.dimensions = {
      width: videoStream.width,
      height: videoStream.height,
    };
  }

  const latitude = parseGpsCoordinate(tags?.GPSLatitudeRef, tags?.GPSLatitude);
  const longitude = parseGpsCoordinate(tags?.GPSLongitudeRef, tags?.GPSLongitude);
  if (latitude !== undefined && longitude !== undefined) {
    metadata.location = { latitude, longitude };
  } else {
    const iso6709 = tags?.['com.apple.quicktime.location.ISO6709'];
    if (iso6709) {
      const match = /([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)/.exec(iso6709);
      if (match) {
        metadata.location = {
          latitude: Number(match[1]),
          longitude: Number(match[2]),
        };
      }
    }
  }

  return metadata;
}
