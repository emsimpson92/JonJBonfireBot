import { MessageFlags, SlashCommandBuilder } from 'discord.js';

import { baseEmbed, errorEmbed } from '../embeds.js';
import { respondWithMatches } from '../search.js';
import type { Command } from '../types.js';
// Circular with registry.ts by design: registry imports every command module,
// including this one. Only read `commands` inside a handler, never at module scope.
import { commands } from './registry.js';

function overviewEmbed() {
  const lines = commands.map((command) => `\`/${command.data.name}\` — ${command.data.description}`).join('\n');
  return baseEmbed('Commands', lines).setFooter({ text: 'Use /help <command> for syntax and examples.' });
}

function detailEmbed(command: Command) {
  const embed = baseEmbed(`/${command.data.name}`, command.data.description).addFields({
    name: 'Usage',
    value: `\`${command.usage}\``,
  });

  if (command.examples.length) {
    embed.addFields({
      name: command.examples.length === 1 ? 'Example' : 'Examples',
      value: command.examples.map((example) => `\`${example}\``).join('\n'),
    });
  }

  const options = command.data.options ?? [];
  if (options.length) {
    embed.addFields({
      name: 'Options',
      value: options
        .map((option) => `\`${option.name}\`${'required' in option && option.required ? '' : ' (optional)'} — ${option.description}`)
        .join('\n'),
    });
  }

  return embed;
}

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
      (command) => [command.data.name],
      (command) => ({ name: `/${command.data.name}`, value: command.data.name }),
    );
  },

  async execute(interaction) {
    const query = interaction.options.getString('command');
    if (!query) {
      await interaction.reply({ embeds: [overviewEmbed()] });
      return;
    }

    const match = commands.find((command) => command.data.name === query.replace(/^\//, '').toLowerCase());
    if (match) {
      await interaction.reply({ embeds: [detailEmbed(match)] });
      return;
    }

    const known = commands.map((command) => `\`/${command.data.name}\``).join(', ');
    await interaction.reply({
      embeds: [errorEmbed('Unknown command', `There is no \`${query}\` command. Available: ${known}`)],
      flags: MessageFlags.Ephemeral,
    });
  },
};
