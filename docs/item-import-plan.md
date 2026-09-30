# Plan: map game-data dump → `data/items.json` / `data/eternals.json`

## Context
We have a raw game-data export that is more authoritative than the hand-scraped wiki data in [data/items.json](../data/items.json) and [data/eternals.json](../data/eternals.json). Goal: define how each source field maps into our `Item` / `ItemAbility` / `Eternal` model ([src/types.ts](../src/types.ts)) so an importer can regenerate both files, and make the model changes that are worth making. Rendering in [src/abilities.ts](../src/abilities.ts) (`statsBlock`, `abilityBlock`, `restates`) keeps working unchanged.

Samples so far:
- Ravah's Shadowsmoke Crown lvl1–3 (`Downloads/message(1).txt`)
- Dahla's Dancing Blade lvl1–3 (`Downloads/message(2).txt`)
- a Health Potion record
- the Edani eternal record, plus the `setBonuses` from the record before it

Only **Anchors** are still **pending samples**.

## Key shape difference
The source has **one record per upgrade level** (`item_E04_crown_lvl1/2/3`). We have **one item with base stats plus per-tier deltas**. The importer groups source records by `upgradeRootIdentifier ?? identifier`, takes lvl1 as the base, and diffs lvl2/lvl3 against it to produce `upgrades[].changes`. A group with one record (e.g. a consumable) has no tiers.

## Item records → items.json

### Item level
| Source | Target | Notes |
|---|---|---|
| `upgradeRootIdentifier`, else `identifier` | *(new)* `sourceId` | Stable join key for re-imports and merges. Consumables have no upgrade chain, so they fall back to `identifier`. |
| `displayName` | `name`, and `id` = slug of `name` | Used as-is, with no owner prefix ("Shadowsmoke Crown"). The importer generates `id`. Search still finds items by eternal name, because `/item` keys include `eternal.name`. |
| `displayDescription` (item level) | `description` | Trimmed. Only consumables have it. |
| `eternalIdentifier` | *(new)* `eternal` (eternal slug, e.g. `"ravah"`) | The owner is the eternal record whose `name` matches the E-code in the item's `identifier` (`item_E04_crown_lvl1` → E04 → Ravah). The E-code is only read when `eternalIdentifier` is present, because eternal records don't carry the hash. The importer checks that every item sharing a hash gets the same E-code. When `eternalIdentifier` is absent, the item gets no `eternal`. That covers Echo items (confirmed) and consumables. |
| `categoryName` | `slot` | Crown, Weapon and Consumable are confirmed. Anchors aren't in the dump yet. |
| `icon` (`icons/…png`) | `icon` | A relative path, not a URL. Keep the existing wiki URLs unless we host the extracted icons (e.g. raw GitHub URLs). Use the lvl1 icon. |
| `itemLore` | *(new)* `lore` | Trim trailing whitespace. Rendered as an italic line in the `/item` detail embed. |
| `maxStackCount` | `stats["Max stacks"]` | Only when greater than 1 (Crown and weapon records carry 1). |
| `type`, `durability`, `identifier`, `upgradesToIdentifier`, `upgradeCost`, `inventoryType` | — | Dropped. `type` values seen are Armor, Weapon and Potion, which repeat the slot or the name. `identifier` is only read for the `sourceId` fallback and the owner's E-code. |

### Ability level (`abilities[]`, matched across levels by `displayName`)
| Source | Target | Notes |
|---|---|---|
| `displayName` | `name` | |
| `displayDescription` | `description` | `[keyword …]…[/keyword]` is stripped down to its inner text: `[keyword tag=pierce]Pierces[/keyword]` → "Pierces". |
| `button` | `input` | Attack1 becomes primary and Attack2 becomes secondary. Any other value (Armor, Consumable) gives no input. |
| `cooldownSeconds` | `stats.Cooldown` = `"18s"` | Read from each level's record, so the lvl2 value of 16.0 becomes `{tier:"II", changes:{Cooldown:"16s"}}`. Omitted when absent or 0; basic attacks have no field at all. |
| `ammo` | `stats.Ammo` | Only when > 0. |
| `mechanics[].name` | `tags` | Casing normalised to glossary terms ("Aoe" → "AoE") by looking up [data/glossary.json](../data/glossary.json) terms and aliases. |
| `mechanics[].levelMask` | tag vs upgrade | A bitmask where bit n = level n ("14" = 0b1110 = L1–3). A mechanic present at L1 becomes a tag. One present only from L2/L3 becomes an upgrade `effect`. Confirmed: Dancing Blade's "Reset on Kill" is "8" (L3 only), which lines up with the current III effect, "Eliminations reset cooldown". |
| `mechanics[].definition` | — (glossary) | Not stored on items. Used for a one-off audit of glossary.json. |
| `stats[].statName` | stats key | |
| `stats[].level1Value` | base value | Formatted with the unit table (see "Decisions from the samples"). |
| `level2Value`/`level3Value` | `upgrades[].changes` | A level is read only if the group has a record for it, so single-level items ignore the 0.0 placeholders. A tier is emitted only if something differs from the previous tier. Every record repeats all three levels, so stats are read from the lvl1 record. |
| `modifierCategory`, `damageType`, `damageScaleType`, `doesNoDamage`, `inputType`, ability `icon` | — | Dropped. Values seen: `modifierCategory` None, Healing. `damageScaleType` Other, Melee, None. `damageType` Single, Combo. `inputType` Default, Hold. Revisit if Charged or Channeled `inputType` values turn up. |

