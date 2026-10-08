/** The limits are "per minute", so the window every bucket slides over is a minute wide. */
const WINDOW_MS = 60_000;

class SlidingWindow {
  private readonly hits: number[] = [];

  constructor(private readonly limit: number) {}

  /** Drops timestamps that have aged out. Kept cheap: the hits are already in order. */
  private prune(now: number): void {
    const cutoff = now - WINDOW_MS;
    let stale = 0;
    while (stale < this.hits.length && this.hits[stale]! <= cutoff) {
      stale += 1;
    }

    if (stale > 0) {
      this.hits.splice(0, stale);
    }
  }

  isFull(now: number): boolean {
    this.prune(now);
    return this.hits.length >= this.limit;
  }

  record(now: number): void {
    this.hits.push(now);
  }

  /** How long until the oldest hit ages out and a slot frees up. */
  retryAfterMs(now: number): number {
    const oldest = this.hits[0];
    return oldest === undefined ? 0 : Math.max(0, oldest + WINDOW_MS - now);
  }

  /** True once the bucket has been quiet for a full window and can be forgotten. */
  isIdle(now: number): boolean {
    this.prune(now);
    return this.hits.length === 0;
  }
}

type RateLimitResult = | { allowed: true } | { allowed: false; scope: 'user' | 'global'; retryAfterMs: number };

class RateLimiter {
  private readonly global: SlidingWindow;
  private readonly perUser = new Map<string, SlidingWindow>();
  private lastSweep = 0;

  constructor(
    maxRequests: number,
    private readonly maxRequestsPerUser: number,
  ) {
    this.global = new SlidingWindow(maxRequests);
  }

  /**
   * Consumes a slot for `userId`, or reports which limit stopped it. A rejected request
   * costs nothing, so being throttled never eats into the budget it was denied.
   *
   * The per-user limit is checked first: one person spamming should hear about it in a DM
   * instead of pushing the channel-wide notice out to everyone.
   */
  check(userId: string, now: number = Date.now()): RateLimitResult {
    this.sweep(now);

    const user = this.userWindow(userId);
    if (user.isFull(now)) {
      return { allowed: false, scope: 'user', retryAfterMs: user.retryAfterMs(now) };
    }
    else if (this.global.isFull(now)) {
      return { allowed: false, scope: 'global', retryAfterMs: this.global.retryAfterMs(now) };
    }

    user.record(now);
    this.global.record(now);
    return { allowed: true };
  }

  private userWindow(userId: string): SlidingWindow {
    let window = this.perUser.get(userId);
    if (!window) {
      window = new SlidingWindow(this.maxRequestsPerUser);
      this.perUser.set(userId, window);
    }
    
    return window;
  }

  /** Without this the per-user map would grow by one entry per person, forever. */
  private sweep(now: number): void {
    if (now - this.lastSweep < WINDOW_MS) {
      return;
    }
    
    this.lastSweep = now;
    for (const [userId, window] of this.perUser) {
      if (window.isIdle(now)) {
        this.perUser.delete(userId);
      }
    }
  }
}

export { RateLimiter };
