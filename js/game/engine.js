/**
 * engine.js — The match: world, voids, physics, scoring, modes.
 *
 * The interesting part is the suction model. Objects are never "collected" on
 * contact. Instead every frame each void asks the spatial grid for the things
 * inside its attraction radius and applies an acceleration to them:
 *
 *   pull      = (1 - distance / attractionRadius)      0 at the rim, 1 at centre
 *   resistance= CLASS_PULL[weight class]               light 1 … massive 0.17
 *   advantage = void radius vs object size             big void, stronger grip
 *   a         = ACCEL · pull^1.6 · resistance · advantage
 *
 * Velocity integrates that, drag bleeds it off, and objects spin as they're
 * dragged. The result: a distant car creeps, then rushes; a warehouse barely
 * shudders until you're big enough to own it.
 */

import { SpatialHash } from '../core/spatial.js';
import { Audio } from '../core/audio.js';
import { Save } from '../core/storage.js';
import {
  objectiveProgress,
  objectiveLabel,
  rateRun,
  stageReward,
  endlessStars,
  resolveEndlessTargets,
} from './levels.js';
import { Input } from '../core/input.js';
import { clamp, formatNumber } from '../core/utils.js';
import { CLASS_PULL } from '../world/objectTypes.js';
import { MAPS } from '../world/maps.js';
import { generateWorld } from '../world/worldgen.js';
import { VoidEntity } from '../entities/void.js';
import { AIController, AI_NAMES, AI_COLORS } from '../entities/ai.js';
import { ParticleSystem } from '../fx/particles.js';
import { Camera } from '../render/camera.js';
import { Renderer } from '../render/renderer.js';
import { equippedSkin, equippedTrail, trackMetric, checkAchievements, coinsForRun } from './progression.js';

const SUCTION_ACCEL = 2100; // px/s² at full pull on a light object
const DRAG = 0.86; // per-frame velocity retention at 60 fps
const COMBO_WINDOW = 1.4; // seconds between bites to keep a combo alive
const GODZILLA_AT = 0.8; // fraction of city mass consumed
const GODZILLA_BONUS_TIME = 20; // seconds added to timed modes

/**
 * AI handicap tiers. `growth` is how much mass a rival keeps from each object
 * relative to the player, `spread` staggers the lobby from strongest to
 * weakest, `skill` drives reaction time and aggression inside the AI brain.
 */
export const DIFFICULTY = {
  relaxed: { id: 'relaxed', name: 'Relaxed', skill: 0.3, growth: 0.5, speed: 0.9, spread: 0.35, startScale: 0.85 },
  normal: { id: 'normal', name: 'Normal', skill: 0.55, growth: 0.72, speed: 0.96, spread: 0.3, startScale: 0.92 },
  hard: { id: 'hard', name: 'Hard', skill: 0.8, growth: 0.9, speed: 1, spread: 0.2, startScale: 0.97 },
  brutal: { id: 'brutal', name: 'Brutal', skill: 1, growth: 1.05, speed: 1.03, spread: 0.1, startScale: 1 },
};

export const MODES = {
  classic: { id: 'classic', name: 'Classic', duration: 120, ai: 0, blurb: 'Two minutes. One city. Highest score.' },
  endless: { id: 'endless', name: 'Endless', duration: 0, ai: 0, blurb: 'No clock. Eat until there is nothing left.' },
  battle: { id: 'battle', name: 'AI battle', duration: 180, ai: 7, blurb: 'Seven rival voids want the same city.' },
  stage: { id: 'stage', name: 'Stage', duration: 120, ai: 0, blurb: 'Campaign stage.' },
};

