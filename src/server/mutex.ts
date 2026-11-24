export class AsyncKeyMutex {
  private readonly queues = new Map<string, Promise<void>>();

  async runExclusive<T>(key: string, fn: () => Promise<T> | T): Promise<T> {
    const previous = this.queues.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });

    const tail = previous.then(() => current, () => current);
    this.queues.set(key, tail);

    await previous.catch(() => undefined);
    try {
      return await fn();
    } finally {
      release();
      if (this.queues.get(key) === tail) {
        this.queues.delete(key);
      }
    }
  }
}

export const storeMutex = new AsyncKeyMutex();
