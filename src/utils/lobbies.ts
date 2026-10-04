import type { Lobby } from '../lobbies.js';

export function postUrl(lobby: Lobby): string | undefined {
  return lobby.messageId ? 
    `https://discord.com/channels/${lobby.guildId}/${lobby.channelId}/${lobby.messageId}` : 
    undefined;
}