export class Game {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} hooks  { onHud, onEnd, onGodzilla, onLevelUp, onToast }
   */
  constructor(canvas, hooks = {}) {
    this.canvas = canvas;
    this.hooks = hooks;
    this.camera = new Camera();
    this.particles = new ParticleSystem();
    this.renderer = new Renderer(canvas, this.camera, this.particles);
    this.running = false;
    this.paused = false;
    this.state = null;
    this._raf = null;
    this._last = 0;
    this._acc = 0;
    this._fpsSamples = [];
    this._queryBuf = [];
    window.addEventListener('resize', () => this.renderer.resize());
  }

  // ---- lifecycle --------------------------------------------------------

  /**
   * @param {object} config { mapId, mode, seed, aiCount, customWorld }
   */
  start(config) {
    const mode = MODES[config.mode] || MODES.classic;
    const preset = config.preset || MAPS[config.mapId] || MAPS.suburbs;
    const seed = String(config.seed || Date.now());

    const wo = config.worldOptions || {};
    const world = config.customWorld || generateWorld(preset, seed, wo);
    // Stage modifiers can override pacing without touching the preset itself.
    if (wo.growthRate != null) world.growthRate = wo.growthRate;
    if (wo.startRadius != null) world.startRadius = wo.startRadius;
    const grid = new SpatialHash(world.width, world.height, 240);
    for (const o of world.objects) {
      o.alive = true;
      o.scale = 1;
      o.eating = 0;
      o.pulled = false;
      o.vx = o.vy = 0;
      grid.insert(o);
    }

    const skin = equippedSkin();
    const player = new VoidEntity({
      id: 'player',
      name: 'You',
      isPlayer: true,
      x: world.spawn.x,
      y: world.spawn.y,
      radius: world.startRadius || 20,
      color: skin.color,
      rimColor: skin.rim,
      growthRate: world.growthRate || 1,
    });

    const voids = [player];
    const ais = [];
    const aiCount = config.aiCount != null ? config.aiCount : mode.ai;
    // Difficulty is a handicap, not a personality change. Rivals still target
    // sensibly; they just grow and move slower, so the early game isn't decided
    // before you've found your first car.
    const tier = DIFFICULTY[config.difficulty || Save.settings.difficulty || 'normal'] || DIFFICULTY.normal;
    for (let i = 0; i < aiCount; i++) {
      const spawn = world.aiSpawns[i % world.aiSpawns.length];
      // Rivals are staggered so a lobby has stragglers and front-runners
      // instead of eight identical opponents converging on you at once.
      const spread = aiCount > 1 ? i / (aiCount - 1) : 0;
      const handicap = tier.growth * (1 - spread * tier.spread);
      const e = new VoidEntity({
        id: 'ai' + i,
        name: AI_NAMES[i % AI_NAMES.length],
        x: spawn.x,
        y: spawn.y,
        radius: (world.startRadius || 20) * tier.startScale,
        color: AI_COLORS[i % AI_COLORS.length],
        rimColor: AI_COLORS[i % AI_COLORS.length],
        growthRate: world.growthRate || 1,
        growthMult: handicap,
        speedMult: tier.speed,
      });
      voids.push(e);
      ais.push(new AIController(e, seed + i, tier.skill));
    }

    this.state = {
      world,
      grid,
      player,
      voids,
      ais,
      mode,
      mapId: world.mapId || preset.id,
      seed,
      time: config.duration != null ? config.duration : mode.duration || 0,
      duration: config.duration != null ? config.duration : mode.duration || 0,
      stage: config.stage ? resolveEndlessTargets(config.stage, world) : null,
      landmarksConsumed: 0,
      rivalsEaten: 0,
      stackPieces: 0,
      bestCombo: 1,
      levelUps: 0,
      elapsed: 0,
      consumedMass: 0,
      destruction: 0,
      combo: 1,
      comboTimer: 0,
      godzilla: false,
      godzillaSeconds: 0,
      flash: 0,
      objectsConsumed: 0,
      carsConsumed: 0,
      buildingsConsumed: 0,
      aiEaten: 0,
      largestObject: { name: '—', mass: 0 },
      trailTimer: 0,
      over: false,
      custom: !!config.customWorld,
    };

    this.particles.clear();
    this.renderer.resize();
    this.camera.jumpTo(player.x, player.y, player.radius);
    Audio.init();
    Audio.resume();
    Audio.startAmbient(MAPS[this.state.mapId] ? MAPS[this.state.mapId].ambient : 'midnight');

    this.paused = false;
    this.running = true;
    this._last = performance.now();
    this._acc = 0;
    cancelAnimationFrame(this._raf);
    this._raf = requestAnimationFrame(this._frame);
    return this.state;
  }

  pause() {
    if (!this.running || this.paused) return;
    this.paused = true;
    Audio.stopAmbient();
  }

  resume() {
    if (!this.running || !this.paused) return;
    this.paused = false;
    this._last = performance.now();
    Audio.resume();
    Audio.startAmbient(MAPS[this.state.mapId] ? MAPS[this.state.mapId].ambient : 'midnight');
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this._raf);
    Audio.stopAmbient();
  }

  // ---- main loop --------------------------------------------------------

  _frame = (now) => {
    if (!this.running) return;
    this._raf = requestAnimationFrame(this._frame);
    let dt = (now - this._last) / 1000;
    this._last = now;
    // A tab that was backgrounded reports a huge dt; clamp so nothing tunnels.
    dt = clamp(dt, 0, 0.05);

    if (!this.paused) {
      this.update(dt);
    }
    this.renderer.draw(this.state);

    if (Save.settings.showFps) {
      this._fpsSamples.push(dt);
      if (this._fpsSamples.length > 30) this._fpsSamples.shift();
    }
  };

  update(dt) {
    const s = this.state;
    if (!s || s.over) return;

    s.elapsed += dt;
    if (s.mode.duration) {
      s.time -= dt;
      if (s.time <= 0) {
        s.time = 0;
        this.endMatch('time');
        return;
      }
      if (s.time < 5.99 && Math.floor(s.time + dt) !== Math.floor(s.time)) Audio.tick();
    }

    // Player input
    Input.update();
    s.player.update(dt, Input.vector, s.world);

    // Rivals
    for (const ai of s.ais) {
      if (!ai.entity.alive) continue;
      const dir = ai.update(dt, s.world, s.grid, s.voids);
      ai.entity.update(dt, dir, s.world);
    }

    // Physics + eating for every void
    for (const v of s.voids) {
      if (v.alive) this._suction(v, dt);
    }

    this._voidVsVoid();

    // Combo decay
    s.comboTimer -= dt;
    if (s.comboTimer <= 0 && s.combo > 1) {
      s.combo = 1;
    }

    // Godzilla check
    s.destruction = s.world.totalMass > 0 ? s.consumedMass / s.world.totalMass : 0;
    if (!s.godzilla && s.destruction >= GODZILLA_AT) this._activateGodzilla();
    if (s.godzilla) s.godzillaSeconds += dt;

    this._emitTrail(dt);
    this.particles.update(dt);
    this.camera.follow(s.player, s.world, dt);
    s.flash = Math.max(0, s.flash - dt * 2.2);

    // Endless ends when the city is gone.
    if (s.destruction >= 0.999) {
      this.endMatch('cleared');
      return;
    }

    if (this.hooks.onHud) this.hooks.onHud(this.hudData());
  }

  // ---- suction ----------------------------------------------------------

  _suction(v, dt) {
    const s = this.state;
    const R = v.suctionRadius;
    const list = s.grid.queryCircle(v.x, v.y, R, this._queryBuf);
    const frameDrag = Math.pow(DRAG, dt * 60);

    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (!o.alive || o.locked) continue;

      const dx = v.x - o.x;
      const dy = v.y - o.y;
      const d = Math.hypot(dx, dy) || 0.001;
      if (d > R) continue;

      const canEat = v.canEat(o);

      if (!v.canPull(o)) {
        // Too big to even nudge — it just sits there and blocks the view.
        continue;
      }

      // --- attraction ---
      const pull = clamp(1 - d / R, 0, 1);
      const resistance = CLASS_PULL[o.cls] || 1;
      const advantage = clamp(v.radius / Math.max(6, o.size * 1.6), 0.25, 4.5);
      // Once an object is small enough to swallow, the grip tightens sharply.
      // Without this, "I can technically eat that warehouse" turns into
      // twenty seconds of watching it creep, which reads as a bug, not weight.
      const grip = canEat ? 2.8 : 1;
      const accel =
        SUCTION_ACCEL * Math.pow(pull, 1.6) * resistance * advantage * grip * (v.godzilla ? 2.2 : 1);
      const nx = dx / d;
      const ny = dy / d;
      o.vx += nx * accel * dt;
      o.vy += ny * accel * dt;
      o.vx *= frameDrag;
      o.vy *= frameDrag;
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      // Tumble: lighter things spin faster, and faster the closer they get.
      o.spin += (o.vx * ny - o.vy * nx) * 0.0016 * dt * 60 * resistance;
      o.pulled = true;
      s.grid.update(o);

      if (!canEat) {
        // Can be dragged, can't be swallowed: it piles up on the rim.
        const rim = v.radius + o.size * 0.55;
        if (d < rim) {
          o.x = v.x - nx * rim;
          o.y = v.y - ny * rim;
          const inward = o.vx * nx + o.vy * ny;
          if (inward > 0) {
            o.vx -= nx * inward;
            o.vy -= ny * inward;
          }
          s.grid.update(o);
        }
        continue;
      }

      // --- swallowing ---
      if (d < v.radius * 0.95) {
        // Once past the rim the object falls in: shrink, accelerate, vanish.
        o.eating += dt * (v.godzilla ? 6 : 3.4);
        o.scale = clamp(1 - o.eating, 0, 1);
        o.x += (v.x - o.x) * clamp(dt * 9, 0, 1);
        o.y += (v.y - o.y) * clamp(dt * 9, 0, 1);
        o.spin += dt * 9;
        if (o.eating >= 1 || o.scale <= 0.05) this._consume(v, o);
      }
    }
  }

  _consume(v, o) {
    const s = this.state;
    o.alive = false;
    s.grid.remove(o);
    s.consumedMass += o.mass;
    // Pull the top crate off a stack and the next one down is in play.
    if (o.stackBelow && o.stackBelow.alive) o.stackBelow.locked = false;

    const isPlayer = v === s.player;
    let gained = o.value;

    if (isPlayer) {
      s.comboTimer = COMBO_WINDOW;
      s.combo = clamp(s.combo + 0.1, 1, 3);
      gained = Math.round(o.value * s.combo * (s.godzilla ? 2 : 1));
      s.objectsConsumed++;
      if (o.tags.includes('car')) s.carsConsumed++;
      if (o.tags.includes('building')) s.buildingsConsumed++;
      if (o.isLandmark) s.landmarksConsumed++;
      if (o.stackBelow || o.zBase > 0) s.stackPieces++;
      s.bestCombo = Math.max(s.bestCombo || 1, s.combo);
      if (o.mass > s.largestObject.mass) s.largestObject = { name: o.name, mass: o.mass };
    }

    v.score += gained;
    const levelsGained = v.absorb(o);

    if (isPlayer) {
      const bigness = clamp(o.mass / 1200, 0.08, 1);
      const voidScale = clamp((v.radius - 20) / 400, 0, 1);
      Audio.consume(bigness, voidScale);

      if (o.mass > 600) {
        this.particles.demolition(o.x, o.y, o.color, clamp(o.size / 60, 0.6, 2.4), v);
        this.camera.addTrauma(clamp(o.mass / 9000, 0.06, 0.45));
        if (o.mass > 2500) Audio.crunch();
      } else {
        this.particles.consumeBurst(o.x, o.y, o.color, clamp(o.size / 26, 0.3, 1.4), v);
      }

      // Floating score: only label the notable stuff, or the screen turns to soup.
      if (o.mass > 120 || s.combo > 2.2) {
        const label = o.mass > 600 ? `+${formatNumber(gained)} ${o.name}` : `+${formatNumber(gained)}`;
        this.particles.floatText(o.x, o.y, label, o.mass > 2500 ? '#ffd76a' : '#ffffff', o.mass > 2500 ? 22 : 16);
      }

      if (o.isLandmark) {
        const lm = s.world.landmarks.find((l) => l.id === o.id);
        if (lm) lm.consumed = true;
        this.particles.shockwave(o.x, o.y, { max: o.size * 4, color: '#ffd76a', life: 0.9, width: 6 });
        this.camera.addTrauma(0.6);
        if (this.hooks.onToast) this.hooks.onToast(`${o.name} erased`, 'landmark');
      }

      if (levelsGained > 0) {
        s.levelUps += levelsGained;
        Audio.levelUp(v.level);
        this.particles.shockwave(v.x, v.y, { max: v.radius * 3, color: v.rimColor, life: 0.7, width: 5 });
        if (this.hooks.onLevelUp) this.hooks.onLevelUp(v.level);
        if (v.level % 5 === 0) {
          Audio.milestone();
          if (this.hooks.onToast) this.hooks.onToast(`Level ${v.level}`, 'level');
        }
      }
    } else if (this._onScreen(o.x, o.y)) {
      // Rival meals still make dust if you can see them.
      this.particles.consumeBurst(o.x, o.y, o.color, 0.5, v);
    }
  }

  _onScreen(x, y) {
    const b = this.camera.bounds(80);
    return x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1;
  }

  // ---- void vs void -----------------------------------------------------

  _voidVsVoid() {
    const s = this.state;
    for (let i = 0; i < s.voids.length; i++) {
      const a = s.voids[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < s.voids.length; j++) {
        const b = s.voids[j];
        if (!b.alive) continue;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const big = a.radius >= b.radius ? a : b;
        const small = big === a ? b : a;
        if (d > big.radius * 0.85) continue;
        if (!big.canEatVoid(small)) continue;

        small.alive = false;
        big.absorbVoid(small);
        this.particles.demolition(small.x, small.y, small.rimColor, 2, big);
        this.particles.shockwave(small.x, small.y, { max: small.radius * 5, color: small.rimColor, life: 0.8, width: 6 });

        if (big === s.player) {
          s.aiEaten++;
          s.rivalsEaten++;
          Audio.crunch();
          this.camera.addTrauma(0.5);
          if (this.hooks.onToast) this.hooks.onToast(`${small.name} swallowed`, 'kill');
        } else if (small === s.player) {
          Audio.matchEnd(false);
          this.camera.addTrauma(1);
          this.endMatch('eaten');
          return;
        }
      }
    }
  }

  // ---- Godzilla ---------------------------------------------------------

  _activateGodzilla() {
    const s = this.state;
    s.godzilla = true;
    s.player.godzilla = true;
    s.flash = 1;
    this.camera.addTrauma(1);
    Audio.godzilla();
    Audio.setAmbientIntensity(1);
    this.particles.shockwave(s.player.x, s.player.y, { max: 1400, color: '#ff7a3d', life: 1.4, width: 14 });
    this.particles.shockwave(s.player.x, s.player.y, { max: 900, color: '#ffffff', life: 1, width: 8 });
    if (s.mode.duration) s.time += GODZILLA_BONUS_TIME;
    Save.stats.godzillaActivations++;
    trackMetric('godzilla', 1);
    Save.save();
    if (this.hooks.onGodzilla) this.hooks.onGodzilla();
  }

  // ---- trail ------------------------------------------------------------

  _emitTrail(dt) {
    const s = this.state;
    const trail = equippedTrail();
    if (trail.id === 'none' || !trail.color) return;
    const p = s.player;
    const speed = Math.hypot(p.vx, p.vy);
    if (speed < 30) return;
    s.trailTimer -= dt;
    if (s.trailTimer > 0) return;
    s.trailTimer = 0.03;
    const a = Math.atan2(-p.vy, -p.vx) + (Math.random() - 0.5) * 0.9;
    const r = p.displayRadius * 0.9;
    this.particles.spawn(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, {
      vx: Math.cos(a) * 40,
      vy: Math.sin(a) * 40,
      life: 0.5,
      size: 2 + Math.random() * 3 + p.displayRadius * 0.02,
      color: trail.color,
      drag: 0.9,
    });
  }

  // ---- HUD + results ----------------------------------------------------

  hudData() {
    const s = this.state;
    const board = s.voids
      .map((v) => ({ name: v.name, score: v.score, alive: v.alive, isPlayer: v === s.player, level: v.level }))
      .sort((a, b) => b.score - a.score);
    let fps = 0;
    if (this._fpsSamples.length) {
      const avg = this._fpsSamples.reduce((a, b) => a + b, 0) / this._fpsSamples.length;
      fps = Math.round(1 / avg);
    }
    return {
      score: s.player.score,
      level: s.player.level,
      progress: s.player.levelProgress(),
      radius: s.player.radius,
      time: s.time,
      timed: !!s.mode.duration,
      combo: s.combo,
      destruction: s.destruction,
      godzilla: s.godzilla,
      board,
      objects: s.objectsConsumed,
      fps,
      objective: s.stage
        ? Object.assign({ label: objectiveLabel(s.stage) }, objectiveProgress(s.stage, s))
        : null,
    };
  }

  /** @param {'time'|'cleared'|'eaten'|'quit'} reason */
  endMatch(reason) {
    const s = this.state;
    if (!s || s.over) return null;
    s.over = true;
    this.running = false;
    cancelAnimationFrame(this._raf);
    Audio.stopAmbient();

    const board = s.voids
      .slice()
      .sort((a, b) => b.score - a.score)
      .map((v, i) => ({ rank: i + 1, name: v.name, score: v.score, level: v.level, isPlayer: v === s.player, alive: v.alive }));
    const rank = board.findIndex((b) => b.isPlayer) + 1;
    const won = s.voids.length > 1 ? rank === 1 && s.player.alive : s.destruction >= GODZILLA_AT;

    const run = {
      reason,
      score: s.player.score,
      level: s.player.level,
      radius: Math.round(s.player.radius),
      destruction: s.destruction,
      objects: s.objectsConsumed,
      largestObject: s.largestObject,
      godzillaSeconds: s.godzillaSeconds,
      duration: s.elapsed,
      rank,
      board,
      won,
      seed: s.seed,
      mapId: s.mapId,
      mode: s.mode.id,
      custom: s.custom,
      alive: s.player.alive,
      stage: s.stage ? { id: s.stage.id, name: s.stage.name, objective: objectiveLabel(s.stage) } : null,
    };
    run.coins = coinsForRun(run);

    // Campaign scoring. Stage coins are paid once per star, so replaying a
    // cleared stage for fun doesn't print money — only beating your rating does.
    if (s.stage) {
      if (s.stage.endless && !s.stage.stars) s.stage.stars = endlessStars(s.stage, s.world.totalMass);
      const rated = rateRun(s.stage, run, s);
      const saved = Save.recordStage(s.stage.id, rated.stars, run.score);
      run.stars = rated.stars;
      run.objectiveMet = rated.met;
      run.previousStars = saved.previousStars;
      run.newBest = rated.stars > saved.previousStars;
      run.stageCoins = stageReward(s.stage, rated.stars, saved.previousStars);
      if (rated.met && saved.previousStars === 0) Save.stats.stagesCleared = (Save.stats.stagesCleared || 0) + 1;
      if (rated.stars === 3 && saved.previousStars < 3) Save.stats.threeStars = (Save.stats.threeStars || 0) + 1;
      if (s.stage.endless && rated.met) Save.stats.bestRung = Math.max(Save.stats.bestRung || 0, s.stage.rung);
      run.coins = Math.round(run.coins * 0.5) + run.stageCoins;
      run.nextStars = s.stage.stars;
    }

    // ---- persist ----
    const st = Save.stats;
    st.totalScore += run.score;
    st.objectsConsumed += run.objects;
    st.matchesPlayed += 1;
    if (won) st.matchesWon += 1;
    st.largestRadius = Math.max(st.largestRadius, run.radius);
    st.carsConsumed += s.carsConsumed;
    st.buildingsConsumed += s.buildingsConsumed;
    st.aiVoidsConsumed += s.aiEaten;
    st.landmarksConsumed = (st.landmarksConsumed || 0) + s.landmarksConsumed;
    st.stackPieces = (st.stackPieces || 0) + s.stackPieces;
    st.bestCombo = Math.max(st.bestCombo || 1, s.bestCombo || 1);
    st.bestLevel = Math.max(st.bestLevel || 0, run.level);
    st.levelUps = (st.levelUps || 0) + (s.levelUps || 0);
    st.bestSingleObject = Math.max(st.bestSingleObject || 0, Math.round(run.largestObject.mass));
    if (run.custom) st.customMapsPlayed = (st.customMapsPlayed || 0) + 1;
    else {
      st.mapsPlayed = st.mapsPlayed || {};
      st.mapsPlayed[run.mapId] = (st.mapsPlayed[run.mapId] || 0) + 1;
    }
    st.godzillaSeconds += Math.round(run.godzillaSeconds);
    st.bestDestruction = Math.max(st.bestDestruction, run.destruction);
    st.playSeconds += Math.round(run.duration);
    if (run.largestObject.mass > st.largestObjectMass) {
      st.largestObjectMass = Math.round(run.largestObject.mass);
      st.largestObjectName = run.largestObject.name;
    }
    if (run.destruction >= 0.8) st.citiesCleared += 1;

    Save.addCoins(run.coins);

    // Custom maps and campaign stages get their own boards so they can't
    // pollute the freeplay ones — stages are rated in stars, not high scores.
    const boardKey = run.custom ? 'custom' : s.stage ? (s.stage.endless ? 'ladder' : 'campaign') : run.mapId;
    run.highScoreRank = Save.recordScore(boardKey, {
      score: run.score,
      mode: run.mode,
      seed: run.seed,
      level: run.level,
      date: new Date().toISOString(),
    });

    trackMetric('objects', run.objects);
    trackMetric('cars', s.carsConsumed);
    trackMetric('buildings', s.buildingsConsumed);
    trackMetric('aiEaten', s.aiEaten);
    trackMetric('matches', 1);
    trackMetric('matchScore', run.score);
    trackMetric('totalScore', run.score);
    trackMetric('level', run.level);
    trackMetric('radius', run.radius);
    if (run.destruction >= 0.8) trackMetric('cityCleared', 1);

    run.achievements = checkAchievements();
    Save.save(true);

    Audio.matchEnd(won);
    if (this.hooks.onEnd) this.hooks.onEnd(run);
    return run;
  }
}
