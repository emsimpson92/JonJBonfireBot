import { eternals, type OwnedItem } from '../data.js';
import { publicUrl } from '../utils/images.js';
import type { ItemAbility, Stats } from '../types.js';
import { embedLength, MAX_EMBEDS, MAX_MESSAGE_CHARS, truncate } from '../utils/general.js';
import { itemUrl, restates } from '../utils/items.js';
import { baseEmbed } from './general.js';

/** Weapons bind two abilities; crown and amulet abilities have no input to label. */
function inputLabel(ability: ItemAbility): string | undefined {
  if (!ability.input) {
    return undefined;
  }

  return ability.input === 'primary' ? 'Primary' : 'Secondary';
}

function statLine(stats: Stats): string {
  return Object.entries(stats).map(([label, value]) => `**${label}**: ${value}`).join('\n');
}

/**
 * Base stats in full, then one row per upgrade tier showing only what it adds.
 * Tiers that change nothing are not stored, which is why the labels can skip.
 */
function statsBlock(ability: ItemAbility): string {
  const rows = [statLine(ability.stats)];

  for (const upgrade of ability.upgrades ?? []) {
    const parts: string[] = [];

    if (upgrade.changes) {
      parts.push(statLine(upgrade.changes));
    }
    if (upgrade.effect && !(upgrade.changes && restates(upgrade.effect, upgrade.changes))) {
      parts.push(upgrade.effect);
    }
    if (parts.length) {
      rows.push(`\`${upgrade.tier}\` ${parts.join(' — ')}`);
    }
  }

  return rows.join('\n');
}

/**
 * Renders one ability's body. The name is not included: each ability gets its
 * own embed field, and abilityField puts the name, with its input label, on it.
 */
function abilityBlock(ability: ItemAbility): string {
  const lines: string[] = [];

  if (ability.description) {
    lines.push(ability.description);
  }

  if (ability.tags?.length) {
    lines.push(ability.tags.map((tag) => `\`${tag}\``).join(' '));
  }
  lines.push(statsBlock(ability));

  return lines.join('\n');
}

function abilityField(ability: ItemAbility) {
  const label = inputLabel(ability);
  return {
    name: label ? `${label} · ${ability.name}` : ability.name,
    value: truncate(abilityBlock(ability), 1024),
  };
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
    embed.setThumbnail(publicUrl(item.icon));
  }

  if (item.abilities.length) {
    embed.addFields(...item.abilities.map(abilityField));
  }
  else if (item.stats) {
    embed.addFields({ name: 'Stats', value: statLine(item.stats) });
  }

  return eternal ? embed.setFooter({ text: `/eternals name:${eternal.id} for the rest of the set` }) : embed;
}

/** A detail embed per match, or undefined when they won't fit in one message and a list should be shown instead. */
export function itemDetailEmbeds(matches: OwnedItem[]) {
  if (matches.length > MAX_EMBEDS) {
    return undefined;
  }

  const embeds = matches.map(detailEmbed);
  if (embeds.reduce((sum, embed) => sum + embedLength(embed), 0) > MAX_MESSAGE_CHARS) {
    return undefined;
  }

  // One closing hint rather than the same footer on every embed.
  for (const embed of embeds.slice(0, -1)) {
    embed.setFooter(null);
  }

  return embeds;
}

/** Titled by the eternal and slot options that narrowed it down, e.g. "Echo · Weapons". */
export function itemListEmbed(matches: OwnedItem[], owner: string | null, slot: string | null) {
  const ownerName = owner === 'echo' ? 'Echo' : eternals.find((e) => e.id === owner)?.name;
  const label = [ownerName, slot ? `${slot[0]?.toUpperCase()}${slot.slice(1)}s` : null].filter(Boolean).join(' · ');
  const options = matches.map(({ item, eternal }) => `\`${item.slot}\` ${item.name}${eternal ? ` — *${eternal.name}*` : ''}`).join('\n');

  return baseEmbed(label || 'Matching items', `${matches.length} items:\n\n${options}`).setFooter({
    text: 'Narrow it with the eternal and slot options.',
  });
}

/** What /item does, for when it's run with no options. */
export function itemsOverviewEmbed(count: number) {
  return baseEmbed('Items',
    `${count} items across the roster.\n\n` +
      '`/item eternal: slot:` — browse, e.g. Dahla + Crown, or Echo + Weapon\n' +
      '`/item name:` — search by item or ability, with autocomplete\n\n' +
      'The options combine, and any one of them works on its own. ' +
      'Anchors and consumables are under `slot:`.',
  );
}
