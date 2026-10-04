import { beforeEach, describe, expect, it } from 'vitest';

import { isHost, LOBBY_TTL_MS, LobbyStore, MAX_LOBBIES, MAX_PLAYERS } from '../src/lobbies.js';
import type { Lobby, Player } from '../src/lobbies.js';

const HOUR = 60 * 60 * 1000;

const host: Player = { id: 'host', name: 'Host' };
const player = (n: number): Player => ({ id: `p${n}`, name: `Player ${n}` });

let store: LobbyStore;

beforeEach(() => {
  store = new LobbyStore();
});

/** Opens a lobby, failing the test if the store refuses. */
function open(code = 'DX89EE', by: Player = host, now = 0): Lobby {
  const result = store.create({ code, region: 'Europe', host: by, guildId: 'guild', channelId: 'channel' }, now);
  if (!result.ok) {
    throw new Error(`Could not open ${code}: ${result.reason}`);
  }

  return result.lobby;
}

/** Adds players 1 to `count` to the lobby. */
function fill(lobby: Lobby, count: number): void {
  for (let n = 1; n <= count; n += 1) {
    expect(store.join(lobby, player(n), 0).ok).toBe(true);
  }
}

describe('create', () => {
  it('makes the creator the host', () => {
    const lobby = open();

    expect(lobby.players).toEqual([host]);
    expect(isHost(lobby, host.id)).toBe(true);
    expect(store.hostedBy(host.id, 0)).toBe(lobby);
    expect(store.find('DX89EE', lobby.id, 0)).toBe(lobby);
  });

  it('refuses a code that is already open', () => {
    const existing = open();

    expect(store.create({ code: 'DX89EE', region: 'Asia', host: player(1), guildId: 'g', channelId: 'c' }, 0))
      .toEqual({ ok: false, reason: 'duplicate', existing });
  });

  it('reuses a code once its lobby has closed', () => {
    const old = open();
    store.close(old);
    const lobby = open();

    expect(lobby.id).not.toBe(old.id);
    expect(store.find('DX89EE', old.id, 0)).toBeUndefined();
    expect(store.find('DX89EE', lobby.id, 0)).toBe(lobby);
  });

  it(`stops at ${MAX_LOBBIES} open lobbies`, () => {
    for (let n = 0; n < MAX_LOBBIES; n += 1) {
      open(`CODE${String(n).padStart(2, '0')}`, player(n));
    }

    expect(store.create({ code: 'ONEMOR', region: 'Europe', host, guildId: 'g', channelId: 'c' }, 0))
      .toEqual({ ok: false, reason: 'limit' });
  });

  it('moves the creator out of the lobby they were in', () => {
    const first = open('FIRST1');
    fill(first, 1);

    const result = store.create({ code: 'SECOND', region: 'Asia', host: player(1), guildId: 'g', channelId: 'c' }, 0);

    expect(result).toMatchObject({ ok: true, left: first });
    expect(first.players).toEqual([host]);
    expect(store.hostedBy(player(1).id, 0)?.code).toBe('SECOND');
  });

  it('hands the old lobby to the next player when its host opens another', () => {
    const first = open('FIRST1');
    fill(first, 1);
    open('SECOND');

    expect(first.closed).toBeUndefined();
    expect(isHost(first, player(1).id)).toBe(true);
  });

  it('closes the old lobby when its host was alone in it', () => {
    const first = open('FIRST1');
    open('SECOND');

    expect(first.closed).toBe(true);
    expect(store.list(0).map((lobby) => lobby.code)).toEqual(['SECOND']);
  });
});

describe('join', () => {
  it('adds the player and counts as activity', () => {
    const lobby = open();

    expect(store.join(lobby, player(1), 1000)).toEqual({ ok: true, left: undefined });
    expect(lobby.players).toEqual([host, player(1)]);
    expect(lobby.lastActivityAt).toBe(1000);
    expect(store.lobbyOf(player(1).id, 1000)).toBe(lobby);
  });

  it('refuses a player who is already in', () => {
    const lobby = open();

    expect(store.join(lobby, host, 0)).toEqual({ ok: false, reason: 'already-in' });
  });

  it(`refuses a lobby with ${MAX_PLAYERS} players`, () => {
    const lobby = open();
    fill(lobby, MAX_PLAYERS - 1);

    expect(store.join(lobby, player(MAX_PLAYERS), 0)).toEqual({ ok: false, reason: 'full' });
  });

  it('moves the player out of the lobby they were in', () => {
    const first = open('FIRST1');
    fill(first, 1);
    const second = open('SECOND', player(2));

    expect(store.join(second, player(1), 0)).toEqual({ ok: true, left: first });
    expect(first.players).toEqual([host]);
    expect(store.lobbyOf(player(1).id, 0)).toBe(second);
  });
});

