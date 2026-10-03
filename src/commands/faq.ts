import { SlashCommandBuilder } from 'discord.js';

import { faq } from '../data.js';
import { baseEmbed, ephemeral, ephemeralError, truncate } from '../embeds.js';
import { findBest, keysOf, respondWithMatches } from '../search.js';
import type { Command, FaqTopic } from '../types.js';

const keys = (entry: FaqTopic) => keysOf(entry, entry.topic);

function topicEmbed(entry: FaqTopic) {
  return baseEmbed(entry.topic).addFields(
    entry.entries.map((qa, index) => ({ name: truncate(`${index + 1}. ${qa.question}`, 256), value: qa.answer })),
  );
}

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
      const list = faq.length ?
        `**${faq.length} ${faq.length === 1 ? 'topic' : 'topics'}:**\n${faq.map((entry) => `\`${entry.topic}\``).join('\n')}` :
        'No FAQ topics have been added yet.';

      await interaction.reply(ephemeral(baseEmbed('Frequently Asked Questions', list).setFooter({ text: 'Use /faq <topic> to read one.' })));

      return;
    }

    const matches = findBest(query, faq, keys);

    if (matches.length === 1) {
      await interaction.reply({ embeds: [topicEmbed(matches[0] as FaqTopic)] });

      return;
    }

    // Several topics match equally - not convinced this is valid
    if (matches.length > 1) {
      const options = matches.map((entry) => `\`${entry.topic}\``).join(', ');
      await interaction.reply(ephemeral(baseEmbed('Multiple topics match', `\`${query}\` matches several: ${options}`)));

      return;
    }

    await interaction.reply(ephemeralError('Topic not found', `No FAQ topic \`${query}\`. Run /faq to see every topic.`));
  },
};
