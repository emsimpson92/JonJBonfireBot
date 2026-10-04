import { Client, Events, GatewayIntentBits, MessageFlags } from 'discord.js';
import type { ChatInputCommandInteraction, MessageComponentInteraction } from 'discord.js';
import { commands, findCommand } from './commands/registry.js';
import { config } from './config.js';
import { ephemeral, ephemeralError, errorEmbed } from './embeds/general.js';
import { handleLobbyComponent, isLobbyComponent, startLobbySweep } from './lobbyMessages.js';
import { RateLimiter } from './rateLimit.js';

const RATE_LIMITED_MESSAGE = 'The message limit has been reached. Please wait and try again.';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const rateLimiter = new RateLimiter(config.maxRequests, config.maxRequestsPerUser);
const componentRateLimiter = new RateLimiter(config.maxRequests * 2, config.maxRequestsPerUser);

client.once(Events.ClientReady, async (ready) => {
  const payload = commands.map((command) => command.data);

  try {
    if (config.guildId) {
      // Guild commands appear immediately; global ones can take up to an hour.
      const guild = await ready.guilds.fetch(config.guildId);
      await guild.commands.set(payload);
      console.log(`Registered ${payload.length} commands to ${guild.name}.`);
    }
    else {
      await ready.application.commands.set(payload);
      console.log(`Registered ${payload.length} commands globally (may take up to an hour to appear).`);
    }
  }
  catch (error) {
    console.error('Failed to register commands:', error);
  }

  startLobbySweep(ready);
  console.log(`Logged in as ${ready.user.tag}.`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isAutocomplete()) {
    const command = findCommand(interaction.commandName);
    try {
      await command?.autocomplete?.(interaction);
    }
    catch (error) {
      console.error(`Autocomplete for "${interaction.commandName}" failed:`, error);
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

  const command = findCommand(interaction.commandName);
  if (!command) {
    return;
  }

  const limit = rateLimiter.check(interaction.user.id);
  if (!limit.allowed) {
    const seconds = Math.ceil(limit.retryAfterMs / 1000);
    console.warn(
      `Throttled /${interaction.commandName} from ${interaction.user.tag} ` +
        `(${limit.scope} limit, ${seconds}s until a slot frees up).`,
    );
    
    // If the user is over their personal limit, DM them instead of posting in the channel.
    await (limit.scope === 'user' ? warnUser(interaction) : warnChannel(interaction));

    return;
  }

  try {
    await command.execute(interaction);
  }
  catch (error) {
    console.error(`Command "${interaction.commandName}" failed:`, error);
    await replyWithFailure(interaction, 'That command failed. Try again in a moment.');
  }
});

/** Lobby buttons. A click posts nothing in the channel, so a throttled one is told privately. */
async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  if (!isLobbyComponent(interaction.customId)) {
    return;
  }

  const limit = componentRateLimiter.check(interaction.user.id);
  if (!limit.allowed) {
    console.warn(
      `Throttled a lobby click from ${interaction.user.tag} ` +
        `(${Math.ceil(limit.retryAfterMs / 1000)}s until a slot frees up).`,
    );
    await interaction.reply(ephemeralError('Slow down', RATE_LIMITED_MESSAGE))
      .catch((error: unknown) => console.error('Failed to warn a rate limited user:', error));

    return;
  }

  try {
    await handleLobbyComponent(interaction);
  }
  catch (error) {
    console.error(`Lobby action "${interaction.customId}" failed:`, error);
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

/** The bot as a whole is over its limit, so everyone in the channel should see why. */
async function warnChannel(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.reply({ embeds: [errorEmbed('Slow down', RATE_LIMITED_MESSAGE)] })
    .catch((error: unknown) => console.error('Failed to post the rate limit notice:', error));
}

/** If the user is over their personal limit, DM them instead of posting in the channel. */
async function warnUser(interaction: ChatInputCommandInteraction): Promise<void> {
  const embed = errorEmbed('Slow down', RATE_LIMITED_MESSAGE);

  try {
    await interaction.user.send({ embeds: [embed] });
  }
  catch {
    // DMs closed, or no shared server any more — fall back to a reply only they can see.
    await interaction.reply(ephemeral(embed))
      .catch((error: unknown) => console.error('Failed to warn a rate limited user:', error));

    return;
  }

  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await interaction.deleteReply();
  }
  catch (error: unknown) {
    console.error('Failed to dismiss a rate limited interaction:', error);
  }
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
