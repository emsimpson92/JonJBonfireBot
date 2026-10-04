import { InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js';

import { ephemeralError } from '../embeds/general.js';
import { lobbyStore } from '../lobbies.js';
import type { AddResult, Lobby } from '../lobbies.js';
import { syncPost, toPlayer } from '../lobbyMessages.js';
import type { Command } from '../types.js';

function addError(result: Exclude<AddResult, { ok: true }>, userId: string, lobby: Lobby) {
  switch (result.reason) {
    case 'already-in':
      return ephemeralError('Already in lobby', `<@${userId}> is already in your lobby.`);
    case 'in-other':
      return ephemeralError('In another lobby', `<@${userId}> is in lobby **${result.other.code}**. They need to leave it before you can add them.`);
    case 'full':
      return ephemeralError('Lobby full', `Lobby ${lobby.code} is full.`);
  }
}

export const lobbyAddCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('lobbyadd')
    .setDescription('Adds a player to the lobby you are hosting.')
    .setContexts(InteractionContextType.Guild)
    .addUserOption((option) =>
      option.setName('player')
        .setDescription('The player to add')
        .setRequired(true),
    )
    .toJSON(),
  usage: '/lobbyadd <player>',
  examples: ['/lobbyadd player:@Steve'],

  async execute(interaction) {
    const lobby = lobbyStore.hostedBy(interaction.user.id);
    if (!lobby) {
      await interaction.reply(ephemeralError('Not hosting', 'You are not the lobby host.'));

      return;
    }

    const user = interaction.options.getUser('player', true);
    if (user.bot) {
      await interaction.reply(ephemeralError('Not a player', "Bots can't join lobbies."));

      return;
    }

    const result = lobbyStore.add(lobby, toPlayer(user, interaction.options.getMember('player')));
    if (!result.ok) {
      await interaction.reply(addError(result, user.id, lobby));

      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await syncPost(interaction.client, lobby);
    await interaction.deleteReply()
      .catch((error: unknown) => console.error('Failed to dismiss a /lobbyadd interaction:', error));
  },
};
