# Plan: map game-data item dump → `data/items.json` / `src/abilities.ts`

## Context
We have a raw game-data export (`Downloads/message(1).txt`, sample: Shadowsmoke Crown lvl1–3). It is more authoritative than the hand-scraped wiki data in [data/items.json](../data/items.json). Goal: define how each source field maps into our `Item` / `ItemAbility` model ([src/types.ts](../src/types.ts)) so an importer can regenerate items.json, and make the model changes that are worth making. Rendering in [src/abilities.ts](../src/abilities.ts) (`statsBlock`, `abilityBlock`, `restates`) should keep working unchanged.

So far we only have a Crown sample. Anything that depends on weapons or consumables is marked **pending samples**.

## Key shape difference
The source has **one record per upgrade level** (`item_E04_crown_lvl1/2/3`). We have **one item with base stats plus per-tier deltas**. The importer groups source records by `upgradeRootIdentifier`, takes lvl1 as the base, and diffs lvl2/lvl3 against it to produce `upgrades[].changes`.

## Field mappings

### Item level
| Source | Target | Notes |
|---|---|---|
| `upgradeRootIdentifier` | *(new)* `sourceId` | Stable join key for re-imports and merges. |
| `displayName` | `name`, and `id` = slug of `name` | Used as-is, with no owner prefix ("Shadowsmoke Crown"). The importer generates `id`. Search still finds items by eternal name, because `/item` keys include `eternal.name`. |
| `eternalIdentifier` | *(new)* `eternal` (eternal slug, e.g. `"ravah"`) | The hash is stored on eternals.json as `Eternal.sourceId` and resolved to the slug at import time. Absent/empty ⇒ Echo item (no `eternal`). |
| `categoryName` | `slot` | "Crown" → "Crown". Weapon/Anchor/Consumable values **pending samples**. |
| `type` ("Armor") | *(new)* `type`, kept for now | Stored raw. Decide whether to keep it once we've seen weapon and consumable records. |
| `icon` (`icons/…png`) | `icon` | A relative path, not a URL. Keep the existing wiki URLs unless we host the extracted icons (e.g. raw GitHub URLs). Use the lvl1 icon. |
| `itemLore` | *(new)* `lore` | Trim trailing whitespace. Rendered as an italic line in the `/item` detail embed. |
| `maxStackCount` | `stats["Max stacks"]` | Consumables only (value > 1). |
| `durability`, `identifier`, `upgradesToIdentifier`, `upgradeCost`, `inventoryType` | — | Dropped. |

### Ability level (`abilities[]`, matched across levels by `displayName`)
| Source | Target | Notes |
|---|---|---|
| `displayName` | `name` | |
| `displayDescription` | `description` | |
| `button` | — | Dropped. `input` (primary/secondary) for weapons probably comes from ability order in the array. **Pending samples.** |
| `cooldownSeconds` | `stats.Cooldown` = `"18s"` | Read from each level's record, so the lvl2 value of 16.0 becomes `{tier:"II", changes:{Cooldown:"16s"}}`. Omitted when 0 (basic attacks). |
| `ammo` | `stats.Ammo` | Only when > 0. |
| `mechanics[].name` | `tags` | Casing normalised to glossary terms ("Aoe" → "AoE") by looking up [data/glossary.json](../data/glossary.json) terms and aliases. |
| `mechanics[].levelMask` | tag vs upgrade | A bitmask where bit n = level n ("14" = 0b1110 = L1–3). A mechanic present at L1 becomes a tag. One present only from L2/L3 becomes an upgrade `effect`, e.g. "Gains Lifesteal". |
| `mechanics[].definition` | — (glossary) | Not stored on items. Used for a one-off audit of glossary.json. |
| `stats[].statName` | stats key | |
| `stats[].level1Value` | base value | Representation **pending samples** (see "Deferred" below). |
| `level2Value`/`level3Value` | `upgrades[].changes` | A tier is emitted only if something differs from the previous tier. Every record repeats all three levels, so stats are read from the lvl1 record. |
| `modifierCategory`, `damageType`, `damageScaleType`, `doesNoDamage`, `inputType`, ability `icon` | — for now | Meaning is unclear from one Crown sample. Revisit with weapon records; `inputType` may map to "Charged Attack" / "Channeled Attack" tags. |

