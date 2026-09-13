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
  { id: 'ember', name: 'Ember', cost: 400, color: '#c8402a', rim: '#ffb27a' },
  { id: 'brine', name: 'Brine', cost: 400, color: '#1f7a8c', rim: '#8ce8ff' },
  { id: 'moss', name: 'Moss', cost: 600, color: '#3d7a44', rim: '#a8f0a2' },
  { id: 'bubblegum', name: 'Bubblegum', cost: 600, color: '#c43d8a', rim: '#ffb3e2' },
  { id: 'solar', name: 'Solar', cost: 1050, color: '#c9930f', rim: '#ffe9a0' },
  { id: 'oilslick', name: 'Oil slick', cost: 1350, color: '#2b2b3e', rim: '#9affe0' },
  { id: 'nova', name: 'Nova', cost: 2100, color: '#e8e8ff', rim: '#ffffff', note: 'A hole so bright it hurts.' },
  { id: 'kaiju', name: 'Kaiju', cost: 0, color: '#8a1a12', rim: '#ff6a3d', achievement: 'godzilla_x5', note: 'Earned in Godzilla mode.' },
  { id: 'citywide', name: 'Citywide', cost: 0, color: '#0f2a2a', rim: '#5ce1c4', achievement: 'clear_city', note: 'Earned by erasing a city.' },
  { id: 'sable', name: 'Sable', cost: 0, color: '#2a2438', rim: '#d9c7ff', stars: 12, note: 'Sable Heights, cleared.' },
  { id: 'meridian', name: 'Meridian', cost: 0, color: '#123047', rim: '#7fd8ff', stars: 30, note: 'Meridian Core, cleared.' },
  { id: 'ferrous', name: 'Ferrous', cost: 0, color: '#4a2a18', rim: '#ffb06a', stars: 55, note: 'Ferrous Flats, cleared.' },
  { id: 'singularity', name: 'Singularity', cost: 0, color: '#05050a', rim: '#ffffff', stars: 75, note: 'Every stage, three stars.' },
  { id: 'verdant', name: 'Verdant', cost: 500, color: '#2f6b3c', rim: '#b9f5a8' },
  { id: 'cobalt', name: 'Cobalt', cost: 500, color: '#1c3f8f', rim: '#8fb6ff' },
  { id: 'rust', name: 'Rust', cost: 750, color: '#8a3b1c', rim: '#ffb48a' },
  { id: 'porcelain', name: 'Porcelain', cost: 750, color: '#d8d4cc', rim: '#ffffff' },
  { id: 'ultraviolet', name: 'Ultraviolet', cost: 1100, color: '#3a0f6b', rim: '#d89bff' },
  { id: 'tidal', name: 'Tidal', cost: 1100, color: '#0d4f5c', rim: '#7ff0e0' },
  { id: 'ember_storm', name: 'Ember storm', cost: 1600, color: '#7a1f0d', rim: '#ffd08a' },
  { id: 'quiet', name: 'Quiet', cost: 2200, color: '#14141c', rim: '#5a5f7a', note: 'Barely there.' },
  { id: 'harbourmaster', name: 'Harbourmaster', cost: 0, color: '#123c4a', rim: '#7fe0ff', achievement: 'all_maps', note: 'Play every city.' },
  { id: 'ladder', name: 'Ladder', cost: 0, color: '#2b2b16', rim: '#ffe066', achievement: 'rung_25', note: 'Climb the ladder.' },
];

export const TRAILS = [
  { id: 'none', name: 'None', cost: 0 },
  { id: 'dust', name: 'Dust', cost: 200, color: '#9aa3b8' },
  { id: 'sparks', name: 'Sparks', cost: 450, color: '#ffd27a' },
  { id: 'embers', name: 'Embers', cost: 750, color: '#ff7a3d' },
  { id: 'frost', name: 'Frost', cost: 750, color: '#9be8ff' },
  { id: 'rift', name: 'Rift', cost: 1350, color: '#c08cff' },
  { id: 'gold', name: 'Gold dust', cost: 0, color: '#ffd700', achievement: 'score_100k' },
  { id: 'static', name: 'Static', cost: 0, color: '#b9c4ff', stars: 20, note: 'Chapter II underway.' },
  { id: 'magma', name: 'Magma', cost: 0, color: '#ff5324', stars: 45, note: 'Chapter III underway.' },
  { id: 'ink', name: 'Ink', cost: 700, color: '#2a2f45' },
  { id: 'bloom', name: 'Bloom', cost: 900, color: '#ff9ad2' },
  { id: 'cinder', name: 'Cinder', cost: 1200, color: '#ff8a3d' },
  { id: 'aurora', name: 'Aurora', cost: 1600, color: '#7dffcf' },
  { id: 'void_dust', name: 'Void dust', cost: 0, color: '#c9b8ff', achievement: 'rung_50', note: 'Rung 50.' },
];

