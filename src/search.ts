/** Shared lookup for the name-or-alias searches that /eternals and /glossary both do. */

import type { AutocompleteInteraction } from 'discord.js';

import { truncate } from './embeds.js';

interface IndexedKey {
  text: string;
  words: string[];
}

interface IndexedItem<T> {
  item: T;
  keys: IndexedKey[];
}

function normalize(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, ' ');
}

/** Levenshtein distance algorithm for fuzzy matching so typos don't matter */
function distance(source: string, target: string): number {
  const dp = Array.from({ length: target.length + 1 }, (_, i) => i);

  for (let sourceIndex = 1; sourceIndex <= source.length; sourceIndex += 1) {
    let diagonal = dp[0] as number;
    dp[0] = sourceIndex;

    for (let targetIndex = 1; targetIndex <= target.length; targetIndex += 1) {
      const left = dp[targetIndex] as number;
      const cost = source[sourceIndex - 1] === target[targetIndex - 1] ? 0 : 1;
      dp[targetIndex] = Math.min(left + 1, (dp[targetIndex - 1] as number) + 1, diagonal + cost);
      diagonal = left;
    }
  }

  return dp[target.length] as number;
}

/** Lower is better. Exact beats prefix beats substring beats near-miss. */
function score(query: string, keys: IndexedKey[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (const { text: candidate } of keys) {
    let value: number;

    if (candidate === query) {
      value = 0;
    }
    else if (candidate.startsWith(query)) {
      value = 1;
    }
    else if (candidate.includes(query)) {
      value = 2;
    }
    else {
      value = 3 + distance(query, candidate);
    }
    if (value < best) {
      best = value;
    }
  }

  return best;
}

/** Close enough to answer with. Roughly one typo per four characters. */
function isMatch(query: string, result: number): boolean {
  return result <= 3 + Math.max(1, Math.floor(query.length / 4));
}

/** Loose enough to offer as a "did you mean", but not a blind list of everything. */
function isSuggestion(query: string, result: number): boolean {
  return result <= 3 + Math.max(3, Math.ceil(query.length / 2));
}

/** Returns all keys for an item, including aliases. */
export function keysOf(item: { aliases?: string[] }, ...primary: string[]): string[] {
  return [...primary, ...(item.aliases ?? [])];
}

/**
 * Every item tied for the best score, so callers can disambiguate rather than
 * silently pick one. `glossary damage` matches four terms equally well.
 * Empty when nothing is close enough.
 */
export function findBest<T>(query: string, items: T[], keys: (item: T) => string[]): T[] {
  const normalized = normalize(query);
  if (normalized === '') {
    return [];
  }

  const scored = indexFor(items, keys).map((entry) => ({ item: entry.item, result: score(normalized, entry.keys) }));
  const best = scored.reduce((lowest, entry) => Math.min(lowest, entry.result), Number.POSITIVE_INFINITY);
  if (!Number.isFinite(best) || !isMatch(normalized, best)) {
    return [];
  }

  return scored.filter((entry) => entry.result === best).map((entry) => entry.item);
}

/**
 * Ordering for autocomplete: exact, then prefix, then any word start, then
 * anywhere. Without the word-start rung "ring" puts Suffe*ring* Amulet above
 * Ravah's *Ring*blade. Empty query keeps the roster order.
 */
function rankMatches<T>(
  query: string,
  items: T[],
  keys: (item: T) => string[],
  limit = Number.POSITIVE_INFINITY,
): T[] {
  const normalized = normalize(query);
  if (normalized === '') {
    return items.slice(0, limit);
  }

  const ranked: { item: T; rank: number }[] = [];
  for (const { item, keys: candidates } of indexFor(items, keys)) {
    let rank = Number.POSITIVE_INFINITY;
    for (const candidate of candidates) {
      rank = Math.min(rank, rankKey(normalized, candidate));
      if (rank === 0) {
        break;
      }
    }

    if (Number.isFinite(rank)) {
      ranked.push({ item, rank });
    }
  }

  return ranked.sort((a, b) => a.rank - b.rank).slice(0, limit).map((entry) => entry.item);
}

/**
 * Normalized keys per dataset, shared by every search in this file. The data is
 * static and autocomplete fires on every keystroke, so building them once beats
 * re-deriving them for each event. Keyed on the `keys` function, then the array,
 * so callers must pass a stable function. A one-off array — /item searching its
 * own filtered subset — just misses the cache and is collected with it.
 */
const indexes = new WeakMap<object, WeakMap<object, IndexedItem<never>[]>>();

function indexFor<T>(items: T[], keys: (item: T) => string[]): IndexedItem<T>[] {
  let byItems = indexes.get(keys);
  if (!byItems) {
    byItems = new WeakMap();
    indexes.set(keys, byItems);
  }

  let index = byItems.get(items) as IndexedItem<T>[] | undefined;
  if (!index) {
    index = items.map((item) => ({
      item,
      keys: keys(item).map((key) => {
        const text = normalize(key);

        return { text, words: text.split(' ') };
      }),
    }));

    byItems.set(items, index as IndexedItem<never>[]);
  }

  return index;
}

/** Autocomplete ordering: 0 exact, 1 prefix, 2 word start, 3 anywhere, Infinity for no match. */
function rankKey(query: string, key: IndexedKey): number {
  if (key.text === query) {
    return 0;
  }
  if (key.text.startsWith(query)) {
    return 1;
  }
  if (key.words.some((word) => word.startsWith(query))) {
    return 2;
  }
  if (key.text.includes(query)) {
    return 3;
  }

  return Number.POSITIVE_INFINITY;
}

/**
 * Answers an autocomplete interaction with the best matches for what is being
 * typed. Discord allows 25 choices, each name at most 100 characters.
 */
export async function respondWithMatches<T>(
  interaction: AutocompleteInteraction,
  items: T[],
  keys: (item: T) => string[],
  toChoice: (item: T) => { name: string; value: string },
): Promise<void> {
  const matches = rankMatches(interaction.options.getFocused(), items, keys, 25);
  await interaction.respond(matches.map((item) => {
      const { name, value } = toChoice(item);
      return { name: truncate(name, 100), value };
    }),
  );
}

/** Up to `limit` plausible alternatives, for "did you mean" lines. */
export function findSuggestions<T>(query: string, items: T[], keys: (item: T) => string[], limit = 3): T[] {
  const normalized = normalize(query);
  if (normalized === '') {
    return [];
  }

  return indexFor(items, keys).map((entry) => ({ item: entry.item, result: score(normalized, entry.keys) }))
    .filter((entry) => isSuggestion(normalized, entry.result))
    .sort((a, b) => a.result - b.result)
    .slice(0, limit)
    .map((entry) => entry.item);
}
