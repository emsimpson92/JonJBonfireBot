import { ApplicationCommandOptionType } from 'discord.js';

import type { Command } from '../types.js';

/** Subcommands are alternatives rather than inputs, so they are never "optional". */
export function isRequired(option: NonNullable<Command['data']['options']>[number]): boolean {
  return option.type === ApplicationCommandOptionType.Subcommand ||
    option.type === ApplicationCommandOptionType.SubcommandGroup ||
    ('required' in option && Boolean(option.required));
}
