// Discord rejects a whole reply if one embed breaks its limits, and the embed builders throw on
// the per-field ones. These render every embed the bot can send from the real data, so content
// that would break a command fails here instead.
import type { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';

import { itemCommand } from '../src/commands/item.js';
import { commands } from '../src/commands/registry.js';
import { eternals, faq, glossary, items, socials } from '../src/data.js';
import { eternalDetailEmbed, eternalListEmbed } from '../src/embeds/eternals.js';
import { faqListEmbed, faqTopicEmbed } from '../src/embeds/faq.js';
import { glossaryListEmbed, glossaryTermEmbed } from '../src/embeds/glossary.js';
import { helpDetailEmbed, helpOverviewEmbed } from '../src/embeds/help.js';
import { itemDetailEmbeds } from '../src/embeds/items.js';
import { lobbyEmbed, lobbyListEmbed } from '../src/embeds/lobbies.js';
import { socialsEmbed } from '../src/embeds/socials.js';
import { MAX_LOBBIES, MAX_PLAYERS } from '../src/lobbies.js';
import type { Lobby } from '../src/lobbies.js';
import { embedLength, MAX_MESSAGE_CHARS } from '../src/utils/general.js';
import { choicesOf } from './helpers.js';

/** truncate() cuts text to exactly its limit and ends it with "…", so text like that lost its end. */
function cutShort(text: string | undefined, limit: number): boolean {
  return text?.length === limit && text.endsWith('…');
}

/** Whatever would get a reply of these embeds rejected, or silently shortened. */
function problems(...embeds: EmbedBuilder[]): string[] {
  const found: string[] = [];

  const total = embeds.reduce((sum, embed) => sum + embedLength(embed), 0);
  if (total > MAX_MESSAGE_CHARS) {
    found.push(`${total} characters, over Discord's ${MAX_MESSAGE_CHARS}`);
  }

  for (const { data } of embeds) {
    if (cutShort(data.description, 4096)) {
      found.push(`"${data.title}" description cut short`);
    }
    for (const field of data.fields ?? []) {
      if (cutShort(field.name, 256) || cutShort(field.value, 1024)) {
        found.push(`"${data.title}" field "${field.name}" cut short`);
      }
    }
  }

  return found;
}

describe('detail embeds', () => {
  it.each(eternals.map((eternal) => [eternal.name, eternal] as const))('/eternals name:%s', (_, eternal) => {
    expect(problems(eternalDetailEmbed(eternal))).toEqual([]);
  });

  // Too long for its own embed, /item would fall back to a list without the abilities.
  it.each(items.map((owned) => [owned.item.name, owned] as const))('/item name:%s shows its details', (_, owned) => {
    const embeds = itemDetailEmbeds([owned]);

    expect(embeds).toHaveLength(1);
    expect(problems(...(embeds ?? []))).toEqual([]);
  });

  it.each(faq.map((topic) => [topic.topic, topic] as const))('/faq topic:%s', (_, topic) => {
    expect(problems(faqTopicEmbed(topic))).toEqual([]);
  });

  it.each(glossary.map((entry) => [entry.term, entry] as const))('/glossary term:%s', (_, entry) => {
    expect(problems(glossaryTermEmbed(entry))).toEqual([]);
  });

  it.each(commands.map((command) => [command.data.name, command] as const))('/help command:%s', (_, command) => {
    expect(problems(helpDetailEmbed(command))).toEqual([]);
  });
});

describe('list embeds', () => {
  it('/eternals', () => {
    expect(problems(eternalListEmbed(eternals))).toEqual([]);
  });

  it('/glossary', () => {
    expect(problems(glossaryListEmbed(glossary))).toEqual([]);
  });

  it('/faq', () => {
    expect(problems(faqListEmbed(faq))).toEqual([]);
  });

  it('/socials', () => {
    expect(problems(socialsEmbed(socials))).toEqual([]);
  });

  it('/help', () => {
    expect(problems(helpOverviewEmbed(commands))).toEqual([]);
  });
});

/** Runs /item with these options and returns the embeds it replies with. */
async function itemReply(options: Record<string, string | null>): Promise<EmbedBuilder[]> {
  const reply = vi.fn();
  const interaction = { options: { getString: (name: string) => options[name] ?? null }, reply };
  await itemCommand.execute(interaction as unknown as ChatInputCommandInteraction);

  return reply.mock.calls[0]?.[0].embeds;
}

describe('/item browsing', () => {
  const owners = [null, ...choicesOf(itemCommand, 'eternal')];
  const slots = [null, ...choicesOf(itemCommand, 'slot')];

  it.each(owners.flatMap((owner) => slots.map((slot) => [owner, slot] as const)))('eternal:%s slot:%s', async (eternal, slot) => {
    const embeds = await itemReply({ eternal, slot });

    expect(embeds.length).toBeGreaterThan(0);
    expect(problems(...embeds)).toEqual([]);
  });
});

/** Snowflakes run to 19 digits, and the lobby embeds mention players and link posts by them. */
const snowflake = (n: number) => String(n).padStart(19, '9');

function busyLobby(code: string): Lobby {
  return {
    id: code,
    code,
    region: 'South America',
    mode: 'Ascension',
    players: Array.from({ length: MAX_PLAYERS }, (_, n) => ({ id: snowflake(n), name: `Player ${n}` })),
    lastActivityAt: Date.now(),
    guildId: snowflake(1),
    channelId: snowflake(2),
    messageId: snowflake(3),
  };
}

describe('lobby embeds', () => {
  it(`fit a lobby of ${MAX_PLAYERS}`, () => {
    expect(problems(lobbyEmbed(busyLobby('DX89EE')))).toEqual([]);
  });

  it(`fit /lobbies with ${MAX_LOBBIES} lobbies open`, () => {
    const open = Array.from({ length: MAX_LOBBIES }, (_, n) => busyLobby(`CODE${String(n).padStart(2, '0')}`));

    expect(problems(lobbyListEmbed(open, null, null))).toEqual([]);
  });
});
