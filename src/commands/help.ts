import { SlashCommandBuilder } from 'discord.js';

import { ephemeralError } from '../embeds/general.js';
import { helpDetailEmbed, helpOverviewEmbed } from '../embeds/help.js';
import { respondWithMatches } from '../utils/search.js';
import type { Command } from '../types.js';
// Circular with registry.ts by design: registry imports every command module,
// including this one. Only read `commands` inside a handler, never at module scope.
import { commands } from './registry.js';

const keys = (command: Command) => [command.data.name];

export const helpCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Lists commands, or explains one.')
    .addStringOption((option) =>
      option.setName('command').setDescription('The command to explain').setAutocomplete(true),
    )
    .toJSON(),
  usage: '/help [command]',
  examples: ['/help', '/help eternals', '/help item'],

  async autocomplete(interaction) {
    await respondWithMatches(
      interaction,
      commands,
      keys,
      (command) => ({ name: `/${command.data.name}`, value: command.data.name }),
    );
  },

  async execute(interaction) {
    const query = interaction.options.getString('command');
    if (!query) {
      await interaction.reply({ embeds: [helpOverviewEmbed(commands)] });
      return;
    }

    const match = commands.find((command) => command.data.name === query.replace(/^\//, '').toLowerCase());
    if (match) {
      await interaction.reply({ embeds: [helpDetailEmbed(match)] });
      return;
    }

    const known = commands.map((command) => `\`/${command.data.name}\``).join(', ');
    await interaction.reply(ephemeralError('Unknown command', `There is no \`${query}\` command. Available: ${known}`));
  },
};
