import { MessageFlags, SlashCommandBuilder } from 'discord.js';

import { glossary } from '../data.js';
import { baseEmbed, errorEmbed } from '../embeds.js';
import { findBest, keysOf, respondWithMatches } from '../search.js';
import type { Command, GlossaryEntry } from '../types.js';

const keys = (entry: GlossaryEntry) => keysOf(entry, entry.term);

export const glossaryCommand: Command = {
  data: new SlashCommandBuilder().setName('glossary').setDescription('Defines a game term.')
    .addStringOption((option) =>
      option.setName('term').setDescription('The term to define').setAutocomplete(true),
    ).toJSON(),
  usage: '/glossary [term]',
  examples: ['/glossary term:fortitude', '/glossary term:crushing', '/glossary'],

  async autocomplete(interaction) {
    await respondWithMatches(interaction, glossary, keys, (entry) => ({ name: entry.term, value: entry.term }));
  },

  async execute(interaction) {
    const query = interaction.options.getString('term');

    if (!query) {
      const terms = glossary.map((entry) => `\`${entry.term}\``).join(', ');
      await interaction.reply({
        embeds: [baseEmbed('Glossary', `**${glossary.length} terms:** ${terms}`)],
        flags: MessageFlags.Ephemeral,
      });

      return;
    }

    const matches = findBest(query, glossary, keys);

    if (matches.length === 1) {
      const match = matches[0] as GlossaryEntry;
      await interaction.reply({ embeds: [baseEmbed(match.term, match.definition)] });

      return;
    }

    // Several terms match equally
    if (matches.length > 1) {
      const options = matches.map((entry) => `\`${entry.term}\``).join(', ');
      await interaction.reply({
        embeds: [baseEmbed('Multiple terms match', `\`${query}\` matches several: ${options}`)],
        flags: MessageFlags.Ephemeral,
      });

      return;
    }

    await interaction.reply({
      embeds: [errorEmbed('Term not found', `No entry for \`${query}\`. Run /glossary to see all ${glossary.length} terms.`)],
      flags: MessageFlags.Ephemeral,
    });
  },
};
