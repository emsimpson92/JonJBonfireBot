import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import type {
  APIInteractionDataResolvedGuildMember,
  APIInteractionGuildMember,
  BaseInteraction,
  Client,
  GuildMember,
  MessageComponentInteraction,
  User,
} from 'discord.js';

import { baseEmbed, ephemeral, ephemeralError } from './embeds.js';
import { expiresAt, isHost, lobbyStore, MAX_PLAYERS } from './lobbies.js';
import type { Lobby, Player } from './lobbies.js';

/** Every lobby button id starts with this. We don't need it now but if we add buttons in the future it'll help */
const PREFIX = 'lobby';

const SWEEP_INTERVAL_MS = 60_000;

type Action = 'join' | 'leave' | 'close';

/** Carries the lobby's id as well as its code, since codes are reused once a lobby closes. */
function customId(action: Action, lobby: Lobby): string {
  return [PREFIX, action, lobby.code, lobby.id].join(':');
}

export function isLobbyComponent(id: string): boolean {
  return id.startsWith(`${PREFIX}:`);
}

export function unixSeconds(ms: number): number {
  return Math.floor(ms / 1000);
}

export function postUrl(lobby: Lobby): string | undefined {
  return lobby.messageId
    ? `https://discord.com/channels/${lobby.guildId}/${lobby.channelId}/${lobby.messageId}`
    : undefined;
}

export function toPlayer(user: User, member: GuildMember | APIInteractionGuildMember | APIInteractionDataResolvedGuildMember | null): Player {
  const name = member && 'displayName' in member ? member.displayName : (member?.nick ?? user.displayName);

  return { id: user.id, name };
}

export function playerFrom(interaction: BaseInteraction): Player {
  return toPlayer(interaction.user, interaction.member);
}

export function lobbyPost(lobby: Lobby) {
  const roster = lobby.players
    .map((player, index) => (index === 0 ? `1. 👑 <@${player.id}> — **Host**` : `${index + 1}. <@${player.id}>`))
    .join('\n');
  const embed = baseEmbed(
    `Lobby Code: ${lobby.code}`,
    `**Region:** ${lobby.region}\n` +
      (lobby.mode ? `**Mode:** ${lobby.mode}\n` : '') +
      `**Expires:** <t:${unixSeconds(expiresAt(lobby))}:R>\n\n` +
      `**Players (${lobby.players.length}/${MAX_PLAYERS})**\n${roster}`,
  );

  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(customId('join', lobby)).setLabel('Join').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(customId('leave', lobby)).setLabel('Leave').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(customId('close', lobby)).setLabel('Close Lobby').setStyle(ButtonStyle.Danger),
  );

  return { embeds: [embed], components: [buttons] };
}

/** Updates a lobby's post when the state changes */
export async function syncPost(client: Client, lobby: Lobby): Promise<void> {
  if (!lobby.messageId) {
    return;
  }

  try {
    const channel = await client.channels.fetch(lobby.channelId);
    if (!channel?.isTextBased()) {
      return;
    }

    if (lobby.closed) {
      await channel.messages.delete(lobby.messageId);
    }
    else {
      await channel.messages.edit(lobby.messageId, lobbyPost(lobby));
    }
  }
  catch (error) {
    console.warn(`Could not update the post for lobby ${lobby.code}:`, error);
  }
}

/** Delete expired lobby posts */
export function startLobbySweep(client: Client): void {
  setInterval(() => {
    try {
      for (const lobby of lobbyStore.sweep()) {
        void syncPost(client, lobby);
      }
    }
    catch (error) {
      console.error('Lobby sweep failed:', error);
    }
  }, SWEEP_INTERVAL_MS);
}

/** Deletes a post that is no longer valid when a player clicks it */
async function deleteClickedPost(interaction: MessageComponentInteraction, note: string): Promise<void> {
  await interaction.deferUpdate();
  await interaction.deleteReply();
  await interaction.followUp(ephemeral(baseEmbed('Lobby closed', note)));
}

export async function handleLobbyComponent(interaction: MessageComponentInteraction): Promise<void> {
  const [, action, code = '', id = ''] = interaction.customId.split(':');
  const lobby = lobbyStore.find(code, id);

  if (!lobby) {
    await lobbyGone(interaction);
    return;
  }

  switch (action) {
    case 'join':
      await join(interaction, lobby);
      break;
    case 'leave':
      await leave(interaction, lobby);
      break;
    case 'close':
      await close(interaction, lobby);
      break;
  }
}

/** The lobby has closed — expired, emptied, or wiped by a restart — but these buttons are still up. */
async function lobbyGone(interaction: MessageComponentInteraction): Promise<void> {
  await deleteClickedPost(interaction, 'This lobby is closed.');
}

async function join(interaction: MessageComponentInteraction, lobby: Lobby): Promise<void> {
  const result = lobbyStore.join(lobby, playerFrom(interaction));
  if (!result.ok) {
    await interaction.reply(result.reason === 'already-in'
      ? ephemeralError('Already joined', `You're already in lobby ${lobby.code}.`)
      : ephemeralError('Lobby full', `Lobby ${lobby.code} is full.`));
    return;
  }

  await interaction.update(lobbyPost(lobby));

  if (result.left) {
    await interaction.followUp(ephemeral(baseEmbed('Switched lobbies', `You left lobby **${result.left.code}** to join this one.`)));
    await syncPost(interaction.client, result.left);
  }
}

async function leave(interaction: MessageComponentInteraction, lobby: Lobby): Promise<void> {
  if (!lobbyStore.leave(lobby, interaction.user.id)) {
    await interaction.reply(ephemeralError('Not in lobby', `You aren't in lobby ${lobby.code}.`));
    return;
  }

  await (lobby.closed ? 
    deleteClickedPost(interaction, `You were the last player, so lobby ${lobby.code} has closed.`) : 
    interaction.update(lobbyPost(lobby)));
}

async function close(interaction: MessageComponentInteraction, lobby: Lobby): Promise<void> {
  if (!isHost(lobby, interaction.user.id)) {
    await interaction.reply(ephemeralError('Host only', 'Only the host can close this lobby.'));
    return;
  }

  lobbyStore.close(lobby);
  await deleteClickedPost(interaction, `Lobby ${lobby.code} is closed.`);
}
