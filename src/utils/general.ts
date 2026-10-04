import type { EmbedBuilder } from 'discord.js';

export function truncate(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}

/** Discord counts at most 10 embeds and 6000 characters across one message. */
/** No more than 3 embeds per message because we don't want to spam the chat */
export const MAX_EMBEDS = 3;
export const MAX_MESSAGE_CHARS = 6000;

/** The character count Discord measures against that 6000 budget. */
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

/** A Discord timestamp shown as relative time ("in 2 hours"), which counts on its own without edits. */
export function relativeTime(ms: number): string {
  return `<t:${Math.floor(ms / 1000)}:R>`;
}
