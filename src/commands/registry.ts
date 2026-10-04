import type { Command } from '../types.js';
import { eternalsCommand } from './eternals.js';
import { faqCommand } from './faq.js';
import { glossaryCommand } from './glossary.js';
import { helpCommand } from './help.js';
import { itemCommand } from './item.js';
import { lobbiesCommand } from './lobbies.js';
import { lobbyCreateCommand } from './createlobby.js';
import { lobbyAddCommand } from './lobbyadd.js';
import { lobbyKickCommand } from './lobbykick.js';
import { randomBuildCommand } from './randombuild.js';
import { socialsCommand } from './socials.js';

/** Order here is the order /help lists them in. */
export const commands: Command[] = [
  helpCommand,
  faqCommand,
  socialsCommand,
  eternalsCommand,
  itemCommand,
  randomBuildCommand,
  glossaryCommand,
  lobbyCreateCommand,
  lobbiesCommand,
  lobbyAddCommand,
  lobbyKickCommand,
];

const commandsByName = new Map(commands.map((command) => [command.data.name, command]));

export function findCommand(name: string): Command | undefined {
  return commandsByName.get(name);
}
