/**
 * customMap.js — Load a city from JSON, or export the one you're playing.
 *
 * Minimal schema (everything except name/width/height/objects is optional):
 *
 * {
 *   "name": "Custom City",
 *   "width": 5000,
 *   "height": 5000,
 *   "palette": { "ground": "#151d1a", ... },
 *   "spawn": { "x": 2500, "y": 2500 },
 *   "roads": { "vertical": [{ "c": 400, "w": 46 }],
 *              "horizontal": [{ "c": 400, "w": 46 }] },
 *   "districts": [{ "x": 0, "y": 0, "w": 600, "h": 600, "type": "park" }],
 *   "objects": [{ "type": "car", "x": 410, "y": 900, "rot": 1.57, "scale": 1 }],
 *   "landmarks": [{ "type": "stadium", "x": 2500, "y": 1200, "scale": 1.4 }]
 * }
 *
 * Roads may also be given as a flat array:
 *   "roads": [{ "axis": "v", "c": 400, "w": 46 }, ...]
 */

import { OBJECT_TYPES } from './objectTypes.js';
import { DISTRICTS, MAPS } from './maps.js';
import { makeObject } from './worldgen.js';

const isNum = (n) => typeof n === 'number' && isFinite(n);

/**
 * @returns {{ ok: boolean, errors: string[], warnings: string[] }}
 */
export function validateCustomMap(data) {
  const errors = [];
  const warnings = [];

  if (!data || typeof data !== 'object') {
    return { ok: false, errors: ['File is not a JSON object.'], warnings };
  }
  if (typeof data.name !== 'string' || !data.name.trim()) errors.push('Missing "name".');
  if (!isNum(data.width) || data.width < 600 || data.width > 20000) errors.push('"width" must be a number between 600 and 20000.');
  if (!isNum(data.height) || data.height < 600 || data.height > 20000) errors.push('"height" must be a number between 600 and 20000.');

  const all = []
    .concat(Array.isArray(data.objects) ? data.objects : [])
    .concat(Array.isArray(data.landmarks) ? data.landmarks : []);
  if (!all.length) errors.push('Map has no objects — there would be nothing to consume.');
  if (all.length > 6000) warnings.push(`${all.length} objects is a lot; phones may drop frames above ~3000.`);

  all.slice(0, 6000).forEach((o, i) => {
    if (!o || !OBJECT_TYPES[o.type]) {
      errors.push(`Object ${i}: unknown type "${o && o.type}".`);
      return;
    }
    if (!isNum(o.x) || !isNum(o.y)) errors.push(`Object ${i} ("${o.type}"): x and y must be numbers.`);
    if (o.scale != null && (!isNum(o.scale) || o.scale <= 0.05 || o.scale > 6)) {
      errors.push(`Object ${i}: scale must be between 0.05 and 6.`);
    }
    if (isNum(o.x) && isNum(data.width) && (o.x < 0 || o.x > data.width)) {
      warnings.push(`Object ${i} sits outside the map and will be dropped.`);
    }
  });

  if (data.districts && !Array.isArray(data.districts)) errors.push('"districts" must be an array.');
  if (Array.isArray(data.districts)) {
    data.districts.forEach((d, i) => {
      if (d.type && !DISTRICTS[d.type]) warnings.push(`District ${i}: unknown type "${d.type}", drawn as mixed use.`);
    });
  }

  if (data.spawn && (!isNum(data.spawn.x) || !isNum(data.spawn.y))) errors.push('"spawn" needs numeric x and y.');

  // Only report the first handful so a broken file doesn't produce a wall of text.
  return { ok: errors.length === 0, errors: errors.slice(0, 12), warnings: warnings.slice(0, 6) };
}

