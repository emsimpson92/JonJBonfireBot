import { SlashCommandBuilder } from 'discord.js';

import { glossary } from '../data.js';
import { ephemeral } from '../embeds/general.js';
import { glossaryListEmbed, glossaryTermEmbed } from '../embeds/glossary.js';
import { keysOf, replyWithBest, respondWithMatches } from '../utils/search.js';
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
      await interaction.reply(ephemeral(glossaryListEmbed(glossary)));

      return;
    }

    await replyWithBest(interaction, query, glossary, keys, {
      plural: 'terms',
      label: (entry) => entry.term,
      render: glossaryTermEmbed,
      notFound: { title: 'Term not found', description: `No entry for \`${query}\`. Run /glossary to see all ${glossary.length} terms.` },
    });
  },
};
