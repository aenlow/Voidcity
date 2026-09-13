/**
 * levels.js — The campaign.
 *
 * Freeplay generates a city and turns you loose. The campaign is the opposite:
 * every stage bends the generator and the rules to ask a different question.
 * One stage gives you a huge empty city and a short clock, so it's about
 * routing. One fills the map with container stacks, so it's about digging. One
 * drops you in with three rivals that start bigger than you.
 *
 * A stage is:
 *   modifiers  passed straight into worldgen + the engine (density, spacing,
 *              growth, time, rival count, difficulty tier, fixed seed)
 *   objective  what "clear" means — the thing you have to actually do
 *   stars      1 for clearing it, 2 and 3 for score thresholds on top
 *
 * Stages are fixed-seed, so a stage is the *same city* for everyone. That's
 * what makes the 3-star target meaningful and lets people compare routes.
 */

import { Save } from '../core/storage.js';
import { MAPS, MAP_IDS } from '../world/maps.js';
import { generatePreset, ARCHETYPE_IDS } from '../world/procgen.js';
import { RNG } from '../core/rng.js';

/** Objective kinds and how their progress reads in the HUD. */
export const OBJECTIVES = {
  destruction: {
    label: (t) => `Consume ${Math.round(t * 100)}% of the city`,
    progress: (s, t) => s.destruction / t,
    value: (s) => `${Math.round(s.destruction * 100)}%`,
  },
  score: {
    label: (t) => `Score ${t.toLocaleString()}`,
    progress: (s, t) => s.player.score / t,
    value: (s) => s.player.score.toLocaleString(),
  },
  radius: {
    label: (t) => `Grow to radius ${t}`,
    progress: (s, t) => s.player.radius / t,
    value: (s) => Math.round(s.player.radius),
  },
  objects: {
    label: (t) => `Consume ${t} objects`,
    progress: (s, t) => s.objectsConsumed / t,
    value: (s) => s.objectsConsumed,
  },
  landmarks: {
    label: (t) => `Swallow ${t} landmark${t > 1 ? 's' : ''}`,
    progress: (s, t) => (s.landmarksConsumed || 0) / t,
    value: (s) => s.landmarksConsumed || 0,
  },
  rivals: {
    label: (t) => `Swallow ${t} rival void${t > 1 ? 's' : ''}`,
    progress: (s, t) => (s.rivalsEaten || 0) / t,
    value: (s) => s.rivalsEaten || 0,
  },
  win: {
    label: () => 'Finish first',
    progress: (s) => {
      const lead = s.voids.filter((v) => v.score > s.player.score).length;
      return lead === 0 ? 1 : 0.5;
    },
    value: (s) => {
      const rank = s.voids.filter((v) => v.score > s.player.score).length + 1;
      return `#${rank}`;
    },
  },
  survive: {
    label: (t) => `Stay alive for ${t}s`,
    progress: (s, t) => s.elapsed / t,
    value: (s) => `${Math.floor(s.elapsed)}s`,
  },
};

/**
 * Chapters map onto the three cities. Nine stages each: an easy opener, a few
 * twists on the map's character, a rival fight, and a hard closer.
 *
 * mods fields:
 *   time         seconds (0 = no clock)
 *   ai           rival count
 *   difficulty   handicap tier for those rivals
 *   density      object density multiplier (1 = normal)
 *   spacing      >1 pushes the hot spots apart — more travel, fewer easy bites
 *   stacks       stack frequency multiplier
 *   growth       how much mass you keep per object (pacing)
 *   size         world size multiplier
 *   start        starting radius
 */
