/**
 * progression.js — Coins, cosmetics, achievements, daily/weekly challenges.
 *
 * All of it is local. Challenges are *generated* from the date, not fetched:
 * hash "2026-05-14" into the RNG and every install produces the same three
 * dailies for that day with no server involved.
 */

import { Save } from '../core/storage.js';
import { RNG } from '../core/rng.js';
import { dayKey, weekKey, formatNumber } from '../core/utils.js';

// ---------------------------------------------------------------------------
// Cosmetics
// ---------------------------------------------------------------------------

export const SKINS = [
  { id: 'abyss', name: 'Abyss', cost: 0, color: '#6f4fd8', rim: '#cbb8ff', note: 'Standard issue.' },
  { id: 'ember', name: 'Ember', cost: 250, color: '#c8402a', rim: '#ffb27a' },
  { id: 'brine', name: 'Brine', cost: 250, color: '#1f7a8c', rim: '#8ce8ff' },
  { id: 'moss', name: 'Moss', cost: 400, color: '#3d7a44', rim: '#a8f0a2' },
  { id: 'bubblegum', name: 'Bubblegum', cost: 400, color: '#c43d8a', rim: '#ffb3e2' },
  { id: 'solar', name: 'Solar', cost: 700, color: '#c9930f', rim: '#ffe9a0' },
  { id: 'oilslick', name: 'Oil slick', cost: 900, color: '#2b2b3e', rim: '#9affe0' },
  { id: 'nova', name: 'Nova', cost: 1400, color: '#e8e8ff', rim: '#ffffff', note: 'A hole so bright it hurts.' },
  { id: 'kaiju', name: 'Kaiju', cost: 0, color: '#8a1a12', rim: '#ff6a3d', achievement: 'godzilla_x5', note: 'Earned in Godzilla mode.' },
  { id: 'citywide', name: 'Citywide', cost: 0, color: '#0f2a2a', rim: '#5ce1c4', achievement: 'clear_city', note: 'Earned by erasing a city.' },
];

export const TRAILS = [
  { id: 'none', name: 'None', cost: 0 },
  { id: 'dust', name: 'Dust', cost: 150, color: '#9aa3b8' },
  { id: 'sparks', name: 'Sparks', cost: 300, color: '#ffd27a' },
  { id: 'embers', name: 'Embers', cost: 500, color: '#ff7a3d' },
  { id: 'frost', name: 'Frost', cost: 500, color: '#9be8ff' },
  { id: 'rift', name: 'Rift', cost: 900, color: '#c08cff' },
  { id: 'gold', name: 'Gold dust', cost: 0, color: '#ffd700', achievement: 'score_100k' },
];

export const THEMES = [
  { id: 'midnight', name: 'Midnight', cost: 0, accent: '#8f7bff', tint: '#0a0b12' },
  { id: 'acid', name: 'Acid rain', cost: 350, accent: '#67e39a', tint: '#0a120e' },
  { id: 'sodium', name: 'Sodium lamp', cost: 350, accent: '#ffb454', tint: '#120e08' },
  { id: 'vhs', name: 'VHS', cost: 600, accent: '#ff6fae', tint: '#120a12' },
];

export const COSMETICS = { skin: SKINS, trail: TRAILS, theme: THEMES };

export function cosmetic(kind, id) {
  return COSMETICS[kind].find((c) => c.id === id) || COSMETICS[kind][0];
}

export function equippedSkin() {
  return cosmetic('skin', Save.data.equipped.skin);
}

export function equippedTrail() {
  return cosmetic('trail', Save.data.equipped.trail);
}

export function equippedTheme() {
  return cosmetic('theme', Save.data.equipped.theme);
}

// ---------------------------------------------------------------------------
// Achievements
// ---------------------------------------------------------------------------

/**
 * Each achievement reads the lifetime stats block. `reward` is coins;
 * unlocking one may also grant a cosmetic (see the `achievement` field above).
 */
