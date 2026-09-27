import { SlashCommandBuilder } from 'discord.js';

import { socials } from '../data.js';
import { baseEmbed } from '../embeds.js';
import type { Command } from '../types.js';

export const socialsCommand: Command = {
  data: new SlashCommandBuilder().setName('socials').setDescription('Links the official social channels.').toJSON(),
  usage: '/socials',
  examples: ['/socials'],

  async execute(interaction) {
    const lines = socials.map((social) => `[${social.name}](${social.url})`).join('\n');
    await interaction.reply({ embeds: [baseEmbed('Socials', lines)] });
  },
};
