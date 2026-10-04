import { describe, expect, it } from 'vitest';

import { RateLimiter } from '../src/rateLimit.js';

const MINUTE = 60_000;

describe('RateLimiter', () => {
  it('allows a user up to their limit, then tells them when a slot frees up', () => {
    const limiter = new RateLimiter(50, 2);

    expect(limiter.check('a', 0)).toEqual({ allowed: true });
    expect(limiter.check('a', 10_000)).toEqual({ allowed: true });
    expect(limiter.check('a', 20_000)).toEqual({ allowed: false, scope: 'user', retryAfterMs: 40_000 });
  });

  it('slides rather than resetting on a minute boundary', () => {
    const limiter = new RateLimiter(50, 2);
    limiter.check('a', 0);
    limiter.check('a', 30_000);

    expect(limiter.check('a', MINUTE - 1).allowed).toBe(false);
    expect(limiter.check('a', MINUTE).allowed).toBe(true);
    // The hit at 30s is still inside the window, alongside the one just made.
    expect(limiter.check('a', MINUTE + 1).allowed).toBe(false);
  });

  it('charges nothing for a refused request', () => {
    const limiter = new RateLimiter(50, 1);
    limiter.check('a', 0);

    expect(limiter.check('a', 30_000).allowed).toBe(false);
    expect(limiter.check('a', MINUTE).allowed).toBe(true);
  });

  it('keeps each user to their own budget', () => {
    const limiter = new RateLimiter(50, 1);
    limiter.check('a', 0);

    expect(limiter.check('b', 0).allowed).toBe(true);
  });

  it('caps everyone together at the bot-wide limit', () => {
    const limiter = new RateLimiter(2, 5);
    limiter.check('a', 0);
    limiter.check('b', 10_000);

    expect(limiter.check('c', 20_000)).toEqual({ allowed: false, scope: 'global', retryAfterMs: 40_000 });
  });

  // So the spammer hears about it in a DM rather than everyone seeing a channel-wide notice.
  it('reports the per-user limit ahead of the bot-wide one', () => {
    const limiter = new RateLimiter(2, 2);
    limiter.check('a', 0);
    limiter.check('a', 0);

    expect(limiter.check('a', 0)).toMatchObject({ allowed: false, scope: 'user' });
    expect(limiter.check('b', 0)).toMatchObject({ allowed: false, scope: 'global' });
  });

  it('forgets users who have been quiet for a full window', () => {
    const limiter = new RateLimiter(50, 5);
    limiter.check('a', 0);
    limiter.check('b', 0);

    expect(limiter['perUser'].size).toBe(2);

    limiter.check('c', MINUTE);

    expect([...limiter['perUser'].keys()]).toEqual(['c']);
  });
});
