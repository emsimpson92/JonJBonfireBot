import { SlashCommandBuilder } from 'discord.js';

import { eternals } from '../data.js';
import { eternalDetailEmbed, eternalListEmbed } from '../embeds/eternals.js';
import { ephemeralError } from '../embeds/general.js';
import { shareable } from '../share.js';
import type { Command } from '../types.js';

export const eternalsCommand: Command = {
  data: new SlashCommandBuilder().setName('eternals')
    .setDescription('Lists every eternal, or shows details for one.')
    .addStringOption((option) =>
      option.setName('name').setDescription('Which eternal')
        .addChoices(...eternals.map((eternal) => ({ name: `${eternal.name}`, value: eternal.id }))),
    ).toJSON(),
  usage: '/eternals [name]',
  examples: ['/eternals', '/eternals name:dahla'],

  async execute(interaction) {
    const id = interaction.options.getString('name');
    if (!id) {
      await interaction.reply(shareable(eternalListEmbed(eternals)));

      return;
    }

    const eternal = eternals.find((candidate) => candidate.id === id);
    if (!eternal) {
      await interaction.reply(ephemeralError('No such eternal', `No eternal matched \`${id}\`. Run /eternals to see the full list.`));

      return;
    }

    await interaction.reply(shareable(eternalDetailEmbed(eternal)));
  },
};
