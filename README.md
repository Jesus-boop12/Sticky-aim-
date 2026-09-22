# Sticky Aim Weapon Studio

Import a weapon from any game — preset, screenshot, JSON, CSV or a sentence you
typed — and get a tuned Cronus **GPC** script written for that specific weapon:
anti-recoil shaped to its recoil pattern, rapid fire at the game's cap, sticky
aim sized to the game's aim assist, and a header that explains where every
number came from.

Up to 8 weapons go into one script as switchable slots.

```bash
npm install
npm start          # http://localhost:5173
```

**No Node, or on a phone?** `npm run build:standalone` writes
`dist/sticky-aim-studio.html` — one self-contained file that runs the catalog,
importers, tuner and GPC emitter entirely in the browser, with no server and no
network. Open it from anywhere, or publish it. The AI importers are the only
thing it leaves behind; they need an API key, which means they need the server.

Nothing else to configure. An `ANTHROPIC_API_KEY` unlocks the AI importers
(see below) but the app, the tuner and the generator all work without one.

---

## What it does

**1 · Import** a weapon, any of six ways:

| Source | Needs a key | Notes |
|---|---|---|
| **Catalog** | no | Full rosters for 11 games — CoD (Black Ops 7, Black Ops 6, MWIII, and Warzone pooling those plus MWII), Apex, Fortnite, Battlefield 2042, Siege, Destiny 2, PUBG, Halo Infinite. Searchable, filterable by class |
| **Describe it** | optional | Paste a wiki table, patch notes or your own words. With a key Claude reads it; without one a local regex parser has a go |
| **Screenshot** | yes | Drop a gunsmith / loadout screen and Claude reads the stat bars off it |
| **JSON** | no | Arrays, `{"weapons":[…]}`, or a single object. Field names are matched loosely — `fire_rate`, `rpm`, `rounds_per_minute` all land in the same place |
| **CSV** | no | Header row plus one row per weapon, commas or tabs |
| **Manual** | no | Type the numbers straight in |

Recoil values are normalised onto 0–100 whatever scale they arrive on (0–1
floats, 0–10 ratings, 0–1000 indexes), and anything the importer had to guess
is listed as a warning on the weapon.

**2 · Tune** — enter your in-game settings, then shape the mods themselves. Every
number in the script is recomputed live, with a chart of the correction curve,
the phase table and a plain-English derivation for each value.

*Your settings* — the ones out of the game's options menu that change the maths:
controller, look sensitivity, ADS sensitivity multiplier, response curve, right
stick deadzone, a separate vertical stick multiplier, field of view, and what
your in-game aim assist is set to.

FOV is only applied when you tick **"my game ties aim speed to FOV"** (CoD's
relative ADS sensitivity and its equivalents). On a fixed-sensitivity setup a
wider FOV does not make a gun easier to hold, however much it looks that way, so
the value is recorded but the numbers stay put. Aim assist set to *off* disables
sticky aim outright — there is no assist left to keep awake — and *strong* or
*precision* shrinks it, since the game is already doing the work.

If the calculated pull comes out smaller than your deadzone, the tuner says so:
the game would swallow it entirely.

*Your own in-game settings* — for anything the tuner does not model. Give it a
name and a value, then choose what it should do:

| Field | Meaning |
|---|---|
| Name / value | e.g. `Weapon Mount Activation` / `On` — always recorded in the script header |
| Changes | vertical pull, horizontal pull, sticky aim radius, fire rate, or *just note it* |
| % | how much, from −75% to +100%; several settings compound |

"Just note it" is the default, so a setting you want documented but not acted on
costs nothing. A button fills in the common ones for the selected game as a
starting point.

*Saved setups* — name and store everything above in the browser, one per game or
per playstyle, and load it back later.

*Recoil control*

| Option | What it does |
|---|---|
| Strength | Global trim on the pull, 0–150% |
| Ramp-in speed | instant / fast / normal / slow — how quickly the correction reaches full strength |
| Start delay trim | ±ms on the dead time before the pull begins |
| Release threshold | how much of your own stick input cancels the correction |
| Only while ADS | compensate only when aiming, or whenever you fire |
| Horizontal correction | apply drift correction at all, or vertical only |

