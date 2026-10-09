import { MessageFlags, MessageFlagsBitField } from 'discord.js';
import type { ActionRowBuilder, ButtonBuilder, MessageComponentInteraction } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';

import { expiresAt, lobbyStore } from '../src/lobbies.js';
import type { Lobby } from '../src/lobbies.js';
import { expiryWarning, handleLobbyComponent, lobbyPost, managePanel } from '../src/lobbyMessages.js';
import { relativeTime } from '../src/utils/general.js';
import { postUrl } from '../src/utils/lobbies.js';

let opened = 0;
let posted = 0;

/** Opens a lobby with a post, under its own code and host, since the store is shared across tests. */
function openLobby(): Lobby {
  opened += 1;
  const result = lobbyStore.create({
    code: `TEST${String(opened).padStart(2, '0')}`,
    region: 'Europe',
    host: { id: `host${opened}`, name: 'Host' },
    guildId: 'guild',
    channelId: 'channel',
  });
  if (!result.ok) {
    throw new Error(`Could not open a lobby: ${result.reason}`);
  }
  result.lobby.messageId = 'original';

  return result.lobby;
}

const hostOf = (lobby: Lobby) => lobby.players[0]?.id ?? '';

/** A reply's buttons' custom ids, keyed by label, or by emoji for the ⚙️ one. */
function buttons(reply: { components: ActionRowBuilder<ButtonBuilder>[] }): Record<string, string> {
  const row = reply.components[0]?.toJSON().components ?? [];

  return Object.fromEntries(row.map((button) => [
    ('label' in button && button.label) || ('emoji' in button && button.emoji?.name) || '',
    'custom_id' in button ? button.custom_id : '',
  ]));
}

/** A click on a button with `customId`, on the public post or on the host's private panel. */
function click(customId: string, userId: string, on: 'post' | 'panel') {
  const channel = {
    isSendable: () => true,
    isTextBased: () => true,
    send: vi.fn(async () => ({ id: `bumped${String(posted += 1)}` })),
    messages: { delete: vi.fn(async () => undefined), edit: vi.fn(async () => undefined) },
  };

  return {
    customId,
    user: { id: userId },
    member: null,
    message: { flags: new MessageFlagsBitField(on === 'panel' ? MessageFlags.Ephemeral : 0) },
    client: { channels: { fetch: vi.fn(async () => channel) } },
    channel,
    reply: vi.fn(),
    update: vi.fn(),
    deferUpdate: vi.fn(),
    editReply: vi.fn(),
    deleteReply: vi.fn(),
    followUp: vi.fn(),
  };
}

const handle = (interaction: ReturnType<typeof click>) =>
  handleLobbyComponent(interaction as unknown as MessageComponentInteraction);

describe('lobby post', () => {
  it('has a ⚙️ button in place of Close Lobby', () => {
    expect(Object.keys(buttons(lobbyPost(openLobby())))).toEqual(['Join', 'Leave', '⚙️']);
  });
});

describe('⚙️ button', () => {
  it('opens the panel privately for the host', async () => {
    const lobby = openLobby();
    const interaction = click(buttons(lobbyPost(lobby))['⚙️'] ?? '', hostOf(lobby), 'post');
    await handle(interaction);

    const reply = interaction.reply.mock.calls[0]?.[0];
    expect(reply.flags).toBe(MessageFlags.Ephemeral);
    expect(reply.embeds[0].data).toMatchObject({ title: 'Lobby Management', description: `Managing lobby **${lobby.code}**.` });
    expect(Object.keys(buttons(reply))).toEqual(['Bump', 'Close Lobby']);
  });

  it('tells anyone else privately that only the host can manage the lobby', async () => {
    const lobby = openLobby();
    const interaction = click(buttons(lobbyPost(lobby))['⚙️'] ?? '', 'someone else', 'post');
    await handle(interaction);

    const reply = interaction.reply.mock.calls[0]?.[0];
    expect(reply.flags).toBe(MessageFlags.Ephemeral);
    expect(reply.embeds[0].data).toMatchObject({ title: 'Lobby Management', description: 'Only the host can manage the lobby.' });
    expect(reply.components).toBeUndefined();
  });
});

