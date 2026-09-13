/**
 * game.js — Entry point.
 *
 * Everything interesting lives in /js. This file boots the UI, registers the
 * service worker, and handles a few browser quirks that would otherwise ruin
 * a full-screen touch game (double-tap zoom, long-press menus, rubber-banding).
 *
 * Module map
 *   js/core      rng, utils, spatial hash, storage, audio, input
 *   js/world     object catalogue, map presets, generator, custom map I/O
 *   js/entities  the void, the AI brain
 *   js/fx        particles, floating text, shockwaves
 *   js/render    camera, canvas renderer
 *   js/game      engine (match loop + physics), progression
 *   js/ui        screens and HUD
 */

import { UI } from './js/ui/ui.js';
import { Audio } from './js/core/audio.js';
import { Save } from './js/core/storage.js';
import { loadPresetOverrides } from './js/world/maps.js';

// Map tuning lives in /maps/*.json and is merged over the built-in presets.
// Awaiting it here costs a few milliseconds and means the menu never shows
// stale map names.
await loadPresetOverrides();

const ui = new UI();
ui.init();

// Audio contexts can only start from a gesture; the first tap anywhere does it.
const wakeAudio = () => {
  Audio.init();
  Audio.resume();
  Audio.applySettings();
};
window.addEventListener('pointerdown', wakeAudio, { once: true });
window.addEventListener('keydown', wakeAudio, { once: true });

// Kill the behaviours that make a web game feel like a web page.
document.addEventListener('contextmenu', (e) => {
  if (e.target.closest('#screen-game')) e.preventDefault();
});
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener(
  'touchmove',
  (e) => {
    // Allow scrolling inside menu lists, block it everywhere else.
    if (!e.target.closest('.scroll, .overlay')) e.preventDefault();
  },
  { passive: false }
);

// Offline support. Registration failures are non-fatal — the game still runs.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch((err) => {
      console.warn('Void City: service worker not registered.', err);
    });
  });
}

// Handy for debugging from the console, and for anyone extending the game.
window.VoidCity = { ui, Save, Audio };
