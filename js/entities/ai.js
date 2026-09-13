/**
 * ai.js — Rival voids.
 *
 * The AI plays by exactly the same rules as the player: same growth curve,
 * same suction, same size gates. All it gets is a steering brain.
 *
 * Priorities each time it re-targets:
 *   1. Run from any void that could swallow it
 *   2. Chase a rival void it can swallow (if it's feeling aggressive)
 *   3. Otherwise head for the best value-per-distance object it can eat
 *   4. If the neighbourhood is picked clean, wander toward denser ground
 */

import { RNG } from '../core/rng.js';
import { clamp } from '../core/utils.js';

export const AI_NAMES = [
  'Nullpoint', 'Gravewell', 'Umbra', 'Sinkhole', 'Maw', 'Ebb', 'Tarpit', 'Rift',
  'Cinder', 'Pitfall', 'Hush', 'Quarry', 'Drain', 'Vantablack', 'Eclipse', 'Nadir',
];

export const AI_COLORS = [
  '#ff6b8a', '#5fd4ff', '#ffd166', '#9d7bff', '#57e2a5', '#ff8f4a', '#f27bff', '#7ee081',
];

export class AIController {
  /**
   * @param {import('./void.js').VoidEntity} entity
   * @param {string|number} seed
   * @param {number} difficulty 0..1
   */
  constructor(entity, seed, difficulty = 0.6) {
    this.entity = entity;
    this.rng = new RNG(seed + '::' + entity.id);
    this.difficulty = difficulty;
    this.target = null;
    this.targetKind = 'none';
    this.retarget = 0;
    this.dir = { x: 0, y: 0 };
    this.wander = null;
    // Personality — makes a lobby of eight voids feel like eight players.
    this.greed = this.rng.range(0.6, 1.4);
    this.aggression = this.rng.range(0.15, 0.9) * difficulty;
    this.reaction = 0.35 + this.rng.range(0.45, 1.1) * (1.35 - difficulty);
    this.sloppiness = this.rng.range(0, 0.35) * (1.2 - difficulty);
    this.clock = this.rng.range(0, 100); // own clock keeps steering deterministic
  }

  /**
   * @param {number} dt
   * @param {object} world
   * @param {import('../core/spatial.js').SpatialHash} grid
   * @param {Array} voids all living voids, including the player
   */
  update(dt, world, grid, voids) {
    const e = this.entity;
    if (!e.alive) return this.dir;

    this.clock += dt;
    this.retarget -= dt;
    if (this.retarget <= 0) {
      this.retarget = this.reaction;
      this._chooseTarget(world, grid, voids);
    }

    let tx = null;
    let ty = null;
    if (this.targetKind === 'flee' && this.target) {
      tx = e.x * 2 - this.target.x;
      ty = e.y * 2 - this.target.y;
    } else if (this.target && (this.target.alive === undefined || this.target.alive)) {
      tx = this.target.x;
      ty = this.target.y;
    } else {
      if (!this.wander || Math.hypot(this.wander.x - e.x, this.wander.y - e.y) < 180) {
        this.wander = {
          x: this.rng.range(world.width * 0.1, world.width * 0.9),
          y: this.rng.range(world.height * 0.1, world.height * 0.9),
        };
      }
      tx = this.wander.x;
      ty = this.wander.y;
    }

    let dx = tx - e.x;
    let dy = ty - e.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;

    // Imperfect aim: weaker AIs drift off the ideal line.
    const wobble = Math.sin(this.clock + this.greed * 10) * this.sloppiness;
    const c = Math.cos(wobble);
    const s = Math.sin(wobble);
    this.dir.x = clamp(dx * c - dy * s, -1, 1);
    this.dir.y = clamp(dx * s + dy * c, -1, 1);
    return this.dir;
  }

  _chooseTarget(world, grid, voids) {
    const e = this.entity;

    // 1. Threats first.
    let threat = null;
    let threatD = Infinity;
    for (const other of voids) {
      if (other === e || !other.alive) continue;
      const d = Math.hypot(other.x - e.x, other.y - e.y);
      if (other.radius > e.radius * 1.15 && d < other.suctionRadius * 2.2 && d < threatD) {
        threat = other;
        threatD = d;
      }
    }
    if (threat) {
      this.target = threat;
      this.targetKind = 'flee';
      return;
    }

    // 2. Hunt a smaller void.
    if (this.rng.next() < this.aggression) {
      let prey = null;
      let preyD = Infinity;
      for (const other of voids) {
        if (other === e || !other.alive) continue;
        const d = Math.hypot(other.x - e.x, other.y - e.y);
        if (e.canEatVoid(other) && d < 1400 && d < preyD) {
          prey = other;
          preyD = d;
        }
      }
      if (prey) {
        this.target = prey;
        this.targetKind = 'void';
        return;
      }
    }

    // 3. Best food nearby.
    const vision = clamp(e.radius * 16, 700, 2600);
    const candidates = grid.queryCircle(e.x, e.y, vision);
    let best = null;
    let bestScore = -Infinity;
    const step = candidates.length > 240 ? 2 : 1; // sample big crowds, stay cheap
    for (let i = 0; i < candidates.length; i += step) {
      const o = candidates[i];
      if (!o.alive || o.eating > 0) continue;
      if (!e.canEat(o)) continue;
      const d = Math.hypot(o.x - e.x, o.y - e.y) + 40;
      const score = (o.value * this.greed) / d;
      if (score > bestScore) {
        bestScore = score;
        best = o;
      }
    }
    // Hysteresis: only switch if the new pick is clearly better. Without it
    // two equally tempting buildings on opposite sides make the void dither in
    // place forever — which is exactly what the first simulation runs did.
    if (best && this.targetKind === 'object' && this.target && this.target.alive) {
      const dCur = Math.hypot(this.target.x - e.x, this.target.y - e.y) + 40;
      const curScore = (this.target.value * this.greed) / dCur;
      if (curScore * 1.45 > bestScore && e.canEat(this.target)) return;
    }
    if (best) {
      this.target = best;
      this.targetKind = 'object';
    } else {
      this.target = null;
      this.targetKind = 'none';
    }
  }
}
