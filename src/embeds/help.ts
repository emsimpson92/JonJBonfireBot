import type { Command } from '../types.js';
import { isRequired } from '../utils/help.js';
import { baseEmbed } from './general.js';

export function helpOverviewEmbed(commands: Command[]) {
  const lines = commands.map((command) => `\`/${command.data.name}\` — ${command.data.description}`).join('\n');
  return baseEmbed('Commands', lines).setFooter({ text: 'Use /help <command> for syntax and examples.' });
}

export function helpDetailEmbed(command: Command) {
  const embed = baseEmbed(`/${command.data.name}`, command.data.description).addFields({
    name: 'Usage',
    value: `\`${command.usage}\``,
  });

  if (command.examples.length) {
    embed.addFields({
      name: command.examples.length === 1 ? 'Example' : 'Examples',
      value: command.examples.map((example) => `\`${example}\``).join('\n'),
    });
  }

  const options = command.data.options ?? [];
  if (options.length) {
    embed.addFields({
      name: 'Options',
      value: options
        .map((option) => `\`${option.name}\`${isRequired(option) ? '' : ' (optional)'} — ${option.description}`)
        .join('\n'),
    });
  }

  return embed;
}
