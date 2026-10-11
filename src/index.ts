import { Client, Events, GatewayIntentBits } from 'discord.js';
import type { ChatInputCommandInteraction, MessageComponentInteraction } from 'discord.js';
import { findCommand, registrations } from './commands/registry.js';
import { config } from './config.js';
import { ephemeralError, slowDown } from './embeds/general.js';
import { handleLobbyComponent, isLobbyComponent, startLobbySweep } from './lobbyMessages.js';
import { RateLimiter } from './rateLimit.js';
import { handleShare, isShareComponent } from './share.js';
import { describeCommand, describePlace } from './utils/logging.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const commandRateLimiter = new RateLimiter({
  global: config.maxRequests,
  perServer: config.maxRequestsPerServer,
  perUser: config.maxRequestsPerUser,
});
const buttonRateLimiter = new RateLimiter({
  global: config.maxButtonClicks,
  perServer: config.maxButtonClicksPerServer,
  perUser: config.maxButtonClicksPerUser,
});

client.once(Events.ClientReady, async (ready) => {
  if (!config.lobbyGuildId) {
    console.warn('LOBBY_GUILD_ID is not set, so the lobby commands are not registered anywhere.');
  }

  for (const [guildId, list] of registrations(config.guildId, config.lobbyGuildId)) {
    const payload = list.map((command) => command.data);

    try {
      if (guildId) {
        const guild = await ready.guilds.fetch(guildId);
        await guild.commands.set(payload);
        console.log(`Registered ${payload.length} commands to ${guild.name}.`);
      }
      else {
        await ready.application.commands.set(payload);
        console.log(`Registered ${payload.length} commands globally (may take up to an hour to appear).`);
      }
    }
    catch (error) {
      console.error(`Failed to register commands ${guildId ? `to server ${guildId}` : 'globally'}:`, error);
    }
  }

  startLobbySweep(ready);
  console.log(`Logged in as ${ready.user.tag}.`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isAutocomplete()) {
    const command = findCommand(interaction.commandName, interaction.guildId);
    try {
      await command?.autocomplete?.(interaction);
    }
    catch (error) {
      console.error(`Autocomplete for "${interaction.commandName}" in ${describePlace(interaction)} failed:`, error);
    }
    
    return;
  }

  if (interaction.isMessageComponent()) {
    await handleComponent(interaction);
    return;
  }

  if (!interaction.isChatInputCommand()) {
    return;
  }

  // Lobby commands only exist in the lobby server, so they aren't found anywhere else
  const command = findCommand(interaction.commandName, interaction.guildId);
  if (!command) {
    return;
  }

  // Every command gets one line, ending in how it went
  const described = describeCommand(interaction);

  const limit = commandRateLimiter.check(interaction.user.id, interaction.guildId);
  if (!limit.allowed) {
    const seconds = Math.ceil(limit.retryAfterMs / 1000);
    console.warn(`${described}: throttled (${limit.scope} limit, ${seconds}s until a slot frees up)`);

    await warnThrottled(interaction, limit.scope === 'server' ? 'channel' : 'ephemeral');

    return;
  }

  const started = Date.now();
  try {
    await command.execute(interaction);
    console.log(`${described}: done in ${Date.now() - started}ms`);
  }
  catch (error) {
    console.error(`${described}: failed after ${Date.now() - started}ms`, error);
    await replyWithFailure(interaction, 'That command failed. Try again in a moment.');
  }
});

/** The handler for a button id, or undefined for one this bot didn't make. */
function componentHandler(id: string) {
  if (isLobbyComponent(id)) {
    return handleLobbyComponent;
  }
  else if (isShareComponent(id)) {
    return handleShare;
  }

  return undefined;
}

/** Lobby and Post to channel buttons. Only the clicker needs to know they were throttled, so they're told privately, whichever limit it was. */
async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  const handler = componentHandler(interaction.customId);
  if (!handler) {
    return;
  }

  const limit = buttonRateLimiter.check(interaction.user.id, interaction.guildId);
  if (!limit.allowed) {
    console.warn(
      `Throttled a button click from ${interaction.user.tag} in ${describePlace(interaction)} ` +
        `(${limit.scope} limit, ${Math.ceil(limit.retryAfterMs / 1000)}s until a slot frees up).`,
    );
    await warnThrottled(interaction, 'ephemeral');

    return;
  }

  try {
    await handler(interaction);
  }
  catch (error) {
    console.error(`Button "${interaction.customId}" in ${describePlace(interaction)} failed:`, error);
    await replyWithFailure(interaction, 'That didn\'t work. Try again in a moment.');
  }
}

async function replyWithFailure(
  interaction: ChatInputCommandInteraction | MessageComponentInteraction,
  description: string,
): Promise<void> {
  const body = ephemeralError('Something went wrong', description);
  await (interaction.replied || interaction.deferred ? 
    interaction.followUp(body) : 
    interaction.reply(body)
  ).catch(() => undefined);
}

async function warnThrottled(
  interaction: ChatInputCommandInteraction | MessageComponentInteraction,
  where: 'channel' | 'ephemeral',
): Promise<void> {
  await interaction.reply(slowDown(where))
    .catch((error: unknown) => console.error('Failed to send the slow down notice:', error));
}

/** Die gracefully */
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    console.log(`Received ${signal}, logging out.`);
    void client.destroy().finally(() => process.exit(0));
  });
}

client.login(config.token).catch((error: unknown) => {
  console.error('Failed to log in:', error);
  process.exit(1);
});
