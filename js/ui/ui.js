/**
 * ui.js — Every screen, every button, and the in-match HUD.
 *
 * The DOM is the menu system; canvas is only ever the city. Screens are plain
 * <section> elements toggled with a class, which keeps navigation instant and
 * costs nothing when a match is running.
 */

import { Save } from '../core/storage.js';
import { Audio } from '../core/audio.js';
import { Input } from '../core/input.js';
import { formatNumber, formatTime, msUntilMidnight, clamp } from '../core/utils.js';
import { randomSeedString } from '../core/rng.js';
import { MAPS, MAP_IDS } from '../world/maps.js';
import { buildCustomWorld, validateCustomMap, exportWorld, downloadJSON } from '../world/customMap.js';
import { Game, MODES } from '../game/engine.js';
import {
  COSMETICS,
  cosmetic,
  ACHIEVEMENTS,
  achievementProgress,
  ensureChallenges,
  claimChallenge,
  claimableCount,
} from '../game/progression.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor() {
    this.game = null;
    this.stack = [];
    this.current = 'menu';
    this.shopTab = 'skin';
    this.scoreTab = 'suburbs';
    this.lastRun = null;
    this.lastWorld = null;
    this.customMap = null; // parsed JSON of an imported city
    this.deferredInstall = null;
    this.selection = {
      mapId: Save.data.lastMap || 'suburbs',
      mode: Save.data.lastMode || 'classic',
      seed: '',
    };
  }

  // =====================================================================
  // boot
  // =====================================================================

  init() {
    this.canvas = $('game-canvas');
    this.game = new Game(this.canvas, {
      onHud: (d) => this.updateHud(d),
      onEnd: (run) => this.showResult(run),
      onGodzilla: () => this.showGodzilla(),
      onToast: (text, kind) => this.toast(text, kind),
    });

    Input.attach($('screen-game'), $('joystick'));
    Input.onPause = () => this.togglePause();

    this.applyTheme();
    this.bindGlobal();
    this.bindMenu();
    this.bindMaps();
    this.bindShop();
    this.bindSettings();
    this.bindGame();
    this.readUrlSeed();
    this.refreshMenu();
    this.installPrompt();

    // Keep the ambience honest when the player tabs away mid-match.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.current === 'game' && this.game.running && !this.game.paused) {
        this.togglePause();
      }
    });
  }

  /** ?seed=VOIDCITY&map=downtown&mode=battle — how shared cities arrive. */
  readUrlSeed() {
    const params = new URLSearchParams(location.search);
    const seed = params.get('seed');
    const map = params.get('map');
    const mode = params.get('mode');
    if (seed) this.selection.seed = seed.toUpperCase();
    if (map && MAPS[map]) this.selection.mapId = map;
    if (mode && MODES[mode]) this.selection.mode = mode;
    if (seed) this.toast(`Seed ${this.selection.seed} loaded`);
  }

  // =====================================================================
  // navigation
  // =====================================================================

  go(name, push = true) {
    const next = $('screen-' + name);
    if (!next) return;
    const cur = document.querySelector('.screen.is-active');
    if (cur === next) return;
    if (cur) cur.classList.remove('is-active');
    next.classList.add('is-active');
    if (push && this.current !== name) this.stack.push(this.current);
    this.current = name;

    if (name === 'maps') this.renderMaps();
    if (name === 'cosmetics') this.renderShop();
    if (name === 'stats') this.renderStats();
    if (name === 'challenges') this.renderChallenges();
    if (name === 'settings') this.renderSettings();
    if (name === 'menu') this.refreshMenu();
  }

  back() {
    Audio.back();
    const prev = this.stack.pop() || 'menu';
    this.go(prev, false);
  }

  bindGlobal() {
    document.addEventListener('click', (e) => {
      const goto = e.target.closest('[data-goto]');
      if (goto) {
        Audio.init();
        Audio.click();
        this.go(goto.dataset.goto);
        return;
      }
      if (e.target.closest('[data-back]')) this.back();
    });
  }

  toast(text, kind = '') {
    if (this.current === 'game' && this.game.running) {
      const host = $('toasts');
      const el = document.createElement('div');
      el.className = 'toast ' + kind;
      el.textContent = text;
      host.appendChild(el);
      setTimeout(() => el.remove(), 2200);
    } else {
      const el = $('global-toast');
      el.textContent = text;
      el.hidden = false;
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => (el.hidden = true), 2200);
    }
  }

  applyTheme() {
    const theme = cosmetic('theme', Save.data.equipped.theme);
    document.documentElement.style.setProperty('--void', theme.accent);
    document.documentElement.style.setProperty('--void-dim', theme.accent + '99');
  }

  // =====================================================================
  // menu
  // =====================================================================

  bindMenu() {
    $('btn-play').addEventListener('click', () => this.startGame());
    $('btn-play-2').addEventListener('click', () => this.startGame());
  }

  refreshMenu() {
    const map = MAPS[this.selection.mapId];
    const mode = MODES[this.selection.mode];
    const label = this.customMap ? this.customMap.name : map.name;
    const meta = `${label} · ${mode.name}${this.selection.seed ? ' · ' + this.selection.seed : ''}`;
    $('play-meta').textContent = meta;
    $('play-meta-2').textContent = meta;
    $('menu-coins').textContent = formatNumber(Save.data.coins);

    const claims = claimableCount();
    const badge = $('challenge-badge');
    badge.hidden = claims === 0;
    badge.textContent = claims;

    const best = Save.bestScore(this.selection.mapId);
    $('tile-map-sub').textContent = best ? `Best here: ${formatNumber(best)}` : 'Pick a map, mode and seed';
    $('tile-challenge-sub').textContent = claims ? `${claims} ready to claim` : 'Daily and weekly goals';
    $('tile-shop-sub').textContent = `${Save.data.unlocks.skin.length} of ${COSMETICS.skin.length} skins owned`;
    const ap = achievementProgress();
    $('tile-stats-sub').textContent = `${ap.done}/${ap.total} achievements`;
  }

  // =====================================================================
  // map / mode / seed screen
  // =====================================================================

  bindMaps() {
    $('btn-seed-random').addEventListener('click', () => {
      Audio.click();
      this.selection.seed = randomSeedString();
      $('seed-input').value = this.selection.seed;
      this.refreshMenu();
    });

    $('seed-input').addEventListener('input', (e) => {
      this.selection.seed = e.target.value.toUpperCase().trim();
      this.refreshMenu();
    });

    $('btn-seed-copy').addEventListener('click', () => {
      const seed = this.selection.seed || randomSeedString();
      this.selection.seed = seed;
      $('seed-input').value = seed;
      this.copy(seed, `Seed ${seed} copied`);
    });

    $('btn-seed-save').addEventListener('click', () => {
      const seed = this.selection.seed || randomSeedString();
      this.selection.seed = seed;
      $('seed-input').value = seed;
      const list = Save.data.savedSeeds;
      if (list.some((s) => s.seed === seed && s.map === this.selection.mapId)) {
        this.toast('Already saved');
        return;
      }
      list.unshift({ seed, map: this.selection.mapId, date: new Date().toISOString() });
      list.length = Math.min(list.length, 12);
      Save.save(true);
      Audio.reward();
      this.renderSeeds();
    });

    $('btn-seed-share').addEventListener('click', () => this.shareSeed());

    $('btn-map-import').addEventListener('click', () => $('map-file').click());
    $('map-file').addEventListener('change', (e) => this.importMapFile(e.target.files[0]));
    $('btn-map-sample').addEventListener('click', () => this.loadSampleMap());
    $('btn-map-export').addEventListener('click', () => this.exportLastCity());
  }

  renderMaps() {
    const list = $('map-list');
    list.innerHTML = '';
    for (const id of MAP_IDS) {
      const m = MAPS[id];
      const best = Save.bestScore(id);
      const card = document.createElement('button');
      card.className = 'map-card' + (id === this.selection.mapId && !this.customMap ? ' is-on' : '');
      card.innerHTML = `
        <span class="map-swatch" style="background:
          linear-gradient(135deg, ${m.palette.block} 0 38%, ${m.palette.road} 38% 50%, ${m.palette.grass} 50% 78%, ${m.palette.accent} 78%)"></span>
        <span>
          <span class="map-name">${m.name}</span>
          <span class="map-blurb">${m.blurb}</span>
          <span class="map-stat">${best ? 'Best ' + formatNumber(best) : m.pacing}</span>
        </span>`;
      card.addEventListener('click', () => {
        Audio.click();
        this.selection.mapId = id;
        this.customMap = null;
        Save.data.lastMap = id;
        Save.save();
        this.renderMaps();
        this.refreshMenu();
      });
      list.appendChild(card);
    }

    if (this.customMap) {
      const card = document.createElement('div');
      card.className = 'map-card is-on';
      card.innerHTML = `
        <span class="map-swatch" style="background: linear-gradient(135deg, #2a2540, #7a6adf)"></span>
        <span>
          <span class="map-name">${this.customMap.name}</span>
          <span class="map-blurb">Imported city · ${formatNumber(
            (this.customMap.objects || []).length + (this.customMap.landmarks || []).length
          )} objects</span>
          <span class="map-stat">Tap a city above to go back to the built-in maps</span>
        </span>`;
      list.prepend(card);
    }

    // Modes
    const row = $('mode-row');
    row.innerHTML = '';
    for (const id of Object.keys(MODES)) {
      const chip = document.createElement('button');
      chip.className = 'chip' + (id === this.selection.mode ? ' is-on' : '');
      chip.textContent = MODES[id].name;
      chip.addEventListener('click', () => {
        Audio.click();
        this.selection.mode = id;
        Save.data.lastMode = id;
        Save.save();
        this.renderMaps();
        this.refreshMenu();
      });
      row.appendChild(chip);
    }
    $('mode-blurb').textContent = MODES[this.selection.mode].blurb;

    $('seed-input').value = this.selection.seed;
    this.renderSeeds();
  }

  renderSeeds() {
    const host = $('saved-seeds');
    host.innerHTML = '';
    for (const entry of Save.data.savedSeeds) {
      const row = document.createElement('div');
      row.className = 'seed-item';
      const mapName = MAPS[entry.map] ? MAPS[entry.map].name : entry.map;
      row.innerHTML = `<b>${entry.seed}</b><span>${mapName}</span>`;
      const use = document.createElement('button');
      use.textContent = 'Use';
      use.addEventListener('click', () => {
        this.selection.seed = entry.seed;
        this.selection.mapId = MAPS[entry.map] ? entry.map : this.selection.mapId;
        this.customMap = null;
        $('seed-input').value = entry.seed;
        Audio.click();
        this.renderMaps();
        this.refreshMenu();
      });
      const del = document.createElement('button');
      del.className = 'remove';
      del.textContent = 'Remove';
      del.addEventListener('click', () => {
        Save.data.savedSeeds = Save.data.savedSeeds.filter((s) => s !== entry);
        Save.save(true);
        this.renderSeeds();
      });
      row.append(use, del);
      host.appendChild(row);
    }
  }

  shareSeed() {
    const seed = this.selection.seed || randomSeedString();
    this.selection.seed = seed;
    $('seed-input').value = seed;
    const url = `${location.origin}${location.pathname}?seed=${encodeURIComponent(seed)}&map=${this.selection.mapId}&mode=${this.selection.mode}`;
    if (navigator.share) {
      navigator.share({ title: 'Void City', text: `Try this city: ${seed}`, url }).catch(() => {});
    } else {
      this.copy(url, 'Link copied');
    }
  }

  copy(text, message) {
    const done = () => this.toast(message);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, () => this.fallbackCopy(text, done));
    } else {
      this.fallbackCopy(text, done);
    }
  }

  fallbackCopy(text, done) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      done();
    } catch (err) {
      this.toast('Copy failed — select it manually');
    }
    ta.remove();
  }

  // ---- custom maps ------------------------------------------------------

  async importMapFile(file) {
    if (!file) return;
    try {
      const text = await file.text();
      this.acceptCustomMap(JSON.parse(text));
    } catch (err) {
      this.showMapNotice(['That file is not valid JSON.'], [], false);
    }
  }

  async loadSampleMap() {
    try {
      const res = await fetch('maps/sample-plaza.json');
      if (!res.ok) throw new Error('not found');
      this.acceptCustomMap(await res.json());
    } catch (err) {
      this.showMapNotice(['Could not load maps/sample-plaza.json.'], [], false);
    }
  }

  acceptCustomMap(data) {
    const check = validateCustomMap(data);
    if (!check.ok) {
      this.showMapNotice(check.errors, check.warnings, false);
      Audio.denied();
      return;
    }
    this.customMap = data;
    this.showMapNotice([], check.warnings, true, data.name);
    Audio.reward();
    this.renderMaps();
    this.refreshMenu();
  }

  showMapNotice(errors, warnings, ok, name) {
    const el = $('map-notice');
    el.hidden = false;
    el.className = 'notice ' + (ok ? 'good' : 'bad');
    const parts = [];
    if (ok) parts.push(`<b>${name}</b> loaded. Press Play to drop in.`);
    if (errors.length) parts.push(`This map can't be loaded:<ul>${errors.map((e) => `<li>${e}</li>`).join('')}</ul>`);
    if (warnings.length) parts.push(`Heads up:<ul>${warnings.map((w) => `<li>${w}</li>`).join('')}</ul>`);
    el.innerHTML = parts.join('');
  }

  exportLastCity() {
    if (!this.lastWorld) {
      this.toast('Play a city first, then export it');
      return;
    }
    const data = exportWorld(this.lastWorld, `${this.lastWorld.name} ${this.lastWorld.seed}`);
    downloadJSON(data, `voidcity-${this.lastWorld.mapId}-${this.lastWorld.seed}.json`);
    this.toast('City exported');
  }

  // =====================================================================
  // shop
  // =====================================================================

  bindShop() {
    $('shop-tabs').addEventListener('click', (e) => {
      const btn = e.target.closest('.chip');
      if (!btn) return;
      Audio.click();
      this.shopTab = btn.dataset.kind;
      this.renderShop();
    });
  }

  renderShop() {
    $('shop-coins').textContent = formatNumber(Save.data.coins);
    for (const chip of $('shop-tabs').children) {
      chip.classList.toggle('is-on', chip.dataset.kind === this.shopTab);
    }

    const kind = this.shopTab;
    const grid = $('shop-grid');
    grid.innerHTML = '';
    for (const item of COSMETICS[kind]) {
      const owned = Save.isUnlocked(kind, item.id);
      const equipped = Save.data.equipped[kind] === item.id;
      const el = document.createElement('button');
      el.className = 'shop-item' + (equipped ? ' is-on' : '') + (owned ? '' : ' is-locked');

      const color = item.color || item.accent || '#3a3a4a';
      const rim = item.rim || item.accent || '#8f7bff';
      const priceLabel = owned
        ? equipped
          ? 'Equipped'
          : 'Tap to equip'
        : item.achievement
        ? 'Achievement'
        : formatNumber(item.cost);

      el.innerHTML = `
        <span class="shop-preview" style="--p-color:${color};--p-rim:${rim}"></span>
        <span class="shop-name">${item.name}</span>
        <span class="shop-note">${item.note || (item.achievement ? this.achievementName(item.achievement) : '&nbsp;')}</span>
        <span class="shop-price ${owned ? 'owned' : ''}">${priceLabel}</span>`;

      el.addEventListener('click', () => this.shopAction(kind, item, owned));
      grid.appendChild(el);
    }
  }

  achievementName(id) {
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    return a ? `Unlock: ${a.desc}` : 'Locked';
  }

  shopAction(kind, item, owned) {
    if (owned) {
      Save.equip(kind, item.id);
      Audio.click();
      if (kind === 'theme') this.applyTheme();
      this.renderShop();
      return;
    }
    if (item.achievement) {
      Audio.denied();
      this.toast(this.achievementName(item.achievement));
      return;
    }
    if (!Save.spendCoins(item.cost)) {
      Audio.denied();
      this.toast(`Need ${formatNumber(item.cost - Save.data.coins)} more coins`);
      return;
    }
    Save.unlock(kind, item.id);
    Save.equip(kind, item.id);
    if (kind === 'theme') this.applyTheme();
    Audio.reward();
    this.toast(`${item.name} unlocked`);
    this.renderShop();
  }

  // =====================================================================
  // stats
  // =====================================================================

  renderStats() {
    const s = Save.stats;
    const rows = [
      ['Total score', formatNumber(s.totalScore)],
      ['Objects consumed', formatNumber(s.objectsConsumed)],
      ['Matches played', formatNumber(s.matchesPlayed)],
      ['Matches won', formatNumber(s.matchesWon)],
      ['Largest void', 'r' + formatNumber(s.largestRadius)],
      ['Biggest meal', s.largestObjectName],
      ['Godzilla activations', formatNumber(s.godzillaActivations)],
      ['Time in Godzilla', formatTime(s.godzillaSeconds)],
      ['Best destruction', Math.round(s.bestDestruction * 100) + '%'],
      ['Rival voids eaten', formatNumber(s.aiVoidsConsumed)],
      ['Vehicles eaten', formatNumber(s.carsConsumed)],
      ['Time played', formatTime(s.playSeconds)],
    ];
    $('stat-grid').innerHTML = rows
      .map((r) => `<div class="stat"><div class="stat-value">${r[1]}</div><div class="stat-label">${r[0]}</div></div>`)
      .join('');

    // High score tabs (built-in maps plus custom, if any runs exist)
    const tabs = $('score-tabs');
    const ids = MAP_IDS.concat(Save.data.highScores.custom ? ['custom'] : []);
    if (!ids.includes(this.scoreTab)) this.scoreTab = ids[0];
    tabs.innerHTML = '';
    for (const id of ids) {
      const chip = document.createElement('button');
      chip.className = 'chip' + (id === this.scoreTab ? ' is-on' : '');
      chip.textContent = id === 'custom' ? 'Custom' : MAPS[id].subtitle;
      chip.addEventListener('click', () => {
        this.scoreTab = id;
        Audio.click();
        this.renderStats();
      });
      tabs.appendChild(chip);
    }

    const table = Save.data.highScores[this.scoreTab] || [];
    $('score-body').innerHTML = table.length
      ? table
          .map(
            (e, i) => `<tr>
              <td>${i + 1}</td>
              <td>${MODES[e.mode] ? MODES[e.mode].name : e.mode}
                <div class="meta">${e.seed} · level ${e.level} · ${new Date(e.date).toLocaleDateString()}</div>
              </td>
              <td>${formatNumber(e.score)}</td>
            </tr>`
          )
          .join('')
      : '<tr><td colspan="3" class="meta">No runs here yet. The board fills as you play.</td></tr>';

    const ap = achievementProgress();
    $('ach-progress').textContent = `${ap.done} of ${ap.total}`;
    $('achievement-list').innerHTML = ACHIEVEMENTS.map((a) => {
      const done = !!Save.data.achievements[a.id];
      return `<div class="achievement ${done ? '' : 'is-locked'}">
        <span class="ach-dot"></span>
        <span><span class="ach-name">${a.name}</span><br><span class="ach-desc">${a.desc}</span></span>
        <span class="ach-reward">${done ? 'Claimed' : '+' + a.reward}</span>
      </div>`;
    }).join('');
  }

  // =====================================================================
  // challenges
  // =====================================================================

  renderChallenges() {
    const c = ensureChallenges();
    $('challenge-coins').textContent = formatNumber(Save.data.coins);
    const hours = Math.floor(msUntilMidnight() / 3600000);
    const mins = Math.floor((msUntilMidnight() % 3600000) / 60000);
    $('daily-reset').textContent = `resets in ${hours}h ${mins}m`;

    const build = (host, set) => {
      host.innerHTML = '';
      for (const item of set.items) {
        const done = item.progress >= item.goal;
        const el = document.createElement('div');
        el.className = 'challenge' + (done ? ' is-done' : '');
        el.innerHTML = `
          <div class="challenge-top">
            <span class="challenge-text">${item.text}</span>
            <span class="challenge-reward">+${item.reward}</span>
          </div>
          <div class="progress"><i style="width:${Math.round((item.progress / item.goal) * 100)}%"></i></div>
          <div class="challenge-foot">
            <span>${formatNumber(item.progress)} / ${formatNumber(item.goal)}</span>
          </div>`;
        const btn = document.createElement('button');
        btn.className = 'claim-btn';
        btn.textContent = item.claimed ? 'Claimed' : done ? 'Claim' : 'In progress';
        btn.disabled = item.claimed || !done;
        btn.addEventListener('click', () => {
          const claimed = claimChallenge(item.id);
          if (claimed) {
            Audio.reward();
            this.toast(`+${claimed.reward} coins`);
            this.renderChallenges();
          }
        });
        el.querySelector('.challenge-foot').appendChild(btn);
        host.appendChild(el);
      }
    };
    build($('daily-list'), c.daily);
    build($('weekly-list'), c.weekly);
  }

  // =====================================================================
  // settings
  // =====================================================================

  bindSettings() {
    const s = Save.settings;
    const bind = (id, key, transform = (v) => v, after = null) => {
      const el = $(id);
      const isCheck = el.type === 'checkbox';
      el.addEventListener('change', () => {
        s[key] = transform(isCheck ? el.checked : el.value);
        Save.save(true);
        Audio.applySettings();
        if (after) after();
      });
      if (el.type === 'range') {
        el.addEventListener('input', () => {
          s[key] = transform(el.value);
          Audio.applySettings();
        });
      }
    };
    bind('set-sfx', 'sfxVolume', Number);
    bind('set-music', 'musicVolume', Number);
    bind('set-mute', 'muted');
    bind('set-shake', 'screenShake');
    bind('set-particles', 'particles');
    bind('set-fps', 'showFps', (v) => v, () => ($('hud-fps').hidden = !Save.settings.showFps));

    $('btn-export-save').addEventListener('click', () => {
      downloadJSON(Save.data, 'voidcity-save.json');
      this.toast('Save exported');
    });

    $('btn-reset').addEventListener('click', () => {
      if (!confirm('Erase all progress, unlocks and high scores on this device?')) return;
      Save.reset();
      this.applyTheme();
      this.renderSettings();
      this.refreshMenu();
      this.toast('Progress erased');
    });
  }

  renderSettings() {
    const s = Save.settings;
    $('set-sfx').value = s.sfxVolume;
    $('set-music').value = s.musicVolume;
    $('set-mute').checked = s.muted;
    $('set-shake').checked = s.screenShake;
    $('set-particles').value = s.particles;
    $('set-fps').checked = s.showFps;
  }

  // =====================================================================
  // match
  // =====================================================================

  bindGame() {
    $('btn-pause').addEventListener('click', () => this.togglePause());
    $('btn-resume').addEventListener('click', () => this.togglePause());
    $('btn-restart').addEventListener('click', () => {
      $('pause-overlay').hidden = true;
      this.game.stop();
      this.startGame();
    });
    $('btn-quit').addEventListener('click', () => {
      $('pause-overlay').hidden = true;
      this.game.endMatch('quit');
    });
    $('btn-again').addEventListener('click', () => {
      $('result-overlay').hidden = true;
      // A new seed each time unless the player pinned one.
      this.startGame();
    });
    $('btn-result-menu').addEventListener('click', () => {
      $('result-overlay').hidden = true;
      this.go('menu', false);
      this.stack.length = 0;
    });
    $('btn-result-seed').addEventListener('click', () => {
      if (this.lastRun) this.copy(this.lastRun.seed, `Seed ${this.lastRun.seed} copied`);
    });
  }

  startGame() {
    Audio.init();
    Audio.click();
    const seed = this.selection.seed || randomSeedString();
    const config = {
      mapId: this.selection.mapId,
      mode: this.selection.mode,
      seed,
      aiCount: MODES[this.selection.mode].ai,
    };

    if (this.customMap) {
      try {
        config.customWorld = buildCustomWorld(this.customMap);
      } catch (err) {
        this.toast('Custom map failed to load');
        this.customMap = null;
      }
    }

    this.go('game', false);
    $('result-overlay').hidden = true;
    $('pause-overlay').hidden = true;
    $('godzilla-banner').hidden = true;
    $('toasts').innerHTML = '';
    $('hud-fps').hidden = !Save.settings.showFps;

    const state = this.game.start(config);
    this.lastWorld = state.world;
    $('hud-board').hidden = state.voids.length < 2;
    this.updateHud(this.game.hudData());
  }

  togglePause() {
    if (this.current !== 'game' || !this.game.running) return;
    const overlay = $('pause-overlay');
    if (this.game.paused) {
      overlay.hidden = true;
      this.game.resume();
    } else {
      this.game.pause();
      const s = this.game.state;
      $('pause-meta').textContent = `${s.world.name} · ${s.mode.name} · seed ${s.seed}`;
      overlay.hidden = false;
    }
  }

  updateHud(d) {
    $('hud-score').textContent = formatNumber(d.score);
    $('hud-level').textContent = 'Level ' + d.level;
    $('hud-level-fill').style.width = Math.round(d.progress * 100) + '%';
    $('hud-destruction').textContent = Math.round(d.destruction * 100) + '% consumed';

    const combo = $('hud-combo');
    if (d.combo > 1.15) {
      combo.hidden = false;
      combo.textContent = 'x' + d.combo.toFixed(1);
    } else {
      combo.hidden = true;
    }

    const timer = $('hud-timer');
    if (d.timed) {
      timer.textContent = formatTime(d.time);
      timer.classList.toggle('is-low', d.time < 15);
    } else {
      timer.textContent = '∞';
      timer.classList.remove('is-low');
    }

    if (d.board.length > 1) {
      $('hud-board').innerHTML = d.board
        .slice(0, 8)
        .map(
          (b) =>
            `<div class="${b.isPlayer ? 'me' : ''} ${b.alive ? '' : 'out'}"><span>${b.name}</span><span>${formatNumber(
              b.score
            )}</span></div>`
        )
        .join('');
    }

    if (Save.settings.showFps) $('hud-fps').textContent = d.fps + ' fps';
  }

  showGodzilla() {
    const el = $('godzilla-banner');
    el.hidden = false;
    // Restart the CSS animation by forcing a reflow.
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    setTimeout(() => (el.hidden = true), 2700);
  }

  showResult(run) {
    this.lastRun = run;
    const overlay = $('result-overlay');
    const kicker =
      run.reason === 'eaten'
        ? 'Swallowed by a rival'
        : run.reason === 'cleared'
        ? 'Nothing left standing'
        : run.reason === 'quit'
        ? 'Run ended early'
        : run.won
        ? 'City consumed'
        : "Time's up";
    $('result-kicker').textContent = kicker;
    $('result-score').textContent = formatNumber(run.score);
    $('again-meta').textContent = `${MAPS[run.mapId] ? MAPS[run.mapId].name : 'Custom city'} · ${MODES[run.mode].name}`;

    const cells = [
      ['Level reached', run.level],
      ['City consumed', Math.round(run.destruction * 100) + '%'],
      ['Objects eaten', formatNumber(run.objects)],
      ['Biggest meal', run.largestObject.name],
      ['Final radius', formatNumber(run.radius)],
      ['Coins earned', '+' + formatNumber(run.coins)],
    ];
    if (run.godzillaSeconds > 0) cells.push(['Godzilla time', formatTime(run.godzillaSeconds)]);
    if (run.highScoreRank) cells.push(['Board rank', '#' + run.highScoreRank]);
    $('result-grid').innerHTML = cells
      .map((c) => `<div class="stat"><div class="stat-value">${c[1]}</div><div class="stat-label">${c[0]}</div></div>`)
      .join('');

    $('result-board').innerHTML =
      run.board.length > 1
        ? run.board
            .map(
              (b) =>
                `<div class="${b.isPlayer ? 'me' : ''}"><span>${b.rank}. ${b.name}</span><span>${formatNumber(
                  b.score
                )}</span></div>`
            )
            .join('')
        : '';

    const unlocks = run.achievements || [];
    $('result-unlocks').innerHTML = unlocks
      .map((a) => `<div class="unlock-row">Achievement: ${a.name} · +${a.reward} coins</div>`)
      .join('');

    overlay.hidden = false;
    this.refreshMenu();
  }

  // =====================================================================
  // install prompt
  // =====================================================================

  installPrompt() {
    const btn = $('btn-install');
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredInstall = e;
      btn.hidden = false;
    });
    btn.addEventListener('click', async () => {
      if (this.deferredInstall) {
        this.deferredInstall.prompt();
        const choice = await this.deferredInstall.userChoice;
        if (choice.outcome === 'accepted') btn.hidden = true;
        this.deferredInstall = null;
      } else {
        // iOS has no install event — tell people where the button lives.
        this.toast('Share → Add to Home Screen');
      }
    });
    window.addEventListener('appinstalled', () => {
      btn.hidden = true;
      this.toast('Installed. It works offline now.');
    });
    // iOS Safari: show the hint button when not already installed.
    const standalone =
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone;
    const iOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (iOS && !standalone) btn.hidden = false;
  }
}
