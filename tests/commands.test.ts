// Importing the registry builds every command, and the builders throw on anything Discord would
// refuse to register: bad names, descriptions over 100 characters, more than 25 choices.
import { describe, expect, it } from 'vitest';

import { commands, findCommand } from '../src/commands/registry.js';

const byName = commands.map((command) => [command.data.name, command] as const);

describe('commands', () => {
  it('have unique names', () => {
    const names = commands.map((command) => command.data.name);

    expect(new Set(names).size).toBe(names.length);
  });

  it.each(byName)('/%s is found by its name', (name, command) => {
    expect(findCommand(name)).toBe(command);
  });

  // /help shows these, so a copy-pasted usage line would teach the wrong command.
  it.each(byName)('/%s has usage and examples for itself', (name, command) => {
    const ownSyntax = new RegExp(`^/${name}( |$)`);

    expect(command.usage).toMatch(ownSyntax);
    expect(command.examples.length).toBeGreaterThan(0);
    for (const example of command.examples) {
      expect(example).toMatch(ownSyntax);
    }
  });

  // Discord shows "Loading options failed" for an autocomplete option with no handler.
  it.each(byName)('/%s handles autocomplete if an option asks for it', (_, command) => {
    const wantsAutocomplete = (command.data.options ?? []).some((option) => 'autocomplete' in option && option.autocomplete);

    expect(Boolean(command.autocomplete)).toBe(wantsAutocomplete);
  });
});