const CHAPTERS = [
  {
    id: 'suburbs',
    name: 'Sable Heights',
    subtitle: 'Chapter I · Suburbs',
    starsToUnlock: 0,
    stages: [
      { name: 'Sinkhole', objective: ['objects', 120], mods: { time: 90, density: 1.1 }, stars: [75000, 105000], hint: 'Start with cones and mailboxes. Everything is food eventually.' },
      { name: 'Cul-de-sac', objective: ['destruction', 0.3], mods: { time: 120, size: 0.75 }, stars: [105000, 183000] },
      { name: 'Long blocks', objective: ['score', 32000], mods: { time: 120, spacing: 1.9, density: 0.85 }, stars: [46000, 64000], hint: 'The good streets are far apart. Pick a lane and commit.' },
      { name: 'Yard sale', objective: ['objects', 420], mods: { time: 120, density: 1.45, stacks: 2 }, stars: [159000, 223000] },
      { name: 'Neighbour', objective: ['win'], mods: { time: 120, ai: 1, difficulty: 'relaxed' }, stars: [157000, 230000], hint: 'One rival, and it is slower than you. Learn the shape of a fight.' },
      { name: 'Growth spurt', objective: ['radius', 150], mods: { time: 100, growth: 1.25 }, stars: [135000, 189000] },
      { name: 'Monuments', objective: ['landmarks', 3], mods: { time: 150, growth: 1.15 }, stars: [174000, 264000], hint: 'Landmarks are the big blocks on the minimap. You need size before they will move.' },
      { name: 'Three of them', objective: ['win'], mods: { time: 150, ai: 3, difficulty: 'relaxed' }, stars: [96000, 209000] },
      { name: 'Clean sweep', objective: ['destruction', 0.75], mods: { time: 210, growth: 1.1 }, stars: [261000, 365000] },
    ],
  },
  {
    id: 'downtown',
    name: 'Meridian Core',
    subtitle: 'Chapter II · Downtown',
    starsToUnlock: 8,
    stages: [
      { name: 'Rush hour', objective: ['objects', 200], mods: { time: 90, density: 1.3 }, stars: [119000, 184000] },
      { name: 'Gridlock', objective: ['score', 90000], mods: { time: 120 }, stars: [271000, 379000] },
      { name: 'Rooftops', objective: ['objects', 500], mods: { time: 140, stacks: 3, density: 1.15 }, stars: [284000, 398000], hint: 'Stacks only give up the top piece. Take it and the rest follows.' },
      { name: 'Wide avenues', objective: ['destruction', 0.42], mods: { time: 160, spacing: 2.1, size: 1.15 }, stars: [78000, 109000] },
      { name: 'Hostile takeover', objective: ['rivals', 2], mods: { time: 150, ai: 4, difficulty: 'normal' }, stars: [239000, 336000], hint: 'You can eat a rival once you are clearly bigger. Corner the small ones early.' },
      { name: 'Skyline', objective: ['radius', 215], mods: { time: 150, growth: 1.1 }, stars: [234000, 328000] },
      { name: 'Blackout', objective: ['score', 150000], mods: { time: 140, density: 0.8, growth: 1.3, spacing: 1.6 }, stars: [122000, 171000] },
      { name: 'Six rivals', objective: ['win'], mods: { time: 180, ai: 6, difficulty: 'normal' }, stars: [193000, 384000] },
      { name: 'Core meltdown', objective: ['destruction', 0.85], mods: { time: 240, growth: 1.05 }, stars: [298000, 417000] },
    ],
  },
  {
    id: 'industrial',
    name: 'Ferrous Flats',
    subtitle: 'Chapter III · Industrial',
    starsToUnlock: 20,
    stages: [
      { name: 'Loading bay', objective: ['objects', 260], mods: { time: 100, stacks: 3 }, stars: [309000, 439000] },
      { name: 'Container yard', objective: ['score', 140000], mods: { time: 140, stacks: 4, density: 1.2 }, stars: [563000, 788000] },
      { name: 'Long haul', objective: ['destruction', 0.4], mods: { time: 150, spacing: 2.4, size: 1.25, density: 0.75 }, stars: [70000, 98000], hint: 'Nothing is nearby. Read the minimap and plan two stops ahead.' },
      { name: 'Heavy plant', objective: ['landmarks', 4], mods: { time: 180, growth: 1.15 }, stars: [395000, 553000] },
      { name: 'Scrap war', objective: ['rivals', 2], mods: { time: 180, ai: 5, difficulty: 'normal' }, stars: [203000, 336000] },
      { name: 'Lean city', objective: ['radius', 215], mods: { time: 165, density: 0.6, growth: 1.4, spacing: 1.8 }, stars: [108000, 223000] },
      { name: 'Hold the yard', objective: ['survive', 130], mods: { time: 130, ai: 5, difficulty: 'normal', start: 34 }, stars: [146000, 204000], hint: 'Surviving is the objective. Score is the tiebreak. Run if you have to.' },
      { name: 'Eight ways down', objective: ['win'], mods: { time: 200, ai: 7, difficulty: 'hard' }, stars: [214000, 300000] },
      { name: 'Ferrous', objective: ['destruction', 0.9], mods: { time: 270, ai: 2, difficulty: 'hard' }, stars: [275000, 411000] },
    ],
  },
];