### Consumables
A consumable becomes an item with `abilities: []`, as it is today. Its single ability is flattened into the item:
- Its stats (and a cooldown, if it has one) go into `item.stats`, next to `Max stacks`.
- Its description is dropped when it matches the item's.
- Its mechanics are dropped until we see a consumable that has some.

This keeps the current `/item` Stats-field rendering ([src/commands/item.ts:56](../src/commands/item.ts#L56)).

## Eternal records → eternals.json
| Source | Target | Notes |
|---|---|---|
| `name` ("E03") | `sourceId` | The join key for items and re-imports. `identifier` ("eternal_E03") is dropped. |
| `displayName` | `name`, and `id` = slug | |
| `ability.displayName` / `displayDescription` | `coreAbility.name` / `description` | Keyword markup is stripped, as for items. |
| `ability.mechanics[].name` | `coreAbility.tags` | Casing is normalised the same way as for items. Every levelMask is L1, so there are no upgrades. |
| `ability.cooldownSeconds` + `ability.stats[]` (`level1Value` only) | `coreAbility.stats` | Uses the same unit table. Every source name is already a `CoreStatName` ([src/types.ts:8](../src/types.ts#L8)), so they map directly. |
| `setBonuses[0].displayName` | `setBonus.name` / `description` | Split at the first ": ". Each eternal has exactly one set bonus, so `setBonus` stays a single object. This fixes Irenna's text: "stunned or slowed" becomes "stunned, slowed, or tethered". |
| `setBonuses[0].itemCountRequired` | *(new)* `setBonus.itemsRequired` | Shown in `/eternals` as "Set Bonus: Cold-blooded (2 items)" ([src/commands/eternals.ts:26](../src/commands/eternals.ts#L26)). |
| `hudColor` ("#FF751ce3", ARGB) | *(new, optional)* `color` ("#751ce3") | Optional: the embed colour for `/eternals` and owned `/item` results. It replaces `config.embedColor` ([src/embeds.ts:9](../src/embeds.ts#L9)) for those embeds only. |
| `icon`, `hudColorSecondary`, ability `icon`/`button`/`inputType`/`damage*`/`ammo`/`doesNoDamage` | — | Dropped. `imageUrl` stays on the wiki, like item icons. |

These are kept from eternals.json because the source doesn't carry them: `title`, `description`, `wikiUrl`, `imageUrl`, `aliases`, and the core ability's `Damage`. The first run joins on `name`, which already matches exactly.

## Things the source does **not** carry (preserved from the existing data)
- Prose upgrade `effect`s. Example: Shadowsmoke III ("1.5 seconds of invisibility when leaving smoke") has no stat or mechanic change in the dump.
- **Damage numbers.** This is confirmed for weapons (the basic attack has `stats: []`) and for core abilities. The `Melee Damage` / `Ranged Damage` / `Damage` strings are kept from the existing data.
- `weaponType`. The dump has no subtype (Sword, Mace, …), so it stays hand-maintained.
- `aliases`, and Anchors as a whole.

### Merge rule
The importer **merges** rather than overwrites, joining on `sourceId`. The first run joins items on the old name with the owner prefix stripped, and eternals on `name`, to backfill `sourceId`. Items without a `sourceId` (Anchors) are left untouched.
- The source wins for description, tags, name, ownership and cooldowns.
- The existing data wins for `effect`, `aliases`, `icon`, and the eternal fields listed above.
- **Stat keys merge per ability and per upgrade tier.** Keys the source produces come from the source; the rest are kept, in their existing order. For example, Throwing Knives III keeps `"Ranged Damage": "9 / 9"` while its Ammo comes from the lvl3 record.
- The importer prints the keys it kept for each item and eternal, because a renamed stat would leave a stale key behind (e.g. Fortitude Shard's `"Healing": "50"`).

## Model changes ([src/types.ts](../src/types.ts), data files)
1. **`Eternal.sourceId?: string`**: the E-code ("E03"), not a hash. The importer's first run fills it, not a person. It is optional until then.
2. **Move ownership onto items: add `Item.eternal?: string` (eternal slug) and drop `Eternal.items`.**
   - [src/data.ts](../src/data.ts): build `ownerById` from `item.eternal`. Throw at startup if an item names an unknown eternal.
   - `itemsOf(eternal)`: filter by `eternal` and sort by slot order (Crown, Amulet, Weapon), so the `/eternals` output ([src/commands/eternals.ts](../src/commands/eternals.ts)) keeps its order.
3. **`Item.sourceId?: string`**. It is optional only because of Anchors. They aren't in the dump yet, so they stay hand-maintained.
4. **`Item.lore?: string`**.
5. **Normalise `slot`** to `'Crown' | 'Amulet' | 'Weapon' | 'Anchor' | 'Consumable'`, and move the free-text subtypes ("Weapon (Mace)" etc.) into an optional, hand-maintained `weaponType`. `item.ts` already filters with `startsWith(slot)`, so behaviour is unchanged, and the subtitle becomes `Weapon · Mace`. Dahla's "Melee"/"Ranged" become "Sword"/"Knives" to match the other 12 subtypes.
6. **`AbilityUpgrade.tier` as `'II' | 'III'`**.
7. **`SetBonus.itemsRequired?: number`**.
8. Optional: **`Eternal.color?: string`**.

## Decisions from the samples
- **Stats stay `Record<string,string>`.** The dump has no damage numbers and no units, so a structured form would still be half hand-filled. The importer formats numbers (125.0 → "125") and adds a unit from a stat-name table:
  - Cooldown and `…Duration` get "s".
  - `…Range` gets "m".
  - Speed Decrease/Increase get "%".
  - A stat name that isn't in the table gets a bare number and is reported.

  [src/abilities.ts](../src/abilities.ts) doesn't change.
- **`input` comes from `button`** (Attack1/Attack2).
- **`type` is dropped.**

## Implementation steps

**Phase A (can be done now, no importer)**
1. Types: model changes 1–8.
2. eternals.json: remove the `items` arrays. No `sourceId` is entered by hand; the importer backfills it.
3. items.json: add `eternal` to each owned item (from the current `items` arrays). Normalise `slot`/`weaponType`, including Dahla's rename to Sword/Knives. Names and ids stay as they are until the importer runs.
4. [src/data.ts](../src/data.ts): derive ownership from `item.eternal`, rewrite `itemsOf`, and add the startup check.
5. [src/commands/item.ts](../src/commands/item.ts) `detailEmbed`: render `lore` (italic) and `weaponType` in the subtitle.
   - Side effect to check: `itemUrl` builds its wiki anchor from `item.name`. Once names lose the "Ravah's" prefix, the anchor may no longer match a wiki heading. The link would still open the right page, just not the section.
6. [src/commands/eternals.ts](../src/commands/eternals.ts): render `itemsRequired` in the set bonus field name, plus the optional `color` as the embed colour for `/eternals` and owned `/item` results.

**Phase B (after the full dump)**
7. Add `scripts/import-dump.ts` (`npm run import:dump <dump.json>`), which writes both eternals.json and items.json.
   - It imports eternals first, so items can resolve their owners.
   - Pipeline: group → map → diff tiers → merge → write, sorted by eternal then slot, in the current compact formatting.
   - Extra jobs: flatten consumables, strip keyword markup, apply the unit table, and report kept keys and unknown stat names.
8. Optional: diff `mechanics[].definition` against glossary.json and report missing or divergent terms.

## Open questions
- Anchors: the dump has none yet, so they stay hand-maintained in items.json until it does.

Consumable edge cases (Healing Ward, Fortitude Shard), other `inputType` values and unknown units aren't tracked as questions. The importer's report on kept keys and unknown stat names brings them up when the full dump is run.

## Verification
- `npm run typecheck && npm run lint`.
- Phase A:
  - The bot starts, so startup validation passes.
  - `/eternals name:ravah` lists the same four items in the same order.
  - `/item eternal:ravah slot:crown` shows lore once it's populated.
  - `/item slot:weapon` still filters correctly.
- Phase B: run the importer on the full dump. `git diff data/` should show numeric corrections, name/id changes and new fields, with no lost `effect`/`aliases`/damage strings. Then check:
  - `/item name:shadowsmoke`: Cooldown 18s, `II` Cooldown 16s, and the `III` prose effect is kept.
  - `/item name:dancing blade`: Slashing Variation gains its description, and Twisting Thorn says "Pierces" with no markup. `Melee Damage 10/40` is kept, Cooldown is 15s with `II` 12s, and the `III` effect is kept.
  - `/item name:health potion`: shows the new description and a Stats field with Healing 125 and Max stacks 4.
  - `/eternals name:irenna`: shows "Set Bonus: Cold-blooded (2 items)" with "…stunned, slowed, or tethered enemies".
  - `/eternals name:edani`: Banish keeps Damage 35, with Cooldown 20s, Duration 6s and Speed Decrease 50%.
