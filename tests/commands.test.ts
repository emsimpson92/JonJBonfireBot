// Importing the registry builds every command, and the builders throw on anything Discord would
// refuse to register: bad names, descriptions over 100 characters, more than 25 choices.
import type { ChatInputCommandInteraction } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';

import { lobbyCreateCommand } from '../src/commands/createlobby.js';
import { commands, commandsIn, findCommand, registrations } from '../src/commands/registry.js';
import { config } from '../src/config.js';
import { slowDown } from '../src/embeds/general.js';
import { lobbyStore, MAX_OWNED_LOBBIES } from '../src/lobbies.js';
import type { Command } from '../src/types.js';

const byName = commands.map((command) => [command.data.name, command] as const);

/** Set by vitest.config.ts. */
const LOBBY_SERVER = config.lobbyGuildId as string;
const OTHER_SERVER = '100000000000000002';
const LOBBY_COMMANDS = ['createlobby', 'lobbies', 'lobbyadd', 'lobbykick'];

const namesOf = (list: Command[] | undefined) => (list ?? []).map((command) => command.data.name);
const lobbyNamesIn = (list: Command[] | undefined) => namesOf(list).filter((name) => LOBBY_COMMANDS.includes(name));

describe('commands', () => {
  it('have unique names', () => {
    const names = commands.map((command) => command.data.name);

    expect(new Set(names).size).toBe(names.length);
  });

  it.each(byName)('/%s is found by its name in the lobby server', (name, command) => {
    expect(findCommand(name, LOBBY_SERVER)).toBe(command);
  });

  // /help shows these, so a copy-pasted usage line would teach the wrong command.
  it.each(byName)('/%s has usage and examples for itself', (name, command) => {
    const ownSyntax = new RegExp(`^/${name}( |$)`);

    expect(command.usage).toMatch(ownSyntax);
    expect(command.examples.length).toBeGreaterThan(0);
    for (const example of command.examples) {
      expect(example).toMatch(ownSyntax);
    }
  });

  // Discord shows "Loading options failed" for an autocomplete option with no handler.
  it.each(byName)('/%s handles autocomplete if an option asks for it', (_, command) => {
    const wantsAutocomplete = (command.data.options ?? []).some((option) => 'autocomplete' in option && option.autocomplete);

    expect(Boolean(command.autocomplete)).toBe(wantsAutocomplete);
  });
});

// The lobby feature is for one server only, so nobody else should see it or be able to run it.
describe('lobby commands', () => {
  it.each(byName)('/%s is only found outside the lobby server if it is not a lobby command', (name, command) => {
    const expected = LOBBY_COMMANDS.includes(name) ? undefined : command;

    expect(findCommand(name, OTHER_SERVER)).toBe(expected);
    expect(findCommand(name, null)).toBe(expected);
  });

  // /help lists these, so it mustn't advertise lobby commands where they don't exist.
  it('are only listed in the lobby server', () => {
    expect(namesOf(commandsIn(LOBBY_SERVER))).toEqual(expect.arrayContaining(LOBBY_COMMANDS));
    expect(lobbyNamesIn(commandsIn(OTHER_SERVER))).toEqual([]);
    expect(namesOf(commandsIn(null))).toEqual(namesOf(commandsIn(OTHER_SERVER)));
  });

  it('register only to the lobby server, with the rest global', () => {
    const targets = registrations(undefined, LOBBY_SERVER);

    expect([...targets.keys()]).toEqual([undefined, LOBBY_SERVER]);
    expect(namesOf(targets.get(LOBBY_SERVER)).sort()).toEqual([...LOBBY_COMMANDS].sort());
    expect(namesOf(targets.get(undefined))).toEqual(namesOf(commandsIn(OTHER_SERVER)));
  });

  // Registering replaces everything a server had, so two lists for one server would undo each other.
  it('register in one go when testing in the lobby server', () => {
    const targets = registrations(LOBBY_SERVER, LOBBY_SERVER);

    expect([...targets.keys()]).toEqual([LOBBY_SERVER]);
    expect(targets.get(LOBBY_SERVER)).toEqual(commands);
  });

  it('register nowhere without a lobby server', () => {
    const targets = registrations(undefined, undefined);

    expect([...targets.keys()]).toEqual([undefined]);
    expect(lobbyNamesIn(targets.get(undefined))).toEqual([]);
  });
});

/** /createlobby from `userId`, answered as Discord would. */
async function createLobby(userId: string, code: string) {
  const interaction = {
    inGuild: () => true,
    guildId: 'guild',
    channelId: 'channel',
    user: { id: userId, tag: userId, displayName: userId },
    member: null,
    options: { getString: (name: string) => ({ code, region: 'Europe' } as Record<string, string>)[name] ?? null },
    client: { channels: { fetch: vi.fn(async () => null) } },
    reply: vi.fn<(options: unknown) => Promise<unknown>>(async () => ({ resource: { message: { id: `post${code}` } } })),
    followUp: vi.fn(),
  };
  await lobbyCreateCommand.execute(interaction as unknown as ChatInputCommandInteraction);

  return interaction.reply.mock.calls[0]?.[0];
}

describe('/createlobby', () => {
  // Telling them the real reason would show someone draining the pool how to get around it.
  it(`gives the rate limit notice to a player who created ${MAX_OWNED_LOBBIES} lobbies that are still open`, async () => {
    for (let n = 0; n < MAX_OWNED_LOBBIES; n += 1) {
      await createLobby('owner', `OWNED${n}`);
      const lobby = lobbyStore.lobbyOf('owner');
      lobbyStore.join(lobby!, { id: `player${n}`, name: 'Player' });
    }

    expect(await createLobby('owner', 'ONEMOR')).toEqual(slowDown('ephemeral'));
  });
});