export const ACHIEVEMENTS = [
  { id: 'first_bite', name: 'First bite', desc: 'Consume 50 objects', reward: 50, test: (s) => s.objectsConsumed >= 50 },
  { id: 'hungry', name: 'Hungry', desc: 'Consume 1,000 objects', reward: 200, test: (s) => s.objectsConsumed >= 1000 },
  { id: 'insatiable', name: 'Insatiable', desc: 'Consume 10,000 objects', reward: 900, test: (s) => s.objectsConsumed >= 10000 },
  { id: 'parking_problem', name: 'Parking problem', desc: 'Consume 250 vehicles', reward: 150, test: (s) => s.carsConsumed >= 250 },
  { id: 'zoning_issue', name: 'Zoning issue', desc: 'Consume 500 buildings', reward: 300, test: (s) => s.buildingsConsumed >= 500 },
  { id: 'score_25k', name: 'Quarter million pieces', desc: 'Bank 25,000 lifetime score', reward: 100, test: (s) => s.totalScore >= 25000 },
  { id: 'score_100k', name: 'Civic menace', desc: 'Bank 100,000 lifetime score', reward: 400, test: (s) => s.totalScore >= 100000 },
  { id: 'big_hole', name: 'Wide open', desc: 'Reach radius 200', reward: 150, test: (s) => s.largestRadius >= 200 },
  { id: 'huge_hole', name: 'Municipal disaster', desc: 'Reach radius 400', reward: 500, test: (s) => s.largestRadius >= 400 },
  { id: 'landmark', name: 'Landmark status', desc: 'Swallow something over 8,000 mass', reward: 250, test: (s) => s.largestObjectMass >= 8000 },
  { id: 'godzilla_1', name: 'Something awakens', desc: 'Trigger Godzilla mode once', reward: 100, test: (s) => s.godzillaActivations >= 1 },
  { id: 'godzilla_x5', name: 'Kaiju season', desc: 'Trigger Godzilla mode 5 times', reward: 400, test: (s) => s.godzillaActivations >= 5 },
  { id: 'clear_city', name: 'Nothing left', desc: 'Consume 95% of a city', reward: 800, test: (s) => s.bestDestruction >= 0.95 },
  { id: 'winner', name: 'Top of the board', desc: 'Win 10 AI battles', reward: 350, test: (s) => s.matchesWon >= 10 },
  { id: 'cannibal', name: 'Rival hollow', desc: 'Swallow 25 rival voids', reward: 300, test: (s) => s.aiVoidsConsumed >= 25 },
  { id: 'regular', name: 'Regular', desc: 'Play 50 matches', reward: 200, test: (s) => s.matchesPlayed >= 50 },
];

/** Returns an array of newly unlocked achievements (already rewarded). */
export function checkAchievements() {
  const unlocked = [];
  const s = Save.stats;
  for (const a of ACHIEVEMENTS) {
    if (Save.data.achievements[a.id]) continue;
    if (!a.test(s)) continue;
    Save.data.achievements[a.id] = new Date().toISOString();
    Save.addCoins(a.reward);
    // Any cosmetic gated behind this achievement unlocks with it.
    for (const kind of Object.keys(COSMETICS)) {
      for (const c of COSMETICS[kind]) {
        if (c.achievement === a.id) Save.unlock(kind, c.id);
      }
    }
    unlocked.push(a);
  }
  if (unlocked.length) Save.save(true);
  return unlocked;
}

export function achievementProgress() {
  const total = ACHIEVEMENTS.length;
  const done = ACHIEVEMENTS.filter((a) => Save.data.achievements[a.id]).length;
  return { done, total };
}

// ---------------------------------------------------------------------------
// Challenges
// ---------------------------------------------------------------------------

/**
 * Metrics a challenge can watch. `mode` decides how a reported value folds
 * into the stored progress: 'add' accumulates, 'max' keeps the best run.
 */
const DAILY_TEMPLATES = [
  { metric: 'cars', mode: 'add', goals: [40, 70, 100], text: (n) => `Consume ${n} vehicles`, reward: 60 },
  { metric: 'objects', mode: 'add', goals: [300, 500, 800], text: (n) => `Consume ${n} objects`, reward: 60 },
  { metric: 'godzilla', mode: 'add', goals: [1, 2], text: (n) => `Trigger Godzilla mode ${n > 1 ? n + ' times' : 'once'}`, reward: 120 },
  { metric: 'level', mode: 'max', goals: [10, 13, 15], text: (n) => `Reach level ${n} in one match`, reward: 90 },
  { metric: 'matchScore', mode: 'max', goals: [20000, 40000, 70000], text: (n) => `Score ${formatNumber(n)} in one match`, reward: 100 },
  { metric: 'buildings', mode: 'add', goals: [60, 120], text: (n) => `Consume ${n} buildings`, reward: 80 },
  { metric: 'aiEaten', mode: 'add', goals: [3, 6], text: (n) => `Swallow ${n} rival voids`, reward: 110 },
  { metric: 'matches', mode: 'add', goals: [3, 5], text: (n) => `Finish ${n} matches`, reward: 50 },
];

