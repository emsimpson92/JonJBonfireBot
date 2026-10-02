# JonJ Bonfire Bot

A Discord bot with slash commands for an FAQ, playtest links, eternal and item lookups, and a glossary.

Content is populated from the [Arkheron Wiki](https://arkheron.wiki.gg/): 12 eternals, 74 items
(48 eternal-specific plus Echo crowns, amulets and weapons, anchors and consumables), and 66
glossary terms, with wiki icons and portraits on the embeds. The only remaining placeholders are
the channel IDs and bot token in `.env`. See [Editing the content](#editing-the-content).

The commands cross-reference each other: `/eternals` names an eternal's four items, `/item`
gives one item's abilities and tier upgrades, and the ability tags on both are glossary terms,
so `/glossary term:crushing` explains them.

## Commands

| Command | Description |
| --- | --- |
| `/help [command]` | Lists commands. With an argument, shows that command's syntax and examples. |
| `/faq [topic]` | Lists FAQ topics. With an argument, shows that topic's numbered questions and answers. |
| `/playtest` | Links the playtest channel. |
| `/socials` | Links the official social channels. |
| `/eternals [name]` | Lists every eternal. With an argument, shows their ability, set bonus, and items. |
| `/item [eternal] [slot] [name]` | Shows an item and the abilities it grants. `eternal:` includes an **Echo** choice for items tied to no eternal; `slot:` covers crowns, amulets, weapons, anchors and consumables. The options combine and each works alone. |
| `/glossary [term]` | Defines a term. With no argument, lists all 66. |

`/eternals name:` and `/item eternal:` / `slot:` are pick-lists. `/item name:` and
`/glossary term:` use **autocomplete**, since 48 items and 66 terms are well past Discord's
25-choice cap; matches are ranked exact, then prefix, then word-start, then anywhere.

Typed values are still matched leniently — case-insensitive, tolerant of partial names,
aliases and small typos, so `stealh` finds Stealth, `hp` finds Essence and `reaver` finds
Tormentors. When several entries match equally well the bot lists them rather than guessing
(`/glossary term:damage` → the four Damage terms); when nothing matches it suggests alternatives.

## Setup

1. **Create the application** at <https://discord.com/developers/applications> → *New Application* → *Bot*.
2. **Copy the token**: *Bot → Reset Token*. No privileged intents are needed — slash commands
   arrive as interactions, so the Message Content intent stays **off**.
3. **Invite the bot**, substituting your *General Information → Application ID*:
   ```
   https://discord.com/oauth2/authorize?client_id=YOUR_APPLICATION_ID&permissions=19456&scope=bot%20applications.commands
   ```
   The `applications.commands` scope is what allows slash commands; without it they never appear.
4. **Configure**:
   ```sh
   cp .env.example .env
   ```
   Fill in `DISCORD_TOKEN`, then `GUILD_ID`
   (enable *Settings → Advanced → Developer Mode* in Discord, then right-click → *Copy ID*).
   The [rate limits](#rate-limiting) have working defaults and can be left alone.
5. **Run**:
   ```sh
   npm install
   npm run dev     # watch mode
   npm run build && npm start   # production
   ```

Commands register themselves on startup — there is no separate deploy step. With `GUILD_ID`
set they register to that server and appear immediately; without it they register globally,
which Discord can take up to an hour to propagate. Use `GUILD_ID` while developing.

## Rate limiting

Commands are throttled by a **sliding window** one minute wide, in
[src/rateLimit.ts](src/rateLimit.ts). Each bucket keeps the timestamp of every request still
inside its window, so the window moves continuously instead of resetting on a clock boundary —
5 requests at 0:59 do not let another 5 through at 1:00.

| Variable | Default | Scope |
| --- | --- | --- |
| `MAX_REQUESTS_PER_MINUTE` | 10 | Every command the bot handles, from anyone. |
| `MAX_REQUESTS_PER_USER_PER_MINUTE` | 5 | One person's commands. |

Both must be whole and positive; anything else falls back to the default rather than leaving the
bot unthrottled. The per-user limit is checked first, and a request that is turned away consumes
nothing — being throttled never eats into the budget it was just denied.

When a limit is hit the command does not run, and the notice goes where only the people
concerned will see it:

- **Bot-wide limit** — a visible reply in the channel: *The message limit has been reached.
  Please wait and try again.* Everyone is affected, so everyone sees why.
- **Per-user limit** — the same notice as a **DM**, keeping one person's spam out of the
  channel. Discord still needs the interaction acknowledged or it shows a failure to the whole
  channel, so it is deferred privately and withdrawn once the DM is away. If their DMs are
  closed the notice falls back to an ephemeral reply only they can see.

Autocomplete is deliberately **not** throttled: it fires on every keystroke, it cannot be
replied to, and it runs entirely from data already in memory.

Both windows live in the bot's process, so restarting clears them and a second instance would
count separately.

## Editing the content

Content lives in JSON so it can be edited without touching code. Restart the bot to pick up changes.

| File | Holds |
| --- | --- |
| `data/eternals.json` | The 12 eternals. Their `items` are **ids into `items.json`**, not inline objects. |
| `data/items.json` | All 74 items: 48 eternal-specific, plus generic Echo crowns/amulets/weapons, anchors and consumables. |
| `data/glossary.json` | The 66 glossary terms. |
| `data/faq.json` | FAQ topics, each a list of `question`/`answer` pairs plus optional `aliases` (`playtest` → Beta). `/faq` numbers them in file order. |
| `data/socials.json` | Social links, each a `name`/`url` pair. `/socials` lists them in file order. |
| `images/items/`, `images/eternals/` | Item icons and eternal portraits, one PNG per id. |

An item belongs to an eternal purely by being listed in that eternal's `items` array — there is
no back-reference to maintain. Anything no eternal lists is a generic item, which is how `/item`
tells them apart. Startup fails loudly if an eternal names an id that `items.json` does not have.

Icons and portraits are local files, downloaded from the wiki: `icon` on each item and
`imageUrl` on each eternal hold a path relative to the project root (`images/items/bow.png`), not
a URL. The embed thumbnail points at the same file in this repo on GitHub, under `IMAGE_BASE_URL`
(default: `https://raw.githubusercontent.com/emsimpson92/JonJBonfireBot/main/`). Discord fetches
it once and caches it. The wiki's own image links didn't load in Discord. Nothing checks that a
path exists; a wrong one just leaves the embed without a thumbnail.

To add one, drop a PNG into `images/` and set the path; anything about 256px across is plenty,
since Discord shows thumbnails at 80px. **It only shows up once it's on `main`** (or whichever
branch `IMAGE_BASE_URL` names). Replacing an image under the same name can keep showing the old
one for a while, because Discord caches by URL, so give a changed image a new file name.

All three files and the images are a **one-time copy from the wiki — nothing syncs.** Wiki edits
will not propagate, so re-check them when the game patches.

- **`data/eternals.json`** — one object per eternal:
  ```json
  {
    "id": "dahla",
    "name": "Dahla",
    "title": "The Dancer",
    "description": "Shown as the embed body.",
    "coreAbility": {
      "name": "Curtain Call",
      "description": "Pull in distant enemies, stunning them.",
      "tags": ["Cone Attack", "Stun", "Exhaust"],
      "damage": "35",
      "cooldown": "26s",
      "range": "9m"
    },
    "setBonus": { "name": "Deep Pockets", "description": "Max stack of consumables increased" },
    "items": ["dahla-vanish-crown", "dahla-petal-dance-amulet", "dahla-dancing-blade", "dahla-throwing-knives"],
    "wikiUrl": "https://arkheron.wiki.gg/wiki/Dahla",
    "imageUrl": "images/eternals/dahla.png",
    "aliases": ["dancer"]
  }
  ```

- **`data/items.json`** — one object per item, referenced by `id`:
  ```json
  {
    "id": "dahla-vanish-crown",
    "name": "Dahla's Vanish Crown",
    "slot": "Crown",
    "icon": "images/items/dahla-vanish-crown.png",
    "abilities": [
      {
        "name": "Vanish",
        "description": "Transform into an invulnerable fast-moving orb…",
        "tags": ["Phased", "Invisible"],
        "stats": { "Cooldown": "15s", "Duration": "1.5s" },
        "upgrades": [
          { "tier": "II", "changes": { "Cooldown": "12s" } },
          { "tier": "III", "effect": "When leaving Vanish, you are invulnerable for 1 second" }
        ]
      }
    ]
  }
  ```
  `slot` is `Crown`, `Amulet`, `Weapon` (sometimes `Weapon (Sword)`), `Anchor` or `Consumable`.
  Anchors and consumables grant no separate ability: they carry a `description` and optional
  `stats` directly, with `abilities` left empty. Echo items have no tiers, so their abilities
  have `stats` and no `upgrades`.
  **Items hold abilities; abilities hold base stats plus upgrades.** Crowns and amulets grant
  one ability; every weapon grants two, tagged `"input": "primary"` (the basic attack) and
  `"secondary"` (the one on a cooldown).

  `stats` is Tier I in full. Each entry in `upgrades` is a tier above that, carrying only what
  it adds: `changes` for the stats it moves, `effect` for the wiki's prose where a tier grants
  a trait no number captures ("Eliminations reset cooldown"). A tier that changes nothing is
  omitted. All abilities stop at III

  Where a tier has both `changes` and `effect`, the renderer drops the prose only when it
  merely restates the numbers ("Blind Duration 6s" vs "Blind duration increased to 6 seconds");
  prose that adds something survives alongside them.

  `stats` and `changes` are open maps because labels vary per ability (Cooldown, Ammo, Weaken
  Percentage, Damage Shared…), and their values are strings because the wiki writes things like
  `20 / 30 + 15 DoT`. An ability's `description` and `tags` are optional — several basic
  attacks are listed on the wiki with neither and render as stats only. `tags` are glossary
  terms, so `/glossary` explains what a tag means.

  On the eternal itself, `damage`, `cooldown`, `range`, `imageUrl` and `aliases` are optional;
  omitted number fields are left out of the embed rather than rendered blank (Rynshi's Rampage
  deals no damage).

  There are no per-character health/damage/speed stats — every player has the same 200 Essence
  and 100 Fortitude. `imageUrl` puts a portrait thumbnail on the embed.

- **`data/glossary.json`** — one object per term: `term`, `definition`, optional `aliases`.
  Sourced from the [Arkheron Wiki glossary](https://arkheron.wiki.gg/wiki/Glossary); definitions
  are verbatim, `aliases` are additions for lookup convenience (`hp` → Essence, `dot` →
  Damage over Time, `reaver` → Tormentors). Entries the wiki marks outdated (Reflect,
  Resilience, Soft Target, Tracking) are kept so the bot can point people at the current term.

## Known wiki inconsistencies

Reproduced as-is rather than silently corrected. Worth re-checking upstream:

- **Vaton's amulet has two names.** The infobox calls it *Vaton's Audacity Amulet*, the item
  section *Vaton's Imbalanced Scales Amulet*. The infobox name is used (consistent with every
  other eternal); the other is an item alias, so both resolve.
- **Two ability tags have no glossary entry:** `Aura` and `Bounce`. `/glossary` cannot explain
  them until the wiki adds them.
- **Three tags are spelled differently from the glossary:** `Airborne Ability` vs Airborne
  Attack, `Channeled Attack` vs Channeled Ability, `Damage Reflect` vs Damage Return. Tags are
  kept as written and the glossary carries aliases, so lookups resolve either way.
- **Penelope's Lock the Door shrinks at Tier III** (AoE Range 3m → 1.5m), against the pattern
  of every other tier upgrade. Possibly an upstream typo; copied as written.


## Adding a command

1. Create `src/commands/yourCommand.ts` exporting a `Command` (see [src/types.ts](src/types.ts)).
   Give it a `SlashCommandBuilder` as `data`, plus `usage` and `examples` for /help.
2. Add it to the `commands` array in [src/commands/registry.ts](src/commands/registry.ts).

`/help` reads that array, so the new command documents itself.

## Layout

```
data/          Content: eternals.json, glossary.json
images/        Item icons and eternal portraits
src/
  index.ts     Client setup, command registration, interaction dispatch
  config.ts    Env vars with placeholder fallbacks
  rateLimit.ts Sliding-window throttling, bot-wide and per user
  data.ts      Loads and validates the JSON files
  images.ts    Image paths to their GitHub URLs
  search.ts    Name/alias matching with typo tolerance
  embeds.ts    Embed builders and truncation helpers
  types.ts     Command, Eternal, GlossaryEntry
  commands/    One file per command, plus registry.ts
```

## Adding Jon J Bonfire to your server

https://discord.com/oauth2/authorize?client_id=1552144984768254083&permissions=19456&scope=bot%20applications.commands