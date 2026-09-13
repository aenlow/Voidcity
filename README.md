# Void City

A hole opens in the street. It eats a traffic cone, then a car, then the block,
then the skyline. Void City is a top-down arcade game that runs entirely in the
browser, installs to a phone home screen, and works with the network off.

No backend, no accounts, no ads, no build step. Static files on GitHub Pages.

- **A 27-stage campaign plus an endless ladder** — three handcrafted chapters,
  then rungs that never run out, each a freshly invented city.
- **Six hand-built cities** — Sable Heights (suburbs), Meridian Core (downtown),
  Ferrous Flats (industrial), Tidewater Quay (harbour), Cassini Field (airport)
  and Ashgrove (old town) — plus procedurally generated cities from six
  archetypes. Every match generates a new layout.
- **Physics-based suction** — nothing is collected on contact. Objects drift,
  accelerate, tumble and shrink as the void drags them in, with heavier weight
  classes resisting until you outgrow them.
- **Three modes** — Classic (2 minutes), Endless, and AI battle against seven
  rival voids that grow by the same rules and will eat you if you get small.
- **Godzilla mode** — at 80% of the city consumed, everything changes.
- **Seeds** — type `HOUSTON` and get the same Houston on every device.
- **Custom maps** — import and export cities as JSON.
- **Stacked objects** — crates, barrels, containers and rooftop units pile up.
  Only the top piece moves; take it and the next one is freed.
- **Four difficulty tiers** — rivals are handicapped on growth and speed rather
  than made artificially stupid.
- **Built for a phone** — bottom tab bar, swipe between tabs, a scrollable
  level map, and a HUD sized for arm's length.
- **Progression** — coins, 24 void skins, 14 trails, 9 themes, 51 achievements,
  daily and weekly challenges, per-map high score tables. Seven cosmetics are
  campaign rewards rather than purchases.

---

## Run it locally

ES modules need a real HTTP origin — opening `index.html` from the file system
will not work. Any static server does:

```bash
python3 -m http.server 8000      # then open http://localhost:8000
# or
npx serve .
```

## Deploy to GitHub Pages

1. Create a repository and push these files to the root of the default branch:

   ```bash
   git init
   git add .
   git commit -m "Void City"
   git branch -M main
   git remote add origin https://github.com/YOUR-NAME/voidcity.git
   git push -u origin main
   ```

2. On GitHub: **Settings → Pages → Build and deployment**. Set *Source* to
   **Deploy from a branch**, branch `main`, folder `/ (root)`. Save.

3. Wait for the green check, then open
   `https://YOUR-NAME.github.io/voidcity/`.

That's the whole deployment. Every path in the project is relative, so the game
works from a project subpath (`/voidcity/`) or a custom domain without edits.
The included `.nojekyll` file stops GitHub from running Jekyll over the assets.

**After you push an update**, bump `CACHE_VERSION` in `service-worker.js`.
Returning players are served from the cache first, so without a version bump
they keep the old build.

## Install it on a device

Pages must be served over HTTPS (GitHub Pages is), then:

