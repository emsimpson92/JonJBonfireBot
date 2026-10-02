import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js';

// A strict list of the stats that can appear on a core ability. No magic values
export type CoreStatName = 'Damage' | 'Cooldown' | 'Range' | 'Stun' | 'Lifesteal' | 'Duration' | 'Speed Decrease' | 'Speed Increase';

export interface CoreAbility {
  name: string;
  description: string;
  tags: string[];
  stats?: Array<{ name: CoreStatName; value: string }>;
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
  /** A file under images/items, relative to the repo root. */
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
  /** A file under images/eternals, relative to the repo root. */
  imageUrl?: string;
  aliases?: string[];
}

export interface GlossaryEntry {
  term: string;
  definition: string;
  aliases?: string[];
}

export interface SocialLink {
  name: string;
  url: string;
}

export interface FaqEntry {
  question: string;
  answer: string;
}

/** /faq numbers the entries 1, 2, 3… in the order they are listed. */
export interface FaqTopic {
  topic: string;
  entries: FaqEntry[];
  aliases?: string[];
}

export interface Command {
  data: RESTPostAPIChatInputApplicationCommandsJSONBody;
  usage: string;
  examples: string[];
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
  autocomplete?(interaction: AutocompleteInteraction): Promise<void>;
}
