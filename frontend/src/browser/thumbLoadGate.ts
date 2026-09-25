// Soft cap on concurrent thumb fetches. Backend INDEX_CONCURRENCY still limits generation.
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

/** Take a slot; call the returned fn when the load finishes or cancels. */
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
