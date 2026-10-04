import { EmbedBuilder, MessageFlags } from 'discord.js';

import { truncate } from '../utils/general.js';

/** Discord rejects embed descriptions over 4096 characters. */
const MAX_DESCRIPTION = 4096;

export function baseEmbed(title: string, description?: string): EmbedBuilder {
  const embed = new EmbedBuilder().setColor(0xe25822).setTitle(title);
  if (description !== undefined) {
    embed.setDescription(truncate(description, MAX_DESCRIPTION));
  }

  return embed;
}

export function errorEmbed(title: string, description: string): EmbedBuilder {
  return new EmbedBuilder().setColor(0x992d22).setTitle(title).setDescription(truncate(description, MAX_DESCRIPTION));
}

export function ephemeral(embed: EmbedBuilder): { embeds: EmbedBuilder[]; flags: MessageFlags.Ephemeral } {
  return { embeds: [embed], flags: MessageFlags.Ephemeral as const };
}

export function ephemeralError(title: string, description: string): { embeds: EmbedBuilder[]; flags: MessageFlags.Ephemeral } {
  return ephemeral(errorEmbed(title, description));
}

/** Several entries matched a typed lookup equally well, so they're listed to pick from. */
export function multipleMatchesEmbed(plural: string, query: string, labels: string[]): EmbedBuilder {
  const options = labels.map((label) => `\`${label}\``).join(', ');
  return baseEmbed(`Multiple ${plural} match`, `\`${query}\` matches several: ${options}`);
}