*Sticky aim*

| Option | What it does |
|---|---|
| On / off | master switch |
| Strength | 0–200% trim on the movement radius (0 = off) |
| Speed | 50–200% — higher means a faster loop |
| Shape | circle, horizontal sweep, vertical bob, or diagonal corners |
| Active | while aiming / while aiming **and** firing / all the time |

*Per weapon* — every derived value can be overridden for one slot only: vertical
push, horizontal push, start delay, release threshold, sticky radius and step,
plus force-on/force-off switches for sticky aim and rapid fire. Empty means
"keep the calculated value", each field shows what auto worked out (`auto (32)`),
and anything you set by hand is flagged with a `*` in the script header. One
button puts the weapon back on auto.

**3 · Script** — copy or download the `.gpc`.

**4 · Review** — have Claude sanity-check the generated values and tell you what
to test first (falls back to fixed range-testing notes without a key).

---

### About the bundled rosters

Two different things live in the catalog, and the difference matters:

- **Names, classes and fire modes are the real rosters.** Black Ops 7, Black
  Ops 6, Modern Warfare III and Modern Warfare II, and Warzone as all four of
  those pooled and de-duplicated — 175 weapons — because that is what Warzone
  actually fields. Roughly 480 weapons in total. Warzone's real count sits
  higher again (around 265 including launchers, melee and every seasonal
  variant); what is here is the shootable roster.
- **The numbers are not extracted from any game.** Some are community-style
  estimates; the rest are derived from the weapon's class. Anything derived is
  tagged `est` in the picker, carries a low confidence score, and says so on the
  weapon itself.

So pick your gun by name, then trim on a range — which is the loop the whole app
is built around. A weapon you have measured yourself beats anything in here:
edit its stats in the Tune tab, or import them.

## How the tuning works

Anti-recoil is one multiplier chain on the weapon's normalised vertical recoil:

```
stick value = recoil
            × game recoil gain      (how much stick a unit of recoil needs in that game)
            × rpm factor            sqrt(rpm / 600), clamped 0.7–1.5
            × sensitivity factor    (reference sens / your sens) ^ game exponent
            × ADS factor            reference ADS multiplier / yours
            × response curve factor curves that soften small inputs need more raw value
            × vertical stick factor  1 / your vertical multiplier
            × FOV factor            reference FOV / yours, only with FOV-relative aim
            × attachment modifiers
            × your strength trim
            × your own settings     everything you pointed at the vertical pull
```

The correction is not flat. Each slot carries a **4-phase timeline**:

| Phase | What it covers |
|---|---|
| 0 | dead time — the first round has not kicked yet, so nothing is applied |
| 1–2 | ramp-in, ~65% then ~88% of peak |
| 3 | sustained, full value until the trigger is released |

If the weapon was imported with a real recoil pattern, those phases are built
from it instead of from a generic ramp, and the tune's confidence score rises.

Other decisions worth knowing:

- **Horizontal correction only happens when the weapon drifts consistently.** A
  gun with random horizontal shake gets none — fighting noise just adds sway.
- **Rapid fire is never applied to a full-auto weapon** (pulsing the trigger
  would make it slower) and is capped at the game's semi-auto fire-rate limit.
- **Sticky aim is off for snipers** and for games with no aim assist to keep
  awake (Siege, PUBG) — override it per weapon if you disagree.
- **Your own stick input wins.** Past a per-weapon release threshold the
  correction stops, so a flick is never fought by the script.

The numbers are a calculated starting point. Trim them on a range — the
generated header tells you which array to edit and in which direction.

---

## The generated script

Core GPC only (`define`, `const` arrays, `main`, `combo`, `set_val`, `get_val`,
`get_rtime`, `event_press`), so it builds on Zen Studio or Gtuner without any
device-specific extensions.

```
header comment   what was generated, from which stats, and how to trim it
layout defines   controller bindings (XB1 or PS4/PS5)
switches         ADS_ONLY, HAIR_TRIGGER, ANTI_DEADZONE, ADS_SLOW, START_SLOT
weapon tables    PH_UNTIL / PH_V / PH_H (PHASES per slot), RF_*, STICKY_*
main             hair trigger → anti-deadzone → ADS slow → anti-recoil
combos           RAPID_FIRE, STICKY_AIM (shaped by your setting), FEEDBACK (rumble)
```