describe('Bump', () => {
  // Posting first means a failed post can't leave the lobby with no post at all.
  it('posts the lobby again before deleting the old post, and pushes back expiry', async () => {
    const lobby = openLobby();
    lobby.lastActivityAt -= 60_000;
    const before = lobby.lastActivityAt;
    const interaction = click(buttons(managePanel(lobby)).Bump ?? '', hostOf(lobby), 'panel');
    await handle(interaction);

    const { send, messages } = interaction.channel;
    expect(lobby.lastActivityAt).toBeGreaterThan(before);
    expect(lobby.messageId).toBe((await send.mock.results[0]?.value)?.id);
    expect(messages.delete).toHaveBeenCalledWith('original');
    expect(send.mock.invocationCallOrder[0]).toBeLessThan(messages.delete.mock.invocationCallOrder[0] ?? 0);
    expect(interaction.editReply).toHaveBeenCalled();
  });

  it('posts once however fast it is clicked', async () => {
    const lobby = openLobby();
    const interaction = click(buttons(managePanel(lobby)).Bump ?? '', hostOf(lobby), 'panel');
    await Promise.all(Array.from({ length: 3 }, () => handle(interaction)));

    expect(interaction.channel.send).toHaveBeenCalledTimes(1);
    expect(interaction.deferUpdate).toHaveBeenCalledTimes(3);
  });

  it('leaves the old post up if the new one fails, and can be tried again', async () => {
    const lobby = openLobby();
    const interaction = click(buttons(managePanel(lobby)).Bump ?? '', hostOf(lobby), 'panel');
    interaction.channel.send.mockRejectedValueOnce(new Error('Missing Permissions'));

    await expect(handle(interaction)).rejects.toThrow();
    expect(lobby.messageId).toBe('original');
    expect(interaction.channel.messages.delete).not.toHaveBeenCalled();

    await handle(interaction);
    expect(interaction.channel.send).toHaveBeenCalledTimes(2);
  });

  // The host can leave after opening the panel, handing the lobby to someone else.
  it('stops working for a host who has left', async () => {
    const lobby = openLobby();
    const host = hostOf(lobby);
    lobbyStore.join(lobby, { id: `next${lobby.code}`, name: 'Next' });
    lobbyStore.leave(lobby, host);
    const interaction = click(buttons(managePanel(lobby)).Bump ?? '', host, 'panel');
    await handle(interaction);

    expect(interaction.channel.send).not.toHaveBeenCalled();
    expect(interaction.update.mock.calls[0]?.[0]).toMatchObject({ components: [] });
  });
});

describe('Close Lobby', () => {
  it('closes the lobby, deletes its post and clears the panel', async () => {
    const lobby = openLobby();
    const interaction = click(buttons(managePanel(lobby))['Close Lobby'] ?? '', hostOf(lobby), 'panel');
    await handle(interaction);

    expect(lobby.closed).toBe(true);
    expect(interaction.channel.messages.delete).toHaveBeenCalledWith('original');
    expect(interaction.update.mock.calls[0]?.[0]).toMatchObject({ components: [] });
  });

  // Deleting the clicked message would only dismiss the panel, and leave the post up.
  it('clears a panel for a lobby that has already closed, rather than deleting it', async () => {
    const lobby = openLobby();
    lobbyStore.close(lobby);
    const interaction = click(buttons(managePanel(lobby))['Close Lobby'] ?? '', hostOf(lobby), 'panel');
    await handle(interaction);

    expect(interaction.update.mock.calls[0]?.[0]).toMatchObject({ components: [] });
    expect(interaction.deleteReply).not.toHaveBeenCalled();
  });
});

describe('expiry DM', () => {
  it('asks the host to bump or close the lobby', () => {
    const lobby = openLobby();

    expect(expiryWarning(lobby).embeds[0]?.data.description).toBe(
      `The lobby you are hosting with code **${lobby.code}** is expiring soon. If the lobby is still active, give it a bump. ` +
        'Otherwise, please close the lobby. ' +
        `If no action is taken, the lobby will automatically close ${relativeTime(expiresAt(lobby))}.`,
    );
  });

  // The post shows the current expiry, and its ⚙️ panel has Bump and Close.
  it('links to the post', () => {
    const lobby = openLobby();
    const [link] = expiryWarning(lobby).components[0]?.toJSON().components ?? [];

    expect(link).toMatchObject({ label: 'Go to lobby', url: postUrl(lobby) });
  });

  it('has no link for a lobby whose post never went up', () => {
    const lobby = openLobby();
    delete lobby.messageId;

    expect(expiryWarning(lobby).components).toEqual([]);
  });
});
