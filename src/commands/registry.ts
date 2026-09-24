import type { Command } from '../types.js';
import { eternalsCommand } from './eternals.js';
import { faqCommand } from './faq.js';
import { glossaryCommand } from './glossary.js';
import { helpCommand } from './help.js';
import { itemCommand } from './item.js';
import { playtestCommand } from './playtest.js';

/** Order here is the order /help lists them in. */
export const commands: Command[] = [
  helpCommand,
  faqCommand,
  playtestCommand,
  eternalsCommand,
  itemCommand,
  glossaryCommand,
];

const byName = new Map(commands.map((command) => [command.data.name, command]));

export function findCommand(name: string): Command | undefined {
  return byName.get(name);
}
