import { SlashCommandBuilder } from 'discord.js';

import { eternals, filterItems, items, type OwnedItem } from '../data.js';
import { ephemeral, ephemeralError } from '../embeds/general.js';
import { itemDetailEmbeds, itemListEmbed, itemsOverviewEmbed } from '../embeds/items.js';
import { findBest, keysOf, respondWithMatches } from '../utils/search.js';
import type { Command } from '../types.js';

/** Searchable by item name, its aliases, the abilities it grants, and its owner. */
const keys = ({ item, eternal }: OwnedItem) =>
  keysOf(
    item,
    item.name,
    item.id,
    ...(eternal ? [eternal.name] : ['echo']),
    ...item.abilities.map((ability) => ability.name),
  );

const SLOTS = ['Crown', 'Amulet', 'Weapon', 'Anchor', 'Consumable'] as const;

export const itemCommand: Command = {
  data: new SlashCommandBuilder().setName('item')
    .setDescription('Shows an item and the abilities it grants.')
    .addStringOption((option) =>
      option.setName('eternal')
        .setDescription('Whose item, or Echo for the ones tied to no eternal')
        .addChoices(
          { name: 'Echo', value: 'echo' },
          ...eternals.map((eternal) => ({ name: eternal.name, value: eternal.id })),
        ),
    ).addStringOption((option) =>
      option.setName('slot')
        .setDescription('Which slot')
        .addChoices(...SLOTS.map((slot) => ({ name: slot, value: slot.toLowerCase() }))),
    ).addStringOption((option) =>
      option.setName('name').setDescription('Item or ability name').setAutocomplete(true),
    ).toJSON(),
  usage: '/item [eternal] [slot] [name]',
  examples: ['/item eternal:dahla slot:crown', '/item eternal:rynshi slot:weapon', '/item name:ringblade'],

  async autocomplete(interaction) {
    const roster = filterItems(interaction.options.getString('eternal'), interaction.options.getString('slot'));
    await respondWithMatches(interaction, roster, keys, ({ item }) => ({ name: item.name, value: item.name }));
  },

  async execute(interaction) {
    const name = interaction.options.getString('name');
    const owner = interaction.options.getString('eternal');
    const slot = interaction.options.getString('slot');

    let matches = filterItems(owner, slot);
    if (name) {
      const found = findBest(name, matches, keys);
      if (!found.length) {
        await interaction.reply(ephemeralError('No such item', `Nothing matched \`${name}\`. Try /eternals to browse the roster.`));

        return;
      }
      matches = found;
    }

    if (!name && !owner && !slot) {
      await interaction.reply(ephemeral(itemsOverviewEmbed(items.length)));

      return;
    }

    // Show details if the embeds fit, otherwise a list
    const details = itemDetailEmbeds(matches);
    if (details) {
      await interaction.reply({ embeds: details });

      return;
    }

    await interaction.reply({ embeds: [itemListEmbed(matches, owner, slot)] });
  },
};
