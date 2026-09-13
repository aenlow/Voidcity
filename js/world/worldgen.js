/**
 * worldgen.js — Turns (map preset + seed) into a city.
 *
 * Pipeline, in order:
 *   1. Road network      — jittered grid of streets and wider avenues
 *   2. Districts         — Voronoi-ish zoning over the blocks a grid creates
 *   3. Block subdivision — each block is cut into lots
 *   4. Buildings         — one per lot, scaled to fit, chosen by district
 *   5. Props             — sidewalk furniture, park trees, yard clutter
 *   6. Vehicles          — parked and stopped traffic along the roads
 *   7. Landmarks         — a few blocks are cleared for late-game targets
 *   8. Balance pass      — totals, spawn point, difficulty smoothing
 *
 * Everything random comes from the seeded RNG, so the same seed always yields
 * a byte-identical city.
 */

import { RNG } from '../core/rng.js';
import { OBJECT_TYPES, CLASS_BONUS } from './objectTypes.js';
import { DISTRICTS, STREET_PROPS, ROAD_VEHICLES } from './maps.js';
import { uid, clamp } from '../core/utils.js';

/**
 * Global score tuning. Raw `value` numbers in the catalogue are relative
 * weights; this scales them so a strong Classic run reads in the hundreds of
 * thousands rather than the millions.
 */
export const SCORE_SCALE = 0.25;

/** Build one live object instance from a type. */
export function makeObject(typeId, x, y, rot = 0, scale = 1, rand = Math.random) {
  const t = OBJECT_TYPES[typeId];
  if (!t) throw new Error('Unknown object type: ' + typeId);
  const area = scale * scale;
  return {
    id: uid('o'),
    typeId,
    name: t.name,
    cls: t.cls,
    shape: t.shape,
    tags: t.tags,
    color: t.color,
    height: t.height * scale,
    x,
    y,
    rot,
    baseScale: scale,
    scale: 1, // shrinks to 0 while being swallowed
    w: t.w * scale,
    h: t.h * scale,
    size: t.size * scale,
    mass: t.mass * area,
    value: Math.max(1, Math.round(t.value * area * CLASS_BONUS[t.cls] * SCORE_SCALE)),
    vx: 0,
    vy: 0,
    spin: 0,
    alive: true,
    pulled: false,
    eating: 0, // 0..1 progress into the void
    zBase: 0, // height of whatever it is stacked on top of
    locked: false, // true while something is stacked above it
    stackBelow: null, // the piece underneath, unlocked when this one goes
    v: rand(), // per-instance variation for the renderer (window rows, tint)
    _cell: -1,
  };
}

/** Axis-aligned overlap test with padding. */
function overlaps(a, b, pad = 4) {
  return (
    Math.abs(a.x - b.x) * 2 < a.w + b.w + pad * 2 && Math.abs(a.y - b.y) * 2 < a.h + b.h + pad * 2
  );
}

