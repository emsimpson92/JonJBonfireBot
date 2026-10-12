import { escapeMarkdown } from 'discord.js';
import { closesAtMaxAge, expiresAt, MAX_LOBBY_AGE_MS, MAX_PLAYERS } from '../lobbies.js';
import type { Lobby, Player } from '../lobbies.js';
import { MAX_FIELDS } from '../utils/discordLimits.js';
import { relativeTime } from '../utils/general.js';
import { postUrl } from '../utils/lobbies.js';
import { baseEmbed, errorEmbed } from './general.js';

const HOUR_MS = 60 * 60 * 1000;

function toPlainText(text: string): string {
  return escapeMarkdown(text, { heading: true, bulletedList: true, numberedList: true, maskedLink: true });
}

/** The embed on a lobby's post. lobbyMessages.ts puts the Join, Leave and Close buttons under it. */
export function lobbyEmbed(lobby: Lobby) {
  const roster = lobby.players
    .map((player, index) => (index === 0 ? `1. 👑 <@${player.id}> — **Host**` : `${index + 1}. <@${player.id}>`))
    .join('\n');

  return baseEmbed(
    `Lobby Code: ${lobby.code}`,
    `**Region:** ${lobby.region}\n` +
      (lobby.mode ? `**Mode:** ${lobby.mode}\n` : '') +
      (lobby.description ? `**Description:** ${toPlainText(lobby.description)}\n` : '') +
      `**Expires:** ${relativeTime(expiresAt(lobby))}\n\n` +
      `**Players (${lobby.players.length}/${MAX_PLAYERS})**\n${roster}`,
  );
}

/** Leaves the region and mode out when the list is already filtered to one, since the title names it. */
function lobbyField(lobby: Lobby, show: { region: boolean; mode: boolean }) {
  const url = postUrl(lobby);
  const parts = [
    ...(show.region ? [lobby.region] : []),
    ...(lobby.mode && show.mode ? [lobby.mode] : []),
    `${lobby.players.length}/${MAX_PLAYERS} players`,
    `active ${relativeTime(lobby.lastActivityAt)}`,
  ];

  return { name: lobby.code, value: parts.join(' · ') + (url ? `\n[Go to lobby](${url})` : '') };
}

/** /lobbies: the open lobbies, already narrowed by the region and mode options, or a note that there are none. */
export function lobbyListEmbed(open: Lobby[], region: string | null, mode: string | null) {
  const filters = [...(region ? [region] : []), ...(mode ? [mode] : [])];
  const title = filters.length ? `Open lobbies - ${filters.join(', ')}` : 'Open lobbies';

  if (!open.length) {
    return baseEmbed(title, `No open ${mode ? `${mode} ` : ''}lobbies${region ? ` in ${region}` : ''}. Start one with /createlobby.`);
  }

  const shown = open.slice(0, MAX_FIELDS);
  let footer = `${open.length} open ${open.length === 1 ? 'lobby' : 'lobbies'}`;
  if (open.length > shown.length) {
    const unused = [...(region ? [] : ['region:']), ...(mode ? [] : ['mode:'])];
    footer = `Showing the ${shown.length} most recently active of ${open.length}.` +
      (unused.length ? ` Narrow it with ${unused.join(' or ')}.` : '');
  }

  const show = { region: !region, mode: !mode };

  return baseEmbed(title).addFields(shown.map((lobby) => lobbyField(lobby, show))).setFooter({ text: footer });
}

export function lobbyManageEmbed(lobby: Lobby, note?: string) {
  return baseEmbed('Lobby Management', `Managing lobby **${lobby.code}**.` + (note ? `\n\n${note}` : ''));
}

export function expiryWarningEmbed(lobby: Lobby) {
  if (closesAtMaxAge(lobby)) {
    return baseEmbed(
      'Lobby expiring soon',
      `The lobby you are hosting with code **${lobby.code}** has been open for almost ${MAX_LOBBY_AGE_MS / HOUR_MS} hours, ` +
        `the longest a lobby can stay open. It will automatically close ${relativeTime(expiresAt(lobby))}.`,
    );
  }

  return baseEmbed(
    'Lobby expiring soon',
    `The lobby you are hosting with code **${lobby.code}** is expiring soon. If the lobby is still active, give it a bump. ` +
      'Otherwise, please close the lobby. ' +
      `If no action is taken, the lobby will automatically close ${relativeTime(expiresAt(lobby))}.`,
  );
}

/** Hosting or joining a lobby moves a player out of the one they were in. */
export function switchedLobbiesEmbed(left: Lobby, reason: 'host' | 'join') {
  return baseEmbed('Switched lobbies', `You left lobby **${left.code}** to ${reason} this one.`);
}

export function lobbyClosedEmbed(note: string) {
  return baseEmbed('Lobby closed', note);
}

export function lobbyFullEmbed(lobby: Lobby) {
  return errorEmbed('Lobby full', `Lobby ${lobby.code} is full.`);
}

export function lobbyKickEmbed(removed: Player[]) {
  const note = removed.length
    ? `Removed ${removed.map((player) => `<@${player.id}>`).join(', ')}.`
    : 'They had already left.';

  return baseEmbed('Lobby kick', note);
}
