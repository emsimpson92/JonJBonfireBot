import type { EmbedBuilder } from 'discord.js';

// Discord's hard limits. Going over any of them gets the whole reply rejected.
export const MAX_EMBED_DESCRIPTION = 4096;
export const MAX_FIELD_NAME = 256;
export const MAX_FIELD_VALUE = 1024;
export const MAX_FIELDS = 25;
export const MAX_MESSAGE_CHARS = 6000;

/** An autocomplete reply offers at most 25 choices, each named in at most 100 characters. */
export const MAX_CHOICES = 25;
export const MAX_CHOICE_NAME = 100;

export function embedLength(embed: EmbedBuilder): number {
  const { title, description, footer, author, fields } = embed.data;
  return (
    (title?.length ?? 0) +
    (description?.length ?? 0) +
    (footer?.text.length ?? 0) +
    (author?.name.length ?? 0) +
    (fields ?? []).reduce((total, field) => total + field.name.length + field.value.length, 0)
  );
}