### Things the source does **not** carry (preserved from the existing items.json)
- Prose upgrade `effect`s. Example: Shadowsmoke III ("1.5 seconds of invisibility when leaving smoke") has no stat or mechanic change in the dump.
- `aliases`, and Anchor descriptions.
- Possibly combo damage strings (`"15 / 15 / 10+10"`), **pending weapon samples**.

⇒ The importer **merges** rather than overwrites, joining on `sourceId`. The first run joins on the old name with the owner prefix stripped, to backfill `sourceId`. The source wins for stats, cooldowns, tags, description, name and ownership. The existing items.json wins for `effect`, `aliases`, `icon`, and any stat key the source doesn't produce.

## Model changes ([src/types.ts](../src/types.ts), data files)
1. **`Eternal.sourceId: string`** (the `eternalIdentifier` hash), added to every entry in [data/eternals.json](../data/eternals.json).
2. **Move ownership onto items: add `Item.eternal?: string` (eternal slug) and drop `Eternal.items`.**
   - [src/data.ts](../src/data.ts): build `ownerById` from `item.eternal`. Throw at startup if an item names an unknown eternal.
   - `itemsOf(eternal)`: filter by `eternal` and sort by slot order (Crown, Amulet, Weapon), so the `/eternals` output ([src/commands/eternals.ts](../src/commands/eternals.ts)) keeps its order.
3. **`Item.sourceId?: string`**. It is optional in case Anchors and Consumables aren't in the dump.
4. **`Item.lore?: string`** and **`Item.type?: string`**.
5. **Normalise `slot`** to `'Crown' | 'Amulet' | 'Weapon' | 'Anchor' | 'Consumable'`, and move the free-text subtypes ("Weapon (Mace)" etc.) into an optional `weaponType`. `item.ts` already filters with `startsWith(slot)`, so behaviour is unchanged. The subtitle becomes `Weapon · Mace`.
6. **`AbilityUpgrade.tier` as `'II' | 'III'`**.

### Deferred until we see weapon records
- **Stats representation.** Either keep `Record<string,string>` display strings, or move to a structured form (`{value, unit, levels[]}`). This decides how the importer formats values and units, and whether [src/abilities.ts](../src/abilities.ts) changes.
- How `input` is derived, and whether `type` stays.

## Implementation steps

**Phase A (can be done now, no importer)**
1. Types: model changes 1–6.
2. eternals.json: add `sourceId` for Ravah from the sample; the other eternals follow when the full dump arrives. Remove the `items` arrays.
3. items.json: add `eternal` to each owned item (from the current `items` arrays), and normalise `slot`/`weaponType`. Names and ids stay as they are until the importer runs.
4. [src/data.ts](../src/data.ts): derive ownership from `item.eternal`, rewrite `itemsOf`, and add the startup check.
5. [src/commands/item.ts](../src/commands/item.ts) `detailEmbed`: render `lore` (italic) and `weaponType` in the subtitle.
   - Side effect to check: `itemUrl` builds its wiki anchor from `item.name`. Once names lose the "Ravah's" prefix, the anchor may no longer match a wiki heading. The link would still open the right page, just not the section.

**Phase B (after weapon/consumable samples)**
6. Decide the deferred items above.
7. Add `scripts/import-items.ts` (run with `tsx`, via an npm script `import:items <dump.json>`): group → map → diff tiers → merge → write sorted by eternal then slot, in the current compact formatting.
8. Optional: diff `mechanics[].definition` against glossary.json and report missing or divergent terms.

## Open questions (need more of the dump)
- Weapon records: ability order, where damage numbers live, and `inputType` values.
- Consumable/Anchor records: `categoryName`, `type`, `maxStackCount`. Are they in the dump at all?
- Is `eternalIdentifier` blank for Echo items?
- Other `modifierCategory` / `damageScaleType` values.

## Verification
- `npm run typecheck && npm run lint`.
- Phase A: the bot starts (startup validation passes). `/eternals name:ravah` lists the same four items in the same order. `/item eternal:ravah slot:crown` shows lore once it's populated, and `/item slot:weapon` still filters correctly.
- Phase B: run the importer on the full dump. `git diff data/items.json` should show numeric corrections, name/id changes and new fields, with no lost `effect`/`aliases`. `/item name:shadowsmoke` should show Cooldown 18s, `II` Cooldown 16s, and the `III` prose effect kept.
