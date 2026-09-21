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

Nothing else to configure. An `ANTHROPIC_API_KEY` unlocks the AI importers
(see below) but the app, the tuner and the generator all work without one.

---

## What it does

**1 · Import** a weapon, any of six ways:

| Source | Needs a key | Notes |
|---|---|---|
| **Catalog** | no | Bundled starter stats for 10 games — CoD (BO6 / MW3 / Warzone), Apex, Fortnite, Battlefield 2042, Siege, Destiny 2, PUBG, Halo Infinite |
| **Describe it** | optional | Paste a wiki table, patch notes or your own words. With a key Claude reads it; without one a local regex parser has a go |
| **Screenshot** | yes | Drop a gunsmith / loadout screen and Claude reads the stat bars off it |
| **JSON** | no | Arrays, `{"weapons":[…]}`, or a single object. Field names are matched loosely — `fire_rate`, `rpm`, `rounds_per_minute` all land in the same place |
| **CSV** | no | Header row plus one row per weapon, commas or tabs |
| **Manual** | no | Type the numbers straight in |

Recoil values are normalised onto 0–100 whatever scale they arrive on (0–1
floats, 0–10 ratings, 0–1000 indexes), and anything the importer had to guess
is listed as a warning on the weapon.

**2 · Tune** — enter your in-game settings (sensitivity, ADS multiplier,
response curve, deadzone, controller). Every number in the script is recomputed
live, with a chart of the correction curve, the phase table and a plain-English
derivation for each value. Edit the weapon's stats in place to re-tune.

**3 · Script** — copy or download the `.gpc`.

**4 · Review** — have Claude sanity-check the generated values and tell you what
to test first (falls back to fixed range-testing notes without a key).

---

## How the tuning works

Anti-recoil is one multiplier chain on the weapon's normalised vertical recoil:

```
stick value = recoil
            × game recoil gain      (how much stick a unit of recoil needs in that game)
            × rpm factor            sqrt(rpm / 600), clamped 0.7–1.5
            × sensitivity factor    (reference sens / your sens) ^ game exponent
            × ADS factor            reference ADS multiplier / yours
            × response curve factor curves that soften small inputs need more raw value
            × attachment modifiers
            × your strength trim
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
  awake (Siege, PUBG).
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
combos           RAPID_FIRE, STICKY_AIM, FEEDBACK (rumble)
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

### Loading it

1. Zen Studio → File → New GPC Script, paste, **Build (F7)**.
2. Program it to a memory slot and select that slot on the device.
3. Practice range: hold the trigger on a wall at ~20m.
   - Shots land **above** the dot → `PH_V` too low, raise ~2 at a time.
   - Shots land **below** the dot → too high, lower it.
   - The script fights your aim → lower `AR_RELEASE` for that slot.

---

## Project layout

```
core/       pure logic, shared by the server and the tests
  games.js      per-game calibration profiles
  catalog.js    bundled starter weapon stats
  weapons.js    the weapon model + JSON/CSV/text importers
  tuning.js     stats -> script parameters (the multiplier chain and phases)
  gpc.js        the GPC emitter
server/
  index.js      dependency-free HTTP server + JSON API
  ai.js         Claude integration (text import, screenshot import, review)
web/          the page (vanilla ES modules, no build step)
test/         node:test suites for the core and the API
```

All maths live in `core/` and run server-side, so the page, the API and the
tests can never disagree about what a weapon tunes to.

```bash
npm test      # 35 tests: importers, tuning bounds, GPC structure, API contract
```

### API

| Route | Body | Returns |
|---|---|---|
| `GET /api/meta` | — | games, categories, catalog, layouts, defaults, AI status |
| `POST /api/import` | `{kind, payload, game}` — kind: `json` \| `csv` \| `text` \| `image` \| `manual` | `{weapons, mode, notes}` |
| `POST /api/tune` | `{weapons, profile}` | `{entries}` (weapon + tuning) |
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
