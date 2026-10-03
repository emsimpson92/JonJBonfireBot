import { EmbedBuilder, MessageFlags } from 'discord.js';

import { config } from './config.js';

/** Discord rejects embed descriptions over 4096 characters. */
const MAX_DESCRIPTION = 4096;

export function baseEmbed(title: string, description?: string): EmbedBuilder {
  const embed = new EmbedBuilder().setColor(config.embedColor).setTitle(title);
  if (description !== undefined) {
    embed.setDescription(truncate(description));
  }

  return embed;
}

export function errorEmbed(title: string, description: string): EmbedBuilder {
  return new EmbedBuilder().setColor(0x992d22).setTitle(title).setDescription(truncate(description));
}

export function ephemeral(embed: EmbedBuilder): { embeds: EmbedBuilder[]; flags: MessageFlags.Ephemeral } {
  return { embeds: [embed], flags: MessageFlags.Ephemeral as const };
}

export function ephemeralError(title: string, description: string): { embeds: EmbedBuilder[]; flags: MessageFlags.Ephemeral } {
  return ephemeral(errorEmbed(title, description));
}

export function truncate(text: string, limit = MAX_DESCRIPTION): string {
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
