/**
 * camera.js — Smooth follow, size-driven zoom, trauma-based shake.
 *
 * Zoom is derived from how much world we want visible rather than from a raw
 * scale factor, which keeps framing consistent between a 380px phone and a
 * 2560px monitor: the void always occupies a similar share of the screen.
 */

import { clamp, damp } from '../core/utils.js';
import { Save } from '../core/storage.js';

export class Camera {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.zoom = 1;
    this.targetZoom = 1;
    this.viewW = 1;
    this.viewH = 1;
    this.trauma = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.mobile = false;
  }

  setViewport(w, h) {
    this.viewW = w;
    this.viewH = h;
    this.mobile = Math.min(w, h) < 620;
  }

  /** Snap straight to a target — used when a match starts. */
  jumpTo(x, y, radius) {
    this.x = x;
    this.y = y;
    this.zoom = this.targetZoom = this._zoomFor(radius);
  }

  _zoomFor(radius) {
    const minDim = Math.min(this.viewW, this.viewH);
    // How many world px of the short screen axis should be visible.
    const visible = (520 + radius * 9) * (this.mobile ? 0.62 : 1);
    return clamp(minDim / visible, 0.12, 2.2);
  }

  /**
   * @param {{x:number,y:number,displayRadius:number,vx:number,vy:number}} target
   * @param {{width:number,height:number}} world
   */
  follow(target, world, dt) {
    // Lead the camera slightly in the direction of travel so you can see where
    // you're going without the view feeling loose.
    const lead = 0.22;
    const tx = target.x + target.vx * lead;
    const ty = target.y + target.vy * lead;
    this.x = damp(this.x, tx, 6.5, dt);
    this.y = damp(this.y, ty, 6.5, dt);

    this.targetZoom = this._zoomFor(target.displayRadius);
    this.zoom = damp(this.zoom, this.targetZoom, 3.2, dt);

    // Keep the view inside the city unless the city is smaller than the screen.
    const halfW = this.viewW / (2 * this.zoom);
    const halfH = this.viewH / (2 * this.zoom);
    if (world.width > halfW * 2) this.x = clamp(this.x, halfW, world.width - halfW);
    else this.x = world.width / 2;
    if (world.height > halfH * 2) this.y = clamp(this.y, halfH, world.height - halfH);
    else this.y = world.height / 2;

    // Shake decays quadratically: strong hits read clearly, small ones vanish.
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const amount = this.trauma * this.trauma;
    if (amount > 0.0001) {
      const t = performance.now() * 0.001;
      this.shakeX = Math.sin(t * 47.3) * amount * 26;
      this.shakeY = Math.cos(t * 39.7) * amount * 26;
    } else {
      this.shakeX = this.shakeY = 0;
    }
  }

  addTrauma(amount) {
    // Players who turn shake off should get none of it, not less of it.
    if (!Save.settings.screenShake) return;
    this.trauma = clamp(this.trauma + amount, 0, 1);
  }

  /** Visible world rectangle, padded, for render culling. */
  bounds(pad = 200) {
    const halfW = this.viewW / (2 * this.zoom) + pad;
    const halfH = this.viewH / (2 * this.zoom) + pad;
    return { x0: this.x - halfW, y0: this.y - halfH, x1: this.x + halfW, y1: this.y + halfH };
  }

  worldToScreen(wx, wy) {
    return {
      x: (wx - this.x - this.shakeX / this.zoom) * this.zoom + this.viewW / 2,
      y: (wy - this.y - this.shakeY / this.zoom) * this.zoom + this.viewH / 2,
    };
  }

  /** Apply as a canvas transform. Call inside save()/restore(). */
  applyTo(ctx) {
    ctx.translate(this.viewW / 2, this.viewH / 2);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.x - this.shakeX / this.zoom, -this.y - this.shakeY / this.zoom);
  }
}
