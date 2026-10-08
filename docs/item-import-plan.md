# Plan: item & eternal data from api.arkheron.net

## Context
Item and eternal data were hand-copied from the wiki into [data/items.json](../data/items.json) and [data/eternals.json](../data/eternals.json). Bonfire now publishes the game data at `https://api.arkheron.net/items/`. **The API is the source of truth.**
- The bot fetches it at runtime and caches it until a new game build ships.
- Both data files are deleted when we migrate.
- The migration waits on the fields the API doesn't carry yet (see [Needed before migration](#needed-before-migration)).

## The API
- **`items/index.json`**: `{ version: "0.23.0", generatedAtUtc, iconsPath: "icons/", locales: [13], counts }`. `version` is the build key. Only en-US is in scope.
- **`items/en-US.json`**: `{ locale, items[168], eternals[12], metaAbilities[13] }`.
- **`items/icons/<file>`**: 320px PNGs, the same art as the wiki copies in `images/items/`.
- Every response sends `Cache-Control: public,max-age=300` and an ETag.

## Runtime sync
- **Startup.**
  - The bot fetches `index.json` and `en-US.json`, then builds and validates the data before it registers commands and logs in.
  - There is no fallback. If this fails, the bot logs the error and exits non-zero. Railway's `ON_FAILURE` policy retries it up to 10 times.
- **TTL.** Every `GAME_DATA_TTL_MINUTES` (new config, default 60), the bot fetches `index.json`.
  - It fetches `en-US.json` and swaps in the rebuilt data **only when `version` differs from the cached build**.
  - The TTL resets either way.
  - If a check fails mid-run, the bot logs it and keeps the last good data.
  - An in-flight guard stops checks from overlapping.
- **Roster changes.** If the set of eternal ids changes after a swap, slash commands are re-registered, because the `/eternals` and `/item eternal:` choices come from the roster.
- **Cache location.** The cache is in memory only. Railway has no volume, so a restart simply refetches.

## Icons
`icon` = `https://api.arkheron.net/items/icons/<file>?v=<version>`, taken from the lvl1 record or the metaAbility.
- **Caching.** `?v=` is a cache-buster, not an API feature.
  - The icons are static files behind Google's CDN, which ignores unknown query parameters. Checked: no query, `?v=0.23.0` and `?v=9.9.9` all return the same 200, ETag and bytes.
  - Discord's media proxy fetches embed thumbnails and caches them by full URL. A new build gives a new URL, which forces a refetch. The same build reuses Discord's cached copy.
  - Discord's behaviour here is expected but not yet confirmed; it is checked during migration (see [Verification](#verification)).
- **No files on our side.** The bot stores no images and sends no attachments, so `/share`'s re-post of `message.embeds` keeps working. `publicUrl()` ([src/utils/images.ts](../src/utils/images.ts)) already passes absolute URLs through.
- **Cleanup.** `images/items/` is deleted once Discord is confirmed to render API icons. The wiki's own links never loaded in Discord, so this needs checking.

## Item records → Item
The API has **one record per upgrade level** for the 48 eternal items (`item_E04_crown_lvl1/2/3`). Echo items and consumables have one record each.
- **Grouping.** Group by `upgradeRootIdentifier ?? identifier` and take the level from `/_lvl(\d)$/i`. Lvl1 is the base.
- **Tiers.** Tiers II and III list only what they change.
- **Level values.** Stats, mechanics and descriptions are identical on all three records of a group, so stats are read from lvl1's `level1Value`/`level2Value`/`level3Value`. `cooldownSeconds` and `ammo` are read from each level's own record. Single-level records pad L2/L3 with 0; those values are ignored.

