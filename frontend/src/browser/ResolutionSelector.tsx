import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { getQualityProfiles } from '../api/client';
import type { QualityProfile, QualityTier } from '../types';

const STORAGE_KEY = 'smb-media-quality';

interface QualityPreferenceValue {
  quality: QualityTier;
  setQuality: (quality: QualityTier) => void;
  profiles: QualityProfile[];
}

const QualityPreferenceContext = createContext<QualityPreferenceValue | null>(null);

export function QualityPreferenceProvider({ children }: { children: ReactNode }) {
  const [profiles, setProfiles] = useState<QualityProfile[]>([]);
  const [quality, setQualityState] = useState<QualityTier>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return (stored as QualityTier) || 'medium';
  });

  useEffect(() => {
    getQualityProfiles()
      .then((result) => setProfiles(result.profiles))
      .catch(() => undefined);
  }, []);

  const setQuality = useCallback((next: QualityTier) => {
    setQualityState(next);
    localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const value = useMemo(
    () => ({ quality, setQuality, profiles }),
    [quality, setQuality, profiles],
  );

  return (
    <QualityPreferenceContext.Provider value={value}>
      {children}
    </QualityPreferenceContext.Provider>
  );
}

export function useQualityPreference(): QualityPreferenceValue {
  const value = useContext(QualityPreferenceContext);
  if (!value) {
    throw new Error('useQualityPreference must be used within QualityPreferenceProvider');
  }
  return value;
}

interface ResolutionSelectorProps {
  quality: QualityTier;
  profiles: QualityProfile[];
  onChange: (quality: QualityTier) => void;
  compact?: boolean;
}

export function ResolutionSelector({
  quality,
  profiles,
  onChange,
  compact = false,
}: ResolutionSelectorProps) {
  return (
    <label className={`resolution-selector ${compact ? 'compact' : ''}`}>
      <span>Quality</span>
      <select value={quality} onChange={(event) => onChange(event.target.value as QualityTier)}>
        {profiles.map((profile) => (
          <option key={profile.id} value={profile.id}>
            {profile.label}
          </option>
        ))}
      </select>
    </label>
  );
}