/** Flattened stage list with ids, chapter back-references and unlock rules. */
export const STAGES = [];
for (const chapter of CHAPTERS) {
  chapter.stages.forEach((raw, i) => {
    const stage = {
      id: `${chapter.id}-${i + 1}`,
      index: i,
      number: i + 1,
      chapterId: chapter.id,
      chapterName: chapter.name,
      chapterSubtitle: chapter.subtitle,
      mapId: chapter.id,
      starsToUnlock: chapter.starsToUnlock,
      name: raw.name,
      hint: raw.hint || '',
      objective: { kind: raw.objective[0], target: raw.objective[1] ?? null },
      stars: raw.stars,
      mods: Object.assign(
        { time: 120, ai: 0, difficulty: 'normal', density: 1, spacing: 1, stacks: 1, growth: 1, size: 1, start: 20 },
        raw.mods
      ),
    };
    STAGES.push(stage);
  });
}

export const CHAPTER_LIST = CHAPTERS.map((c) => ({
  id: c.id,
  name: c.name,
  subtitle: c.subtitle,
  starsToUnlock: c.starsToUnlock,
  stageIds: STAGES.filter((s) => s.chapterId === c.id).map((s) => s.id),
}));

export function getStage(id) {
  const found = STAGES.find((s) => s.id === id);
  if (found) return found;
  if (typeof id === 'string' && id.startsWith('endless-')) {
    const n = parseInt(id.slice(8), 10);
    if (n > 0) return endlessStage(n);
  }
  return null;
}

/** Human-readable objective text, e.g. "Consume 75% of the city". */
export function objectiveLabel(stage) {
  const o = OBJECTIVES[stage.objective.kind];
  return o ? o.label(stage.objective.target) : '';
}

/**
 * A stage is playable when the one before it has at least one star and the
 * chapter's star gate is met. The gate stops people bouncing off Chapter III
 * before they have the movement down, without hard-locking anyone out: every
 * stage you replay for a better rating counts toward it.
 */
export function isUnlocked(stageId) {
  const stage = getStage(stageId);
  if (!stage) return false;
  if (stage.endless) {
    // The ladder opens when the campaign is done, then you climb one rung at a
    // time — but any rung you have already cleared stays replayable.
    if (!ladderUnlocked()) return false;
    return stage.rung <= ladderProgress() + 1;
  }
  if (Save.totalStars < stage.starsToUnlock) return false;
  if (stage.index === 0) return true;
  const prev = STAGES.find((s) => s.chapterId === stage.chapterId && s.index === stage.index - 1);
  return prev ? Save.starsFor(prev.id) > 0 : true;
}

export function lockReason(stageId) {
  const stage = getStage(stageId);
  if (!stage) return '';
  if (stage.endless) {
    return ladderUnlocked() ? 'Clear the rung below first' : 'Finish the campaign to open the ladder';
  }
  if (Save.totalStars < stage.starsToUnlock) {
    return `${stage.starsToUnlock - Save.totalStars} more star${stage.starsToUnlock - Save.totalStars > 1 ? 's' : ''} to open this chapter`;
  }
  return 'Clear the previous stage first';
}

/** The next stage worth playing — used for the menu's big Play button. */
export function nextStage() {
  for (const s of STAGES) {
    if (isUnlocked(s.id) && Save.starsFor(s.id) === 0) return s;
  }
  return STAGES.find((s) => isUnlocked(s.id) && Save.starsFor(s.id) < 3) || STAGES[0];
}

/** Progress toward the objective, 0..1, plus the value to print in the HUD. */
export function objectiveProgress(stage, state) {
  const def = OBJECTIVES[stage.objective.kind];
  if (!def) return { progress: 0, value: '' };
  const p = def.progress(state, stage.objective.target);
  return { progress: Math.max(0, Math.min(1, p || 0)), value: def.value(state) };
}

/**
 * Score the run. One star for the objective, two more for the score
 * thresholds — but only if the objective was met, so you can't three-star a
 * stage by farming points and ignoring what it asked for.
 */
export function rateRun(stage, run, state) {
  const def = OBJECTIVES[stage.objective.kind];
  let met = false;
  if (def) {
    if (stage.objective.kind === 'win') met = run.rank === 1 && run.alive !== false;
    else if (stage.objective.kind === 'survive')
      // Eating the entire city counts as surviving it — the clock only ran out
      // early because there was nothing left to run from.
      met = run.alive !== false && (run.duration >= stage.objective.target - 0.5 || run.reason === 'cleared');
    else met = def.progress(state, stage.objective.target) >= 1;
  }
  let stars = met ? 1 : 0;
  if (met && stage.stars) {
    if (run.score >= stage.stars[0]) stars = 2;
    if (run.score >= stage.stars[1]) stars = 3;
  }
  return { stars, met };
}