### Item level
| Source | Target | Notes |
|---|---|---|
| `identifier` without `_lvlN` | `sourceId` | Readable and stable, for example `item_E04_crown`, `item_E00_longbow`, `metaAbility_full_heal`. All records in a group must reduce to the same value. |
| `displayName` | `name`; `id` = slug(name) | Apostrophes and quotes are removed (`Sword "Caretaker"` → `sword-caretaker`). |
| `displayDescription` | `description` | Trimmed. |
| E-code in `identifier` | `eternal` (eternal id) | `/^item_(e\d\d)_/i`, uppercased, joined to `eternals[].name`. E00 means Echo, with no owner. Some identifiers are lowercase (`item_e07_…`, `item_e00_…`). `eternalIdentifier` is a hash that eternal records don't carry. It is only used to check that each hash maps to exactly one E-code. |
| `categoryName` | `slot` | Crown, Amulet, Weapon, Consumable. Anchors come from `metaAbilities`. |
| `icon` | `icon` | API URL; see [Icons](#icons). |
| `itemLore` | `lore` | Trimmed, rendered as an italic line. |
| `maxStackCount` | `stats["Max stacks"]` | Only when greater than 1. |
| `type`, `durability`, `inventoryType`, `upgradeRootIdentifier`, `upgradesToIdentifier`, `upgradeCost` | — | Dropped. `type` now includes "Iconic". `durability` is 50 on some crowns. The upgrade ids are hashes used only for grouping. `upgradeCost` is free text ("None for now"). |

### Ability level (`abilities[]`, matched across levels by trimmed `displayName`)
| Source | Target | Notes |
|---|---|---|
| `displayName` | `name` | Trimmed: L2/L3 can carry a trailing space ("Under the Weather "). |
| `displayDescription` | `description` | `[keyword …]X[/keyword]` → X, then trimmed. This adds descriptions to 13 basic attacks that had none. |
| `button` | `input` | Attack1 → primary, Attack2 → secondary. Anything else gives no input. |
| `cooldownSeconds` | `stats.Cooldown` and tier changes | |
| `ammo` | `stats.Ammo` and tier changes | Only when > 0. |
| `reloadTime` | `stats["Reload Time"]` | |
| `mechanics[]` with `levelMask & 2` | `tags` | The mask is a bitmask where bit n = level n. Echo items use "2". Some basic attacks use "15". Names are normalised to the canonical glossary **term** through a term/alias lookup: Aoe → AoE, Tether → Tethered, Damage Return → Damage Reflect, Channeled Attack → Channeled Ability. |
| `mechanics[]` first present at L2/L3 | `upgrades[].tags` on that tier | "8" = L3 only, 42 cases. For example, Dancing Blade III gains `Reset on Kill`. |
| `stats[]` | `stats` and tier changes | Formatted with the unit table below. |
| `inputType`, `damageType`, `damageScaleType`, `doesNoDamage`, `icon`, `stats[].modifierCategory`, `repeatInterval`, `shieldDurability`, `areaOfEffectDamage`, `damageString`, `damageValues` | — | Dropped. `inputType` values: Default, Hold, Charge, ModalAim; tags already cover Charged Attack. `damageType` values: Single, Combo, Ramp, String. `shieldDurability` repeats the Durability stat. `areaOfEffectDamage` (Seeing Eye 15) and `damageString` (Parasol "5 per shard") are fragments of damage info; see [Needed before migration](#needed-before-migration). `damageValues` is only used for consumables. |

**Units.** Numbers print without a trailing `.0`.

| Unit | Stats |
|---|---|
| "s" | Cooldown, `*Duration`, Cast Time, Channel Time, Activation Time Window, Reload Time |
| "m" | `*Range`, `*Distance` |
| "%" | Speed Increase/Decrease, Damage Increase/Mitigation/Shared/Return, Lifesteal, Vulnerability, Weaken Percentage |
| " hp" | Health, Durability |
| none | Ammo, Bounce, Healing, Damage |

A stat name that isn't in the table gets a bare number, and the bot logs a warning.

### Consumables
- **Flattening.** The single ability is flattened into `item.stats` next to `Max stacks`, and the item gets `abilities: []`. The ability's description is dropped when it matches the item's.
- **Healing.** When the ability has `isHealing` and no Healing stat, `damageValues[0]` becomes `Healing`.
- **Health Potion** shows Healing 125 and Max stacks 4.

### What's excluded
**The API has no field that marks an item as unavailable.**
- **Shared fields:** Coelacanth and Healing Mist match their peers on `type`, `categoryName`, `inventoryType` ("Normal" on all 168), `durability` and `button`.
- **Translations:** both are fully translated in every locale.
- **Coelacanth:** its only differences are no lore and no mechanics. Consumables have no lore either, so this isn't a signal.
- **Healing Mist:** its only difference is `inputType: ModalAim`.
- **Anchors:** all 13 metaAbilities are `type: "PerFloor"` with `cooldownSeconds: 0`.

So the exclusions are explicit constants in the mapper, not data files:
- **`*_bundle` consumables** (4). They duplicate the base consumables.
- **Coelacanth** (`item_E00_amulet_fish`) and **Healing Mist** (`item_consumable_healing_mist`). They are in the API but not available in game.
- **Anchors.** Only an allowlist of the 6 we have today is included: Full Heal, Last Wish, Mending Hands, Refill Consumables, Self Revive and Summon Shrine.
  - The other 7 metaAbilities are skipped.
  - Each included Anchor maps `displayName`/`description`/`icon` to an item with `slot: 'Anchor'` and `abilities: []`.
  - A leading `*TEMP*` is stripped from the description.

**To do: ask Bonfire for an availability flag.** It would replace these lists.

## Eternal records → Eternal
| Source | Target | Notes |
|---|---|---|
| `name` ("E03") | `sourceId` | The join key for item ownership. E01–E10, E13, E14. |
| `displayName` | `name`; `id` = slug | Tsu'bo → `tsubo`. |
| `ability.displayName` / `displayDescription` | `coreAbility.name` / `description` | Markup stripped. |
| `ability.mechanics[].name` | `coreAbility.tags` | Normalised like item tags. |
| `ability.cooldownSeconds` + `ability.stats[]` (`level1Value`) | `coreAbility.stats` (`Stats` record) | Uses the API's stat names: Stun Duration, Max Range, Aura Range, Area of Effect Range. The `CoreStatName` union goes. |
| `setBonuses[0].displayName` | `setBonus.name` / `description` | Split at the first ": " and trimmed (some have trailing spaces). |
| `setBonuses[0].itemCountRequired` | `setBonus.itemsRequired` | Rendered as "Set Bonus: Cold-blooded (2 items)". |
| `hudColor` ("#FFd94c88", ARGB) | `color` (number) | The embed colour for `/eternals` and owned `/item` results. |
| `icon` | — | An emblem, not a portrait. A fallback only if no portrait source appears. |
| `identifier`, `hudColorSecondary`, ability `icon`/`button`/`inputType`/`damage*`/`ammo`/`doesNoDamage` | — | Dropped. |

## Needed before migration
The API doesn't carry these. Today they exist only in the data files that are being removed. Their mapping is added once their source and shape are known.
- **Damage numbers** for basic attacks, abilities and core abilities, including per-tier damage changes. For example, `Melee Damage: 15 / 15 / 10+10`, `Ranged Damage`, core `Damage`, and Radiant Shield's `Lifesteal (Self)`.
- **Prose upgrade effects** that no stat or mechanic change expresses. For example, Shadowsmoke III: "1.5 seconds of invisibility when leaving smoke".
- **Eternal** title ("The Dancer"), description, wiki URL, portrait, and `inRotation` (which `/randombuild` filters on).

These are **dropped, not migrated**:
- **Weapon subtype**: the free-text "Weapon (Mace)" goes away, and `slot` is just `Weapon`.
- **Search aliases**:
  - Items have none.
  - Every eternal has some, but nothing reads them. `/eternals` picks from a fixed choice list and doesn't search, and `/item` only searches `eternal.name`.
  - Glossary and FAQ aliases are separate and stay.

## Model changes ([src/types.ts](../src/types.ts))
1. **`Item`:**
   - `sourceId: string`
   - `eternal?: string`
   - `lore?: string`
   - `slot: 'Crown' | 'Amulet' | 'Weapon' | 'Anchor' | 'Consumable'`
   - `icon` becomes an absolute URL
   - drop `aliases`
2. **`Eternal`:**
   - drop `items`; ownership lives on `Item.eternal`
   - drop `aliases`
   - add `sourceId`
   - add `color?: number`
   - `coreAbility.stats: Stats`
   - `title`, `description`, `wikiUrl`, `imageUrl`, `inRotation` stay, filled from their source once it's known
3. **`SetBonus.itemsRequired?: number`.**
4. **`AbilityUpgrade`:**
   - `tier: 'II' | 'III'`
   - `tags?: string[]`
5. **New:** raw API payload interfaces.

## What players will see change
Compared with the hand-copied data, as of API version 0.23.0.

**Already applied to the local data on 2026-10-07:**
- **Leodin's core:** cooldown 20→24s, and Stun 1s added.
- **Glint Spear Reflect:** cooldown 16→14s, Channel Time 4→3.5s.
- **Sanctuary:** 6→4.5m, and III 8→6m.
- **Set bonuses:**
  - Irenna's now reads "stunned, slowed, or tethered".
  - Tsu'bo's now reads "Deal 50% more damage at 150 total HP".

**Arriving with the migration:**
- **Stats.**
  - Vortex 3.3→3.25m.
  - Boom-Chakas stun 0.5→1s.
  - Ravah's aura 2.8→2.75m.
- **Healing.** Vitality and Fortitude Crown healing becomes totals (75, 50) instead of per-second strings.
- **Tags.** 13 abilities change tags. For example:
  - Icebreaker loses Root.
  - Eclipse Hammer's AoE moves to tier III.
  - Charged Rings loses Displacement.
  - Run Free: Lifesteal → Breakout.
  - Karriv's DoT tags become "Searing Damage Over Time".
  - Leodin's core gains Crushing.
- **Renames.**
  - Grimwold's crown and amulet are now **Oscillating Crown** and **Voltaic Amulet**.
  - `AoE Range` becomes `Area of Effect Range`, and `Reflect Damage` becomes `Damage Return`.
  - Core stats take the API's names (`Range` → `Max Range` / `Area of Effect Range`, `Stun` → `Stun Duration`).

## Codebase notes (since the first plan)
- **Names.** Item names already drop the owner. `itemUrl` ([src/utils/items.ts](../src/utils/items.ts)) adds it back for the wiki anchor.
- **Rendering location.** Rendering is in [src/embeds/items.ts](../src/embeds/items.ts) (`statsBlock`, `abilityBlock`, `detailEmbed`) and [src/embeds/eternals.ts](../src/embeds/eternals.ts). The embed colour is hard-coded in `baseEmbed` ([src/embeds/general.ts](../src/embeds/general.ts)).
- **Import-time snapshots.** These read data when their module is first imported, so they need to read it at call time instead:
  - The `/item` and `/eternals` command choices are built at import.
  - `/randombuild` builds its pools at import.
  - `filterItems` and `itemsOf` live in [src/data.ts](../src/data.ts).
- **Search index.** It's cached by array identity, so swapping in new arrays rebuilds it automatically.
- **Tests** ([tests/data.test.ts](../tests/data.test.ts), [tests/embeds.test.ts](../tests/embeds.test.ts)). They read `eternal.items`, check that icon files exist on disk, and render every embed against Discord's limits.

## Migration steps
1. `src/gameData/api.ts`: payload types, plus `fetchIndex()`/`fetchLocale()` (global `fetch`, `AbortSignal.timeout`).
2. Types: the model changes above.
3. `src/gameData/map.ts`: a pure `buildGameData(payload, version)`. It covers:
   - grouping and tiers
   - the unit table and text cleanup
   - glossary normalisation
   - exclusions and the Anchor allowlist
   - consumable flattening
   - validation: throws on broken invariants and logs warnings for unknown stats or tags
4. Runtime state.
   - [src/data.ts](../src/data.ts): `export let eternals/items` plus `setGameData()`. Ownership comes from `item.eternal`, and `itemsOf` sorts Crown, Amulet, Weapon.
   - `src/gameData/cache.ts`: the startup load and the TTL loop.
   - [src/config.ts](../src/config.ts): `gameDataTtlMinutes`.
   - [src/index.ts](../src/index.ts): load before login, extract `registerCommands()`, and re-register when the roster changes.
5. Commands and embeds.
   - Command `data` becomes a getter so choices track the roster.
   - `/randombuild` builds its pools per call.
   - The item embed shows lore and tier tags in `statsBlock`.
   - `/item`'s search keys drop `item.aliases`.
   - The eternal embed shows core stats as a record and "(N items)" on the set bonus.
   - Both use the eternal `color`.
6. [data/glossary.json](../data/glossary.json): add "Searing Damage Over Time" with the API's definition.
7. Map the [Needed before migration](#needed-before-migration) fields from their source.
8. Delete `data/items.json` and `data/eternals.json`. Delete `images/items/` after the icon check. Delete `images/eternals/` once portraits have a source.
9. Tests.
   - **Mapper unit tests** use small inline fixtures. They cover:
     - the Shadowsmoke tiers
     - Dancing Blade's markup and its III `Reset on Kill`
     - Health Potion
     - exclusions and the Anchor allowlist
     - Echo mask "2"
     - lowercase E-codes
     - units
   - **Cache tests** use a mocked `fetch` and fake timers. They check that:
     - the same version fetches only the index
     - a new version swaps the data
     - a mid-run error keeps the old data
   - **Data-driven suites** (`data.test.ts`, `embeds.test.ts`) load the live API in shared setup. Replace the `eternal.items` and icon-file checks, and add upgrade tags to the glossary check.
10. [README.md](../README.md): replace "one-time copy from the wiki — nothing syncs" with the API sync and `GAME_DATA_TTL_MINUTES`.

## Verification
- Run `npm run typecheck && npm run lint && npm test`.
- **Startup.** The bot logs the build version. With a 1-minute TTL it logs version checks and does no locale fetch. An unreachable API at startup exits non-zero.
- **In Discord:**
  - `/item name:shadowsmoke`: Cooldown 18s with `II` 16s, lore, and **the API icon renders**. Inspecting the embed shows the thumbnail proxied through `media.discordapp.net` with the `?v=` URL.
  - `/item name:dancing blade`: "Pierces" with no markup, and `III` `Reset on Kill`.
  - `/item name:health potion`: Healing 125 and Max stacks 4.
  - `/item slot:anchor`: exactly 6.
  - `/item name:coelacanth`: no match.
  - `/eternals name:irenna`: "Cold-blooded (2 items)" in Irenna's colour.
  - `/randombuild` works.
  - The share button re-posts with thumbnails.
