import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import type { EmbedBuilder, MessageComponentInteraction } from 'discord.js';

import { ephemeral, ephemeralError } from './embeds/general.js';

const SHARE_ID = 'share';

// Keep track of what has been shared
const CLAIM_MS = 60_000;
const claimed = new Set<string>();

export function isShareComponent(id: string): boolean {
  return id === SHARE_ID;
}

export function shareable(...embeds: EmbedBuilder[]) {
  const button = new ButtonBuilder().setCustomId(SHARE_ID).setLabel('Post to channel').setStyle(ButtonStyle.Secondary);

  return { ...ephemeral(...embeds), components: [new ActionRowBuilder<ButtonBuilder>().addComponents(button)] };
}

export async function handleShare(interaction: MessageComponentInteraction): Promise<void> {
  const { channel, message } = interaction;
  if (!channel?.isSendable()) {
    await interaction.reply(ephemeralError("Can't post here", "I can't post in this channel."));

    return;
  }

  // This prevents spam clicks from posting the same thing multiple times
  if (claimed.has(message.id)) {
    await interaction.deferUpdate();

    return;
  }
  claimed.add(message.id);

  try {
    await interaction.deferUpdate();
    await channel.send({
      content: `Shared by <@${interaction.user.id}>`,
      embeds: message.embeds,
      allowedMentions: { parse: [] },
    });
  }
  catch (error) {
    claimed.delete(message.id);
    throw error;
  }

  setTimeout(() => claimed.delete(message.id), CLAIM_MS);
  await interaction.editReply({ components: [] });
}
