import { InteractionContextType, SlashCommandBuilder } from 'discord.js';

import { config } from '../config.js';
import { ephemeral, ephemeralError, slowDown } from '../embeds/general.js';
import { switchedLobbiesEmbed } from '../embeds/lobbies.js';
import {
  CODE_LENGTH,
  CODE_PATTERN,
  lobbyStore,
  MAX_DESCRIPTION_LENGTH,
  MAX_LOBBIES,
  MAX_OWNED_LOBBIES,
  MODE_CHOICES,
  MODES,
  REGION_CHOICES,
} from '../lobbies.js';
import type { CreateResult, Region } from '../lobbies.js';
import { lobbyPost, playerFrom, syncPost } from '../lobbyMessages.js';
import type { Command } from '../types.js';
import { postUrl } from '../utils/lobbies.js';

function createError(result: Exclude<CreateResult, { ok: true }>, code: string) {
  switch (result.reason) {
    case 'duplicate':
      const url = postUrl(result.existing);
      return ephemeralError('Code taken', `Lobby **${code}** is already open${url ? `: [go to it](${url})` : '.'}`);
    
      case 'limit':
      return ephemeralError('Too many lobbies', `There are already ${MAX_LOBBIES} open lobbies. Try again once one closes.`);

      case 'owner-limit':
      return slowDown('ephemeral');
  }
}

export const lobbyCreateCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('createlobby')
    .setDescription('Posts a lobby for others to join, with you as host.')
    .setContexts(InteractionContextType.Guild)
    .addStringOption((option) =>
      option.setName('code')
        .setDescription('The in-game invite code, e.g. DX89EE')
        .setRequired(true)
        .setMinLength(CODE_LENGTH)
        .setMaxLength(CODE_LENGTH),
    )
    .addStringOption((option) =>
      option.setName('region')
        .setDescription('Which server the lobby is hosted on')
        .setRequired(true)
        .addChoices(...REGION_CHOICES),
    )
    .addStringOption((option) =>
      option.setName('mode')
        .setDescription('Which game mode')
        .addChoices(...MODE_CHOICES),
    )
    .addStringOption((option) =>
      option.setName('description')
        .setDescription('A note for players, shown on the lobby post')
        .setMaxLength(MAX_DESCRIPTION_LENGTH),
    )
    .toJSON(),
  usage: '/createlobby <code> <region> [mode] [description]',
  examples: [
    '/createlobby code:DX89EE region:Europe',
    '/createlobby code:DX89EE region:Europe mode:Spires',
    '/createlobby code:DX89EE region:Europe description:Casual, all welcome',
  ],

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return;
    }

    if (config.lobbyChannelId && interaction.channelId !== config.lobbyChannelId) {
      await interaction.reply(ephemeralError('Wrong channel', `Lobbies go in <#${config.lobbyChannelId}>.`));

      return;
    }

    const code = interaction.options.getString('code', true).trim().toUpperCase();
    if (!CODE_PATTERN.test(code)) {
      await interaction.reply(ephemeralError('Invalid code', `Invite codes are ${CODE_LENGTH} letters or numbers, like \`DX89EE\`.`));

      return;
    }

    const region = interaction.options.getString('region', true) as Region;
    const mode = MODES.find((name) => name === interaction.options.getString('mode'));

    const result = lobbyStore.create({
      code,
      region,
      mode,
      description: interaction.options.getString('description')?.trim() || undefined,
      host: playerFrom(interaction),
      guildId: interaction.guildId,
      channelId: interaction.channelId,
    });

    if (!result.ok) {
      if (result.reason === 'owner-limit') {
        console.warn(`Refused /createlobby from ${interaction.user.tag}: they created ${MAX_OWNED_LOBBIES} lobbies that are still open.`);
      }
      await interaction.reply(createError(result, code));

      return;
    }

    const { lobby, left } = result;
    try {
      const response = await interaction.reply({ ...lobbyPost(lobby), withResponse: true });
      lobby.messageId = response.resource?.message?.id;
    }
    catch (error) {
      lobbyStore.close(lobby);
      throw error;
    }
    finally {
      if (left) {
        await syncPost(interaction.client, left);
      }
    }

    if (left) {
      await interaction.followUp(ephemeral(switchedLobbiesEmbed(left, 'host')));
    }
  },
};
