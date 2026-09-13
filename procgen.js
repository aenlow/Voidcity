/**
 * procgen.js — Cities that don't exist yet.
 *
 * The six built-in maps are hand-tuned presets. This builds new ones from a
 * seed: block sizes, zoning mix, density, spacing, palette and a name, all
 * derived deterministically. The endless ladder uses it so stage 40 isn't
 * stage 12 with a bigger number on it.
 *
 * Everything it produces is a normal preset, so worldgen doesn't know or care
 * that it wasn't written by hand, and a generated city can be exported to JSON
 * and edited like any other.
 */

import { RNG } from '../core/rng.js';
import { shade } from '../core/utils.js';

/**
 * City archetypes. Each is a starting point the seed then varies — this is
 * what stops procedural maps from converging on the same grey average.
 */
const ARCHETYPES = [
  {
    id: 'sprawl',
    label: 'Sprawl',
    blurb: 'Low houses forever, and a long walk between anything worth eating.',
    block: [320, 560],
    road: [42, 74],
    spacing: [1.3, 1.9],
    prop: [0.8, 1.1],
    vehicle: [0.4, 0.7],
    growth: [1.0, 1.15],
    size: [4800, 6200],
    zones: [['residential', 6], ['park', 3], ['mixed', 2], ['plaza', 2], ['commercial', 1.5]],
    landmarks: ['school', 'watertower', 'mall', 'monument'],
  },
  {
    id: 'core',
    label: 'Core',
    blurb: 'Towers packed shoulder to shoulder. Enormous score, no room to move.',
    block: [200, 330],
    road: [36, 64],
    spacing: [0.8, 1.1],
    prop: [1.1, 1.4],
    vehicle: [1.0, 1.5],
    growth: [0.85, 0.95],
    size: [3800, 4800],
    zones: [['downtown', 7], ['commercial', 3], ['mixed', 2], ['plaza', 1.5]],
    landmarks: ['cityblock', 'mall', 'stadium', 'monument'],
  },
  {
    id: 'works',
    label: 'Works',
    blurb: 'Yards, stacks and heavy plant. Everything is worth more than it looks.',
    block: [260, 480],
    road: [40, 78],
    spacing: [1.1, 1.5],
    prop: [1.0, 1.4],
    vehicle: [0.6, 0.9],
    growth: [1.1, 1.3],
    size: [4600, 6000],
    zones: [['industrial', 6], ['depot', 5], ['mixed', 2], ['plaza', 1.5], ['commercial', 1]],
    landmarks: ['powerplant', 'railyard', 'factory', 'warehouse'],
  },
  {
    id: 'warren',
    label: 'Warren',
    blurb: 'Tiny blocks and narrow lanes. You will outgrow the streets themselves.',
    block: [140, 240],
    road: [28, 50],
    spacing: [0.7, 1.0],
    prop: [1.3, 1.7],
    vehicle: [0.7, 1.1],
    growth: [0.85, 0.95],
    size: [3200, 4200],
    zones: [['mixed', 5], ['residential', 4], ['commercial', 3], ['park', 1.5], ['plaza', 1.5]],
    landmarks: ['school', 'monument', 'watertower'],
  },
  {
    id: 'expanse',
    label: 'Expanse',
    blurb: 'Vast aprons and scattered terminals. Half the game is the drive.',
    block: [420, 820],
    road: [50, 110],
    spacing: [1.7, 2.4],
    prop: [0.9, 1.3],
    vehicle: [0.5, 0.9],
    growth: [1.2, 1.45],
    size: [5600, 7000],
    zones: [['plaza', 6], ['depot', 3], ['commercial', 2], ['industrial', 2], ['downtown', 1]],
    landmarks: ['stadium', 'mall', 'warehouse', 'cityblock'],
  },
  {
    id: 'parkland',
    label: 'Parkland',
    blurb: 'More trees than buildings. Gentle, green and quietly enormous.',
    block: [300, 520],
    road: [40, 70],
    spacing: [1.2, 1.7],
    prop: [1.3, 1.7],
    vehicle: [0.3, 0.6],
    growth: [1.05, 1.25],
    size: [4600, 5800],
    zones: [['park', 7], ['residential', 3], ['plaza', 3], ['mixed', 1.5]],
    landmarks: ['monument', 'school', 'stadium', 'watertower'],
  },
];