On the controller:

| Input | Action |
|---|---|
| Hold **modifier** + D-pad ◀ ▶ | previous / next weapon slot |
| Hold **modifier** + D-pad ▼ | master on/off |
| Hold **modifier** + D-pad ▲ | rumble out the current slot number |

The modifier button (View/Share by default) is swallowed while held, so the
game never sees it. The device rumbles once per slot number, so you always know
which weapon is loaded without looking.

### Loading it onto the device

The same steps are in the app, under the generated script.

1. Install **Cronus Zen Studio** and sign in. (Titan Two: **Gtuner IV** — same flow, different menu names.)
2. Connect the Zen to the computer with the **PROG** port, the small one on the side — *not* the OUTPUT
   port the console uses. This is the step people get wrong. Take any firmware update it offers.
3. Open a new GPC script, paste this one in, **Build**. It should compile clean; an error names its line.
4. **Program it into a memory slot** and note the slot number.
5. Unplug from the computer: console USB → the Zen's **OUTPUT** port, controller → the Zen's **INPUT** port.
6. Select your slot on the device. On boot you get one rumble pulse per weapon slot number.
7. Practice range before a real match — hold the trigger on a wall at ~20m:
   - Shots land **above** the dot → `PH_V` too low, raise ~2 at a time.
   - Shots land **below** the dot → too high, lower it.
   - The script fights your aim → lower `AR_RELEASE` for that slot.

Menu names and shortcuts move between Zen Studio versions; look for the equivalent Build / Program action.

**Compiles but does nothing in game?** Wrong slot selected or the master toggle is off (modifier + D-pad down);
the script is ADS-only and you are hip-firing; your in-game deadzone is bigger than the pull (the Tune tab warns
about this); or the controller layout does not match the pad you are using.

---

## Project layout

```
core/       pure logic, shared by the server and the tests
  games.js      per-game calibration profiles
  catalog.js    bundled starter weapon stats
  weapons.js    the weapon model + JSON/CSV/text importers
  tuning.js     stats + your settings -> script parameters (chain and phases)
  gpc.js        the GPC emitter
server/
  index.js      dependency-free HTTP server + JSON API
  ai.js         Claude integration (text import, screenshot import, review)
web/          the page (vanilla ES modules, no build step)
tools/
  build-standalone.js   inlines core/ + web/ into one offline HTML file
test/         node:test suites for the core, the API and the bundle
```

All maths live in `core/` and run server-side, so the page, the API and the
tests can never disagree about what a weapon tunes to.

```bash
npm test                  # 65 tests: importers, tuning bounds, in-game settings,
                          # options, overrides, GPC structure, API, bundle
npm run build:standalone  # dist/sticky-aim-studio.html - no server needed
```

### API

| Route | Body | Returns |
|---|---|---|
| `GET /api/meta` | — | games, categories, catalog, layouts, defaults, option vocabularies, AI status |
| `POST /api/import` | `{kind, payload, game}` — kind: `json` \| `csv` \| `text` \| `image` \| `manual` | `{weapons, mode, notes}` |
| `POST /api/tune` | `{weapons, profile}` | `{entries}` (weapon + tuning, including `auto` and `overridden`) |
| `POST /api/generate` | `{weapons, profile, title, modButton, startSlot}` | `{gpc, fileName, entries}` |
| `POST /api/coach` | `{weapons, profile, question}` | `{text, mode}` |

### Configuration

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | enables screenshot import, AI text import and the review tab |
| `STICKY_AIM_MODEL` | `claude-opus-5` | model used for those calls |
| `PORT` | `5173` | server port |

Requests to Anthropic only happen when you press an AI button. Everything else
— importing, tuning, generating — stays on your machine.

---

## Fair play

Scripted recoil control and aim assistance break the terms of service of most
online shooters and can get an account banned. This is built for single-player,
private lobbies, accessibility setups and range testing. Where you point it is
your call, and your responsibility.

The bundled weapon stats are community-style estimates, not extracted game data,
and they go stale every balance patch — verify anything you rely on.
