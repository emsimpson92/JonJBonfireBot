import { SlashCommandBuilder } from 'discord.js';

import { ephemeral, ephemeralError } from '../embeds/general.js';
import { lobbyKickEmbed } from '../embeds/lobbies.js';
import { lobbyStore } from '../lobbies.js';
import type { Player } from '../lobbies.js';
import { requireHostedLobby, syncPost } from '../lobbyMessages.js';
import { respondWithMatches } from '../utils/search.js';
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
    const kickable = lobbyStore.hostedBy(interaction.user.id)?.players.slice(1) ?? [];
    await respondWithMatches(interaction, kickable, playerKeys, (player) => ({ name: player.name, value: player.id }));
  },

  async execute(interaction) {
    const lobby = await requireHostedLobby(interaction);
    if (!lobby) {
      return;
    }

    const value = interaction.options.getString('player', true);
    const target = lobby.players.find((player) => player.id === value);
    if (!target) {
      await interaction.reply(ephemeralError('Player not found', 'Pick a player from the autocomplete list.'));

      return;
    }

    const removed = lobbyStore.kick(lobby, [target.id]);
    await interaction.reply(ephemeral(lobbyKickEmbed(removed)));

    if (removed.length) {
      await syncPost(interaction.client, lobby);
    }
  },
};
