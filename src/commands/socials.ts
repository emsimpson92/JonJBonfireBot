import { SlashCommandBuilder } from 'discord.js';

import { socials } from '../data.js';
import { socialsEmbed } from '../embeds/socials.js';
import { shareable } from '../share.js';
import type { Command } from '../types.js';

export const socialsCommand: Command = {
  data: new SlashCommandBuilder().setName('socials').setDescription('Links the official social channels.').toJSON(),
  usage: '/socials',
  examples: ['/socials'],

  async execute(interaction) {
    await interaction.reply(shareable(socialsEmbed(socials)));
  },
};
