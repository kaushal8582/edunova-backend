/**
 * Minimal Redis stub for unit/integration tests.
 * Supports the subset of ioredis commands used by auth services.
 */
type Entry = { value: string; expiresAt?: number };

export class MemoryRedis {
  public status: 'wait' | 'ready' | 'end' = 'ready';
  private store = new Map<string, Entry>();

  on(_event: string, _handler: (...args: unknown[]) => void): this {
    return this;
  }

  async connect(): Promise<void> {
    this.status = 'ready';
  }

  async quit(): Promise<void> {
    this.status = 'end';
    this.store.clear();
  }

  disconnect(): void {
    this.status = 'end';
    this.store.clear();
  }

  private isExpired(entry: Entry): boolean {
    return entry.expiresAt != null && entry.expiresAt <= Date.now();
  }

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (this.isExpired(entry)) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, mode?: string, ttlSeconds?: number): Promise<'OK'> {
    let expiresAt: number | undefined;
    if (mode === 'EX' && typeof ttlSeconds === 'number') {
      expiresAt = Date.now() + ttlSeconds * 1000;
    }
    this.store.set(key, { value, expiresAt });
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    let count = 0;
    for (const key of keys) {
      if (this.store.delete(key)) count += 1;
    }
    return count;
  }

  async flushall(): Promise<'OK'> {
    this.store.clear();
    return 'OK';
  }
}
