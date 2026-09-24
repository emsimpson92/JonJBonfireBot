import type { ItemAbility, Stats } from './types.js';

/** Weapons bind two abilities; crown and amulet abilities have no input to label. */
export function inputBadge(ability: ItemAbility): string {
  return ability.input ? `\`${ability.input === 'primary' ? 'Primary' : 'Secondary'}\` ` : '';
}

function statLine(stats: Stats): string {
  return Object.entries(stats).map(([label, value]) => `${label} ${value}`).join(' · ');
}

const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * True when the wiki's prose only restates the stat change: "Blind Duration 6s"
 * against "Blind duration increased to 6 seconds". It has to name the stat that
 * moved *and* repeat its numbers — "Pirouette flings 2 knives every rotation"
 * names neither, so it survives alongside "Ranged Damage 9 / 9 · Ammo 12".
 */
function restates(effect: string, changes: Stats): boolean {
  const prose = normalize(effect);

  return Object.entries(changes).every(([label, value]) => {
    const namesStat = normalize(label).split(' ').every((word) => prose.includes(word));
    const digits = value.match(/\d+(?:\.\d+)?/g) ?? [];
    const repeatsValue = digits.length > 0 && digits.every((d) => prose.replace(/\s/g, '').includes(d.replace('.', '')));
    
    return namesStat && repeatsValue;
  });
}

/**
 * Base stats in full, then one row per upgrade tier showing only what it adds.
 * Tiers that change nothing are not stored, which is why the labels can skip.
 */
export function statsBlock(ability: ItemAbility): string {
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
 * Renders one ability. `heading` puts the name inline, for when several abilities
 * share a single embed field; /item gives each its own field and omits it.
 */
export function abilityBlock(ability: ItemAbility, { heading }: { heading: boolean }): string {
  const lines: string[] = [];

  if (heading) {
    const title = `${inputBadge(ability)}**${ability.name}**`;
    lines.push(ability.description ? `${title}\n${ability.description}` : title);
  }
  else if (ability.description) {
    lines.push(ability.description);
  }

  if (ability.tags?.length) {
    lines.push(ability.tags.map((tag) => `\`${tag}\``).join(' '));
  }
  lines.push(statsBlock(ability));

  return lines.join('\n');
}
