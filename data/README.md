# data/

Reference data. Nothing here is loaded by the game at runtime — it's for people
writing custom maps or extending the object catalogue.

## object-catalog.json

Generated from `js/world/objectTypes.js`. Lists all 37 object types with the
`id` you use as `"type"` in a custom map, plus name, weight class, footprint,
mass, score value and tags. It also records the two ratios that decide what a
void can interact with:

- `moveRatio` — a void of radius R can drag objects up to `R / 0.42` in size
- `eatRatio` — and can swallow objects up to `R / 0.78`

Regenerate it after editing the catalogue:

```bash
node -e "import('./js/world/objectTypes.js').then(m => console.log(Object.keys(m.OBJECT_TYPES).length))"
```

(or re-run the export snippet in the project README).

Achievements, challenge templates and cosmetics are defined in
`js/game/progression.js` rather than here, because each one carries a test
function and JSON can't hold those.
