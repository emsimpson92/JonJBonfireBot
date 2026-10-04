import { InteractionContextType, SlashCommandBuilder } from 'discord.js';

import { config } from '../config.js';
import { ephemeral, ephemeralError } from '../embeds/general.js';
import { switchedLobbiesEmbed } from '../embeds/lobbies.js';
import { CODE_LENGTH, CODE_PATTERN, lobbyStore, MAX_LOBBIES, MODE_CHOICES, MODES, REGION_CHOICES } from '../lobbies.js';
import type { Region } from '../lobbies.js';
import { lobbyPost, playerFrom, syncPost } from '../lobbyMessages.js';
import type { Command } from '../types.js';
import { postUrl } from '../utils/lobbies.js';

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
    .toJSON(),
  usage: '/createlobby <code> <region> [mode]',
  examples: ['/createlobby code:DX89EE region:Europe', '/createlobby code:DX89EE region:Europe mode:Spires'],

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
      host: playerFrom(interaction),
      guildId: interaction.guildId,
      channelId: interaction.channelId,
    });

    if (!result.ok) {
      const url = result.reason === 'duplicate' ? postUrl(result.existing) : undefined;
      const description = result.reason === 'duplicate'
        ? `Lobby **${code}** is already open${url ? `: [go to it](${url})` : '.'}`
        : `There are already ${MAX_LOBBIES} open lobbies. Try again once one closes.`;
      await interaction.reply(ephemeralError(result.reason === 'duplicate' ? 'Code taken' : 'Too many lobbies', description));

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
