import type { BaseInteraction, ChatInputCommandInteraction, CommandInteractionOption } from 'discord.js';

/** Plain values print bare; anything else is quoted, which also escapes whatever the user typed. */
function bareOrQuoted(value: string): string {
  return /^[\w-]+$/.test(value) ? value : JSON.stringify(value);
}

function optionValue(option: CommandInteractionOption): string {
  if (option.user) {
    return `@${option.user.tag}`;
  }

  return bareOrQuoted(String(option.value));
}

/** The channel and server, e.g. `#general on "JonJ Bonfire" (1234)`. Server names are quoted like option values, since anyone can name a server. */
export function describePlace(interaction: BaseInteraction): string {
  if (!interaction.inGuild()) {
    return 'DMs';
  }

  const channel = interaction.channel;
  const where = channel && 'name' in channel && channel.name ? `#${channel.name}` : interaction.channelId;
  const server = interaction.guild ? `${bareOrQuoted(interaction.guild.name)} (${interaction.guildId})` : interaction.guildId;

  return `${where} on ${server}`;
}

/** The command as typed, who ran it and where, e.g. `/item eternal:Dahla from steve (1234) in #general on Bonfire (5678)`. */
export function describeCommand(interaction: ChatInputCommandInteraction): string {
  const typed = [`/${interaction.commandName}`, ...interaction.options.data.map((option) => `${option.name}:${optionValue(option)}`)];

  return `${typed.join(' ')} from ${interaction.user.tag} (${interaction.user.id}) in ${describePlace(interaction)}`;
}
