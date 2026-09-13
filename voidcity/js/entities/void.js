/**
 * void.js — A void: the player's hole and every AI rival use this same class.
 *
 * Mass model
 *   mass = radius²  (so area, which is what a hole "holds", is linear in mass)
 *   Eating an object adds its mass, then radius = sqrt(mass). That gives the
 *   classic curve: fast early growth, then each level costs much more.
 */

import { clamp, damp, TAU } from '../core/utils.js';
import { MOVE_RATIO, EAT_RATIO } from '../world/objectTypes.js';

/**
 * How much of an eaten object's mass the void keeps. Tuned by simulation: at
 * 1.0 a skilled player erases a whole city in about 70 seconds, which makes
 * the 2-minute mode pointless. At 0.12 a very good Classic run lands around
 * 60–85% destruction, so Godzilla mode is a reward rather than a formality.
 */
export const GROWTH_SCALE = 0.22;

/** Radius required for each level. Levels 1–5 come straight from the design
 * brief (20/30/45/65/90); after that each level is 16% wider, which keeps
 * level-ups arriving every few seconds all the way to the endgame. */
export const LEVEL_RADII = (() => {
  const list = [20, 30, 45, 65, 90];
  while (list.length < 40) list.push(Math.round(list[list.length - 1] * 1.16));
  return list;
})();

export function levelForRadius(r) {
  let lvl = 1;
  for (let i = 0; i < LEVEL_RADII.length; i++) {
    if (r >= LEVEL_RADII[i]) lvl = i + 1;
    else break;
  }
  return lvl;
}

/** Movement speed in world px/s — bigger voids cover more ground. */
export function speedForRadius(r, godzilla = false) {
  const base = 215 * Math.pow(r / 20, 0.34);
  return base * (godzilla ? 1.55 : 1);
}

export class VoidEntity {
  constructor(opts = {}) {
    this.id = opts.id || 'void';
    this.name = opts.name || 'Void';
    this.isPlayer = !!opts.isPlayer;
    this.x = opts.x || 0;
    this.y = opts.y || 0;
    this.vx = 0;
    this.vy = 0;
    this.radius = opts.radius || 20;
    this.mass = this.radius * this.radius;
    this.displayRadius = this.radius;
    this.level = levelForRadius(this.radius);
    this.score = 0;
    this.consumedCount = 0;
    this.consumedMass = 0;
    this.alive = true;
    this.color = opts.color || '#a06bff';
    this.rimColor = opts.rimColor || '#e4d4ff';
    this.trail = opts.trail || 'none';
    this.growthRate = opts.growthRate || 1;
    this.spin = 0;
    this.pulse = 0; // 0..1 squash-and-stretch on each bite
    this.godzilla = false;
    this.suctionMult = 2.8;
    this.boost = 1;
    this.lastAte = 0;
  }

  /** Radius at which objects start sliding toward this void. */
  get suctionRadius() {
    return this.radius * (this.godzilla ? 5.4 : this.suctionMult);
  }

  /** Can this void physically drag the object at all? */
  canPull(obj) {
    return this.radius >= obj.size * (this.godzilla ? MOVE_RATIO * 0.5 : MOVE_RATIO);
  }

  /** Can this void swallow the object once it reaches the rim? */
  canEat(obj) {
    return this.radius >= obj.size * (this.godzilla ? EAT_RATIO * 0.55 : EAT_RATIO);
  }

  /** Voids eat voids, but only with a clear size advantage. */
  canEatVoid(other) {
    return this.radius >= other.radius * 1.22;
  }

  /** Absorb an object's mass and recompute radius / level. Returns levels gained. */
  absorb(obj, massScale = 1) {
    const before = this.level;
    this.mass += obj.mass * this.growthRate * massScale * GROWTH_SCALE;
    this.radius = Math.sqrt(this.mass);
    this.level = levelForRadius(this.radius);
    this.consumedCount++;
    this.consumedMass += obj.mass;
    this.pulse = Math.min(1, this.pulse + clamp(obj.mass / (this.mass * 0.25), 0.05, 0.8));
    return this.level - before;
  }

  /** Swallowing a rival void: take its mass and its score. */
  absorbVoid(other) {
    const before = this.level;
    this.mass += other.mass * 0.75;
    this.radius = Math.sqrt(this.mass);
    this.level = levelForRadius(this.radius);
    this.score += Math.round(other.score * 0.3) + 500;
    this.pulse = 1;
    return this.level - before;
  }

  /** Progress toward the next level, 0..1 (for the HUD bar). */
  levelProgress() {
    const cur = LEVEL_RADII[this.level - 1];
    const next = LEVEL_RADII[this.level] || cur * 1.32;
    return clamp((this.radius - cur) / (next - cur), 0, 1);
  }

  /**
   * @param {number} dt       seconds
   * @param {{x:number,y:number}} dir normalised input direction
   * @param {{width:number,height:number}} bounds world size
   */
  update(dt, dir, bounds) {
    const speed = speedForRadius(this.radius, this.godzilla) * this.boost;
    const targetVX = dir.x * speed;
    const targetVY = dir.y * speed;
    // Damped acceleration: snappy but never twitchy, and frame-rate independent.
    this.vx = damp(this.vx, targetVX, 9, dt);
    this.vy = damp(this.vy, targetVY, 9, dt);
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    const m = this.radius * 0.35;
    this.x = clamp(this.x, m, bounds.width - m);
    this.y = clamp(this.y, m, bounds.height - m);

    // Visual easing: the hole "catches up" to its true size, so growth reads
    // as a swell rather than a pop.
    this.displayRadius = damp(this.displayRadius, this.radius, 7, dt);
    this.spin = (this.spin + dt * (0.35 + this.radius * 0.0015) * (this.godzilla ? 3 : 1)) % TAU;
    this.pulse = Math.max(0, this.pulse - dt * 2.4);
    this.lastAte += dt;
  }
}