/** Coins paid for a stage, first time each star is earned. */
export function stageReward(stage, stars, previousStars) {
  if (stars <= previousStars) return 0;
  // Ladder rungs pay on a curve of their own that flattens out, so an endless
  // run is worth playing without becoming a coin printer at rung 200.
  const chapterIndex = stage.endless ? 3 : CHAPTER_LIST.findIndex((c) => c.id === stage.chapterId);
  const base = stage.endless
    ? 90 + Math.min(120, stage.rung * 3)
    : 40 + chapterIndex * 30 + stage.number * 6;
  let coins = 0;
  for (let s = previousStars + 1; s <= stars; s++) coins += Math.round(base * (s === 1 ? 1 : s === 2 ? 0.7 : 1.1));
  return coins;
}



// =======================================================================
// The endless ladder
// =======================================================================

/**
 * After the 27 handcrafted stages the ladder takes over and never stops.
 * Stage N is a pure function of N: same city, same objective, same targets for
 * everyone, forever. Difficulty climbs on three separate curves so it doesn't
 * become "the same stage but you need more points":
 *
 *   pressure   rival count and their handicap tier
 *   scale      city size and how far apart the density hot spots sit
 *   ask        the objective target relative to what the city can give
 *
 * Every fifth rung is a **gauntlet**: a fixed-city rival fight. Every tenth is
 * a **marathon**: a huge map, a long clock and a destruction target. Those two
 * beats stop a long session from flattening out.
 */
export const ENDLESS_START = 1;

const ENDLESS_OBJECTIVES = [
  'destruction', 'score', 'objects', 'radius', 'landmarks', 'destruction', 'score', 'objects',
];

/** Difficulty tiers used as the ladder climbs. */
const LADDER_TIERS = ['relaxed', 'normal', 'normal', 'hard', 'hard', 'brutal'];

export function endlessStageId(n) {
  return 'endless-' + n;
}

/** Build the descriptor for rung `n` (1-based). */
export function endlessStage(n) {
  const rung = Math.max(1, Math.floor(n));
  const rng = new RNG('ladder::' + rung);
  const gauntlet = rung % 5 === 0 && rung % 10 !== 0;
  const marathon = rung % 10 === 0;

  // 0 at the bottom, approaching 1 by rung ~60 and creeping after.
  const climb = 1 - Math.pow(0.965, rung - 1);
  const tier = LADDER_TIERS[Math.min(LADDER_TIERS.length - 1, Math.floor(climb * LADDER_TIERS.length))];

  // Which city: the first rungs reuse the hand-built maps so the ladder feels
  // familiar before it starts inventing places.
  const useBuiltIn = rung <= 6 || (!marathon && rng.chance(0.3));
  const preset = useBuiltIn
    ? MAPS[MAP_IDS[(rung - 1) % MAP_IDS.length]]
    : generatePreset('L' + rung, {
        archetype: marathon ? 'expanse' : rng.chance(0.25) ? rng.pick(ARCHETYPE_IDS) : null,
        sizeMult: marathon ? 1.25 : 1 + climb * 0.25,
        densityMult: 1 + climb * 0.2,
      });

  const kind = gauntlet ? 'win' : marathon ? 'destruction' : ENDLESS_OBJECTIVES[(rung - 1) % ENDLESS_OBJECTIVES.length];
  const time = marathon ? 240 : gauntlet ? 170 : Math.round(105 + Math.min(75, rung * 2.2));
  const ai = gauntlet ? Math.min(9, 3 + Math.floor(rung / 5)) : marathon ? 2 : Math.min(6, Math.floor(climb * 7));

  // Targets are expressed as a *fraction of what this city can give* and
  // resolved once it has been generated (see resolveEndlessTargets). Deriving
  // them from the rung number alone produced rungs that were unreachable even
  // after eating the entire map.
  const ask = Math.min(0.88, (marathon ? 0.55 : 0.42) + climb * 0.4);
  let target = 1;
  if (kind === 'destruction') target = +Math.min(0.92, (marathon ? 0.55 : 0.38) + climb * 0.4).toFixed(2);
  else if (kind === 'landmarks') target = Math.min(8, 2 + Math.floor(rung / 6));

  const label = marathon
    ? 'Marathon'
    : gauntlet
    ? 'Gauntlet'
    : preset.generated
    ? preset.archetypeLabel
    : preset.subtitle;

  return {
    id: endlessStageId(rung),
    endless: true,
    rung,
    index: rung - 1,
    number: rung,
    chapterId: 'endless',
    chapterName: 'The ladder',
    chapterSubtitle: 'Endless',
    kindLabel: label,
    mapId: preset.id,
    preset,
    starsToUnlock: 0,
    name: preset.generated ? preset.name : preset.name,
    hint: rung === 1 ? 'The ladder never ends. Stars here count like any other.' : '',
    objective: { kind, target, ask, resolved: kind === 'destruction' || kind === 'win' },
    stars: null, // filled in below from the city's own mass
    mods: {
      time,
      ai,
      difficulty: tier,
      density: 1,
      spacing: marathon ? 1.6 : 1,
      stacks: 1 + climb,
      growth: marathon ? 1.1 : 1,
      size: 1,
      start: 20,
    },
  };
}

