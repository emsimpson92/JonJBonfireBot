import { itemsOf } from '../data.js';
import { publicUrl } from '../utils/images.js';
import type { Eternal } from '../types.js';
import { truncate } from '../utils/general.js';
import { baseEmbed } from './general.js';

export function eternalDetailEmbed(eternal: Eternal) {
  const { coreAbility: core } = eternal;

  let abilityValue = `${core.description}\n${core.tags.map((tag) => `\`${tag}\``).join(' ')}`;

  // Eternal ability details
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
    embed.setThumbnail(publicUrl(eternal.imageUrl));
  }

  return embed.setFooter({ text: "/item for an item's abilities · /glossary explains any tag" });
}

export function eternalListEmbed(eternals: Eternal[]) {
  const lines = eternals.map((eternal) => `**${eternal.name}**`).join('\n');
  return baseEmbed(`Eternals (${eternals.length})`, lines || 'No eternals are configured yet.').setFooter({
    text: 'Use /eternals <name> for details on one.',
  });
}
