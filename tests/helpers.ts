import type { Command } from '../src/types.js';

/** The values of a pick-list option, as Discord offers them. */
export function choicesOf(command: Command, optionName: string): string[] {
  const option = command.data.options?.find((candidate) => candidate.name === optionName);
  const choices = option && 'choices' in option ? option.choices ?? [] : [];

  return choices.map((choice) => String(choice.value));
}
