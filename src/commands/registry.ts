import { config } from '../config.js';
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
  eternalsCommand,
  itemCommand,
  glossaryCommand,
  randomBuildCommand,
  lobbyCreateCommand,
  lobbiesCommand,
  lobbyAddCommand,
  lobbyKickCommand,
  socialsCommand,
];

const lobbyCommands = new Set<Command>([lobbyCreateCommand, lobbiesCommand, lobbyAddCommand, lobbyKickCommand]);

const everywhere = commands.filter((command) => !lobbyCommands.has(command));

const commandsByName = new Map(commands.map((command) => [command.data.name, command]));

export function commandsIn(guildId: string | null): Command[] {
  return guildId !== null && guildId === config.lobbyGuildId ? commands : everywhere;
}

export function findCommand(name: string, guildId: string | null): Command | undefined {
  const command = commandsByName.get(name);

  return command && commandsIn(guildId).includes(command) ? command : undefined;
}

export function registrations(guildId: string | undefined, lobbyGuildId: string | undefined): Map<string | undefined, Command[]> {
  const targets = new Map<string | undefined, Command[]>();
  for (const command of commands) {
    const isLobby = lobbyCommands.has(command);
    if (isLobby && !lobbyGuildId) {
      continue;
    }

    const target = isLobby ? lobbyGuildId : guildId;
    targets.set(target, [...(targets.get(target) ?? []), command]);
  }

  return targets;
}
