import { SlashCommandBuilder } from 'discord.js';

import { channelUrl } from '../config.js';
import { baseEmbed } from '../embeds.js';
import type { Command } from '../types.js';

interface LinkCommandOptions {
  name: string;
  description: string;
  channelId: string;
  title: string;
  blurb: string;
}

/** /faq and /playtest differ only in their copy, so they share one builder. */
export function linkCommand(options: LinkCommandOptions): Command {
  return {
    data: new SlashCommandBuilder().setName(options.name).setDescription(options.description).toJSON(),
    usage: `/${options.name}`,
    examples: [`/${options.name}`],
    async execute(interaction) {
      const url = channelUrl(options.channelId);
      const link = url ? `<#${options.channelId}> — [open channel](${url})` : `<#${options.channelId}>`;
      await interaction.reply({ embeds: [baseEmbed(options.title, `${options.blurb}\n\n${link}`)] });
    },
  };
}
