import { describe, expect, it } from 'vitest';

import { RateLimiter } from '../src/rateLimit.js';

const MINUTE = 60_000;

describe('RateLimiter', () => {
  it('allows a user up to their limit, then tells them when a slot frees up', () => {
    const limiter = new RateLimiter({ global: 50, perServer: 50, perUser: 2 });

    expect(limiter.check('a', 's', 0)).toEqual({ allowed: true });
    expect(limiter.check('a', 's', 10_000)).toEqual({ allowed: true });
    expect(limiter.check('a', 's', 20_000)).toEqual({ allowed: false, scope: 'user', retryAfterMs: 40_000 });
  });

  it('slides rather than resetting on a minute boundary', () => {
    const limiter = new RateLimiter({ global: 50, perServer: 50, perUser: 2 });
    limiter.check('a', 's', 0);
    limiter.check('a', 's', 30_000);

    expect(limiter.check('a', 's', MINUTE - 1).allowed).toBe(false);
    expect(limiter.check('a', 's', MINUTE).allowed).toBe(true);
    // The hit at 30s is still inside the window, alongside the one just made.
    expect(limiter.check('a', 's', MINUTE + 1).allowed).toBe(false);
  });

  it('charges nothing for a refused request', () => {
    const limiter = new RateLimiter({ global: 50, perServer: 50, perUser: 1 });
    limiter.check('a', 's', 0);

    expect(limiter.check('a', 's', 30_000).allowed).toBe(false);
    expect(limiter.check('a', 's', MINUTE).allowed).toBe(true);
  });

  it('keeps each user to their own budget', () => {
    const limiter = new RateLimiter({ global: 50, perServer: 50, perUser: 1 });
    limiter.check('a', 's', 0);

    expect(limiter.check('b', 's', 0).allowed).toBe(true);
  });

  // A person is the same person in every server.
  it('counts one user across every server', () => {
    const limiter = new RateLimiter({ global: 50, perServer: 50, perUser: 1 });
    limiter.check('a', 's', 0);

    expect(limiter.check('a', 't', 0)).toMatchObject({ allowed: false, scope: 'user' });
  });

  it('caps everyone in a server together at the server limit', () => {
    const limiter = new RateLimiter({ global: 50, perServer: 2, perUser: 5 });
    limiter.check('a', 's', 0);
    limiter.check('b', 's', 10_000);

    expect(limiter.check('c', 's', 20_000)).toEqual({ allowed: false, scope: 'server', retryAfterMs: 40_000 });
  });

  it('keeps each server to its own budget', () => {
    const limiter = new RateLimiter({ global: 50, perServer: 1, perUser: 5 });
    limiter.check('a', 's', 0);

    expect(limiter.check('b', 't', 0).allowed).toBe(true);
  });

  it('counts DMs toward no server', () => {
    const limiter = new RateLimiter({ global: 50, perServer: 1, perUser: 5 });
    limiter.check('a', null, 0);

    expect(limiter.check('b', null, 0).allowed).toBe(true);
    expect(limiter['perServer'].size).toBe(0);
  });

  it('caps every server and DM together at the bot-wide limit', () => {
    const limiter = new RateLimiter({ global: 2, perServer: 5, perUser: 5 });
    limiter.check('a', 's', 0);
    limiter.check('b', null, 10_000);

    expect(limiter.check('c', 't', 20_000)).toEqual({ allowed: false, scope: 'global', retryAfterMs: 40_000 });
  });

  // So the spammer is told privately rather than everyone seeing a channel-wide notice, and one
  // busy server is held back before it holds back every other server.
  it('reports the narrowest limit that was hit', () => {
    const limiter = new RateLimiter({ global: 3, perServer: 2, perUser: 2 });
    limiter.check('a', 's', 0);
    limiter.check('a', 's', 0);

    expect(limiter.check('a', 's', 0)).toMatchObject({ allowed: false, scope: 'user' });
    expect(limiter.check('b', 's', 0)).toMatchObject({ allowed: false, scope: 'server' });

    limiter.check('b', 't', 0);

    expect(limiter.check('c', 'u', 0)).toMatchObject({ allowed: false, scope: 'global' });
  });

  // A refused request mustn't use up a wider budget either, or one spammer could drain their server's.
  it('charges no limit for a request another limit refused', () => {
    const limiter = new RateLimiter({ global: 50, perServer: 2, perUser: 1 });
    limiter.check('a', 's', 0);
    limiter.check('a', 's', 0);
    limiter.check('a', 's', 0);

    expect(limiter.check('b', 's', 0).allowed).toBe(true);
  });

  it('forgets users and servers that have been quiet for a full window', () => {
    const limiter = new RateLimiter({ global: 50, perServer: 50, perUser: 5 });
    limiter.check('a', 's', 0);
    limiter.check('b', 't', 0);

    expect(limiter['perUser'].size).toBe(2);
    expect(limiter['perServer'].size).toBe(2);

    limiter.check('c', 'u', MINUTE);

    expect([...limiter['perUser'].keys()]).toEqual(['c']);
    expect([...limiter['perServer'].keys()]).toEqual(['u']);
  });
});
