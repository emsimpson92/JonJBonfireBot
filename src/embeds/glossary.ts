import type { GlossaryEntry } from '../types.js';
import { baseEmbed } from './general.js';

export function glossaryTermEmbed(entry: GlossaryEntry) {
  return baseEmbed(entry.term, entry.definition);
}

export function glossaryListEmbed(glossary: GlossaryEntry[]) {
  const terms = glossary.map((entry) => `\`${entry.term}\``).join(', ');
  return baseEmbed('Glossary', `**${glossary.length} terms:** ${terms}`);
}