/**
 * Fill in a ladder rung's real objective target now that its city exists.
 * Score, radius and object targets all key off the city's own mass and count,
 * so "eat 70% of what is here" stays 70% whether the city is a warren or an
 * airport. Called once, from the engine, at match start.
 */
export function resolveEndlessTargets(stage, world) {
  if (!stage || !stage.endless || stage.objective.resolved) return stage;
  const o = stage.objective;
  const mass = world.totalMass || 1;
  if (o.kind === 'score') {
    o.target = Math.max(5000, Math.round((mass * SCORE_PER_MASS * o.ask) / 500) * 500);
  } else if (o.kind === 'objects') {
    o.target = Math.max(60, Math.round(((world.totalObjects || 100) * o.ask) / 10) * 10);
  } else if (o.kind === 'radius') {
    // radius² = mass, and each object adds GROWTH_SCALE × its mass.
    const growth = world.growthRate || 1;
    const reach = Math.sqrt(400 + 0.175 * growth * mass * o.ask);
    o.target = Math.max(60, Math.round(reach / 5) * 5);
  } else if (o.kind === 'landmarks') {
    o.target = Math.max(1, Math.min(o.target, (world.landmarks || []).length));
  }
  o.resolved = true;
  if (!stage.stars) stage.stars = endlessStars(stage, mass);
  return stage;
}

/**
 * Star thresholds for a ladder rung. Handcrafted stages got bot-calibrated
 * numbers; a rung is generated on the spot, so the targets are derived from the
 * one thing we know about the city before it is built — how much mass it holds.
 * SCORE_PER_MASS comes from measuring real runs across all six maps.
 */
const SCORE_PER_MASS = 0.9;

export function endlessStars(stage, totalMass) {
  const reachable = totalMass * SCORE_PER_MASS;
  const climb = 1 - Math.pow(0.965, stage.rung - 1);
  const two = Math.round((reachable * (0.34 + climb * 0.14)) / 1000) * 1000;
  const three = Math.round((reachable * (0.52 + climb * 0.16)) / 1000) * 1000;
  return [Math.max(2000, two), Math.max(4000, three)];
}

/** How far up the ladder the player has reached (highest rung cleared). */
export function ladderProgress() {
  let top = 0;
  for (const key of Object.keys(Save.data.campaign.stages)) {
    if (!key.startsWith('endless-')) continue;
    if ((Save.data.campaign.stages[key].stars || 0) > 0) {
      top = Math.max(top, parseInt(key.slice(8), 10) || 0);
    }
  }
  return top;
}

/** The ladder unlocks once the handcrafted campaign is finished. */
export function ladderUnlocked() {
  return STAGES.every((s) => Save.starsFor(s.id) > 0) || Save.totalStars >= 60;
}

export function nextRung() {
  return ladderProgress() + 1;
}


/** Turns a stage into an engine config. */
export function stageConfig(stage) {
  const preset = stage.preset || MAPS[stage.mapId];
  return {
    mapId: stage.mapId,
    preset,
    mode: 'stage',
    stage,
    // Fixed seed per stage: everyone gets the same city, so the 3-star target
    // means the same thing for everyone.
    seed: 'STAGE-' + stage.id.toUpperCase(),
    aiCount: stage.mods.ai,
    difficulty: stage.mods.difficulty,
    duration: stage.mods.time,
    worldOptions: {
      densityMult: stage.mods.density,
      spacing: stage.mods.spacing,
      stackMult: stage.mods.stacks,
      width: Math.round((preset ? preset.width : 5000) * stage.mods.size),
      height: Math.round((preset ? preset.height : 5000) * stage.mods.size),
      growthRate: (preset ? preset.growthRate : 1) * stage.mods.growth,
      startRadius: stage.mods.start,
    },
  };
}
