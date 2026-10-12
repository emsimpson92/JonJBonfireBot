import type { ChatInputCommandInteraction, CommandInteractionOption } from 'discord.js';
import { describe, expect, it } from 'vitest';

import { describeCommand } from '../src/utils/logging.js';

/** A /`name` command from steve in #lobbies on Bonfire, or in DMs when `channel` is null. */
function command(name: string, options: Partial<CommandInteractionOption>[] = [], channel: string | null = 'lobbies') {
  return {
    commandName: name,
    options: { data: options },
    user: { tag: 'steve', id: '1234' },
    inGuild: () => channel !== null,
    channel: channel === null ? null : { name: channel },
    channelId: '5678',
    guild: channel === null ? null : { name: 'Bonfire' },
    guildId: channel === null ? null : '9012',
  } as unknown as ChatInputCommandInteraction;
}

describe('describeCommand', () => {
  it('shows the command as typed, who ran it and where', () => {
    const interaction = command('createlobby', [{ name: 'code', value: 'DX89EE' }, { name: 'region', value: 'Europe' }]);

    expect(describeCommand(interaction)).toBe('/createlobby code:DX89EE region:Europe from steve (1234) in #lobbies on Bonfire (9012)');
  });

  it('shows a command with no options', () => {
    expect(describeCommand(command('socials'))).toBe('/socials from steve (1234) in #lobbies on Bonfire (9012)');
  });

  // Free text is the player's own, so it mustn't be able to fake the rest of the line.
  it('quotes values with spaces or punctuation', () => {
    const interaction = command('createlobby', [{ name: 'description', value: 'Casual, all "welcome"' }]);

    expect(describeCommand(interaction)).toBe('/createlobby description:"Casual, all \\"welcome\\"" from steve (1234) in #lobbies on Bonfire (9012)');
  });

  // Anyone can name a server, so the same goes for its name.
  it('quotes server names with spaces or punctuation', () => {
    const interaction = { ...command('faq'), guild: { name: 'JonJ Bonfire: done' } } as unknown as ChatInputCommandInteraction;

    expect(describeCommand(interaction)).toBe('/faq from steve (1234) in #lobbies on "JonJ Bonfire: done" (9012)');
  });

  it('shows a picked member by name', () => {
    const interaction = command('lobbyadd', [{ name: 'player', value: '999', user: { tag: 'alex' } as CommandInteractionOption['user'] }]);

    expect(describeCommand(interaction)).toBe('/lobbyadd player:@alex from steve (1234) in #lobbies on Bonfire (9012)');
  });

  it('shows the channel id when the channel is not cached', () => {
    const interaction = { ...command('faq'), channel: null } as unknown as ChatInputCommandInteraction;

    expect(describeCommand(interaction)).toBe('/faq from steve (1234) in 5678 on Bonfire (9012)');
  });

  it('shows the server id when the server is not cached', () => {
    const interaction = { ...command('faq'), guild: null } as unknown as ChatInputCommandInteraction;

    expect(describeCommand(interaction)).toBe('/faq from steve (1234) in #lobbies on 9012');
  });

  it('says DMs outside a server', () => {
    expect(describeCommand(command('faq', [], null))).toBe('/faq from steve (1234) in DMs');
  });
});
