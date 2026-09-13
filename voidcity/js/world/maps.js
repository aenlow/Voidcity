/**
 * maps.js — The three built-in cities.
 *
 * A map preset is pure data: palette, block sizes, which districts are allowed
 * and how often, how many vehicles and landmarks to scatter. The generator in
 * worldgen.js turns a preset + a seed into an actual city, so every match on
 * "Downtown" is a different Downtown.
 */

export const MAPS = {
  suburbs: {
    id: 'suburbs',
    name: 'Sable Heights',
    subtitle: 'Suburbs',
    blurb: 'Wide roads, big yards, easy early food. Slow finish.',
    width: 5200,
    height: 5200,
    ambient: 'dusk',
    startRadius: 20,
    growthRate: 1.0,
    pacing: 'Gentle start · low density',
    // Road grid
    blockMin: 340,
    blockMax: 520,
    roadWidth: 46,
    avenueWidth: 76,
    avenueEvery: 4,
    // Contents
    districtWeights: [
      ['residential', 6],
      ['park', 3],
      ['commercial', 2],
      ['mixed', 2],
      ['downtown', 0.4],
      ['industrial', 0.3],
    ],
    vehicleDensity: 0.55,
    propDensity: 1.0,
    landmarks: 5,
    landmarkTypes: ['school', 'mall', 'watertower', 'stadium', 'monument'],
    palette: {
      ground: '#151d1a',
      block: '#1a231f',
      road: '#242c31',
      roadLine: '#3d4a4b',
      grass: '#20392a',
      sidewalk: '#2b352f',
      accent: '#67d6a0',
      sky: '#0b1210',
    },
  },

  downtown: {
    id: 'downtown',
    name: 'Meridian Core',
    subtitle: 'Downtown',
    blurb: 'Dense towers, constant traffic, the fastest score in the game.',
    width: 4400,
    height: 4400,
    ambient: 'midnight',
    startRadius: 20,
    growthRate: 0.92,
    pacing: 'Fast growth · heavy traffic',
    blockMin: 230,
    blockMax: 360,
    roadWidth: 40,
    avenueWidth: 68,
    avenueEvery: 3,
    districtWeights: [
      ['downtown', 6],
      ['commercial', 4],
      ['mixed', 3],
      ['residential', 2],
      ['park', 1],
      ['industrial', 0.5],
    ],
    vehicleDensity: 1.25,
    propDensity: 1.15,
    landmarks: 7,
    landmarkTypes: ['cityblock', 'mall', 'stadium', 'monument', 'office', 'garage'],
    palette: {
      ground: '#12141f',
      block: '#171a26',
      road: '#232739',
      roadLine: '#3e4666',
      grass: '#22352f',
      sidewalk: '#2a2f42',
      accent: '#7fa8ff',
      sky: '#080a12',
    },
  },

  industrial: {
    id: 'industrial',
    name: 'Ferrous Flats',
    subtitle: 'Industrial district',
    blurb: 'Nothing small to eat. Survive the opening and the payout is huge.',
    width: 5800,
    height: 5800,
    ambient: 'industrial',
    startRadius: 22,
    growthRate: 1.2,
    pacing: 'Slow start · enormous endgame',
    blockMin: 420,
    blockMax: 640,
    roadWidth: 52,
    avenueWidth: 88,
    avenueEvery: 3,
    districtWeights: [
      ['industrial', 7],
      ['mixed', 2],
      ['commercial', 1.5],
      ['residential', 1],
      ['park', 0.6],
      ['downtown', 0.6],
    ],
    vehicleDensity: 0.8,
    propDensity: 0.8,
    landmarks: 6,
    landmarkTypes: ['powerplant', 'factory', 'railyard', 'warehouse', 'watertower'],
    palette: {
      ground: '#1a1613',
      block: '#201b17',
      road: '#2d2722',
      roadLine: '#4b4136',
      grass: '#2f3324',
      sidewalk: '#332c25',
      accent: '#ff9b4a',
      sky: '#0f0c0a',
    },
  },
};