/** Turn validated JSON into a world the engine can run. */
export function buildCustomWorld(data) {
  const check = validateCustomMap(data);
  if (!check.ok) {
    const err = new Error(check.errors.join(' '));
    err.details = check;
    throw err;
  }

  const basePalette = (MAPS[data.basePalette] || MAPS.downtown).palette;
  const palette = Object.assign({}, basePalette, data.palette || {});
  const W = data.width;
  const H = data.height;

  // Roads: accept both the object form and the flat array form.
  let vertical = [];
  let horizontal = [];
  if (Array.isArray(data.roads)) {
    for (const r of data.roads) {
      const entry = { c: r.c ?? r.position ?? 0, w: r.w ?? r.width ?? 44, avenue: !!r.avenue };
      if ((r.axis || 'v').toLowerCase().startsWith('v')) vertical.push(entry);
      else horizontal.push(entry);
    }
  } else if (data.roads && typeof data.roads === 'object') {
    vertical = (data.roads.vertical || []).map((r) => ({ c: r.c, w: r.w || 44, avenue: !!r.avenue }));
    horizontal = (data.roads.horizontal || []).map((r) => ({ c: r.c, w: r.w || 44, avenue: !!r.avenue }));
  }

  const blocks = (data.districts || []).map((d) => ({
    x: d.x,
    y: d.y,
    w: d.w,
    h: d.h,
    cx: d.x + d.w / 2,
    cy: d.y + d.h / 2,
    district: DISTRICTS[d.type] ? d.type : 'mixed',
    landmark: false,
  }));

  const objects = [];
  const landmarks = [];
  const add = (entry, isLandmark) => {
    if (!OBJECT_TYPES[entry.type]) return;
    if (entry.x < 0 || entry.y < 0 || entry.x > W || entry.y > H) return;
    const o = makeObject(entry.type, entry.x, entry.y, entry.rot || 0, entry.scale || 1, Math.random);
    if (isLandmark) {
      o.isLandmark = true;
      landmarks.push({ x: o.x, y: o.y, name: o.name, id: o.id });
    }
    objects.push(o);
  };
  (data.objects || []).forEach((o) => add(o, !!o.landmark));
  (data.landmarks || []).forEach((o) => add(o, true));

  let totalMass = 0;
  let totalValue = 0;
  for (const o of objects) {
    totalMass += o.mass;
    totalValue += o.value;
  }

  const spawn = data.spawn && isNum(data.spawn.x) ? { x: data.spawn.x, y: data.spawn.y } : { x: W / 2, y: H / 2 };
  const aiSpawns =
    Array.isArray(data.aiSpawns) && data.aiSpawns.length
      ? data.aiSpawns
      : [
          { x: W * 0.2, y: H * 0.2 },
          { x: W * 0.8, y: H * 0.2 },
          { x: W * 0.2, y: H * 0.8 },
          { x: W * 0.8, y: H * 0.8 },
          { x: W * 0.5, y: H * 0.15 },
          { x: W * 0.15, y: H * 0.5 },
          { x: W * 0.85, y: H * 0.5 },
          { x: W * 0.5, y: H * 0.85 },
        ];

  return {
    name: data.name,
    mapId: 'custom',
    seed: data.seed || 'custom',
    width: W,
    height: H,
    palette,
    growthRate: data.growthRate || 1,
    startRadius: data.startRadius || 20,
    roads: { vertical, horizontal },
    blocks,
    objects,
    landmarks,
    spawn,
    aiSpawns,
    totalMass,
    totalValue,
    totalObjects: objects.length,
    warnings: check.warnings,
  };
}

/** Serialise a generated (or custom) world back to the import schema. */
export function exportWorld(world, name) {
  return {
    name: name || world.name || 'Exported city',
    width: Math.round(world.width),
    height: Math.round(world.height),
    seed: world.seed,
    palette: world.palette,
    growthRate: world.growthRate,
    startRadius: world.startRadius,
    spawn: { x: Math.round(world.spawn.x), y: Math.round(world.spawn.y) },
    roads: {
      vertical: world.roads.vertical.map((r) => ({ c: Math.round(r.c), w: Math.round(r.w), avenue: !!r.avenue })),
      horizontal: world.roads.horizontal.map((r) => ({ c: Math.round(r.c), w: Math.round(r.w), avenue: !!r.avenue })),
    },
    districts: world.blocks.map((b) => ({
      x: Math.round(b.x),
      y: Math.round(b.y),
      w: Math.round(b.w),
      h: Math.round(b.h),
      type: b.district,
    })),
    objects: world.objects
      .filter((o) => !o.isLandmark)
      .map((o) => ({
        type: o.typeId,
        x: Math.round(o.x),
        y: Math.round(o.y),
        rot: Number(o.rot.toFixed(3)),
        scale: Number(o.baseScale.toFixed(3)),
      })),
    landmarks: world.objects
      .filter((o) => o.isLandmark)
      .map((o) => ({
        type: o.typeId,
        x: Math.round(o.x),
        y: Math.round(o.y),
        scale: Number(o.baseScale.toFixed(3)),
      })),
  };
}

/** Browser download helper used by the map screen. */
export function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