export function generateWorld(preset, seed, options = {}) {
  const rng = new RNG(String(seed) + '::' + preset.id);
  const W = options.width || preset.width;
  const H = options.height || preset.height;

  // ---- 1. Road network --------------------------------------------------
  const makeAxis = (limit) => {
    const roads = [];
    let pos = 0;
    let i = 0;
    while (pos < limit - preset.blockMin * 0.5) {
      const isAvenue = i % preset.avenueEvery === 0;
      const rw = isAvenue ? preset.avenueWidth : preset.roadWidth;
      roads.push({ c: pos + rw / 2, w: rw, avenue: isAvenue });
      pos += rw + rng.range(preset.blockMin, preset.blockMax);
      i++;
    }
    // Close the grid on the far edge so no block bleeds off-map.
    roads.push({ c: limit - preset.roadWidth / 2, w: preset.roadWidth, avenue: false });
    return roads;
  };

  const vRoads = makeAxis(W);
  const hRoads = makeAxis(H);

  // ---- 2. Blocks + districts -------------------------------------------
  const blocks = [];
  for (let i = 0; i < vRoads.length - 1; i++) {
    for (let j = 0; j < hRoads.length - 1; j++) {
      const x0 = vRoads[i].c + vRoads[i].w / 2;
      const x1 = vRoads[i + 1].c - vRoads[i + 1].w / 2;
      const y0 = hRoads[j].c + hRoads[j].w / 2;
      const y1 = hRoads[j + 1].c - hRoads[j + 1].w / 2;
      if (x1 - x0 < 60 || y1 - y0 < 60) continue;
      blocks.push({
        x: x0,
        y: y0,
        w: x1 - x0,
        h: y1 - y0,
        cx: (x0 + x1) / 2,
        cy: (y0 + y1) / 2,
        district: 'mixed',
        landmark: false,
      });
    }
  }

  // Scatter zoning centres, then give every block the district of its nearest
  // centre. Cheap Voronoi — produces contiguous neighbourhoods, not confetti.
  const zoneCount = clamp(Math.round(blocks.length / 9), 4, 26);
  const zones = [];
  for (let i = 0; i < zoneCount; i++) {
    zones.push({
      x: rng.range(0, W),
      y: rng.range(0, H),
      type: rng.weighted(preset.districtWeights),
    });
  }
  for (const b of blocks) {
    let best = null;
    let bestD = Infinity;
    for (const z of zones) {
      const d = (z.x - b.cx) ** 2 + (z.y - b.cy) ** 2;
      if (d < bestD) {
        bestD = d;
        best = z;
      }
    }
    b.district = best ? best.type : 'mixed';
    // A little noise keeps neighbourhood edges from looking machine-cut.
    if (rng.chance(0.12)) b.district = rng.weighted(preset.districtWeights);
  }

  // ---- 2b. Density map --------------------------------------------------
  // A city with even density plays like a treadmill: you never stop eating and
  // never have to choose where to go. Instead, scatter hot spots — busy
  // pockets with real gaps between them, so travel is part of the game.
  const spacing = options.spacing != null ? options.spacing : preset.spacing || 1;
  const densityMult = options.densityMult != null ? options.densityMult : 1;
  const hotCount = clamp(Math.round((W * H) / 1900000 / spacing), 3, 14);
  const hotspots = [];
  for (let i = 0; i < hotCount; i++) {
    hotspots.push({
      x: rng.range(W * 0.08, W * 0.92),
      y: rng.range(H * 0.08, H * 0.92),
      r: rng.range(Math.min(W, H) * 0.12, Math.min(W, H) * 0.22) / spacing,
      power: rng.range(0.8, 1.35),
    });
  }
  /** 0.25 out in the quiet streets, up to ~1.5 in the middle of a hot spot. */
  const densityAt = (x, y) => {
    let best = 0;
    for (const h of hotspots) {
      const d = Math.hypot(h.x - x, h.y - y);
      if (d > h.r) continue;
      const f = (1 - d / h.r) * h.power;
      if (f > best) best = f;
    }
    const floor = 0.3 / spacing;
    return clamp(floor + best * 1.25, 0.12, 1.7) * densityMult;
  };

  const objects = [];
  const push = (o) => {
    objects.push(o);
    return o;
  };
  const rand = () => rng.next();

  // ---- 7a. Pick landmark blocks first so nothing else claims them -------
  const byArea = blocks.slice().sort((a, b) => b.w * b.h - a.w * a.h);
  const landmarkBlocks = [];
  const wantLandmarks = options.landmarks != null ? options.landmarks : preset.landmarks;
  for (const b of byArea) {
    if (landmarkBlocks.length >= wantLandmarks) break;
    // Spread them out — no two landmarks in neighbouring blocks.
    const tooClose = landmarkBlocks.some(
      (l) => Math.hypot(l.cx - b.cx, l.cy - b.cy) < Math.min(W, H) * 0.22
    );
    if (!tooClose) {
      b.landmark = true;
      landmarkBlocks.push(b);
    }
  }

  // ---- 3–5. Fill ordinary blocks ---------------------------------------
  for (const b of blocks) {
    if (b.landmark) continue;
    let spec = DISTRICTS[b.district] || DISTRICTS.mixed;
    const heat = densityAt(b.cx, b.cy);
    // Cold blocks become plazas and parking aprons: open ground you cross.
    if (heat < 0.45 && !spec.open && rng.chance(0.55)) {
      spec = DISTRICTS.plaza;
      b.district = 'plaza';
    }
    const placed = [];

    // Lot grid
    const cols = Math.max(1, Math.round(b.w / rng.range(spec.lotMin, spec.lotMax)));
    const rows = Math.max(1, Math.round(b.h / rng.range(spec.lotMin, spec.lotMax)));
    const lw = b.w / cols;
    const lh = b.h / rows;

    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        if (!rng.chance(clamp(spec.fill * heat, 0.05, 0.95))) continue;
        const lx = b.x + lw * (c + 0.5);
        const ly = b.y + lh * (r + 0.5);

        // Pick a building that actually fits this lot.
        let typeId = null;
        let scale = 1;
        for (let attempt = 0; attempt < 4; attempt++) {
          const candidate = rng.weighted(spec.buildings);
          const t = OBJECT_TYPES[candidate];
          const fit = Math.min((lw * 0.86) / t.w, (lh * 0.86) / t.h);
          if (fit >= 0.6) {
            typeId = candidate;
            scale = clamp(fit * rng.range(0.82, 1), 0.6, 1.45);
            break;
          }
        }
        if (!typeId) continue;

        const rot = rng.chance(0.5) ? 0 : Math.PI / 2;
        const jitterX = rng.range(-lw * 0.06, lw * 0.06);
        const jitterY = rng.range(-lh * 0.06, lh * 0.06);
        const obj = makeObject(typeId, lx + jitterX, ly + jitterY, rot, scale, rand);
        // Rotated footprints swap w/h for the overlap test.
        const box = rot === 0 ? obj : { x: obj.x, y: obj.y, w: obj.h, h: obj.w };
        if (placed.some((p) => overlaps(p, box, 6))) continue;
        placed.push(box);
        push(obj);
      }
    }

    // Props: yard clutter, park trees, whatever the district likes.
    const density = (spec.greenery > 0.6 ? 1.6 : 1) * preset.propDensity * heat;
    const propCount = Math.round(((b.w * b.h) / 14000) * density);
    for (let i = 0; i < propCount; i++) {
      const px = rng.range(b.x + 12, b.x + b.w - 12);
      const py = rng.range(b.y + 12, b.y + b.h - 12);
      const typeId = rng.weighted(spec.props);
      const o = makeObject(typeId, px, py, rng.range(0, Math.PI * 2), rng.range(0.85, 1.2), rand);
      if (placed.some((p) => overlaps(p, o, 2))) continue;
      placed.push(o);
      push(o);
    }

    // Stacks: crates, barrels, containers and rooftop units piled up. Only the
    // top piece can be pulled; take it and the next one down is freed. Eating
    // a four-high container stack is one of the better feelings in the game.
    const stackSpecs = spec.stacks || [];
    if (stackSpecs.length) {
      const stackCount = Math.round(((b.w * b.h) / 46000) * heat * (options.stackMult ?? 1));
      for (let i = 0; i < stackCount; i++) {
        const sx = rng.range(b.x + 26, b.x + b.w - 26);
        const sy = rng.range(b.y + 26, b.y + b.h - 26);
        const typeId = rng.weighted(stackSpecs);
        const t = OBJECT_TYPES[typeId];
        const probe = { x: sx, y: sy, w: t.w, h: t.h };
        if (placed.some((p) => overlaps(p, probe, 8))) continue;
        placed.push(probe);
        const tall = rng.int(2, 4);
        const rot = rng.range(0, Math.PI * 2);
        let below = null;
        let z = 0;
        for (let k = 0; k < tall; k++) {
          const scale = rng.range(0.88, 1.05) * (1 - k * 0.04);
          const o = makeObject(
            typeId,
            sx + rng.range(-3, 3),
            sy + rng.range(-3, 3),
            rot + rng.range(-0.2, 0.2),
            scale,
            rand
          );
          o.zBase = z;
          o.stackBelow = below;
          if (below) below.locked = true;
          z += (t.height || 14) * scale * 0.92;
          below = o;
          push(o);
        }
      }
    }
  }

  // ---- 5b. Sidewalk furniture along every street -----------------------
  const sidewalkInset = 16;
  for (const road of vRoads) {
    const step = rng.range(110, 200) / preset.propDensity;
    for (let y = step; y < H - step; y += step * rng.range(0.7, 1.4)) {
      if (!rng.chance(clamp(densityAt(road.c, y), 0.1, 1))) continue;
      const side = rng.chance(0.5) ? -1 : 1;
      const x = road.c + side * (road.w / 2 + sidewalkInset);
      push(makeObject(rng.weighted(STREET_PROPS), x, y, rng.range(0, Math.PI * 2), rng.range(0.9, 1.15), rand));
    }
  }
  for (const road of hRoads) {
    const step = rng.range(110, 200) / preset.propDensity;
    for (let x = step; x < W - step; x += step * rng.range(0.7, 1.4)) {
      if (!rng.chance(clamp(densityAt(x, road.c), 0.1, 1))) continue;
      const side = rng.chance(0.5) ? -1 : 1;
      const y = road.c + side * (road.w / 2 + sidewalkInset);
      push(makeObject(rng.weighted(STREET_PROPS), x, y, rng.range(0, Math.PI * 2), rng.range(0.9, 1.15), rand));
    }
  }

  // ---- 6. Traffic -------------------------------------------------------
  const laneOffset = (road) => (rng.chance(0.5) ? -1 : 1) * road.w * 0.22;
  for (const road of vRoads) {
    const count = Math.round(((H / 260) * preset.vehicleDensity) / (road.avenue ? 0.7 : 1));
    for (let i = 0; i < count; i++) {
      const y = rng.range(40, H - 40);
      if (!rng.chance(clamp(densityAt(road.c, y) * 0.85, 0.08, 1))) continue;
      push(makeObject(rng.weighted(ROAD_VEHICLES), road.c + laneOffset(road), y, Math.PI / 2, rng.range(0.92, 1.08), rand));
    }
  }
  for (const road of hRoads) {
    const count = Math.round(((W / 260) * preset.vehicleDensity) / (road.avenue ? 0.7 : 1));
    for (let i = 0; i < count; i++) {
      const x = rng.range(40, W - 40);
      if (!rng.chance(clamp(densityAt(x, road.c) * 0.85, 0.08, 1))) continue;
      push(makeObject(rng.weighted(ROAD_VEHICLES), x, road.c + laneOffset(road), 0, rng.range(0.92, 1.08), rand));
    }
  }

  // ---- 7b. Landmarks ----------------------------------------------------
  const landmarks = [];
  for (const b of landmarkBlocks) {
    let typeId = rng.pick(preset.landmarkTypes);
    let t = OBJECT_TYPES[typeId];
    let fit = Math.min((b.w * 0.9) / t.w, (b.h * 0.9) / t.h);
    if (fit < 0.7) {
      // Block is too tight for the first pick — fall back to the smallest option.
      typeId = preset.landmarkTypes
        .slice()
        .sort((a, c) => OBJECT_TYPES[a].mass - OBJECT_TYPES[c].mass)[0];
      t = OBJECT_TYPES[typeId];
      fit = Math.min((b.w * 0.9) / t.w, (b.h * 0.9) / t.h);
    }
    const scale = clamp(fit, 0.7, 1.8);
    const lm = makeObject(typeId, b.cx, b.cy, 0, scale, rand);
    lm.isLandmark = true;
    push(lm);
    landmarks.push({ x: lm.x, y: lm.y, name: lm.name, id: lm.id });

    // Ring of small stuff so landmark plazas aren't barren.
    const ring = Math.round(6 * preset.propDensity);
    for (let i = 0; i < ring; i++) {
      const a = rng.range(0, Math.PI * 2);
      const rad = Math.max(lm.w, lm.h) * 0.62 + rng.range(10, 60);
      push(
        makeObject(
          rng.weighted([['lamppost', 3], ['bench', 2], ['planter', 2], ['cone', 2], ['trashcan', 2]]),
          b.cx + Math.cos(a) * rad,
          b.cy + Math.sin(a) * rad,
          a,
          1,
          rand
        )
      );
    }
  }

  // ---- 8. Balance + spawn ----------------------------------------------
  // Keep everything inside the world bounds.
  const live = objects.filter((o) => o.x > 4 && o.y > 4 && o.x < W - 4 && o.y < H - 4);

  let totalMass = 0;
  let totalValue = 0;
  for (const o of live) {
    totalMass += o.mass;
    totalValue += o.value;
  }

  // Spawn on an intersection near the middle with a decent amount of small
  // food nearby, so the opening 10 seconds always feel good.
  const spawn = pickSpawn(rng, vRoads, hRoads, live, W, H);
  const aiSpawns = [];
  for (let i = 0; i < 12; i++) {
    aiSpawns.push(pickSpawn(rng, vRoads, hRoads, live, W, H, spawn, 900));
  }

  return {
    name: preset.name,
    mapId: preset.id,
    seed: String(seed),
    width: W,
    height: H,
    palette: preset.palette,
    growthRate: preset.growthRate,
    startRadius: preset.startRadius,
    roads: { vertical: vRoads, horizontal: hRoads },
    blocks,
    objects: live,
    landmarks,
    spawn,
    aiSpawns,
    totalMass,
    totalValue,
    totalObjects: live.length,
  };
}

/** Find a roomy intersection, optionally far from another point. */
function pickSpawn(rng, vRoads, hRoads, objects, W, H, away = null, minDist = 0) {
  let best = { x: W / 2, y: H / 2, score: -Infinity };
  for (let attempt = 0; attempt < 40; attempt++) {
    const v = vRoads[rng.int(1, vRoads.length - 2)];
    const h = hRoads[rng.int(1, hRoads.length - 2)];
    const x = v.c;
    const y = h.c;
    if (away && Math.hypot(x - away.x, y - away.y) < minDist) continue;
    // Prefer intersections with nothing huge parked on them.
    let score = 0;
    for (const o of objects) {
      const d = Math.hypot(o.x - x, o.y - y);
      if (d < 60 && o.size > 24) score -= 50;
      else if (d < 320 && o.size < 20) score += 1;
    }
    if (score > best.score) best = { x, y, score };
  }
  return { x: best.x, y: best.y };
}
