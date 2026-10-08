import type { AutocompleteInteraction } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';

import { findBest, keysOf, respondWithMatches } from '../src/utils/search.js';

interface Entry {
  name: string;
  aliases?: string[];
}

const entries: Entry[] = [
  { name: 'Fire Bolt' },
  { name: 'Fire Wall' },
  { name: 'Frost Nova', aliases: ['nova'] },
  { name: 'Bonfire' },
];

const keys = (entry: Entry) => keysOf(entry, entry.name);
const names = (found: Entry[]) => found.map((entry) => entry.name);
const find = (query: string) => names(findBest(query, entries, keys));

describe('findBest', () => {
  it('finds an exact name', () => {
    expect(find('Fire Bolt')).toEqual(['Fire Bolt']);
  });

  it('ignores case and extra spaces', () => {
    expect(find('  fire   BOLT ')).toEqual(['Fire Bolt']);
  });

  it('finds an alias', () => {
    expect(find('nova')).toEqual(['Frost Nova']);
  });

  it('finds part of a name', () => {
    expect(find('wall')).toEqual(['Fire Wall']);
  });

  it('returns every entry tied for the best match', () => {
    // A prefix of both Fire entries, which beats being somewhere inside Bonfire.
    expect(find('fire')).toEqual(['Fire Bolt', 'Fire Wall']);
  });

  it('tolerates a small typo', () => {
    expect(find('bonfre')).toEqual(['Bonfire']);
    expect(find('forst nova')).toEqual(['Frost Nova']);
  });

  it('finds nothing for a query that is nowhere close', () => {
    expect(find('lightning')).toEqual([]);
  });

  it('finds nothing for an empty query', () => {
    expect(find('')).toEqual([]);
    expect(find('   ')).toEqual([]);
  });
});

/** Runs autocomplete for `typed` and returns the choices it would send to Discord. */
async function suggest(typed: string, items: Entry[]): Promise<{ name: string; value: string }[]> {
  const respond = vi.fn();
  const interaction = { options: { getFocused: () => typed }, respond } as unknown as AutocompleteInteraction;
  await respondWithMatches(interaction, items, keys, (entry) => ({ name: entry.name, value: entry.name }));

  return respond.mock.calls[0]?.[0];
}

describe('respondWithMatches', () => {
  it('ranks exact, then prefix, then word start, then anywhere', async () => {
    const items = ['Bonfire', 'Ice', 'Big Fire', 'Fireball', 'Fire'].map((name) => ({ name }));

    expect((await suggest('fire', items)).map((choice) => choice.name)).toEqual(['Fire', 'Fireball', 'Big Fire', 'Bonfire']);
  });

  it('does not guess at typos', async () => {
    expect(await suggest('bonfre', entries)).toEqual([]);
  });

  it('lists everything in order before anything is typed', async () => {
    expect((await suggest('', entries)).map((choice) => choice.name)).toEqual(names(entries));
  });

  it("stays within Discord's 25 choices of 100 characters", async () => {
    const items = Array.from({ length: 30 }, (_, n) => ({ name: `Entry ${n} ${'x'.repeat(120)}` }));
    const choices = await suggest('entry', items);

    expect(choices).toHaveLength(25);
    expect(choices.every((choice) => choice.name.length <= 100)).toBe(true);
  });
});
