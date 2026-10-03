import { SlashCommandBuilder } from 'discord.js';

import { baseEmbed, ephemeral, ephemeralError } from '../embeds.js';
import { isHost, lobbyStore } from '../lobbies.js';
import type { Player } from '../lobbies.js';
import { syncPost } from '../lobbyMessages.js';
import { respondWithMatches } from '../search.js';
import type { Command } from '../types.js';

const playerKeys = (player: Player) => [player.name];

export const lobbyKickCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('lobbykick')
    .setDescription('Removes a player from the lobby you are hosting.')
    .addStringOption((option) =>
      option.setName('player')
        .setDescription('The player to remove')
        .setRequired(true)
        .setAutocomplete(true),
    )
    .toJSON(),
  usage: '/lobbykick <player>',
  examples: ['/lobbykick player:Steve'],

  async autocomplete(interaction) {
    const lobby = lobbyStore.lobbyOf(interaction.user.id);
    const kickable = lobby && isHost(lobby, interaction.user.id) ? lobby.players.slice(1) : [];
    await respondWithMatches(interaction, kickable, playerKeys, (player) => ({ name: player.name, value: player.id }));
  },

  async execute(interaction) {
    const lobby = lobbyStore.lobbyOf(interaction.user.id);
    if (!lobby || !isHost(lobby, interaction.user.id)) {
      await interaction.reply(ephemeralError('Not hosting', "You are not the lobby host."));

      return;
    }

    const value = interaction.options.getString('player', true);
    const target = lobby.players.find((player) => player.id === value);
    if (!target) {
      await interaction.reply(ephemeralError('Player not found', 'Pick a player from the autocomplete list.'));

      return;
    }

    const removed = lobbyStore.kick(lobby, [target.id]);
    const note = removed.length
      ? `Removed ${removed.map((player) => `<@${player.id}>`).join(', ')}.`
      : 'They had already left.';
    await interaction.reply(ephemeral(baseEmbed('Lobby kick', note)));

    if (removed.length) {
      await syncPost(interaction.client, lobby);
    }
  },
};
