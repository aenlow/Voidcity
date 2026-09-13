/**
 * storage.js — The whole persistent profile lives in one LocalStorage key.
 *
 * Everything is client side: settings, stats, coins, unlocks, achievements,
 * per-map high score tables, saved seeds and challenge progress. Writes are
 * debounced so a 60 FPS game loop can call save() as often as it likes.
 */

const KEY = 'voidcity.save.v1';
const SAVE_VERSION = 1;

/** A brand new profile. Also used to backfill fields after an update. */
function defaultSave() {
  return {
    version: SAVE_VERSION,
    coins: 0,
    settings: {
      sfxVolume: 0.7,
      musicVolume: 0.35,
      muted: false,
      screenShake: true,
      particles: 'high', // high | low | off
      joystickSide: 'left',
      showFps: false,
      difficulty: 'normal',
    },
    stats: {
      totalScore: 0,
      objectsConsumed: 0,
      matchesPlayed: 0,
      matchesWon: 0,
      largestRadius: 0,
      largestObjectMass: 0,
      largestObjectName: '—',
      godzillaActivations: 0,
      godzillaSeconds: 0,
      bestDestruction: 0,
      carsConsumed: 0,
      buildingsConsumed: 0,
      citiesCleared: 0,
      playSeconds: 0,
      aiVoidsConsumed: 0,
      landmarksConsumed: 0,
      stackPieces: 0,
      bestCombo: 1,
      stagesCleared: 0,
      bestRung: 0,
      threeStars: 0,
      mapsPlayed: {}, // mapId -> matches
      customMapsPlayed: 0,
      bestSingleObject: 0,
      levelUps: 0,
      bestLevel: 0,
    },
    unlocks: { skin: ['abyss'], trail: ['none'], theme: ['midnight'] },
    equipped: { skin: 'abyss', trail: 'none', theme: 'midnight' },
    achievements: {}, // id -> ISO date unlocked
    highScores: {}, // mapId -> [{ score, mode, seed, level, date }]
    savedSeeds: [], // [{ seed, map, note, date }]
    challenges: { daily: null, weekly: null },
    // Campaign: stageId -> { stars, best }. `cleared` counts 1-star-or-better.
    campaign: { stages: {}, lastStage: null },
    lastMap: 'suburbs',
    lastMode: 'classic',
  };
}

/** Recursively fill missing keys from the defaults (forward compatible saves). */
function merge(base, loaded) {
  if (typeof base !== 'object' || base === null || Array.isArray(base)) {
    return loaded === undefined ? base : loaded;
  }
  const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
  if (loaded && typeof loaded === 'object') {
    for (const k of Object.keys(loaded)) {
      out[k] = k in base ? merge(base[k], loaded[k]) : loaded[k];
    }
  }
  return out;
}

class SaveManager {
  constructor() {
    this.data = defaultSave();
    this._timer = null;
    this._available = true;
    this.load();
  }

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.data = merge(defaultSave(), JSON.parse(raw));
    } catch (err) {
      // Private browsing or corrupted JSON — play on with an in-memory profile.
      console.warn('Void City: could not read save, starting fresh.', err);
      this._available = false;
      this.data = defaultSave();
    }
  }

  /** Debounced write. Pass true to flush immediately (e.g. on match end). */
  save(immediate = false) {
    if (!this._available) return;
    if (immediate) {
      this._write();
      return;
    }
    if (this._timer) return;
    this._timer = setTimeout(() => {
      this._timer = null;
      this._write();
    }, 800);
  }

  _write() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch (err) {
      console.warn('Void City: save failed.', err);
      this._available = false;
    }
  }

  reset() {
    this.data = defaultSave();
    this.save(true);
  }

  // ---- convenience accessors -------------------------------------------

  get settings() {
    return this.data.settings;
  }

  get stats() {
    return this.data.stats;
  }

  addCoins(n) {
    this.data.coins += Math.max(0, Math.round(n));
    this.save();
    return this.data.coins;
  }

  spendCoins(n) {
    if (this.data.coins < n) return false;
    this.data.coins -= n;
    this.save(true);
    return true;
  }

  isUnlocked(kind, id) {
    return (this.data.unlocks[kind] || []).includes(id);
  }

  unlock(kind, id) {
    if (!this.data.unlocks[kind]) this.data.unlocks[kind] = [];
    if (!this.data.unlocks[kind].includes(id)) {
      this.data.unlocks[kind].push(id);
      this.save(true);
      return true;
    }
    return false;
  }

  equip(kind, id) {
    this.data.equipped[kind] = id;
    this.save(true);
  }

  /** Insert a run into a map's table, keep the top 10, return its rank (1-based) or 0. */
  /** Store a stage result, keeping the best stars and score ever earned. */
  recordStage(stageId, stars, score) {
    const c = this.data.campaign;
    const prev = c.stages[stageId] || { stars: 0, best: 0 };
    const fresh = stars > prev.stars;
    c.stages[stageId] = { stars: Math.max(prev.stars, stars), best: Math.max(prev.best, score) };
    c.lastStage = stageId;
    this.save();
    return { fresh, previousStars: prev.stars };
  }

  get totalStars() {
    return Object.values(this.data.campaign.stages).reduce((n, s) => n + (s.stars || 0), 0);
  }

  starsFor(stageId) {
    const s = this.data.campaign.stages[stageId];
    return s ? s.stars : 0;
  }

  recordScore(mapId, entry) {
    const table = this.data.highScores[mapId] || (this.data.highScores[mapId] = []);
    table.push(entry);
    table.sort((a, b) => b.score - a.score);
    table.length = Math.min(table.length, 10);
    this.save(true);
    const rank = table.indexOf(entry);
    return rank === -1 ? 0 : rank + 1;
  }

  bestScore(mapId) {
    const table = this.data.highScores[mapId];
    return table && table.length ? table[0].score : 0;
  }
}

export const Save = new SaveManager();
export { defaultSave };