export const MAP_IDS = Object.keys(MAPS);

/**
 * The same presets are mirrored in /maps/<id>.json. On boot we try to load
 * those files and merge them over the defaults, so a map can be retuned —
 * block sizes, density, palette, landmark mix — by editing JSON, with no
 * build step and no code change. If the files are missing (or the page is
 * opened straight off the filesystem) the built-in values above are used.
 */
export async function loadPresetOverrides() {
  await Promise.all(
    MAP_IDS.map(async (id) => {
      try {
        const res = await fetch(`maps/${id}.json`, { cache: 'no-cache' });
        if (!res.ok) return;
        const data = await res.json();
        if (data && typeof data === 'object') Object.assign(MAPS[id], data);
      } catch (err) {
        /* offline or file://  — defaults are already correct */
      }
    })
  );
  return MAPS;
}

/** District recipes: what gets built on a block of each type. */
export const DISTRICTS = {
  residential: {
    name: 'Residential',
    lotMin: 90,
    lotMax: 150,
    buildings: [['house', 8], ['shed', 3], ['apartment', 1.2]],
    props: [['tree', 5], ['mailbox', 3], ['trashcan', 2], ['bench', 1], ['planter', 1.5], ['bikerack', 0.6]],
    fill: 0.72,
    greenery: 0.45,
  },
  commercial: {
    name: 'Commercial',
    lotMin: 120,
    lotMax: 200,
    buildings: [['apartment', 4], ['garage', 2], ['mall', 0.7], ['office', 1.5]],
    props: [['kiosk', 3], ['foodcart', 3], ['trashcan', 3], ['busstop', 2], ['bikerack', 2], ['planter', 2]],
    fill: 0.8,
    greenery: 0.12,
  },
  downtown: {
    name: 'Downtown',
    lotMin: 150,
    lotMax: 260,
    buildings: [['office', 5], ['skyscraper', 3], ['garage', 2], ['apartment', 2], ['cityblock', 0.5]],
    props: [['trashcan', 3], ['lamppost', 4], ['busstop', 2], ['kiosk', 2], ['hydrant', 2], ['cone', 2]],
    fill: 0.88,
    greenery: 0.06,
  },
  industrial: {
    name: 'Industrial',
    lotMin: 180,
    lotMax: 300,
    buildings: [['warehouse', 5], ['factory', 2], ['container', 6], ['powerplant', 0.6], ['railyard', 0.8]],
    props: [['dumpster', 4], ['cone', 4], ['container', 3], ['streetsign', 2], ['lamppost', 2]],
    fill: 0.76,
    greenery: 0.05,
  },
  park: {
    name: 'Park',
    lotMin: 70,
    lotMax: 120,
    buildings: [['shed', 1], ['statue', 1.2], ['playset', 2]],
    props: [['tree', 12], ['bench', 4], ['planter', 3], ['trashcan', 2], ['playset', 1], ['statue', 0.4]],
    fill: 0.22,
    greenery: 1,
  },
  mixed: {
    name: 'Mixed use',
    lotMin: 110,
    lotMax: 190,
    buildings: [['apartment', 4], ['house', 3], ['garage', 1.5], ['office', 1.5], ['warehouse', 1]],
    props: [['tree', 3], ['bench', 2], ['trashcan', 3], ['kiosk', 1.5], ['foodcart', 1.5], ['hydrant', 1.5], ['lamppost', 2]],
    fill: 0.76,
    greenery: 0.25,
  },
};

/** Street props that line every sidewalk regardless of district. */
export const STREET_PROPS = [
  ['cone', 3],
  ['trashcan', 3],
  ['hydrant', 2],
  ['streetsign', 3],
  ['lamppost', 4],
  ['mailbox', 2],
  ['bench', 1.5],
];

/** Vehicles that spawn on roads, weighted. */
export const ROAD_VEHICLES = [
  ['car', 10],
  ['van', 4],
  ['truck', 1.6],
  ['bus', 1.2],
];