export const THEMES = [
  { id: 'midnight', name: 'Midnight', cost: 0, accent: '#8f7bff', tint: '#0a0b12' },
  { id: 'acid', name: 'Acid rain', cost: 500, accent: '#67e39a', tint: '#0a120e' },
  { id: 'sodium', name: 'Sodium lamp', cost: 500, accent: '#ffb454', tint: '#120e08' },
  { id: 'vhs', name: 'VHS', cost: 900, accent: '#ff6fae', tint: '#120a12' },
  { id: 'blueprint', name: 'Blueprint', cost: 0, accent: '#6fa8ff', tint: '#080d16', stars: 36, note: 'Earned in the campaign.' },
  { id: 'harbourlight', name: 'Harbour light', cost: 800, accent: '#4fc3e8', tint: '#08131a' },
  { id: 'terracotta', name: 'Terracotta', cost: 800, accent: '#ffa06a', tint: '#160f0a' },
  { id: 'chlorophyll', name: 'Chlorophyll', cost: 1200, accent: '#8ef06a', tint: '#0b1409' },
  { id: 'nightshift', name: 'Nightshift', cost: 0, accent: '#e0e4ff', tint: '#07070c', achievement: 'marathon', note: 'Clear a marathon rung.' },
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
  { id: 'stacks_100', name: 'Top down', desc: 'Take 100 pieces off stacks', reward: 100, test: (s) => (s.stackPieces || 0) >= 100 },
  { id: 'stacks_1000', name: 'Longshoreman', desc: 'Take 1,000 pieces off stacks', reward: 400, test: (s) => (s.stackPieces || 0) >= 1000 },
  { id: 'landmarks_10', name: 'Civic erasure', desc: 'Swallow 10 landmarks', reward: 150, test: (s) => (s.landmarksConsumed || 0) >= 10 },
  { id: 'landmarks_50', name: 'Heritage listed', desc: 'Swallow 50 landmarks', reward: 500, test: (s) => (s.landmarksConsumed || 0) >= 50 },
  { id: 'combo_2', name: 'On a roll', desc: 'Reach a 2x combo', reward: 80, test: (s) => (s.bestCombo || 1) >= 2 },
  { id: 'combo_3', name: 'Chain reaction', desc: 'Reach a 3x combo', reward: 250, test: (s) => (s.bestCombo || 1) >= 3 },
  { id: 'level_20', name: 'Twenty deep', desc: 'Reach level 20', reward: 200, test: (s) => (s.bestLevel || 0) >= 20 },
  { id: 'level_30', name: 'Thirty deep', desc: 'Reach level 30', reward: 600, test: (s) => (s.bestLevel || 0) >= 30 },
  { id: 'levelups_500', name: 'Escalation', desc: 'Gain 500 levels across all runs', reward: 300, test: (s) => (s.levelUps || 0) >= 500 },
  { id: 'all_maps', name: 'Grand tour', desc: 'Play all six cities', reward: 350, test: (s) => Object.keys(s.mapsPlayed || {}).length >= 6 },
  { id: 'custom_map', name: 'Town planner', desc: 'Play a custom city', reward: 120, test: (s) => (s.customMapsPlayed || 0) >= 1 },
  { id: 'stage_1', name: 'Getting started', desc: 'Clear a campaign stage', reward: 60, test: (s) => (s.stagesCleared || 0) >= 1 },
  { id: 'stage_9', name: 'Chapter one', desc: 'Clear 9 campaign stages', reward: 200, test: (s) => (s.stagesCleared || 0) >= 9 },
  { id: 'stage_27', name: 'Full campaign', desc: 'Clear all 27 campaign stages', reward: 900, test: (s) => (s.stagesCleared || 0) >= 27 },
  { id: 'three_star_10', name: 'Perfectionist', desc: 'Three-star 10 stages', reward: 350, test: (s) => (s.threeStars || 0) >= 10 },
  { id: 'three_star_27', name: 'Immaculate', desc: 'Three-star 27 stages', reward: 1200, test: (s) => (s.threeStars || 0) >= 27 },
  { id: 'rung_5', name: 'First rung', desc: 'Clear rung 5 of the ladder', reward: 150, test: (s) => (s.bestRung || 0) >= 5 },
  { id: 'rung_25', name: 'Steady climb', desc: 'Clear rung 25 of the ladder', reward: 450, test: (s) => (s.bestRung || 0) >= 25 },
  { id: 'rung_50', name: 'No ceiling', desc: 'Clear rung 50 of the ladder', reward: 900, test: (s) => (s.bestRung || 0) >= 50 },
  { id: 'rung_100', name: 'Century', desc: 'Clear rung 100 of the ladder', reward: 2000, test: (s) => (s.bestRung || 0) >= 100 },
  { id: 'marathon', name: 'Long haul', desc: 'Clear a marathon rung', reward: 300, test: (s) => (s.bestRung || 0) >= 10 },
  { id: 'score_500k', name: 'Municipal collapse', desc: 'Bank 500,000 lifetime score', reward: 700, test: (s) => s.totalScore >= 500000 },
  { id: 'score_2m', name: 'Structural failure', desc: 'Bank 2,000,000 lifetime score', reward: 1500, test: (s) => s.totalScore >= 2000000 },
  { id: 'cars_1000', name: 'Traffic solution', desc: 'Consume 1,000 vehicles', reward: 400, test: (s) => s.carsConsumed >= 1000 },
  { id: 'buildings_2000', name: 'Redevelopment', desc: 'Consume 2,000 buildings', reward: 600, test: (s) => s.buildingsConsumed >= 2000 },
  { id: 'objects_50k', name: 'Appetite', desc: 'Consume 50,000 objects', reward: 1500, test: (s) => s.objectsConsumed >= 50000 },
  { id: 'godzilla_25', name: 'Kaiju veteran', desc: 'Trigger Godzilla mode 25 times', reward: 800, test: (s) => s.godzillaActivations >= 25 },
  { id: 'godzilla_300s', name: 'Extended rampage', desc: 'Spend 5 minutes in Godzilla mode', reward: 500, test: (s) => s.godzillaSeconds >= 300 },
  { id: 'cities_10', name: 'Serial demolisher', desc: 'Clear 80% of a city ten times', reward: 600, test: (s) => s.citiesCleared >= 10 },
  { id: 'wins_50', name: 'Apex void', desc: 'Win 50 AI battles', reward: 900, test: (s) => s.matchesWon >= 50 },
  { id: 'cannibal_100', name: 'Rival famine', desc: 'Swallow 100 rival voids', reward: 800, test: (s) => s.aiVoidsConsumed >= 100 },
  { id: 'big_object', name: 'Impossible meal', desc: 'Swallow something over 40,000 mass', reward: 700, test: (s) => (s.bestSingleObject || 0) >= 40000 },
  { id: 'radius_600', name: 'Postcode', desc: 'Reach radius 600', reward: 900, test: (s) => s.largestRadius >= 600 },
  { id: 'played_200', name: 'Resident', desc: 'Play 200 matches', reward: 600, test: (s) => s.matchesPlayed >= 200 },
  { id: 'hours_5', name: 'Five hours gone', desc: 'Play for five hours', reward: 500, test: (s) => s.playSeconds >= 18000 },
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
/**
 * Freeplay pays modestly and is capped: the shop is meant to be earned across
 * a lot of play, and the campaign (stars) is the main source of coins. Before
 * this, one good run bought half the shop.
 */
export const RUN_COIN_CAP = 140;

export function coinsForRun(run) {
  const base = Math.round(run.score / 900);
  const destruction = Math.round(run.destruction * 45);
  const win = run.won ? 35 : 0;
  const godzilla = run.godzillaSeconds > 0 ? 20 : 0;
  return Math.min(RUN_COIN_CAP, base + destruction + win + godzilla);
}
