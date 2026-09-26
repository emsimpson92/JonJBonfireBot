import { MessageFlags, SlashCommandBuilder } from 'discord.js';

import { eternalKeys, eternals, itemsOf } from '../data.js';
import { baseEmbed, errorEmbed, truncate } from '../embeds.js';
import { findBest, findSuggestions } from '../search.js';
import type { Command, Eternal } from '../types.js';

function detailEmbed(eternal: Eternal) {
  const { coreAbility: core } = eternal;

  let abilityValue = `${core.description}\n${core.tags.map((tag) => `\`${tag}\``).join(' ')}`;

  // Core ability details
  if (core.stats?.length) {
    const parts = core.stats.map((stat) => `**${stat.name}:** ${stat.value}`);
    abilityValue += `\n${parts.join('\n')}`;
  }

  const embed = baseEmbed(`${eternal.name} — ${eternal.title}`, eternal.description).setURL(eternal.wikiUrl)
    .addFields({
      name: `Eternal Ability: ${core.name}`,
      value: abilityValue,
    });

  // Set bonus
  embed.addFields({ name: `Set Bonus: ${eternal.setBonus.name}`, value: eternal.setBonus.description });

  // Item list. Item abilities can be found using /item
  const itemLines = itemsOf(eternal).map((item) => `\`${item.slot}\` **${item.name}**`);
  if (itemLines.length) {
    embed.addFields({ name: 'Items', value: truncate(itemLines.join('\n'), 1024) });
  }

  if (eternal.imageUrl) {
    embed.setThumbnail(eternal.imageUrl);
  }

  return embed.setFooter({ text: "/item for an item's abilities · /glossary explains any tag" });
}

function listEmbed() {
  const lines = eternals.map((eternal) => `**${eternal.name}**`).join('\n');
  return baseEmbed(`Eternals (${eternals.length})`, lines || 'No eternals are configured yet.').setFooter({
    text: 'Use /eternals <name> for details on one.',
  });
}

export const eternalsCommand: Command = {
  data: new SlashCommandBuilder().setName('eternals')
    .setDescription('Lists every eternal, or shows details for one.')
    .addStringOption((option) =>
      option.setName('name').setDescription('Which eternal')
        .addChoices(...eternals.map((eternal) => ({ name: `${eternal.name}`, value: eternal.id }))),
    ).toJSON(),
  usage: '/eternals [name]',
  examples: ['/eternals', '/eternals name:dahla'],

  async execute(interaction) {
    const query = interaction.options.getString('name');
    if (!query) {
      await interaction.reply({ embeds: [listEmbed()] });

      return;
    }

    const matches = findBest(query, eternals, eternalKeys);

    if (matches.length === 1) {
      await interaction.reply({ embeds: [detailEmbed(matches[0] as Eternal)] });

      return;
    }

    // Reachable when a value is typed rather than picked from the choices.
    if (matches.length > 1) {
      const options = matches.map((eternal) => `**${eternal.name}**`).join('\n');
      await interaction.reply({
        embeds: [baseEmbed('Multiple eternals match', `\`${query}\` matches several:\n\n${options}`)],
        flags: MessageFlags.Ephemeral,
      });

      return;
    }

    const suggestions = findSuggestions(query, eternals, eternalKeys);
    const hint = suggestions.length ? 
      `Did you mean: ${suggestions.map((eternal) => `**${eternal.name}**`).join(', ')}?` : 
      'Run /eternals to see the full list.';
      
    await interaction.reply({
      embeds: [errorEmbed('No such eternal', `No eternal matched \`${query}\`. ${hint}`)],
      flags: MessageFlags.Ephemeral,
    });
  },
};
