import { useEffect, useState } from 'react';
import { fetchVideoStatus } from '../api/client';

export type VideoPrepareState = {
  /** False until the first status response; avoids a loader flash for cached videos */
  known: boolean;
  ready: boolean;
  processing: boolean;
  progress: number | null;
};

const IDLE: VideoPrepareState = {
  known: false,
  ready: false,
  processing: false,
  progress: null,
};

/**
 * Polls video-status and starts a prepare when needed.
 * Ready/cached videos never flip processing to true.
 */
export function useVideoPrepareStatus(
  token: string | undefined,
  quality: string,
  enabled: boolean,
): VideoPrepareState {
  const [state, setState] = useState<VideoPrepareState>(IDLE);

  useEffect(() => {
    if (!enabled || !token) {
      setState(IDLE);
      return undefined;
    }

    let cancelled = false;
    let timer: number | undefined;
    setState(IDLE);

    const poll = async (prepare: boolean) => {
      try {
        const status = await fetchVideoStatus(token, quality, {
          prepare,
          signal: undefined,
        });
        if (cancelled) return;

        if (status.state === 'ready') {
          setState({
            known: true,
            ready: true,
            processing: false,
            progress: 1,
          });
          return;
        }

        setState({
          known: true,
          ready: false,
          processing: true,
          progress: status.progress,
        });
        timer = window.setTimeout(() => {
          void poll(false);
        }, 500);
      } catch {
        if (cancelled) return;
        setState({
          known: true,
          ready: false,
          processing: true,
          progress: null,
        });
        timer = window.setTimeout(() => {
          void poll(true);
        }, 1200);
      }
    };

    void poll(true);

    return () => {
      cancelled = true;
      if (timer != null) window.clearTimeout(timer);
    };
  }, [token, quality, enabled]);

  return state;
}
