/**
 * input.js — One movement vector, three ways to produce it.
 *
 *  • Keyboard: WASD + arrows (desktop)
 *  • Virtual joystick: touch anywhere on the play area, drag to steer (mobile)
 *  • Mouse: hold the left button and the void moves toward the cursor
 *
 * Consumers just read Input.vector — {x, y} with a magnitude of 0..1.
 */

import { clamp } from './utils.js';

const KEY_MAP = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
};

class InputManager {
  constructor() {
    this.keys = { up: false, down: false, left: false, right: false };
    this.vector = { x: 0, y: 0 };
    this.joystick = { active: false, id: null, baseX: 0, baseY: 0, dx: 0, dy: 0 };
    this.mouse = { down: false, x: 0, y: 0 };
    this.maxRadius = 60; // px of stick travel for full speed
    this.onPause = null;
    this._bound = false;
  }

  /**
   * @param {HTMLElement} surface element that receives touches (the canvas wrapper)
   * @param {HTMLElement} stickEl visual joystick root
   */
  attach(surface, stickEl) {
    if (this._bound) return;
    this._bound = true;
    this.surface = surface;
    this.stickEl = stickEl;
    this.stickBase = stickEl ? stickEl.querySelector('.stick-base') : null;
    this.stickKnob = stickEl ? stickEl.querySelector('.stick-knob') : null;

    window.addEventListener('keydown', (e) => this._onKey(e, true));
    window.addEventListener('keyup', (e) => this._onKey(e, false));
    window.addEventListener('blur', () => this.releaseAll());

    surface.addEventListener('touchstart', (e) => this._touchStart(e), { passive: false });
    surface.addEventListener('touchmove', (e) => this._touchMove(e), { passive: false });
    surface.addEventListener('touchend', (e) => this._touchEnd(e), { passive: false });
    surface.addEventListener('touchcancel', (e) => this._touchEnd(e), { passive: false });

    surface.addEventListener('mousedown', (e) => {
      this.mouse.down = true;
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
    });
    window.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
    });
    window.addEventListener('mouseup', () => (this.mouse.down = false));
  }

  _onKey(e, down) {
    const action = KEY_MAP[e.code];
    if (action) {
      this.keys[action] = down;
      e.preventDefault();
      return;
    }
    if (down && (e.code === 'Escape' || e.code === 'KeyP')) {
      if (this.onPause) this.onPause();
    }
  }

  releaseAll() {
    this.keys.up = this.keys.down = this.keys.left = this.keys.right = false;
    this.mouse.down = false;
    this._hideStick();
    this.joystick.active = false;
  }

  _touchStart(e) {
    if (this.joystick.active) return;
    const t = e.changedTouches[0];
    // Don't hijack taps that land on HUD buttons.
    if (t.target.closest('button, input, select, .hud-btn, .overlay, .no-joystick')) return;
    e.preventDefault();
    this.joystick.active = true;
    this.joystick.id = t.identifier;
    this.joystick.baseX = t.clientX;
    this.joystick.baseY = t.clientY;
    this.joystick.dx = 0;
    this.joystick.dy = 0;
    this._showStick(t.clientX, t.clientY, 0, 0);
  }

  _touchMove(e) {
    if (!this.joystick.active) return;
    for (const t of e.changedTouches) {
      if (t.identifier !== this.joystick.id) continue;
      e.preventDefault();
      let dx = t.clientX - this.joystick.baseX;
      let dy = t.clientY - this.joystick.baseY;
      const len = Math.hypot(dx, dy);
      if (len > this.maxRadius) {
        // Drag the base along so the stick never feels "stuck" at the rim.
        this.joystick.baseX += dx * (1 - this.maxRadius / len);
        this.joystick.baseY += dy * (1 - this.maxRadius / len);
        dx *= this.maxRadius / len;
        dy *= this.maxRadius / len;
      }
      this.joystick.dx = dx;
      this.joystick.dy = dy;
      this._showStick(this.joystick.baseX, this.joystick.baseY, dx, dy);
    }
  }

  _touchEnd(e) {
    for (const t of e.changedTouches) {
      if (t.identifier === this.joystick.id) {
        this.joystick.active = false;
        this.joystick.dx = 0;
        this.joystick.dy = 0;
        this._hideStick();
      }
    }
  }

  _showStick(x, y, dx, dy) {
    if (!this.stickEl) return;
    this.stickEl.style.display = 'block';
    this.stickEl.style.transform = `translate(${x}px, ${y}px)`;
    if (this.stickKnob) this.stickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  _hideStick() {
    if (this.stickEl) this.stickEl.style.display = 'none';
  }

  /** Call once per frame before reading `vector`. */
  update() {
    let x = 0;
    let y = 0;
    if (this.keys.left) x -= 1;
    if (this.keys.right) x += 1;
    if (this.keys.up) y -= 1;
    if (this.keys.down) y += 1;

    if (this.joystick.active) {
      x += this.joystick.dx / this.maxRadius;
      y += this.joystick.dy / this.maxRadius;
    } else if (this.mouse.down && this.surface) {
      const r = this.surface.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = this.mouse.x - cx;
      const dy = this.mouse.y - cy;
      const len = Math.hypot(dx, dy);
      if (len > 12) {
        const s = Math.min(1, len / 160);
        x += (dx / len) * s;
        y += (dy / len) * s;
      }
    }

    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    this.vector.x = clamp(x, -1, 1);
    this.vector.y = clamp(y, -1, 1);
  }
}

export const Input = new InputManager();
