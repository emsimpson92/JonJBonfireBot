import { randomUUID } from 'node:crypto';

export const REGIONS = ['North America', 'South America', 'Europe', 'Asia'] as const;
export type Region = (typeof REGIONS)[number];

export const MODES = ['Ascension', 'Spires'] as const;
export type Mode = (typeof MODES)[number];

export const REGION_CHOICES = REGIONS.map((region) => ({ name: region, value: region }));
export const MODE_CHOICES = MODES.map((mode) => ({ name: mode, value: mode }));

/** In-game invite codes are six capital letters or digits, e.g. DX89EE. */
export const CODE_LENGTH = 6;
export const CODE_PATTERN = /^[A-Z0-9]{6}$/;

export const MAX_PLAYERS = 45;
export const MAX_LOBBIES = 50;

/** A lobby closes after two hours with nobody joining, leaving or being kicked. */
export const LOBBY_TTL_MS = 2 * 60 * 60 * 1000;

export interface Player {
  id: string;
  name: string;
}

export interface Lobby {
  /** This is probably redundant but just in case someone creates a lobby with the same code... */
  id: string;
  code: string;
  region: Region;
  mode?: Mode;
  players: Player[];
  lastActivityAt: number;
  guildId: string;
  channelId: string;
  messageId?: string;
  closed?: boolean;
}

export function expiresAt(lobby: Lobby): number {
  return lobby.lastActivityAt + LOBBY_TTL_MS;
}

export function isHost(lobby: Lobby, userId: string): boolean {
  return lobby.players[0]?.id === userId;
}

type CreateResult =
  | { ok: true; lobby: Lobby; left?: Lobby }
  | { ok: false; reason: 'duplicate'; existing: Lobby }
  | { ok: false; reason: 'limit' };

type JoinResult = { ok: true; left?: Lobby } | { ok: false; reason: 'already-in' | 'full' };

export type AddResult =
  | { ok: true }
  | { ok: false; reason: 'already-in' | 'full' }
  | { ok: false; reason: 'in-other'; other: Lobby };

export class LobbyStore {
  /** Keyed by lobby code. */
  private readonly lobbies = new Map<string, Lobby>();
  /** The lobby each player is in. Slightly redundant but good for performance */
  private readonly playerLobbies = new Map<string, Lobby>();
  /** Lobbies that expired since the last sweep */
  private expired: Lobby[] = [];

  find(code: string, id: string, now: number = Date.now()): Lobby | undefined {
    this.expire(now);
    const lobby = this.lobbies.get(code);
    return lobby?.id === id ? lobby : undefined;
  }

  /** The lobby a player currently belongs to */
  lobbyOf(userId: string, now: number = Date.now()): Lobby | undefined {
    this.expire(now);
    return this.playerLobbies.get(userId);
  }

  /** Get the lobby the player is hosting (if any) */
  hostedBy(userId: string, now: number = Date.now()): Lobby | undefined {
    const lobby = this.lobbyOf(userId, now);
    return lobby && isHost(lobby, userId) ? lobby : undefined;
  }

  list(now: number = Date.now()): Lobby[] {
    this.expire(now);
    return [...this.lobbies.values()].sort((a, b) => b.lastActivityAt - a.lastActivityAt);
  }

  create(
    details: { code: string; region: Region; mode?: Mode; host: Player; guildId: string; channelId: string },
    now: number = Date.now(),
  ): CreateResult {
    this.expire(now);

    const existing = this.lobbies.get(details.code);
    if (existing) {
      return { ok: false, reason: 'duplicate', existing };
    }
    else if (this.lobbies.size >= MAX_LOBBIES) {
      return { ok: false, reason: 'limit' };
    }

    const { host, ...rest } = details;
    const left = this.removeFromCurrent(host.id, now);
    const lobby: Lobby = { id: randomUUID(), ...rest, players: [host], lastActivityAt: now };
    this.lobbies.set(lobby.code, lobby);
    this.playerLobbies.set(host.id, lobby);

    return { ok: true, lobby, left };
  }

  join(lobby: Lobby, player: Player, now: number = Date.now()): JoinResult {
    if (this.playerLobbies.get(player.id) === lobby) {
      return { ok: false, reason: 'already-in' };
    }
    else if (lobby.players.length >= MAX_PLAYERS) {
      return { ok: false, reason: 'full' };
    }

    const left = this.removeFromCurrent(player.id, now);
    this.addPlayer(lobby, player, now);

    return { ok: true, left };
  }

  /** Host adds a player to a lobby if  they aren't in one already */
  add(lobby: Lobby, player: Player, now: number = Date.now()): AddResult {
    const current = this.playerLobbies.get(player.id);
    if (current === lobby) {
      return { ok: false, reason: 'already-in' };
    }
    else if (current) {
      return { ok: false, reason: 'in-other', other: current };
    }
    else if (lobby.players.length >= MAX_PLAYERS) {
      return { ok: false, reason: 'full' };
    }

    this.addPlayer(lobby, player, now);

    return { ok: true };
  }

  leave(lobby: Lobby, userId: string, now: number = Date.now()): boolean {
    return this.remove(lobby, [userId], now).length > 0;
  }

  kick(lobby: Lobby, userIds: string[], now: number = Date.now()): Player[] {
    return this.remove(lobby, userIds.filter((id) => !isHost(lobby, id)), now);
  }

  close(lobby: Lobby): void {
    if (this.lobbies.get(lobby.code) === lobby) {
      this.lobbies.delete(lobby.code);
    }
    for (const player of lobby.players) {
      if (this.playerLobbies.get(player.id) === lobby) {
        this.playerLobbies.delete(player.id);
      }
    }
    lobby.closed = true;
  }

  sweep(now: number = Date.now()): Lobby[] {
    this.expire(now);
    const expired = this.expired;
    this.expired = [];

    return expired;
  }

  private expire(now: number): void {
    for (const lobby of this.lobbies.values()) {
      if (now >= expiresAt(lobby)) {
        this.close(lobby);
        this.expired.push(lobby);
      }
    }
  }

  private addPlayer(lobby: Lobby, player: Player, now: number): void {
    lobby.players.push(player);
    lobby.lastActivityAt = now;
    this.playerLobbies.set(player.id, lobby);
  }

  private removeFromCurrent(userId: string, now: number): Lobby | undefined {
    const current = this.playerLobbies.get(userId);
    if (current) {
      this.remove(current, [userId], now);
    }

    return current;
  }

  private remove(lobby: Lobby, userIds: string[], now: number): Player[] {
    const ids = new Set(userIds);
    const removed = lobby.players.filter((player) => ids.has(player.id));
    if (!removed.length) {
      return removed;
    }

    lobby.players = lobby.players.filter((player) => !ids.has(player.id));
    for (const player of removed) {
      this.playerLobbies.delete(player.id);
    }

    if (lobby.players.length) {
      lobby.lastActivityAt = now;
    }
    else {
      this.close(lobby);
    }

    return removed;
  }
}

export const lobbyStore = new LobbyStore();