/** Name parts — enough combinations that repeats are rare in a long run. */
const FIRST = [
  'Glass', 'Iron', 'Hollow', 'Cinder', 'Saltmarsh', 'Vantage', 'Kestrel', 'Marrow',
  'Dunmore', 'Bramble', 'Copper', 'Fathom', 'Grendel', 'Harrow', 'Juniper', 'Lantern',
  'Mercer', 'Northgate', 'Obsidian', 'Pillar', 'Quarry', 'Rivet', 'Sable', 'Tallow',
  'Umber', 'Verdigris', 'Wexford', 'Yarrow', 'Ashen', 'Beacon',
];
const SECOND = [
  'Reach', 'Basin', 'Cross', 'Dell', 'End', 'Fields', 'Gate', 'Heights', 'Inlet',
  'Junction', 'Keep', 'Landing', 'Mills', 'Narrows', 'Orchard', 'Point', 'Quay',
  'Row', 'Strand', 'Terrace', 'Vale', 'Wharf', 'Yard', 'Hollow', 'Flats',
];

/** Palette families, varied per seed so two Works cities don't look alike. */
const PALETTES = [
  { ground: '#141a20', accent: '#67d6a0', warm: false },
  { ground: '#1a1512', accent: '#ffa06a', warm: true },
  { ground: '#101420', accent: '#7ba7ff', warm: false },
  { ground: '#181320', accent: '#c08cff', warm: false },
  { ground: '#1a1a14', accent: '#ffd166', warm: true },
  { ground: '#101f1d', accent: '#4fc3e8', warm: false },
  { ground: '#1d1218', accent: '#ff7ba1', warm: true },
];

/**
 * Build a complete map preset from a seed.
 * @param {string|number} seed
 * @param {object} [opts] { archetype, sizeMult, densityMult }
 */
export function generatePreset(seed, opts = {}) {
  const rng = new RNG('preset::' + seed);
  const arch = opts.archetype
    ? ARCHETYPES.find((a) => a.id === opts.archetype) || rng.pick(ARCHETYPES)
    : rng.pick(ARCHETYPES);

  const pal = rng.pick(PALETTES);
  const size = Math.round(rng.range(arch.size[0], arch.size[1]) * (opts.sizeMult || 1));
  const roadWidth = Math.round(rng.range(arch.road[0], arch.road[0] * 1.2));
  const name = `${rng.pick(FIRST)} ${rng.pick(SECOND)}`;

  // Zoning: take the archetype's mix, jitter the weights, and occasionally
  // splice in one district it wouldn't normally have. That single wrong-looking
  // district is usually what makes a generated city memorable.
  const zones = arch.zones.map(([id, w]) => [id, +(w * rng.range(0.7, 1.35)).toFixed(2)]);
  if (rng.chance(0.45)) {
    const extras = ['industrial', 'depot', 'park', 'downtown', 'plaza', 'residential'];
    zones.push([rng.pick(extras), +rng.range(0.8, 2.5).toFixed(2)]);
  }

  return {
    id: 'gen-' + seed,
    generated: true,
    archetype: arch.id,
    archetypeLabel: arch.label,
    name,
    subtitle: arch.label,
    blurb: arch.blurb,
    width: size,
    height: Math.round(size * rng.range(0.8, 1.15)),
    ambient: rng.chance(0.5) ? 'midnight' : 'dusk',
    startRadius: 20,
    growthRate: +rng.range(arch.growth[0], arch.growth[1]).toFixed(3),
    pacing: `${arch.label} · ${rng.pick(['dense pockets', 'long routes', 'mixed pacing', 'tight streets'])}`,
    blockMin: Math.round(rng.range(arch.block[0], arch.block[0] * 1.15)),
    blockMax: Math.round(rng.range(arch.block[1] * 0.9, arch.block[1])),
    roadWidth,
    avenueWidth: Math.round(roadWidth * rng.range(1.5, 2.1)),
    avenueEvery: rng.int(3, 6),
    districtWeights: zones,
    spacing: +(rng.range(arch.spacing[0], arch.spacing[1]) / (opts.densityMult || 1)).toFixed(2),
    vehicleDensity: +(rng.range(arch.vehicle[0], arch.vehicle[1]) * (opts.densityMult || 1)).toFixed(2),
    propDensity: +(rng.range(arch.prop[0], arch.prop[1]) * (opts.densityMult || 1)).toFixed(2),
    landmarks: rng.int(4, 9),
    landmarkTypes: arch.landmarks,
    palette: buildPalette(pal, rng),
  };
}

function buildPalette(base, rng) {
  const ground = shade(base.ground, rng.range(-0.08, 0.08));
  return {
    ground,
    block: shade(ground, 0.14),
    road: shade(ground, base.warm ? 0.2 : 0.24),
    roadLine: shade(ground, 0.55),
    grass: base.warm ? shade('#2a3320', rng.range(-0.1, 0.12)) : shade('#20392a', rng.range(-0.1, 0.12)),
    sidewalk: shade(ground, 0.3),
    accent: base.accent,
    sky: shade(ground, -0.35),
  };
}

export const ARCHETYPE_IDS = ARCHETYPES.map((a) => a.id);
