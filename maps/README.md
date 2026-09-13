# maps/

Two different kinds of file live here.

## Map presets — `suburbs.json`, `downtown.json`, `industrial.json`

These mirror the built-in presets in `js/world/maps.js`. On boot the game
fetches them and merges them over the defaults, so you can retune a city by
editing JSON and reloading. If a file is missing or malformed the built-in
values are used instead and the game still starts.

They describe how a city is *generated*, not what is in it:

| Field | Meaning |
| --- | --- |
| `name`, `subtitle`, `blurb` | what the menu shows |
| `width`, `height` | world size in pixels |
| `blockMin`, `blockMax` | city block size, i.e. street spacing |
| `roadWidth`, `avenueWidth`, `avenueEvery` | street grid |
| `districtWeights` | `[type, weight]` pairs — how the city is zoned |
| `propDensity`, `vehicleDensity` | sidewalk clutter and traffic |
| `landmarks` | how many blocks are cleared for a big late-game target |
| `startRadius`, `growthRate` | pacing |
| `palette` | ground, road, sidewalk, grass, accent colours |

District types (`residential`, `commercial`, `downtown`, `industrial`, `park`,
`mixed`) and their building mixes are defined in `js/world/maps.js`.

## Sample custom maps — `sample-plaza.json`, `sample-spiral.json`

These are complete, hand-placed cities in the custom-map format: every object is
listed with a position. Load them from **Cities → Load sample city**.

`sample-plaza.json` is a compact town with a real street grid, four residential
corners and a central park. `sample-spiral.json` has no roads at all — 620
objects spiralling outward from traffic cone to skyscraper, which makes it a
clean test of the growth curve.

### Schema

```jsonc
{
  "name": "Custom City",
  "width": 3000,
  "height": 3000,
  "spawn": { "x": 1500, "y": 1500 },   // optional, defaults to centre
  "startRadius": 20,                    // optional
  "growthRate": 1.0,                    // optional, scales mass gained
  "basePalette": "downtown",            // optional: suburbs | downtown | industrial
  "palette": { "ground": "#10121c" },   // optional overrides
  "roads": {                            // optional, cosmetic + ground colour
    "vertical":   [{ "c": 700, "w": 64, "avenue": true }],
    "horizontal": [{ "c": 700, "w": 64 }]
  },
  "districts": [                        // optional, tints the ground
    { "x": 750, "y": 750, "w": 500, "h": 500, "type": "park" }
  ],
  "objects": [
    { "type": "car", "x": 1400, "y": 1500, "rot": 0, "scale": 1 }
  ],
  "landmarks": [
    { "type": "stadium", "x": 900, "y": 900, "scale": 1.2 }
  ],
  "aiSpawns": [{ "x": 400, "y": 2600 }]  // optional, used in AI battle
}
```

`roads` also accepts a flat array — `[{ "axis": "v", "c": 700, "w": 64 }]` — if
that's easier to generate.

Valid `type` values, with their mass, size and weight class, are listed in
`../data/object-catalog.json`.

### Validation rules

Import fails, with a specific message per problem, if: the file isn't an object,
`width`/`height` are missing or absurd, `objects` is not a non-empty array, or
an entry has a non-numeric `x`/`y`. Unknown object types and out-of-bounds
positions are reported as warnings — those entries are dropped and the rest of
the city still loads.

The quickest way to author one is to play a generated city and use
**Cities → Export last city**, then edit the file it gives you.
