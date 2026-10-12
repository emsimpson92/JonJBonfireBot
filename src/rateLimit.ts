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

type Scope = 'user' | 'server' | 'global';

type RateLimitResult = | { allowed: true } | { allowed: false; scope: Scope; retryAfterMs: number };

interface Limits {
  global: number;
  perServer: number;
  perUser: number;
}

function windowFor(windows: Map<string, SlidingWindow>, rateIdentifier: string, limit: number): SlidingWindow {
  let window = windows.get(rateIdentifier);
  if (!window) {
    window = new SlidingWindow(limit);
    windows.set(rateIdentifier, window);
  }

  return window;
}

class RateLimiter {
  private readonly global: SlidingWindow;
  private readonly perServer = new Map<string, SlidingWindow>();
  private readonly perUser = new Map<string, SlidingWindow>();
  private lastSweep = 0;

  constructor(private readonly limits: Limits) {
    this.global = new SlidingWindow(limits.global);
  }

  check(userId: string, serverId: string | null, now: number = Date.now()): RateLimitResult {
    this.sweep(now);

    const windows: { scope: Scope; window: SlidingWindow }[] = [
      { scope: 'user', window: windowFor(this.perUser, userId, this.limits.perUser) },
      ...(serverId ? [{ scope: 'server' as const, window: windowFor(this.perServer, serverId, this.limits.perServer) }] : []),
      { scope: 'global', window: this.global },
    ];

    const full = windows.find(({ window }) => window.isFull(now));
    if (full) {
      return { allowed: false, scope: full.scope, retryAfterMs: full.window.retryAfterMs(now) };
    }

    for (const { window } of windows) {
      window.record(now);
    }

    return { allowed: true };
  }

  /** Without this the per-user and per-server maps would grow by one entry per person and server, forever. */
  private sweep(now: number): void {
    if (now - this.lastSweep < WINDOW_MS) {
      return;
    }

    this.lastSweep = now;
    for (const windows of [this.perUser, this.perServer]) {
      for (const [key, window] of windows) {
        if (window.isIdle(now)) {
          windows.delete(key);
        }
      }
    }
  }
}

/** Lets each key through at most once per cooldown, e.g. one public notice per server per minute. */
class Cooldown {
  private readonly readyAt = new Map<string, number>();
  private lastSweep = 0;

  assign(key: string, ms: number, now: number = Date.now()): boolean {
    this.sweep(now);
    if ((this.readyAt.get(key) ?? 0) > now) {
      return false;
    }

    this.readyAt.set(key, now + ms);
    return true;
  }

  private sweep(now: number): void {
    if (now - this.lastSweep < WINDOW_MS) {
      return;
    }

    this.lastSweep = now;
    for (const [key, readyAt] of this.readyAt) {
      if (readyAt <= now) {
        this.readyAt.delete(key);
      }
    }
  }
}

export { Cooldown, RateLimiter };
