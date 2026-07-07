import type { QualityTier } from '../types.js';

export interface QualityProfile {
  id: QualityTier;
  label: string;
  imageMaxDimension: number | null;
  videoHeight: number | null;
}

export const QUALITY_PROFILES: QualityProfile[] = [
  { id: 'very_low', label: 'Very Low', imageMaxDimension: 320, videoHeight: 240 },
  { id: 'low', label: 'Low', imageMaxDimension: 640, videoHeight: 480 },
  { id: 'medium', label: 'Medium', imageMaxDimension: 1280, videoHeight: 720 },
  { id: 'high', label: 'High', imageMaxDimension: 1920, videoHeight: 1080 },
  { id: 'very_high', label: 'Very High', imageMaxDimension: 2560, videoHeight: 1440 },
  { id: 'full', label: 'Full', imageMaxDimension: null, videoHeight: null },
];

export function isQualityTier(value: string): value is QualityTier {
  return QUALITY_PROFILES.some((profile) => profile.id === value);
}

export function getQualityProfile(quality: QualityTier): QualityProfile {
  const profile = QUALITY_PROFILES.find((item) => item.id === quality);
  if (!profile) {
    throw new Error(`Unknown quality tier: ${quality}`);
  }
  return profile;
}
