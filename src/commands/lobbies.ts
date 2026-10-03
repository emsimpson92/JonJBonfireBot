import { SlashCommandBuilder } from 'discord.js';

import { baseEmbed, ephemeral } from '../embeds.js';
import { lobbyStore, MAX_PLAYERS, MODES, REGIONS } from '../lobbies.js';
import type { Lobby } from '../lobbies.js';
import { postUrl, unixSeconds } from '../lobbyMessages.js';
import type { Command } from '../types.js';

/** An embed holds at most 25 fields, one per lobby. */
const MAX_LISTED = 25;

function lobbyField(lobby: Lobby) {
  const url = postUrl(lobby);
  const parts = [
    ...(lobby.mode ? [lobby.mode] : []),
    `${lobby.players.length}/${MAX_PLAYERS} players`,
    `active <t:${unixSeconds(lobby.lastActivityAt)}:R>`,
    ...(url ? [`[Go to lobby](${url})`] : []),
  ];

  return { name: lobby.code, value: parts.join(' · ') };
}

export const lobbiesCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('lobbies')
    .setDescription('Lists open lobbies, most recently active first.')
    .addStringOption((option) =>
      option.setName('region')
        .setDescription('Only show lobbies in this region')
        .addChoices(...REGIONS.map((region) => ({ name: region, value: region }))),
    )
    .addStringOption((option) =>
      option.setName('mode')
        .setDescription('Only show lobbies playing this mode')
        .addChoices(...MODES.map((mode) => ({ name: mode, value: mode }))),
    )
    .toJSON(),
  usage: '/lobbies [region] [mode]',
  examples: ['/lobbies', '/lobbies region:Europe', '/lobbies region:Europe mode:Spires'],

  async execute(interaction) {
    const region = interaction.options.getString('region');
    const mode = interaction.options.getString('mode');
    const open = lobbyStore.list()
      .filter((lobby) => (!region || lobby.region === region) && (!mode || lobby.mode === mode));
    const filters = [...(region ? [region] : []), ...(mode ? [mode] : [])];
    const title = filters.length ? `Open lobbies - ${filters.join(', ')}` : 'Open lobbies';

    if (!open.length) {
      await interaction.reply(ephemeral(baseEmbed(title, `No open ${mode ? `${mode} ` : ''}lobbies${region ? ` in ${region}` : ''}. Start one with /createlobby.`)));

      return;
    }

    const shown = open.slice(0, MAX_LISTED);
    let footer = `${open.length} open ${open.length === 1 ? 'lobby' : 'lobbies'}`;
    if (open.length > shown.length) {
      const unused = [...(region ? [] : ['region:']), ...(mode ? [] : ['mode:'])];
      footer = `Showing the ${shown.length} most recently active of ${open.length}.` +
        (unused.length ? ` Narrow it with ${unused.join(' or ')}.` : '');
    }

    await interaction.reply(ephemeral(baseEmbed(title).addFields(shown.map(lobbyField)).setFooter({ text: footer })));
  },
};
