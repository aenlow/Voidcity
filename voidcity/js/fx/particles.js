/**
 * particles.js — Pooled effects. Nothing here allocates during play.
 *
 * Three layers:
 *   particles   — debris, dust, sparks
 *   floaters    — "+150 Car" score popups
 *   shockwaves  — expanding rings for level-ups and Godzilla mode
 *
 * Counts scale with the quality setting so a mid-range phone can turn the
 * fireworks down instead of dropping frames.
 */

import { Save } from '../core/storage.js';
import { TAU } from '../core/utils.js';

const MAX_PARTICLES = 900;
const MAX_FLOATERS = 60;
const MAX_WAVES = 24;

export class ParticleSystem {
  constructor() {
    this.particles = new Array(MAX_PARTICLES);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles[i] = { active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 2, color: '#fff', rot: 0, spin: 0, drag: 0.9, shape: 'square' };
    }
    this.cursor = 0;
    this.floaters = [];
    this.waves = [];
  }

  get quality() {
    const q = Save.settings.particles;
    return q === 'off' ? 0 : q === 'low' ? 0.4 : 1;
  }

  _next() {
    // Ring buffer: if everything is busy the oldest particle is recycled.
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.cursor = (this.cursor + 1) % MAX_PARTICLES;
      if (!this.particles[this.cursor].active) return this.particles[this.cursor];
    }
    return this.particles[this.cursor];
  }

  spawn(x, y, opts = {}) {
    const p = this._next();
    p.active = true;
    p.x = x;
    p.y = y;
    p.vx = opts.vx || 0;
    p.vy = opts.vy || 0;
    p.max = p.life = opts.life || 0.6;
    p.size = opts.size || 3;
    p.color = opts.color || '#ffffff';
    p.rot = opts.rot || Math.random() * TAU;
    p.spin = opts.spin || (Math.random() - 0.5) * 8;
    p.drag = opts.drag != null ? opts.drag : 0.9;
    p.shape = opts.shape || 'square';
    p.gravityTo = opts.gravityTo || null; // {x, y, force} — debris sucked inward
    return p;
  }

  /** Dust and rubble when something goes down the hole. */
  consumeBurst(x, y, color, scale = 1, hole = null) {
    const q = this.quality;
    if (!q) return;
    const count = Math.round((6 + scale * 14) * q);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU;
      const sp = 40 + Math.random() * 160 * scale;
      this.spawn(x, y, {
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.35 + Math.random() * 0.5,
        size: 1.5 + Math.random() * 3.5 * scale,
        color,
        drag: 0.88,
        gravityTo: hole,
      });
    }
  }

  /** Heavy collapse: bigger, slower chunks plus a dust ring. */
  demolition(x, y, color, scale = 1, hole = null) {
    const q = this.quality;
    if (!q) return;
    const count = Math.round(18 * scale * q);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU;
      const sp = 60 + Math.random() * 260 * scale;
      this.spawn(x, y, {
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.6 + Math.random() * 0.9,
        size: 3 + Math.random() * 8 * scale,
        color,
        drag: 0.9,
        shape: Math.random() < 0.5 ? 'square' : 'shard',
        gravityTo: hole,
      });
    }
    this.shockwave(x, y, { max: 60 * scale, color: '#ffffff', life: 0.5, width: 3 });
  }

  /** Rising score popup. */
  floatText(x, y, text, color = '#ffffff', size = 18) {
    if (this.floaters.length >= MAX_FLOATERS) this.floaters.shift();
    this.floaters.push({ x, y, text, color, size, life: 1.1, max: 1.1, vy: -46 });
  }

  shockwave(x, y, opts = {}) {
    if (this.waves.length >= MAX_WAVES) this.waves.shift();
    this.waves.push({
      x,
      y,
      r: opts.from || 0,
      max: opts.max || 200,
      life: opts.life || 0.6,
      maxLife: opts.life || 0.6,
      color: opts.color || '#ffffff',
      width: opts.width || 4,
    });
  }

  update(dt) {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      if (p.gravityTo) {
        // Debris keeps falling toward the hole that made it.
        const dx = p.gravityTo.x - p.x;
        const dy = p.gravityTo.y - p.y;
        const d = Math.hypot(dx, dy) || 1;
        const f = 900 / (d + 40);
        p.vx += (dx / d) * f * dt * 60;
        p.vy += (dy / d) * f * dt * 60;
      }
      const damp = Math.pow(p.drag, dt * 60);
      p.vx *= damp;
      p.vy *= damp;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
    }

    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.life -= dt;
      f.y += f.vy * dt;
      f.vy *= Math.pow(0.94, dt * 60);
      if (f.life <= 0) this.floaters.splice(i, 1);
    }

    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      w.life -= dt;
      const t = 1 - w.life / w.maxLife;
      w.r = w.max * (1 - Math.pow(1 - t, 3));
      if (w.life <= 0) this.waves.splice(i, 1);
    }
  }

  clear() {
    for (const p of this.particles) p.active = false;
    this.floaters.length = 0;
    this.waves.length = 0;
  }
}
