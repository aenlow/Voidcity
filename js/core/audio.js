/**
 * audio.js — All sound is synthesised at runtime with the Web Audio API.
 *
 * Why no .mp3/.wav files? Because the whole game then weighs a few hundred KB,
 * installs instantly, works offline with zero extra cache entries, and every
 * effect can react to gameplay (a bigger void swallows things at a lower pitch).
 * /assets/sounds/ is kept in the tree for anyone who wants to swap in samples —
 * see loadSample() at the bottom.
 */

import { Save } from './storage.js';
import { clamp } from './utils.js';

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfxBus = null;
    this.musicBus = null;
    this.ambient = null;
    this.ready = false;
    this.samples = new Map();
  }

  /** Must be called from a user gesture — browsers block audio otherwise. */
  init() {
    if (this.ready) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.sfxBus = this.ctx.createGain();
    this.musicBus = this.ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus.connect(this.master);
    this.master.connect(this.ctx.destination);
    this.ready = true;
    this.applySettings();
  }

  /** Safari suspends the context when the tab is backgrounded. */
  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  applySettings() {
    if (!this.ready) return;
    const s = Save.settings;
    this.master.gain.value = s.muted ? 0 : 1;
    this.sfxBus.gain.value = clamp(s.sfxVolume, 0, 1);
    this.musicBus.gain.value = clamp(s.musicVolume, 0, 1);
  }

  get now() {
    return this.ctx.currentTime;
  }

  // ---- primitive voices -------------------------------------------------

  _tone({ freq = 220, endFreq = null, type = 'sine', dur = 0.2, gain = 0.3, delay = 0, bus = null }) {
    if (!this.ready) return;
    const t = this.now + delay;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t + dur);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + Math.min(0.02, dur * 0.2));
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(env);
    env.connect(bus || this.sfxBus);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  _noise({ dur = 0.3, gain = 0.3, filter = 900, q = 1, sweepTo = null, delay = 0, type = 'lowpass' }) {
    if (!this.ready) return;
    const t = this.now + delay;
    const frames = Math.floor(this.ctx.sampleRate * dur);
    const buffer = this.ctx.createBuffer(1, frames, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const biq = this.ctx.createBiquadFilter();
    biq.type = type;
    biq.frequency.setValueAtTime(filter, t);
    biq.Q.value = q;
    if (sweepTo) biq.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t + dur);
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(biq);
    biq.connect(env);
    env.connect(this.sfxBus);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  // ---- game sounds ------------------------------------------------------

  /**
   * Swallowing something. Pitch falls as the void grows, so late game sounds
   * cavernous while the first traffic cone goes down with a little pop.
   * @param {number} sizeRatio 0 (tiny snack) .. 1 (skyscraper)
   * @param {number} voidScale 0 (small void) .. 1 (huge void)
   */
  consume(sizeRatio = 0, voidScale = 0) {
    if (!this.ready) return;
    const base = 420 * Math.pow(0.55, voidScale) * (1 - sizeRatio * 0.4);
    this._tone({ freq: base, endFreq: base * 0.35, type: 'triangle', dur: 0.16 + sizeRatio * 0.25, gain: 0.16 + sizeRatio * 0.2 });
    this._noise({ dur: 0.12 + sizeRatio * 0.3, gain: 0.08 + sizeRatio * 0.18, filter: 1800 - voidScale * 900, sweepTo: 140 });
  }

  /** Something big enough to shake the street. */
  crunch() {
    this._noise({ dur: 0.45, gain: 0.3, filter: 700, sweepTo: 90 });
    this._tone({ freq: 90, endFreq: 38, type: 'square', dur: 0.4, gain: 0.22 });
  }

  levelUp(level = 1) {
    const root = 300 + level * 14;
    [0, 4, 7].forEach((semi, i) => {
      this._tone({
        freq: root * Math.pow(2, semi / 12),
        type: 'triangle',
        dur: 0.35,
        gain: 0.14,
        delay: i * 0.055,
      });
    });
  }

  milestone() {
    [0, 5, 9, 12].forEach((semi, i) =>
      this._tone({ freq: 330 * Math.pow(2, semi / 12), type: 'sine', dur: 0.5, gain: 0.12, delay: i * 0.07 })
    );
  }

  godzilla() {
    if (!this.ready) return;
    // Rising siren, then an impact.
    this._tone({ freq: 70, endFreq: 900, type: 'sawtooth', dur: 1.1, gain: 0.22 });
    this._tone({ freq: 35, endFreq: 450, type: 'square', dur: 1.1, gain: 0.14 });
    this._noise({ dur: 1.2, gain: 0.16, filter: 300, sweepTo: 4000, type: 'bandpass', q: 2 });
    this._tone({ freq: 120, endFreq: 30, type: 'sawtooth', dur: 1.4, gain: 0.3, delay: 1.05 });
    this._noise({ dur: 1.6, gain: 0.3, filter: 2200, sweepTo: 60, delay: 1.05 });
  }

  click() {
    this._tone({ freq: 640, endFreq: 900, type: 'square', dur: 0.05, gain: 0.07 });
  }

  back() {
    this._tone({ freq: 420, endFreq: 260, type: 'square', dur: 0.07, gain: 0.07 });
  }

  denied() {
    this._tone({ freq: 190, endFreq: 120, type: 'sawtooth', dur: 0.18, gain: 0.1 });
  }

  reward() {
    [523, 659, 784, 1046].forEach((f, i) =>
      this._tone({ freq: f, type: 'triangle', dur: 0.3, gain: 0.12, delay: i * 0.08 })
    );
  }

  tick() {
    this._tone({ freq: 880, type: 'sine', dur: 0.07, gain: 0.09 });
  }

  matchEnd(won) {
    if (won) {
      [392, 523, 659, 784].forEach((f, i) =>
        this._tone({ freq: f, type: 'triangle', dur: 0.5, gain: 0.14, delay: i * 0.12 })
      );
    } else {
      [392, 330, 262].forEach((f, i) =>
        this._tone({ freq: f, type: 'triangle', dur: 0.55, gain: 0.12, delay: i * 0.16 })
      );
    }
  }

  // ---- ambience ---------------------------------------------------------

  /** A slow city drone: two detuned saws under a lowpass, plus filtered noise. */
  startAmbient(theme = 'midnight') {
    if (!this.ready || this.ambient) return;
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(this.musicBus);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = theme === 'industrial' ? 420 : 620;
    filter.Q.value = 0.8;
    filter.connect(out);

    const roots = { midnight: 55, dusk: 62, industrial: 49 };
    const root = roots[theme] || 55;
    const oscs = [];
    [1, 1.005, 1.5].forEach((mult, i) => {
      const o = ctx.createOscillator();
      o.type = i === 2 ? 'triangle' : 'sawtooth';
      o.frequency.value = root * mult;
      const g = ctx.createGain();
      g.gain.value = i === 2 ? 0.05 : 0.12;
      o.connect(g);
      g.connect(filter);
      o.start();
      oscs.push(o);
    });

    // Wind / distant traffic bed.
    const frames = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, frames, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < frames; i++) {
      // Brown-ish noise reads as "city far away" rather than "static".
      last = (last + (Math.random() * 2 - 1) * 0.02) * 0.996;
      d[i] = last * 3;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    const nGain = ctx.createGain();
    nGain.gain.value = 0.5;
    noise.connect(nGain);
    nGain.connect(filter);
    noise.start();

    // Slow filter sweep so the drone never sits still.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 160;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();

    out.gain.setTargetAtTime(0.5, this.now, 2);
    this.ambient = { out, oscs, noise, lfo, filter };
  }

  /** Godzilla mode pushes the drone up a fifth and opens the filter. */
  setAmbientIntensity(level) {
    if (!this.ambient) return;
    const f = 620 + level * 900;
    this.ambient.filter.frequency.setTargetAtTime(f, this.now, 0.6);
  }

  stopAmbient() {
    if (!this.ambient) return;
    const a = this.ambient;
    this.ambient = null;
    a.out.gain.setTargetAtTime(0.0001, this.now, 0.4);
    const stopAt = this.now + 1.4;
    a.oscs.forEach((o) => o.stop(stopAt));
    a.noise.stop(stopAt);
    a.lfo.stop(stopAt);
  }

  /**
   * Optional: drop real audio files into /assets/sounds/ and call
   * Audio.loadSample('boom', 'assets/sounds/boom.mp3') at boot, then
   * Audio.playSample('boom'). Nothing in the shipped game needs it.
   */
  async loadSample(name, url) {
    if (!this.ready) return;
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    this.samples.set(name, await this.ctx.decodeAudioData(buf));
  }

  playSample(name, gain = 1) {
    const buf = this.samples.get(name);
    if (!buf || !this.ready) return;
    const src = this.ctx.createBufferSource();
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.buffer = buf;
    src.connect(g);
    g.connect(this.sfxBus);
    src.start();
  }
}

export const Audio = new AudioEngine();
