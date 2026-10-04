import { expiresAt, MAX_PLAYERS } from '../lobbies.js';
import type { Lobby, Player } from '../lobbies.js';
import { relativeTime } from '../utils/general.js';
import { postUrl } from '../utils/lobbies.js';
import { baseEmbed } from './general.js';

/** An embed holds at most 25 fields, one per lobby. */
const MAX_LISTED = 25;

/** The embed on a lobby's post. lobbyMessages.ts puts the Join, Leave and Close buttons under it. */
export function lobbyEmbed(lobby: Lobby) {
  const roster = lobby.players
    .map((player, index) => (index === 0 ? `1. 👑 <@${player.id}> — **Host**` : `${index + 1}. <@${player.id}>`))
    .join('\n');

  return baseEmbed(
    `Lobby Code: ${lobby.code}`,
    `**Region:** ${lobby.region}\n` +
      (lobby.mode ? `**Mode:** ${lobby.mode}\n` : '') +
      `**Expires:** ${relativeTime(expiresAt(lobby))}\n\n` +
      `**Players (${lobby.players.length}/${MAX_PLAYERS})**\n${roster}`,
  );
}

function lobbyField(lobby: Lobby) {
  const url = postUrl(lobby);
  const parts = [
    ...(lobby.mode ? [lobby.mode] : []),
    `${lobby.players.length}/${MAX_PLAYERS} players`,
    `active ${relativeTime(lobby.lastActivityAt)}`,
    ...(url ? [`[Go to lobby](${url})`] : []),
  ];

  return { name: lobby.code, value: parts.join(' · ') };
}

/** /lobbies: the open lobbies, already narrowed by the region and mode options, or a note that there are none. */
export function lobbyListEmbed(open: Lobby[], region: string | null, mode: string | null) {
  const filters = [...(region ? [region] : []), ...(mode ? [mode] : [])];
  const title = filters.length ? `Open lobbies - ${filters.join(', ')}` : 'Open lobbies';

  if (!open.length) {
    return baseEmbed(title, `No open ${mode ? `${mode} ` : ''}lobbies${region ? ` in ${region}` : ''}. Start one with /createlobby.`);
  }

  const shown = open.slice(0, MAX_LISTED);
  let footer = `${open.length} open ${open.length === 1 ? 'lobby' : 'lobbies'}`;
  if (open.length > shown.length) {
    const unused = [...(region ? [] : ['region:']), ...(mode ? [] : ['mode:'])];
    footer = `Showing the ${shown.length} most recently active of ${open.length}.` +
      (unused.length ? ` Narrow it with ${unused.join(' or ')}.` : '');
  }

  return baseEmbed(title).addFields(shown.map(lobbyField)).setFooter({ text: footer });
}

/** Hosting or joining a lobby moves a player out of the one they were in. */
export function switchedLobbiesEmbed(left: Lobby, reason: 'host' | 'join') {
  return baseEmbed('Switched lobbies', `You left lobby **${left.code}** to ${reason} this one.`);
}

export function lobbyClosedEmbed(note: string) {
  return baseEmbed('Lobby closed', note);
}

export function lobbyKickEmbed(removed: Player[]) {
  const note = removed.length
    ? `Removed ${removed.map((player) => `<@${player.id}>`).join(', ')}.`
    : 'They had already left.';

  return baseEmbed('Lobby kick', note);
}
