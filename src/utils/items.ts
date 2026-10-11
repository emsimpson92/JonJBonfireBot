import type { OwnedItem } from '../data.js';
import type { Stats } from '../types.js';
import { normalize } from './general.js';

// Section anchor keeps URLs distinct (Discord merges embeds with the same URL) and restores the owner name the wiki uses but items.json omits.
export function itemUrl({ item, eternal }: OwnedItem): string | undefined {
  return eternal ? `${eternal.wikiUrl}#${encodeURIComponent(`${eternal.name}'s ${item.name}`.replace(/ /g, '_'))}` : undefined;
}

/** Lowercase words with the punctuation dropped, e.g. "Blind Duration: 6s" gives "blind duration 6s". */
const plainWords = (text: string) => normalize(text.replace(/[^a-z0-9]+/gi, ' '));

// True when prose restates the stat change by naming the stat and repeating its numbers (e.g. "Blind Duration 6s" but not "Pirouette flings 2 knives").
export function restates(effect: string, changes: Stats): boolean {
  const prose = plainWords(effect);

  return Object.entries(changes).every(([label, value]) => {
    const namesStat = plainWords(label).split(' ').every((word) => prose.includes(word));
    const digits = value.match(/\d+(?:\.\d+)?/g) ?? [];
    const repeatsValue = digits.length > 0 && digits.every((d) => prose.replace(/\s/g, '').includes(d.replace('.', '')));

    return namesStat && repeatsValue;
  });
}
