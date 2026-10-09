import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import type {
  APIInteractionDataResolvedGuildMember,
  APIInteractionGuildMember,
  BaseInteraction,
  Client,
  EmbedBuilder,
  GuildMember,
  MessageComponentInteraction,
  User,
} from 'discord.js';

import { ephemeral, ephemeralError, errorEmbed } from './embeds/general.js';
import {
  expiryWarningEmbed,
  lobbyClosedEmbed,
  lobbyEmbed,
  lobbyManageEmbed,
  switchedLobbiesEmbed,
} from './embeds/lobbies.js';
import { expiresAt, isHost, lobbyStore } from './lobbies.js';
import type { Lobby, Player } from './lobbies.js';
import { relativeTime } from './utils/general.js';
import { postUrl } from './utils/lobbies.js';

/** Every lobby button id starts with this. We don't need it now but if we add buttons in the future it'll help */
const PREFIX = 'lobby';

const SWEEP_INTERVAL_MS = 60_000;

const NOT_HOST = 'Only the host can manage the lobby.';

type Action = 'join' | 'leave' | 'manage' | 'bump' | 'close';

/** Lobbies with a bump in flight. Each click is its own interaction, so a double click would otherwise post twice */
const bumping = new Set<string>();

/** Carries the lobby's id as well as its code, since codes are reused once a lobby closes. */
function customId(action: Action, lobby: Lobby): string {
  return [PREFIX, action, lobby.code, lobby.id].join(':');
}

export function isLobbyComponent(id: string): boolean {
  return id.startsWith(`${PREFIX}:`);
}

export function toPlayer(user: User, member: GuildMember | APIInteractionGuildMember | APIInteractionDataResolvedGuildMember | null): Player {
  const name = member && 'displayName' in member ? member.displayName : (member?.nick ?? user.displayName);

  return { id: user.id, name };
}

export function playerFrom(interaction: BaseInteraction): Player {
  return toPlayer(interaction.user, interaction.member);
}

/** The lobby's embed with its buttons, which live here beside the handler that reads their ids. */
export function lobbyPost(lobby: Lobby) {
  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(customId('join', lobby)).setLabel('Join').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(customId('leave', lobby)).setLabel('Leave').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(customId('manage', lobby)).setEmoji('⚙️').setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [lobbyEmbed(lobby)], components: [buttons] };
}

export function managePanel(lobby: Lobby, note?: string) {
  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(customId('bump', lobby)).setLabel('Bump').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(customId('close', lobby)).setLabel('Close Lobby').setStyle(ButtonStyle.Danger),
  );

  return { embeds: [lobbyManageEmbed(lobby, note)], components: [buttons] };
}

export function expiryWarning(lobby: Lobby) {
  const url = postUrl(lobby);
  const link = url && new ButtonBuilder().setURL(url).setLabel('Go to lobby').setStyle(ButtonStyle.Link);

  return { embeds: [expiryWarningEmbed(lobby)], components: link ? [new ActionRowBuilder<ButtonBuilder>().addComponents(link)] : [] };
}

function endPanel(embed: EmbedBuilder) {
  return { embeds: [embed], components: [] };
}

function isPanel(interaction: MessageComponentInteraction): boolean {
  return interaction.message.flags.has(MessageFlags.Ephemeral);
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

async function warnHost(client: Client, lobby: Lobby): Promise<void> {
  const host = lobby.players[0];
  if (!host) {
    return;
  }

  try {
    await client.users.send(host.id, expiryWarning(lobby));
  }
  catch (error) {
    // Most likely the host doesn't take DMs from server members
    console.warn(`Could not warn the host of lobby ${lobby.code} that it's expiring:`, error);
  }
}

/** Delete expired lobby posts, and warn the hosts of lobbies about to expire */
export function startLobbySweep(client: Client): void {
  setInterval(() => {
    try {
      for (const lobby of lobbyStore.sweep()) {
        void syncPost(client, lobby);
      }
      for (const lobby of lobbyStore.warningsPending()) {
        void warnHost(client, lobby);
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
  await interaction.followUp(ephemeral(lobbyClosedEmbed(note)));
}

export async function handleLobbyComponent(interaction: MessageComponentInteraction): Promise<void> {
  const [, action, code = '', id = ''] = interaction.customId.split(':');
  const lobby = lobbyStore.find(code, id);

  if (!lobby) {
    await (isPanel(interaction) ?
      interaction.update(endPanel(lobbyClosedEmbed('This lobby is closed.'))) :
      deleteClickedPost(interaction, 'This lobby is closed.'));
    return;
  }

  switch (action) {
    case 'join':
      await join(interaction, lobby);
      break;
    case 'leave':
      await leave(interaction, lobby);
      break;
    case 'manage':
      await manage(interaction, lobby);
      break;
    case 'bump':
      await bump(interaction, lobby);
      break;
    case 'close':
      await close(interaction, lobby);
      break;
  }
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
    await interaction.followUp(ephemeral(switchedLobbiesEmbed(result.left, 'join')));
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

async function manage(interaction: MessageComponentInteraction, lobby: Lobby): Promise<void> {
  await interaction.reply(isHost(lobby, interaction.user.id) ?
    { ...managePanel(lobby), flags: MessageFlags.Ephemeral } :
    ephemeralError('Lobby Management', NOT_HOST));
}

/** Reposts the lobby as the channel's latest message and pushes back its expiry. */
async function bump(interaction: MessageComponentInteraction, lobby: Lobby): Promise<void> {
  // The host can change after the panel opens, if they leave
  if (!isHost(lobby, interaction.user.id)) {
    await interaction.update(endPanel(errorEmbed('Lobby Management', NOT_HOST)));
    return;
  }

  if (bumping.has(lobby.id)) {
    await interaction.deferUpdate();
    return;
  }
  bumping.add(lobby.id);

  try {
    const channel = await interaction.client.channels.fetch(lobby.channelId);
    if (!channel?.isSendable()) {
      await interaction.reply(ephemeralError("Can't post here", "I can't post in this lobby's channel."));
      return;
    }

    await interaction.deferUpdate();
    lobbyStore.bump(lobby);

    // Post the new one first, so a failed post leaves the old one up
    const previous = lobby.messageId;
    lobby.messageId = (await channel.send(lobbyPost(lobby))).id;
    if (previous) {
      await channel.messages.delete(previous)
        .catch((error: unknown) => console.warn(`Could not delete the old post for lobby ${lobby.code}:`, error));
    }
  }
  finally {
    bumping.delete(lobby.id);
  }

  await interaction.editReply(managePanel(lobby, 'Lobby bumped'));
}

async function close(interaction: MessageComponentInteraction, lobby: Lobby): Promise<void> {
  if (!isHost(lobby, interaction.user.id)) {
    await interaction.update(endPanel(errorEmbed('Lobby Management', NOT_HOST)));
    return;
  }

  lobbyStore.close(lobby);
  await interaction.update(endPanel(lobbyClosedEmbed(`Lobby ${lobby.code} is closed.`)));
  await syncPost(interaction.client, lobby);
}
