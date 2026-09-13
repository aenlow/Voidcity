/**
 * rng.js — Deterministic, seedable pseudo random number generator.
 *
 * Every part of world generation pulls numbers from an instance of RNG so that
 * the same seed always rebuilds the exact same city. Never use Math.random()
 * inside generation code — only inside cosmetic effects that don't need to be
 * reproducible.
 */

/** Convert any string/number into a 32-bit unsigned integer seed. */
export function hashSeed(input) {
  const str = String(input === undefined || input === null ? '' : input).trim().toUpperCase();
  // FNV-1a, 32 bit.
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Human friendly random seed, e.g. "VOID-7QK2". */
export function randomSeedString() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let tail = '';
  for (let i = 0; i < 4; i++) {
    tail += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return 'VOID-' + tail;
}

export class RNG {
  /** @param {string|number} seed */
  constructor(seed) {
    this.seed = seed;
    this.state = hashSeed(seed) || 0x9e3779b9;
  }

  /** Float in [0, 1). Mulberry32 — small, fast, good enough for level gen. */
  next() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Float in [min, max). */
  range(min, max) {
    return min + this.next() * (max - min);
  }

  /** Integer in [min, max] inclusive. */
  int(min, max) {
    return Math.floor(this.range(min, max + 1));
  }

  /** True with probability p. */
  chance(p) {
    return this.next() < p;
  }

  /** Random element of an array. */
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /**
   * Weighted pick. `entries` is an array of [value, weight] pairs.
   */
  weighted(entries) {
    let total = 0;
    for (const e of entries) total += e[1];
    let roll = this.next() * total;
    for (const e of entries) {
      roll -= e[1];
      if (roll <= 0) return e[0];
    }
    return entries[entries.length - 1][0];
  }

  /** In-place Fisher–Yates shuffle using this generator. */
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  /** Roughly normal distribution centred on `mean`. */
  gaussian(mean = 0, spread = 1) {
    const u = 1 - this.next();
    const v = this.next();
    const n = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return mean + n * spread;
  }
}
