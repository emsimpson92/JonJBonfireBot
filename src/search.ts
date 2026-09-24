/** Shared lookup for the name-or-alias searches that /eternals and /glossary both do. */

import type { AutocompleteInteraction } from 'discord.js';

import { truncate } from './embeds.js';

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
function score(query: string, keys: string[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (const key of keys) {
    const candidate = normalize(key);
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
export function findAllBest<T>(query: string, items: T[], keys: (item: T) => string[]): T[] {
  const needle = normalize(query);
  if (needle === '') {
    return [];
  }

  const scored = items.map((item) => ({ item, result: score(needle, keys(item)) }));
  const best = scored.reduce((lowest, entry) => Math.min(lowest, entry.result), Number.POSITIVE_INFINITY);
  if (!Number.isFinite(best) || !isMatch(needle, best)) {
    return [];
  }

  return scored.filter((entry) => entry.result === best).map((entry) => entry.item);
}

/** Best single match, or undefined when nothing is close enough. */
export function findBest<T>(query: string, items: T[], keys: (item: T) => string[]): T | undefined {
  return findAllBest(query, items, keys)[0];
}

/**
 * Ordering for autocomplete: exact, then prefix, then any word start, then
 * anywhere. Without the word-start rung "ring" puts Suffe*ring* Amulet above
 * Ravah's *Ring*blade. Empty query keeps the roster order.
 */
export function rankMatches<T>(query: string, items: T[], keys: (item: T) => string[]): T[] {
  const needle = normalize(query);
  if (needle === '') {
    return [...items];
  }

  const ranked: { item: T; rank: number }[] = [];
  for (const item of items) {
    const candidates = keys(item).map(normalize);
    let rank: number | undefined;

    if (candidates.some((key) => key === needle)) {
      rank = 0;
    }
    else if (candidates.some((key) => key.startsWith(needle))) {
      rank = 1;
    }
    else if (candidates.some((key) => key.split(' ').some((word) => word.startsWith(needle)))) {
      rank = 2;
    }
    else if (candidates.some((key) => key.includes(needle))) {
      rank = 3;
    }

    if (rank !== undefined) {
      ranked.push({ item, rank });
    }
  }

  return ranked.sort((a, b) => a.rank - b.rank).map((entry) => entry.item);
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
  const matches = rankMatches(interaction.options.getFocused(), items, keys);
  await interaction.respond(matches.slice(0, 25).map((item) => {
      const { name, value } = toChoice(item);
      return { name: truncate(name, 100), value };
    }),
  );
}

/** Up to `limit` plausible alternatives, for "did you mean" lines. */
export function findSuggestions<T>(query: string, items: T[], keys: (item: T) => string[], limit = 3): T[] {
  const needle = normalize(query);
  if (needle === '') {
    return [];
  }

  return items.map((item) => ({ item, result: score(needle, keys(item)) }))
    .filter((entry) => isSuggestion(needle, entry.result))
    .sort((a, b) => a.result - b.result)
    .slice(0, limit)
    .map((entry) => entry.item);
}
