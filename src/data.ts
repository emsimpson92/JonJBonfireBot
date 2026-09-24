import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { keysOf } from './search.js';
import type { Eternal, GlossaryEntry, Item } from './types.js';

const dataDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'data');

function load<T>(file: string): T[] {
  const contents = readFileSync(resolve(dataDir, file), 'utf8');
  const parsed: unknown = JSON.parse(contents);
  if (!Array.isArray(parsed)) {
    throw new Error(`Expected ${file} to contain a JSON array.`);
  }

  return parsed as T[];
}

export const eternals: Eternal[] = load<Eternal>('eternals.json');
export const glossary: GlossaryEntry[] = load<GlossaryEntry>('glossary.json');

const allItems: Item[] = load<Item>('items.json');
const itemsById = new Map(allItems.map((item) => [item.id, item]));

export interface OwnedItem {
  item: Item;
  eternal?: Eternal;
}

const ownerById = new Map<string, Eternal>();
for (const eternal of eternals) {
  for (const id of eternal.items) {
    if (!itemsById.has(id)) {
      throw new Error(`${eternal.id} references unknown item "${id}" in items.json`);
    }
    ownerById.set(id, eternal);
  }
}

export const items: OwnedItem[] = allItems.map((item) => {
  const eternal = ownerById.get(item.id);
  return eternal ? { item, eternal } : { item };
});

/** The four items an eternal carries, resolved from their ids. */
export function itemsOf(eternal: Eternal): Item[] {
  return eternal.items.map((id) => itemsById.get(id) as Item);
}

/** How an eternal is looked up, shared by /eternals and /item. */
export const eternalKeys = (eternal: Eternal): string[] => keysOf(eternal, eternal.id, eternal.name, eternal.title);