const WEEKLY_TEMPLATES = [
  { metric: 'cityCleared', mode: 'add', goals: [3, 5], text: (n) => `Destroy ${n} cities (80%+ consumed)`, reward: 400 },
  { metric: 'objects', mode: 'add', goals: [1000, 2000], text: (n) => `Consume ${formatNumber(n)} objects`, reward: 350 },
  { metric: 'radius', mode: 'max', goals: [300, 450], text: (n) => `Reach radius ${n}`, reward: 300 },
  { metric: 'totalScore', mode: 'add', goals: [200000, 400000], text: (n) => `Bank ${formatNumber(n)} score`, reward: 450 },
  { metric: 'godzilla', mode: 'add', goals: [5, 8], text: (n) => `Trigger Godzilla mode ${n} times`, reward: 400 },
];

function buildSet(templates, seed, count) {
  const rng = new RNG(seed);
  const pool = templates.slice();
  rng.shuffle(pool);
  const items = [];
  for (let i = 0; i < Math.min(count, pool.length); i++) {
    const t = pool[i];
    const goal = t.goals[rng.int(0, t.goals.length - 1)];
    items.push({
      id: t.metric + '_' + goal,
      metric: t.metric,
      mode: t.mode,
      goal,
      text: t.text(goal),
      reward: t.reward,
      progress: 0,
      claimed: false,
    });
  }
  return items;
}

/** Rebuilds the daily/weekly sets when the date rolls over. */
export function ensureChallenges() {
  const dk = dayKey();
  const wk = weekKey();
  const c = Save.data.challenges;
  let changed = false;
  if (!c.daily || c.daily.key !== dk) {
    c.daily = { key: dk, items: buildSet(DAILY_TEMPLATES, 'daily::' + dk, 3) };
    changed = true;
  }
  if (!c.weekly || c.weekly.key !== wk) {
    c.weekly = { key: wk, items: buildSet(WEEKLY_TEMPLATES, 'weekly::' + wk, 2) };
    changed = true;
  }
  if (changed) Save.save(true);
  return c;
}

/**
 * Report progress. Called from the match loop and from endMatch().
 * @param {string} metric
 * @param {number} value
 */
export function trackMetric(metric, value) {
  const c = ensureChallenges();
  let changed = false;
  for (const set of [c.daily, c.weekly]) {
    for (const item of set.items) {
      if (item.metric !== metric || item.claimed) continue;
      const next = item.mode === 'max' ? Math.max(item.progress, value) : item.progress + value;
      if (next !== item.progress) {
        item.progress = Math.min(next, item.goal);
        changed = true;
      }
    }
  }
  if (changed) Save.save();
}

export function claimChallenge(id) {
  const c = ensureChallenges();
  for (const set of [c.daily, c.weekly]) {
    for (const item of set.items) {
      if (item.id === id && !item.claimed && item.progress >= item.goal) {
        item.claimed = true;
        Save.addCoins(item.reward);
        Save.save(true);
        return item;
      }
    }
  }
  return null;
}

export function claimableCount() {
  const c = ensureChallenges();
  let n = 0;
  for (const set of [c.daily, c.weekly]) {
    for (const item of set.items) if (!item.claimed && item.progress >= item.goal) n++;
  }
  return n;
}

/** Coins awarded for a finished run — the main income source. */
export function coinsForRun(run) {
  const base = Math.round(run.score / 120);
  const destruction = Math.round(run.destruction * 150);
  const win = run.won ? 120 : 0;
  const godzilla = run.godzillaSeconds > 0 ? 60 : 0;
  return base + destruction + win + godzilla;
}
