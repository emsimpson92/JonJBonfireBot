import { MessageFlags, SlashCommandBuilder } from 'discord.js';

import { abilityBlock } from '../abilities.js';
import { eternals, items, type OwnedItem } from '../data.js';
import { baseEmbed, embedLength, errorEmbed, MAX_EMBEDS, MAX_MESSAGE_CHARS, truncate } from '../embeds.js';
import { findAllBest, findSuggestions, keysOf, respondWithMatches } from '../search.js';
import type { Command, ItemAbility, Stats } from '../types.js';

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

function abilityField(ability: ItemAbility) {
  const prefix = ability.input ? `${ability.input === 'primary' ? 'Primary' : 'Secondary'} · ` : '';
  return { name: `${prefix}${ability.name}`, value: truncate(abilityBlock(ability, { heading: false }), 1024) };
}

/**
 * Discord merges embeds in one message that share a `url`, which would collapse an
 * eternal's items into a single embed. The section anchor keeps each url distinct
 * and still lands on the right wiki page.
 */
function itemUrl({ item, eternal }: OwnedItem): string | undefined {
  return eternal ? `${eternal.wikiUrl}#${encodeURIComponent(item.name.replace(/ /g, '_'))}` : undefined;
}

function statLine(stats: Stats): string {
  return Object.entries(stats).map(([label, value]) => `${label} ${value}`).join(' · ');
}

function detailEmbed(owned: OwnedItem) {
  const { item, eternal } = owned;

  const subtitle = eternal ? `${item.slot} · **${eternal.name}**, ${eternal.title}` : item.slot;
  const body = [subtitle, item.description].filter(Boolean).join('\n\n');

  const embed = baseEmbed(item.name, body);
  const url = itemUrl(owned);
  if (url) {
    embed.setURL(url);
  }
  if (item.icon) {
    embed.setThumbnail(item.icon);
  }

  if (item.abilities.length) {
    embed.addFields(...item.abilities.map(abilityField));
  }
  else if (item.stats) {
    embed.addFields({ name: 'Stats', value: statLine(item.stats) });
  }

  return eternal ? embed.setFooter({ text: `/eternals name:${eternal.id} for the rest of the set` }) : embed;
}

function listEmbed(label: string, matches: OwnedItem[]) {
  const options = matches.map(({ item, eternal }) => `\`${item.slot}\` ${item.name}${eternal ? ` — *${eternal.name}*` : ''}`).join('\n');
  
  return baseEmbed(label, `${matches.length} items:\n\n${options}`).setFooter({
    text: 'Narrow it with the eternal and slot options.',
  });
}

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
    await respondWithMatches(interaction, items, keys, ({ item }) => ({ name: item.name, value: item.name }));
  },

  async execute(interaction) {
    const name = interaction.options.getString('name');
    const owner = interaction.options.getString('eternal');
    const slot = interaction.options.getString('slot');

    // no eternalId for echo
    const echoOnly = owner === 'echo';
    const eternalId = echoOnly ? null : owner;

    // eternal/slot filter the roster; name searches it. They combine.
    let matches = items;
    if (echoOnly) {
      matches = matches.filter(({ eternal }) => !eternal);
    }
    else if (eternalId) {
      matches = matches.filter(({ eternal }) => eternal?.id === eternalId);
    }
    if (slot) {
      matches = matches.filter(({ item }) => item.slot.toLowerCase().startsWith(slot));
    }

    if (name) {
      const found = findAllBest(name, matches, keys);
      if (!found.length) {
        const suggestions = findSuggestions(name, matches, keys);
        const hint = suggestions.length ? 
          `Did you mean: ${suggestions.map(({ item }) => `**${item.name}**`).join(', ')}?` : 
          'Try /eternals to browse the roster.';

        await interaction.reply({
          embeds: [errorEmbed('No such item', `Nothing matched \`${name}\`. ${hint}`)],
          flags: MessageFlags.Ephemeral,
        });

        return;
      }
      matches = found;
    }

    if (!name && !owner && !slot) {
      const embed = baseEmbed(
        'Items',
        `${items.length} items across the roster.\n\n` +
          '`/item eternal: slot:` — browse, e.g. Dahla + Crown, or Echo + Weapon\n' +
          '`/item name:` — search by item or ability, with autocomplete\n\n' +
          'The options combine, and any one of them works on its own. ' +
          'Anchors and consumables are under `slot:`.',
      );
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

      return;
    }

    // Show details if the embeds fit, otherwise a list
    if (matches.length <= MAX_EMBEDS) {
      const embeds = matches.map(detailEmbed);
      const total = embeds.reduce((sum, embed) => sum + embedLength(embed), 0);

      if (total <= MAX_MESSAGE_CHARS) {
        // One closing hint rather than the same footer on every embed.
        for (const embed of embeds.slice(0, -1)) {
          embed.setFooter(null);
        }
        await interaction.reply({ embeds });

        return;
      }
    }

    const ownerName = eternalId === 'echo' ? 'Echo' : eternals.find((e) => e.id === eternalId)?.name;
    const label = [ownerName, slot ? `${slot[0]?.toUpperCase()}${slot.slice(1)}s` : null].filter(Boolean).join(' · ');
    
    await interaction.reply({ embeds: [listEmbed(label || 'Matching items', matches)] });
  },
};
