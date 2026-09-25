import { createContext, useContext } from 'react';
import type { CastMode } from './types';

export interface OpenSetupOptions {
  paths?: string[];
  append?: boolean;
}

export interface CastContextValue {
  ready: boolean;
  /** Why Cast is unavailable in this browser/page, if known. */
  unavailableReason: string | null;
  connected: boolean;
  mode: CastMode;
  /** Origin used in media URLs sent to the Cast device. */
  mediaOrigin: string;
  mediaOriginCandidates: string[];
  /** Show LAN media address field (localhost without CAST_PUBLIC_ORIGIN). */
  showMediaOriginField: boolean;
  setMediaOrigin: (origin: string) => void;
  openSetup: (options?: OpenSetupOptions) => Promise<void>;
  castManualSelection: (paths: string[], activePath: string) => Promise<void>;
}

export const CastContext = createContext<CastContextValue | null>(null);

export function useCast(): CastContextValue {
  const value = useContext(CastContext);
  if (!value) throw new Error('useCast must be used inside CastProvider');
  return value;
}
