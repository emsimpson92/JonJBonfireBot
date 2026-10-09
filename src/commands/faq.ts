import { SlashCommandBuilder } from 'discord.js';

import { faq } from '../data.js';
import { faqListEmbed, faqTopicEmbed } from '../embeds/faq.js';
import { shareable } from '../share.js';
import { keysOf, replyWithBest, respondWithMatches } from '../utils/search.js';
import type { Command, FaqTopic } from '../types.js';

export const keys = (entry: FaqTopic) => keysOf(entry, entry.topic);

export const faqCommand: Command = {
  data: new SlashCommandBuilder().setName('faq').setDescription('Lists FAQ topics, or answers one.')
    .addStringOption((option) =>
      option.setName('topic').setDescription('The topic to show').setAutocomplete(true),
    ).toJSON(),
  usage: '/faq [topic]',
  examples: ['/faq', '/faq topic:playtest'],

  async autocomplete(interaction) {
    await respondWithMatches(interaction, faq, keys, (entry) => ({ name: entry.topic, value: entry.topic }));
  },

  async execute(interaction) {
    const query = interaction.options.getString('topic');

    if (!query) {
      await interaction.reply(shareable(faqListEmbed(faq)));

      return;
    }

    await replyWithBest(interaction, query, faq, keys, {
      plural: 'topics',
      label: (entry) => entry.topic,
      render: faqTopicEmbed,
      shareable: true,
      notFound: { title: 'Topic not found', description: `No FAQ topic \`${query}\`. Run /faq to see every topic.` },
    });
  },
};