| Platform | How |
| --- | --- |
| **Android / Chrome** | Tap **Install Void City** in the menu footer, or the browser's ⋮ → *Install app* |
| **iPhone / iPad** | Share button → **Add to Home Screen** (Safari only — Chrome on iOS can't install PWAs) |
| **Windows / Mac / Linux, Chrome or Edge** | Install icon in the address bar, or ⋮ → *Cast, save and share* → *Install page as app* |
| **Mac / Safari** | File → *Add to Dock* |

Once installed it launches full screen with its own icon and splash screen, and
plays with airplane mode on.

---

## The campaign and the ladder

27 stages across three chapters, gated on stars rather than a strict chain, so
one stage you can't crack never blocks the rest. Each is a **fixed seed**: the
same city for everyone, which is what makes a 3-star target mean something.

Stars: one for the objective, two more for score thresholds on top — and the
score stars only count if you met the objective, so you can't three-star a
stage by farming points and ignoring what it asked.

Objectives come in eight kinds: consume a percentage of the city, hit a score,
grow to a radius, eat a number of objects, swallow landmarks, swallow rival
voids, finish first, or simply stay alive. The generator settings move with
them — *Long haul* is a 1.25× map at 2.4 spacing and 0.75 density so the whole
stage is about routing, *Container yard* quadruples stacks, *Hold the yard*
drops five rivals on you and only asks you to survive.

Every star target in the file was calibrated by running a bot through all 27
stages at three skill levels; see "Tuning" below if you change the numbers.

**The endless ladder** opens when the campaign is done and never stops. Rung N
is a pure function of N — same city, same objective, same targets for everyone.
Three curves climb independently: rival count and handicap tier, city size and
spacing, and how much of the city the objective asks for. Every fifth rung is a
**gauntlet** (a rival fight), every tenth a **marathon** (a huge map, a long
clock, a destruction target).

Ladder targets are resolved *after* the city is generated, as a fraction of
what that city actually holds. Deriving them from the rung number produced
rungs that were unreachable even after eating the entire map.

Cities beyond the first few rungs come from `js/world/procgen.js`, which builds
a complete map preset from a seed: six archetypes (Sprawl, Core, Works, Warren,
Expanse, Parkland), each jittered, with a name, palette and zoning mix. Roughly
half the time it splices in one district the archetype wouldn't normally have —
that single wrong-looking district is usually what makes a city memorable.

## Controls

- **Desktop** — `WASD` or arrow keys. Hold the left mouse button to steer toward
  the cursor. `Esc` or `P` pauses.
- **Mobile** — touch anywhere on the city and drag. The joystick appears under
  your thumb and follows it, so there's no fixed pad to miss.

## How the suction works

Every frame, each void asks the spatial grid for the objects inside its
attraction radius and applies an acceleration to each one:

```
pull       = 1 - distance / attractionRadius     0 at the rim, 1 at the centre
resistance = CLASS_PULL[weight class]            light 1.0 … massive 0.30
advantage  = void radius vs object size          bigger void, firmer grip
grip       = 2.8 if the void can swallow it, else 1

acceleration = 2100 · pull^1.6 · resistance · advantage · grip
```

Velocity integrates that, drag bleeds it off, and objects spin in the direction
they're being dragged. Objects you can move but not yet swallow pile up against
the rim instead of falling in, which is the game's main difficulty signal: you
can *see* what you're not big enough for.

Growth is `mass = radius²`. Eating an object adds a fraction of its mass
(`GROWTH_SCALE` in `js/entities/void.js`), so the first hundred props grow you
quickly and the last stretch to a skyscraper takes real work.

**Stacks.** A stacked piece carries `zBase` (how high it sits) and `locked`
(something is on top of it). Locked pieces ignore suction entirely; consuming
the piece above clears the flag on the one below. It's a few lines in
`_suction` and `_consume`, and it's why a four-high container stack unwinds
from the top instead of collapsing all at once.

**Density.** The generator scatters hot spots and scales prop, traffic and
sidewalk density by distance from them, so a city is busy pockets with quiet
ground between. Cold blocks are rezoned as plazas. Travel is part of the game;
an evenly-filled city plays like a treadmill.

## Project structure

```
index.html            all screens, markup only
style.css             design tokens + every screen's styling
game.js               entry point: boots UI, registers service worker
manifest.json         PWA manifest (icons, shortcuts, splash colours)
service-worker.js     precache + offline strategy — bump CACHE_VERSION on release

js/core/
  rng.js              seeded mulberry32 + string→seed hashing
  utils.js            maths, easing, number and time formatting
  spatial.js          uniform grid spatial hash (broad phase)
  storage.js          the whole save profile, debounced to LocalStorage
  audio.js            Web Audio synthesis — no sound files at all
  input.js            keyboard, mouse steering, floating virtual joystick
js/world/
  objectTypes.js      the catalogue of 37 consumable object types
  maps.js             map presets + district recipes (merged with /maps/*.json)
  worldgen.js         the 8-stage city generator
  customMap.js        custom map import, validation, export
  procgen.js          builds new map presets from a seed
js/entities/
  void.js             growth curve, movement, size gates
  ai.js               rival void steering and target selection
js/fx/particles.js    pooled particles, floating score text, shockwaves
js/render/
  camera.js           follow, size-driven zoom, trauma shake
  renderer.js         canvas draw: ground, roads, extruded objects, voids, HUD overlays
js/game/
  engine.js           the match: loop, suction physics, scoring, Godzilla mode
  levels.js           campaign stages, the endless ladder, objectives, ratings
  progression.js      coins, cosmetics, achievements, daily/weekly challenges
js/ui/ui.js           screens, menus, HUD, results

maps/                 map presets as JSON + two sample custom cities
data/                 generated object catalogue (reference for map authors)
assets/icons/         app icons and splash screens (generated by tools/)
tools/make-icons.py   regenerates every icon from code
```

## Tuning without touching code

`maps/suburbs.json`, `maps/downtown.json` and `maps/industrial.json` are loaded
at boot and merged over the built-in presets. Change block sizes, density,
palette, landmark mix or pacing there and reload — no build, no bundler.

The values worth knowing:

| Field | Effect |
| --- | --- |
| `blockMin` / `blockMax` | city block size, so how far apart the streets run |
| `districtWeights` | how often each district type is zoned |
| `vehicleDensity` | traffic per road |
| `propDensity` | sidewalk furniture and yard clutter |
| `landmarks` | how many blocks get cleared for a late-game target |
| `growthRate` | how much mass this map feeds you, i.e. pacing |
| `palette` | ground, road, grass, sidewalk and accent colours |

## Custom maps

Load any city from JSON on the **Cities** screen. Two samples ship with the
game: `maps/sample-plaza.json` (a compact hand-laid town) and
`maps/sample-spiral.json` (no roads at all — a spiral ramp of objects from
traffic cone to skyscraper, which is a good difficulty-curve test).

Minimum viable map:

```json
{
  "name": "Custom City",
  "width": 3000,
  "height": 3000,
  "spawn": { "x": 1500, "y": 1500 },
  "objects": [
    { "type": "car", "x": 1400, "y": 1500, "rot": 0, "scale": 1 },
    { "type": "tree", "x": 1600, "y": 1520 }
  ],
  "landmarks": [{ "type": "stadium", "x": 900, "y": 900, "scale": 1.2 }]
}
```

Optional: `roads` (`{vertical:[{c,w}], horizontal:[{c,w}]}` or a flat array with
an `axis` field), `districts` (`{x,y,w,h,type}` — drives the ground colour),
`palette`, `basePalette`, `growthRate`, `startRadius`, `aiSpawns`.

Valid `type` values and their masses are listed in `data/object-catalog.json`.
Bad files are rejected with a specific reason per problem rather than a silent
failure, and **Export last city** writes the city you just played back out as a
JSON file you can edit.

Custom cities record their scores on a separate board so they can't inflate the
real ones.

## Tuning

Three places, in order of how often you'll touch them:

1. **`maps/*.json`** — per-city generator settings, merged over the built-ins at
   boot. `spacing` (>1 pushes hot spots apart), `propDensity`, `vehicleDensity`,
   `districtWeights`, `palette`, `landmarks`.
2. **`js/game/levels.js`** — stage objectives, modifiers and star thresholds.
   Changing `GROWTH_SCALE` or map density invalidates every star target, so
   re-run a bot pass and rewrite them rather than guessing.
3. **`js/game/engine.js`** — the `DIFFICULTY` table. `growth` is how much mass a
   rival keeps per object relative to you, `spread` staggers the lobby from
   strongest to weakest, `skill` drives the AI's reaction time and aggression.

## Performance notes

- Objects live in a uniform grid; suction, rendering and AI vision all query
  cells rather than scanning the world. A 2,300-object city costs well under a
  millisecond of logic per frame.
- Device pixel ratio is capped at 2 — the single biggest win on high-density
  phone screens.
- Particles come from a fixed pool of 900 and never allocate mid-match.
- Props below a pixel or two are skipped entirely when the camera is zoomed out.
- The **Particles** setting (high / low / off) is the first thing to drop on an
  older device; **Screen shake** can be turned off independently.

## Where to take it next

- **Local multiplayer** — the void class already supports many instances;
  split-screen needs a second camera and a second `Input` source.
- **Online leaderboards** — `Save.recordScore()` is the only write point.
  Posting the same object to a serverless function is a contained change.
- **Weather and time of day** — the palette is per-map data; a rain overlay and
  a dusk/night lerp would cost very little.
- **Object behaviours** — vehicles currently sit still. Giving them a lane and a
  speed would make traffic dodge the void.
- **More maps** — copy a preset JSON, change the district weights, done. Harbour
  (water blocks), Airport (runways, planes) and Old Town (dense, tiny blocks)
  all fit the existing generator.
- **Replays** — the world is a pure function of the seed, so a replay is just
  the seed plus the input stream.

## Credits

Everything here is original: code, generator, artwork, icons, the object
catalogue, the map names, and the sound, which is synthesised at runtime with
the Web Audio API rather than sampled. No third-party libraries, no CDN, no
tracking, nothing loaded at runtime from another origin.
