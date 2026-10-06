import { MessageFlags } from 'discord.js';
import type { MessageComponentInteraction } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';

import { baseEmbed } from '../src/embeds/general.js';
import { handleShare, isShareComponent, shareable } from '../src/share.js';

const embeds = [baseEmbed('Socials', 'Links').toJSON()];

let messageId = 0;

/** A click on a Post to channel button, on a new reply showing `embeds`. */
function click(sendable = true) {
  messageId += 1;

  return {
    user: { id: '1' },
    message: { id: String(messageId), embeds },
    channel: { isSendable: () => sendable, send: vi.fn() },
    reply: vi.fn(),
    deferUpdate: vi.fn(),
    followUp: vi.fn(),
    editReply: vi.fn(),
  };
}

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
    const interaction = click(false);
    await handleShare(interaction as unknown as MessageComponentInteraction);

    expect(interaction.reply.mock.calls[0]?.[0].flags).toBe(MessageFlags.Ephemeral);
    expect(interaction.channel.send).not.toHaveBeenCalled();
  });
});
