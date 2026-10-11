import { MessageFlags, PermissionFlagsBits, PermissionsBitField } from 'discord.js';
import type { MessageComponentInteraction } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';

import { baseEmbed } from '../src/embeds/general.js';
import { handleShare, isShareComponent, shareable } from '../src/share.js';

const embeds = [baseEmbed('Socials', 'Links').toJSON()];

const { EmbedLinks, SendMessages, SendMessagesInThreads } = PermissionFlagsBits;

let messageId = 0;

interface ClickOptions {
  sendable?: boolean;
  /** The clicker's permissions in the channel, or null for a DM, which has none. */
  permissions?: bigint[] | null;
  thread?: boolean;
}

/** A click on a Post to channel button, on a new reply showing `embeds`. */
function click({ sendable = true, permissions = null, thread = false }: ClickOptions = {}) {
  messageId += 1;

  return {
    user: { id: '1' },
    memberPermissions: permissions && new PermissionsBitField(permissions),
    message: { id: String(messageId), embeds },
    channel: {
      isSendable: () => sendable,
      isThread: () => thread,
      send: vi.fn(),
    },
    reply: vi.fn(),
    deferUpdate: vi.fn(),
    followUp: vi.fn(),
    editReply: vi.fn(),
  };
}

const share = (interaction: ReturnType<typeof click>) => handleShare(interaction as unknown as MessageComponentInteraction);

describe('Post to channel', () => {
  it('starts as a private reply carrying a button the handler recognizes', () => {
    const reply = shareable(baseEmbed('Socials'));
    const [button] = reply.components[0]?.toJSON().components ?? [];

    expect(reply.flags).toBe(MessageFlags.Ephemeral);
    expect(button && 'custom_id' in button && isShareComponent(button.custom_id)).toBe(true);
  });

  // A follow-up would show as a reply to the private message, which reads as deleted once dismissed.
  it('posts the clicked embeds to the channel, not as a reply, then removes the button', async () => {
    const interaction = click();
    await handleShare(interaction as unknown as MessageComponentInteraction);

    const posted = interaction.channel.send.mock.calls[0]?.[0];
    expect(posted.embeds).toEqual(embeds);
    expect(interaction.followUp).not.toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalledWith({ components: [] });
  });

  // Each click is its own interaction, and any sent before the button comes off still arrive.
  it('posts once however fast the button is clicked', async () => {
    const interaction = click();
    const clicks = Array.from({ length: 3 }, () => handleShare(interaction as unknown as MessageComponentInteraction));
    await Promise.all(clicks);

    expect(interaction.channel.send).toHaveBeenCalledTimes(1);
    expect(interaction.deferUpdate).toHaveBeenCalledTimes(3);
  });

  it('keeps the button if the post fails, and lets it be clicked again', async () => {
    const interaction = click();
    interaction.channel.send.mockRejectedValueOnce(new Error('Missing Permissions'));

    await expect(handleShare(interaction as unknown as MessageComponentInteraction)).rejects.toThrow();
    expect(interaction.editReply).not.toHaveBeenCalled();

    await handleShare(interaction as unknown as MessageComponentInteraction);
    expect(interaction.channel.send).toHaveBeenCalledTimes(2);
  });

  it('says so privately when the channel takes no posts', async () => {
    const interaction = click({ sendable: false });
    await share(interaction);

    expect(interaction.reply.mock.calls[0]?.[0].flags).toBe(MessageFlags.Ephemeral);
    expect(interaction.channel.send).not.toHaveBeenCalled();
  });
});

// The bot does the posting, so without these checks the button would get around the channel's rules.
describe('Post to channel permissions', () => {
  it.each([
    ['send messages', [EmbedLinks]],
    ['embed links', [SendMessages]],
  ])('refuses someone who cannot %s in the channel', async (_, permissions) => {
    const interaction = click({ permissions });
    await share(interaction);

    expect(interaction.reply.mock.calls[0]?.[0].flags).toBe(MessageFlags.Ephemeral);
    expect(interaction.channel.send).not.toHaveBeenCalled();
  });

  it('asks for Send Messages in Threads in a thread', async () => {
    const inThread = click({ thread: true, permissions: [SendMessagesInThreads, EmbedLinks] });
    const outsideOnly = click({ thread: true, permissions: [SendMessages, EmbedLinks] });
    await share(inThread);
    await share(outsideOnly);

    expect(inThread.channel.send).toHaveBeenCalledTimes(1);
    expect(outsideOnly.channel.send).not.toHaveBeenCalled();
  });
});
