import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js';

export interface CoreAbility {
  name: string;
  description: string;
  tags: string[];
  /** Wiki damage format varies. "20 / 30 + 15 DoT". So we use a string */
  damage?: string;
  cooldown?: string;
  range?: string;
}

export interface SetBonus {
  name: string;
  description: string;
}

/** Labels vary per ability, so these look like { "Damage": "10 / 10 / 20" } */
export type Stats = Record<string, string>;

export interface AbilityUpgrade {
  tier: string;
  /** Only the stats this tier changes; unchanged ones stay at their base value. E.g. { "damage": "100 + 20", "cooldown": "7s" }. */
  changes?: Stats;
  /** The wiki's prose upgrade, where it says something the numbers do not. E.g. "Now applies Weakened for 3 seconds". */
  effect?: string;
}

export interface ItemAbility {
  name: string;
  input?: 'primary' | 'secondary';
  description?: string;
  tags?: string[];
  stats: Stats;
  /** Tiers above base, each listing only what it changes. Absent if nothing ever changes. */
  upgrades?: AbilityUpgrade[];
}

export interface Item {
  id: string;
  name: string;
  slot: string;
  icon?: string;
  description?: string;
  stats?: Stats;
  /** Weapons grant two: a primary basic attack and a secondary ability. Empty for anchors. */
  abilities: ItemAbility[];
  aliases?: string[];
}

export interface Eternal {
  id: string;
  name: string;
  /** Archetype, e.g. "The Dancer". */
  title: string;
  description: string;
  coreAbility: CoreAbility;
  setBonus: SetBonus;
  /** These map to item Ids */
  items: string[];
  wikiUrl: string;
  imageUrl?: string;
  aliases?: string[];
}

export interface GlossaryEntry {
  term: string;
  definition: string;
  aliases?: string[];
}

export interface Command {
  data: RESTPostAPIChatInputApplicationCommandsJSONBody;
  usage: string;
  examples: string[];
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
  autocomplete?(interaction: AutocompleteInteraction): Promise<void>;
}
