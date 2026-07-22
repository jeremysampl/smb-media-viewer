/** Limit how many async tasks run at once (shared across callers). */
export function createSemaphore(limit: number) {
  const max = Math.max(1, Math.floor(limit));
  let active = 0;
  const waiters: Array<() => void> = [];

  async function acquire(): Promise<void> {
    if (active < max) {
      active += 1;
      return;
    }
    await new Promise<void>((resolve) => {
      waiters.push(() => {
        active += 1;
        resolve();
      });
    });
  }

  function release(): void {
    active = Math.max(0, active - 1);
    const next = waiters.shift();
    if (next) next();
  }

  return {
    get active() {
      return active;
    },
    get pending() {
      return waiters.length;
    },
    async run<T>(fn: () => Promise<T>): Promise<T> {
      await acquire();
      try {
        return await fn();
      } finally {
        release();
      }
    },
  };
}

/** Run async work over items with a fixed concurrency limit. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];

  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index], index);
    }
  }

  const workerCount = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