describe('add', () => {
  it('adds a player who is in no lobby', () => {
    const lobby = open();

    expect(store.add(lobby, player(1), 1000)).toEqual({ ok: true });
    expect(store.lobbyOf(player(1).id, 1000)).toBe(lobby);
    expect(lobby.lastActivityAt).toBe(1000);
  });

  it('refuses a player who is already in', () => {
    const lobby = open();
    fill(lobby, 1);

    expect(store.add(lobby, player(1), 0)).toEqual({ ok: false, reason: 'already-in' });
  });

  it('never moves a player out of another lobby', () => {
    const other = open('OTHER1', player(1));
    const lobby = open();

    expect(store.add(lobby, player(1), 0)).toEqual({ ok: false, reason: 'in-other', other });
    expect(store.lobbyOf(player(1).id, 0)).toBe(other);
  });

  it(`refuses a lobby with ${MAX_PLAYERS} players`, () => {
    const lobby = open();
    fill(lobby, MAX_PLAYERS - 1);

    expect(store.add(lobby, player(MAX_PLAYERS), 0)).toEqual({ ok: false, reason: 'full' });
  });
});

describe('leave', () => {
  it('removes the player', () => {
    const lobby = open();
    fill(lobby, 1);

    expect(store.leave(lobby, player(1).id, 1000)).toBe(true);
    expect(lobby.players).toEqual([host]);
    expect(lobby.lastActivityAt).toBe(1000);
    expect(store.lobbyOf(player(1).id, 1000)).toBeUndefined();
  });

  it('does nothing for someone not in the lobby', () => {
    const lobby = open();

    expect(store.leave(lobby, player(1).id, 1000)).toBe(false);
    expect(lobby.lastActivityAt).toBe(0);
  });

  it('passes host to whoever joined first when the host leaves', () => {
    const lobby = open();
    fill(lobby, 2);
    store.leave(lobby, host.id, 0);

    expect(isHost(lobby, player(1).id)).toBe(true);
    expect(store.hostedBy(player(1).id, 0)).toBe(lobby);
  });

  it('closes the lobby when the last player leaves', () => {
    const lobby = open();
    store.leave(lobby, host.id, 0);

    expect(lobby.closed).toBe(true);
    expect(store.list(0)).toEqual([]);
    expect(store.find('DX89EE', lobby.id, 0)).toBeUndefined();
  });
});

describe('kick', () => {
  it('removes the named players but never the host', () => {
    const lobby = open();
    fill(lobby, 2);

    expect(store.kick(lobby, [host.id, player(1).id], 0)).toEqual([player(1)]);
    expect(lobby.players).toEqual([host, player(2)]);
    expect(store.lobbyOf(player(1).id, 0)).toBeUndefined();
  });

  it('removes nobody who is not in the lobby', () => {
    const lobby = open();
    fill(lobby, 1);

    expect(store.kick(lobby, [player(9).id], 0)).toEqual([]);
    expect(lobby.players).toHaveLength(2);
  });
});

describe('close', () => {
  it('frees the players to join elsewhere', () => {
    const lobby = open();
    fill(lobby, 1);
    store.close(lobby);

    expect(store.lobbyOf(host.id, 0)).toBeUndefined();
    expect(store.lobbyOf(player(1).id, 0)).toBeUndefined();
  });

  it('leaves a newer lobby with the same code alone', () => {
    const old = open();
    store.close(old);
    const lobby = open();
    store.close(old);

    expect(store.find('DX89EE', lobby.id, 0)).toBe(lobby);
    expect(store.lobbyOf(host.id, 0)).toBe(lobby);
  });
});

describe('expiry', () => {
  it('closes a lobby two hours after its last activity', () => {
    const lobby = open();

    expect(store.list(LOBBY_TTL_MS - 1)).toEqual([lobby]);
    expect(store.list(LOBBY_TTL_MS)).toEqual([]);
    expect(lobby.closed).toBe(true);
    expect(store.lobbyOf(host.id, LOBBY_TTL_MS)).toBeUndefined();
  });

  it('counts from the latest activity', () => {
    const lobby = open();
    store.join(lobby, player(1), HOUR);

    expect(store.list(LOBBY_TTL_MS + 1)).toEqual([lobby]);
    expect(store.list(HOUR + LOBBY_TTL_MS)).toEqual([]);
  });

  it('applies to every lookup, not only the sweep', () => {
    const lobby = open();

    expect(store.find('DX89EE', lobby.id, LOBBY_TTL_MS)).toBeUndefined();
    expect(store.hostedBy(host.id, LOBBY_TTL_MS)).toBeUndefined();
  });

  it('lets a player whose lobby expired open another with the same code', () => {
    open();

    expect(store.create({ code: 'DX89EE', region: 'Asia', host, guildId: 'g', channelId: 'c' }, LOBBY_TTL_MS).ok).toBe(true);
  });

  it('sweep reports each expired lobby once', () => {
    const lobby = open();

    expect(store.sweep(LOBBY_TTL_MS - 1)).toEqual([]);
    expect(store.sweep(LOBBY_TTL_MS)).toEqual([lobby]);
    expect(store.sweep(LOBBY_TTL_MS + 1)).toEqual([]);
  });

  // The sweep deletes expired posts, so it must hear about lobbies another lookup closed first.
  it('sweep reports lobbies that expired during another lookup', () => {
    const lobby = open();
    store.list(LOBBY_TTL_MS);

    expect(store.sweep(LOBBY_TTL_MS)).toEqual([lobby]);
  });
});

describe('list', () => {
  it('puts the most recently active first', () => {
    const older = open('OLDER1', player(1), 0);
    const newer = open('NEWER1', player(2), 1000);
    store.join(older, player(3), 2000);

    expect(store.list(2000)).toEqual([older, newer]);
  });
});
