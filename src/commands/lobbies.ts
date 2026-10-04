import { SlashCommandBuilder } from 'discord.js';

import { ephemeral } from '../embeds/general.js';
import { lobbyListEmbed } from '../embeds/lobbies.js';
import { lobbyStore, MODE_CHOICES, REGION_CHOICES } from '../lobbies.js';
import type { Command } from '../types.js';

export const lobbiesCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('lobbies')
    .setDescription('Lists open lobbies, most recently active first.')
    .addStringOption((option) =>
      option.setName('region')
        .setDescription('Only show lobbies in this region')
        .addChoices(...REGION_CHOICES),
    )
    .addStringOption((option) =>
      option.setName('mode')
        .setDescription('Only show lobbies playing this mode')
        .addChoices(...MODE_CHOICES),
    )
    .toJSON(),
  usage: '/lobbies [region] [mode]',
  examples: ['/lobbies', '/lobbies region:Europe', '/lobbies region:Europe mode:Spires'],

  async execute(interaction) {
    const region = interaction.options.getString('region');
    const mode = interaction.options.getString('mode');
    const open = lobbyStore.list()
      .filter((lobby) => (!region || lobby.region === region) && (!mode || lobby.mode === mode));

    await interaction.reply(ephemeral(lobbyListEmbed(open, region, mode)));
  },
};
