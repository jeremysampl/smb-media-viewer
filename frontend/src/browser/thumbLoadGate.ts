/**
 * Soft cap on concurrent thumb HTTP fetches.
 * Backend INDEX_CONCURRENCY still limits Sharp/ffmpeg generation.
 * Visibility (IntersectionObserver) already limits who requests.
 */
const MAX_IN_FLIGHT = 16;

let active = 0;
const waiters: Array<() => void> = [];

function pump(): void {
  while (active < MAX_IN_FLIGHT && waiters.length > 0) {
    active += 1;
    const next = waiters.shift();
    next?.();
  }
}

/** Acquire a thumb-load slot; call the returned release when load finishes/cancels. */
export function acquireThumbSlot(): Promise<() => void> {
  return new Promise((resolve) => {
    const grant = () => {
      let released = false;
      resolve(() => {
        if (released) return;
        released = true;
        active = Math.max(0, active - 1);
        pump();
      });
    };

    if (active < MAX_IN_FLIGHT) {
      active += 1;
      grant();
      return;
    }

    waiters.push(grant);
  });
}
