// Importing data.ts runs its startup checks, so a broken JSON file fails here rather than on deploy.
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { keys as faqKeys } from '../src/commands/faq.js';
import { keys as glossaryKeys } from '../src/commands/glossary.js';
import { itemCommand, keys as itemKeys } from '../src/commands/item.js';
import { eternals, faq, filterItems, glossary, items, itemsOf } from '../src/data.js';
import { findBest } from '../src/utils/search.js';
import { choicesOf } from './helpers.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const normalize = (text: string) => text.toLowerCase().trim().replace(/\s+/g, ' ');

function duplicates(values: string[]): string[] {
  return values.filter((value, index) => values.indexOf(value) !== index);
}

describe('eternals', () => {
  it('have unique ids and names', () => {
    expect(duplicates(eternals.map((eternal) => eternal.id))).toEqual([]);
    expect(duplicates(eternals.map((eternal) => normalize(eternal.name)))).toEqual([]);
  });

  it.each(eternals.map((eternal) => [eternal.name, eternal] as const))('%s carries a crown, an amulet and two weapons', (_, eternal) => {
    const slots = itemsOf(eternal).map((item) => item.slot.split(' ')[0]).sort();

    expect(slots).toEqual(['Amulet', 'Crown', 'Weapon', 'Weapon']);
  });

  it('never share an item', () => {
    expect(duplicates(eternals.flatMap((eternal) => eternal.items))).toEqual([]);
  });

  it('have portraits that exist', () => {
    const missing = eternals.filter((eternal) => eternal.imageUrl && !existsSync(resolve(root, eternal.imageUrl)));

    expect(missing.map((eternal) => eternal.imageUrl)).toEqual([]);
  });
});

describe('items', () => {
  it('have unique ids', () => {
    expect(duplicates(items.map(({ item }) => item.id))).toEqual([]);
  });

  it('have icons that exist', () => {
    const missing = items.filter(({ item }) => item.icon && !existsSync(resolve(root, item.icon)));

    expect(missing.map(({ item }) => item.icon)).toEqual([]);
  });

  it('are each reachable through one of /item\'s slot choices', () => {
    const slots = choicesOf(itemCommand, 'slot');
    const unreachable = items.filter((owned) => !slots.some((slot) => filterItems(null, slot).includes(owned)));

    expect(unreachable.map(({ item }) => `${item.name} (${item.slot})`)).toEqual([]);
  });

  it('give weapons a primary and a secondary ability', () => {
    const weapons = items.filter(({ item }) => item.slot.startsWith('Weapon'));
    const wrong = weapons.filter(({ item }) => item.abilities.map((ability) => ability.input).join('+') !== 'primary+secondary');

    expect(wrong.map(({ item }) => item.name)).toEqual([]);
  });
});

// A key shared by two entries makes the lookup list both instead of answering.
describe('lookups', () => {
  it.each(items.flatMap((owned) => [owned.item.name, owned.item.id, ...(owned.item.aliases ?? [])].map((key) => [key, owned] as const)))(
    '/item name:%s finds only that item',
    (key, owned) => {
      expect(findBest(key, items, itemKeys)).toEqual([owned]);
    },
  );

  it.each(glossary.flatMap((entry) => glossaryKeys(entry).map((key) => [key, entry] as const)))(
    '/glossary term:%s finds only that term',
    (key, entry) => {
      expect(findBest(key, glossary, glossaryKeys)).toEqual([entry]);
    },
  );

  it.each(faq.flatMap((topic) => faqKeys(topic).map((key) => [key, topic] as const)))(
    '/faq topic:%s finds only that topic',
    (key, topic) => {
      expect(findBest(key, faq, faqKeys)).toEqual([topic]);
    },
  );

  // The eternal embed's footer promises that /glossary explains any tag.
  it('every ability tag is a glossary term or alias', () => {
    const terms = new Set(glossary.flatMap(glossaryKeys).map(normalize));
    const tags = new Set([
      ...eternals.flatMap((eternal) => eternal.coreAbility.tags),
      ...items.flatMap(({ item }) => item.abilities.flatMap((ability) => ability.tags ?? [])),
    ]);

    expect([...tags].filter((tag) => !terms.has(normalize(tag)))).toEqual([]);
  });
});
