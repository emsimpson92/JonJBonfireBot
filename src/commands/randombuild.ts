import { SlashCommandBuilder } from 'discord.js';

import { filterItems, type OwnedItem } from '../data.js';
import { randomBuildEmbed } from '../embeds/builds.js';
import { ephemeral } from '../embeds/general.js';
import type { Command } from '../types.js';

const inRotation = ({ eternal }: OwnedItem) => !eternal || eternal.inRotation;

const crowns = filterItems(null, 'crown').filter(inRotation);
const amulets = filterItems(null, 'amulet').filter(inRotation);
const weapons = filterItems(null, 'weapon').filter(inRotation);

function pickDistinct<T>(pool: T[], count: number): T[] {
  const remaining = [...pool];
  const picked: T[] = [];
  for (let index = 0; index < count; index += 1) {
    picked.push(...remaining.splice(Math.floor(Math.random() * remaining.length), 1));
  }

  return picked;
}

export const randomBuildCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('randombuild')
    .setDescription('Rolls a random build: a crown, an amulet and two different weapons.')
    .toJSON(),
  usage: '/randombuild',
  examples: ['/randombuild'],

  async execute(interaction) {
    const build = [...pickDistinct(crowns, 1), ...pickDistinct(amulets, 1), ...pickDistinct(weapons, 2)];
    await interaction.reply(ephemeral(randomBuildEmbed(build)));
  },
};
