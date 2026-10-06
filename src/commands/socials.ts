import { SlashCommandBuilder } from 'discord.js';

import { socials } from '../data.js';
import { ephemeral } from '../embeds/general.js';
import { socialsEmbed } from '../embeds/socials.js';
import type { Command } from '../types.js';

export const socialsCommand: Command = {
  data: new SlashCommandBuilder().setName('socials').setDescription('Links the official social channels.').toJSON(),
  usage: '/socials',
  examples: ['/socials'],

  async execute(interaction) {
    await interaction.reply(ephemeral(socialsEmbed(socials)));
  },
};
