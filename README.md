# JonJ Bonfire Bot

A Discord bot with slash commands for an FAQ, social links, eternal and item lookups, random
builds, a glossary, and player-run lobbies.

Content is populated from the [Arkheron Wiki](https://arkheron.wiki.gg/): 12 eternals, 72 items
(48 eternal-specific plus Echo crowns, amulets and weapons, anchors and consumables), and 79
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
| `/socials` | Links the official social channels. |
| `/eternals [name]` | Lists every eternal. With an argument, shows their ability, set bonus, and items. |
| `/item [eternal] [slot] [name]` | Shows an item and the abilities it grants. `eternal:` includes an **Echo** choice for items tied to no eternal; `slot:` covers crowns, amulets, weapons, anchors and consumables. The options combine and each works alone. |
| `/randombuild` | Rolls a random build from the Echo items and the items of eternals currently in rotation: one crown, one amulet and two different weapons. Only you see the result. |
| `/glossary [term]` | Defines a term. With no argument, lists all 79. |
| `/createlobby <code> <region> [mode]` | Posts a lobby for an in-game invite code, with you as host. See [Lobbies](#lobbies). |
| `/lobbies [region] [mode]` | Lists open lobbies, most recently active first, with their mode and links to their posts. `region:` and `mode:` filter the list and combine; lobbies with no mode don't match a `mode:` filter. |
| `/lobbyadd <player>` | Host only. Adds a server member to the lobby you're hosting, unless they're already in a lobby. |
| `/lobbykick <player>` | Host only. Removes a player from the lobby you're hosting; `player:` autocompletes against your own roster. |

`/socials`, `/eternals`, `/item` and `/glossary term:` reply so only you see them, with a
**Post to channel** button that posts the same embeds publicly, marked with who shared them. The
post is a plain message rather than a reply, since a reply would point at the private one and
read as deleted once it's dismissed, so the bot needs to be able to send messages and embed links
in that channel. The button comes off the private reply once the post goes through.

`/eternals name:`, `/item eternal:` / `slot:` and the lobby `region:` / `mode:` options are
pick-lists. `/item name:`, `/glossary term:`, `/faq topic:` and `/help command:` use
**autocomplete**, since 72 items and 79 terms are well past Discord's 25-choice cap; matches are
ranked exact, then prefix, then word-start, then anywhere. `/item name:` only suggests items that
fit the `eternal:` and `slot:` already picked, so `eternal:Dahla` narrows it to her four.

Typed values are still matched leniently — case-insensitive, tolerant of partial names,
aliases and small typos, so `stealh` finds Stealthed, `hp` finds Essence and `reaver` finds
Tormentors. When several entries match equally well the bot lists them rather than guessing
(`/glossary term:damage` → the four Damage terms); when nothing matches it says so and points
at the command that lists everything.

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
   Fill in `DISCORD_TOKEN`, then `GUILD_ID` and `LOBBY_CHANNEL_ID`
   (enable *Settings → Advanced → Developer Mode* in Discord, then right-click → *Copy ID*).
   The [rate limits](#rate-limiting) have working defaults and can be left alone.
5. **Run**:
   ```sh
   npm install
   npm run dev     # watch mode
   npm run build && npm start   # production
   npm test        # see Testing
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
| `MAX_REQUESTS_PER_MINUTE` | 50 | Every command the bot handles, from anyone. |
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

Buttons (the lobby ones and **Post to channel**) have budgets of their own, separate from
commands: per user the same size as for commands, and bot-wide twice `MAX_REQUESTS_PER_MINUTE`.
A busy lobby can see dozens of joins in a minute, and those shouldn't lock everyone out of
commands. A throttled click gets a reply only the clicker can see.

## Lobbies

`/createlobby code:DX89EE region:Europe` posts a lobby in the lobby channel (`LOBBY_CHANNEL_ID`;
unset, any channel works). Codes are six letters or digits and are stored in capitals, so
`dx89ee` works too. Regions are North America, South America, Europe and Asia. The optional
`mode:` is Ascension or Spires, and shows on the post and in `/lobbies` when set.

The post shows the region, the mode if one was given, when the lobby expires, and the numbered roster with the host
marked 👑. It has three buttons:

- **Join** — adds you to the lobby. Joining moves you out of any other lobby, since nobody can
  be in two; at 45 players, joining is refused. Clicking it while already in the lobby gets an
  ephemeral error.
- **Leave** — removes you from the lobby; clicking it while not in the lobby gets an ephemeral
  error. If the host leaves, whoever has been in the lobby longest takes over. When the last
  player leaves, the lobby closes.
- **Close Lobby** — visible to everyone, but only works for the host; anyone else gets an
  ephemeral error. Deletes the post immediately.

The host adds players with `/lobbyadd player:`, picking any member of the server. Unlike
**Join**, adding never moves anyone: someone already in another lobby has to leave it first,
and the host is told which lobby they're in. Bots can't be added, and a full lobby refuses.

The host removes players with `/lobbykick player:`, whose `player:` option autocompletes
against their own roster as they type, rather than listing everyone at once. Kicked players
can rejoin; kicking is for keeping the roster accurate, not moderation.

The `/createlobby` user is in the lobby too, so creating a lobby also moves them out of any other.
At most 50 lobbies can be open at once, and two can't share a code.

However a lobby closes — the host closes it, the last player leaves, or it expires — its post
is deleted.

### Expiry

A lobby expires 2 hours after anyone last joined, left, or was added or kicked. The post's expiry time
uses a Discord timestamp, so it counts down on its own without the bot editing the post.

Each lobby stores when it was last active, and that alone decides whether it's open. Every
click and command checks it first, so an expired lobby can't be joined or listed even a second
late. A once-a-minute sweep then deletes the posts of lobbies that expired while nobody was
looking. It only tidies up, so nothing goes wrong if it runs late. Per-lobby timers were
avoided because codes are reused: a timer left running for a closed lobby could fire later and
delete a new lobby with the same code. Every button also carries its lobby's unique id, so a
button left on an old post can't act on a newer lobby with the same code.

Nothing tells the bot who is actually in a game lobby, so the roster stays accurate through:
moving players out when they join elsewhere, host kicks, and expiry. If an absent host's lobby
fills up with people who have gone, nobody can join, so it goes quiet and expires.

Lobbies live in memory, so **a restart or redeploy clears them**. Their posts stay up until
someone clicks one, which deletes it.

## Editing the content

Content lives in JSON so it can be edited without touching code. Restart the bot to pick up changes.

| File | Holds |
| --- | --- |
| `data/eternals.json` | The 12 eternals. Their `items` are **ids into `items.json`**, not inline objects. |
| `data/items.json` | All 72 items: 48 eternal-specific, plus generic Echo crowns/amulets/weapons, anchors and consumables. |
| `data/glossary.json` | The 79 glossary terms. |
| `data/faq.json` | FAQ topics, each a list of `question`/`answer` pairs plus optional `aliases` (`playtest` → Beta). `/faq` numbers them in file order. |
| `data/socials.json` | Social links, each a `name`/`url` pair. `/socials` lists them in file order. |
| `images/items/`, `images/eternals/` | Item icons and eternal portraits, one PNG per id. |

An item belongs to an eternal purely by being listed in that eternal's `items` array — there is
no back-reference to maintain. Anything no eternal lists is a generic item, which is how `/item`
tells them apart. Startup fails loudly if an eternal names an id that `items.json` does not have.

Run `npm test` after editing. It checks the content more thoroughly than startup does, from
missing images to aliases that clash; see [Testing](#testing).

Icons and portraits are local files, downloaded from the wiki: `icon` on each item and
`imageUrl` on each eternal hold a path relative to the project root (`images/items/bow.png`), not
a URL. The embed thumbnail points at the same file in this repo on GitHub, under `IMAGE_BASE_URL`
(default: `https://raw.githubusercontent.com/emsimpson92/JonJBonfireBot/main/`). Discord fetches
it once and caches it. The wiki's own image links didn't load in Discord. `npm test` checks that
every path exists; the bot itself doesn't, and a wrong one just leaves the embed without a thumbnail.

To add one, drop a PNG into `images/` and set the path; anything about 256px across is plenty,
since Discord shows thumbnails at 80px. **It only shows up once it's on `main`** (or whichever
branch `IMAGE_BASE_URL` names). Replacing an image under the same name can keep showing the old
one for a while, because Discord caches by URL, so give a changed image a new file name.

The eternals, items and glossary, and the images, are a **one-time copy from the wiki — nothing
syncs.** Wiki edits will not propagate, so re-check them when the game patches.

- **`data/eternals.json`** — one object per eternal:
  ```json
  {
    "id": "dahla",
    "name": "Dahla",
    "title": "The Dancer",
    "inRotation": true,
    "description": "Shown as the embed body.",
    "coreAbility": {
      "name": "Curtain Call",
      "description": "Pull in distant enemies, stunning them.",
      "tags": ["Cone Attack", "Stun"],
      "stats": [
        { "name": "Damage", "value": "35" },
        { "name": "Cooldown", "value": "25s" },
        { "name": "Range", "value": "9m" },
        { "name": "Stun", "value": "1s" }
      ]
    },
    "setBonus": { "name": "Deep Pockets", "description": "Max stack of consumables increased" },
    "items": ["dahlas-vanish-crown", "dahlas-petal-dance-amulet", "dahlas-dancing-blade", "dahlas-throwing-knives"],
    "wikiUrl": "https://arkheron.wiki.gg/wiki/Dahla",
    "imageUrl": "images/eternals/dahla.png",
    "aliases": ["dancer"]
  }
  ```

- **`data/items.json`** — one object per item, referenced by `id`:
  ```json
  {
    "id": "dahlas-vanish-crown",
    "name": "Vanish Crown",
    "slot": "Crown",
    "icon": "images/items/dahlas-vanish-crown.png",
    "abilities": [
      {
        "name": "Vanish",
        "description": "Transform into an invulnerable fast-moving orb…",
        "tags": ["Phased", "Movement Increase", "Invisible"],
        "stats": { "Cooldown": "15s", "Duration": "1.5s" },
        "upgrades": [
          { "tier": "II", "changes": { "Cooldown": "12s" } },
          { "tier": "III", "effect": "When leaving Vanish, you are invulnerable to damage for 1 second" }
        ]
      }
    ]
  }
  ```
  `name` leaves off the owner: the wiki's *Dahla's Vanish Crown* is `Vanish Crown`. The embeds
  show the owner alongside the name, and the wiki link puts it back to reach the item's section.

  `slot` is `Crown`, `Amulet`, `Weapon`, `Anchor` or `Consumable`. Eternal weapons name their
  type, e.g. `Weapon (Sword)`; the `slot:` filter matches them all as weapons.
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

  On the eternal itself, `coreAbility.stats` lists `name`/`value` pairs. Names are limited to
  `CoreStatName` in [src/types.ts](src/types.ts) (Damage, Cooldown, Range, Stun, Lifesteal,
  Duration, Speed Decrease, Speed Increase), and only the stats listed are shown: Rynshi's
  Rampage has no Damage line because it deals none. `inRotation` is required and says whether
  the eternal is currently in the game's rotation; `/randombuild` leaves out the items of
  eternals that aren't. `stats`, `imageUrl` and `aliases` are optional. Eternal `aliases` are not currently used, since `/eternals name:` is a pick-list.

  There are no per-character health/damage/speed stats — every player has the same 200 Essence
  and 100 Fortitude. `imageUrl` puts a portrait thumbnail on the embed.

- **`data/glossary.json`** — one object per term: `term`, `definition`, optional `aliases`.
  Sourced from the [Arkheron Wiki glossary](https://arkheron.wiki.gg/wiki/Glossary); definitions
  are verbatim, `aliases` are additions for lookup convenience (`hp` → Essence, `dot` →
  Damage over Time, `reaver` → Tormentors). Entries the wiki marks outdated (Reflect,
  Resilience, Soft Target) are kept so the bot can point people at the current term.

## Adding a command

1. Create `src/commands/yourCommand.ts` exporting a `Command` (see [src/types.ts](src/types.ts)).
   Give it a `SlashCommandBuilder` as `data`, plus `usage` and `examples` for /help.
2. Add it to the `commands` array in [src/commands/registry.ts](src/commands/registry.ts).

`/help` reads that array, so the new command documents itself. The tests read it too, and check
that its `usage` and `examples` name it and that it has an `autocomplete` handler if any option
asks for one.

## Testing

```sh
npm test             # run once
npm run test:watch   # re-run on every save
```

The tests use [Vitest](https://vitest.dev/) and live in `tests/`. CI runs them on every pull
request and push to `main`, alongside typecheck, lint and build. None of them talk to Discord:
the logic is tested as plain functions, and the rest checks the content against what Discord
will accept.

- **Logic.** `lobbies.test.ts`, `rateLimit.test.ts`, `search.test.ts` and `share.test.ts` cover
  the lobby rules (hosting, joining, adding, kicking, expiry), the sliding-window limits, lookup
  ranking and typo tolerance, and the Post to channel button. The lobby store and the rate limiter both take the current time as an
  argument, so expiry and windows are tested by passing timestamps rather than waiting.
- **Content.** `data.test.ts` checks the JSON: unique ids, each eternal carrying a crown, an
  amulet and two weapons, every image path existing, every ability tag having a glossary
  entry, and every item name, glossary term, FAQ topic and alias finding only its own entry.
  An alias shared by two entries makes the bot list both instead of answering.
- **Embeds.** `embeds.test.ts` renders every embed the bot can send from the real data, every
  `/item eternal: slot:` combination, a full lobby and a full `/lobbies` list. It fails if one
  would break Discord's limits or have its text cut short. `commands.test.ts` checks that every
  command registers and documents itself as described in [Adding a command](#adding-a-command).

After a content edit, a failure names the entry to fix: an alias that's another item's name, a
tag missing from the glossary, an ability too long for its embed.

## Layout

```
data/          Content: eternals, items, glossary, faq and socials JSON
images/        Item icons and eternal portraits
src/
  index.ts     Client setup, command registration, interaction dispatch, shutdown
  config.ts    Env vars, with defaults for the optional ones
  rateLimit.ts Sliding-window throttling, bot-wide and per user
  lobbies.ts   Lobby state and rules: joining, leaving, adding, kicking, expiry
  lobbyMessages.ts  Lobby post buttons and clicks, post updates, and the expiry sweep
  share.ts     The Post to channel button on private replies, and its click
  data.ts      Loads and validates the JSON files
  types.ts     Command and the content types: Eternal, Item, GlossaryEntry, FaqTopic, SocialLink
  commands/    One file per command, plus registry.ts
  embeds/      The embeds, one file per concept (eternals, items, lobbies…), with the shared
               builders in general.ts
  utils/       Helpers that aren't embeds, one file per concept, with the shared ones
               (truncation, timestamps, message limits) in general.ts
    search.ts  Name/alias matching with typo tolerance, lookup replies, autocomplete
    images.ts  Image paths to their GitHub URLs
tests/         Vitest tests, one file per area; see Testing
```