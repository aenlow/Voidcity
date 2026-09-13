/**
 * renderer.js — Everything you see, drawn with Canvas 2D.
 *
 * The city is top-down but objects are extruded away from the screen centre by
 * their height, which gives the skyline a readable sense of depth without a
 * 3D engine. Buildings near the middle of the view stand straight up; ones at
 * the edges lean outward, exactly like a wide-angle photo.
 *
 * Draw order: ground → blocks → roads → objects (depth sorted) → voids →
 * particles → floating text → screen-space overlays (minimap, Godzilla tint).
 */

import { TAU, shade, clamp, formatNumber } from '../core/utils.js';

const EXTRUDE = 0.0022; // how strongly height leans away from centre

export class Renderer {
  constructor(canvas, camera, particles) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.camera = camera;
    this.particles = particles;
    this.dpr = 1;
    this.visible = [];
    this._nameplates = [];
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    // Cap DPR: a 3x retina phone rendering 3x pixels is the #1 cause of jank.
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.width = w;
    this.height = h;
    this.camera.setViewport(w, h);
  }

  /**
   * @param {object} state { world, grid, player, voids, godzilla, flash }
   */
  draw(state) {
    const { ctx, camera } = this;
    const { world } = state;
    const pal = world.palette;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = pal.ground;
    ctx.fillRect(0, 0, this.width, this.height);

    this._nameplates = [];

    ctx.save();
    camera.applyTo(ctx);
    const view = camera.bounds(260);

    this._drawBlocks(world, view);
    this._drawRoads(world, view);
    this._drawObjects(state, view);
    this._drawVoids(state);
    this._drawParticles();
    ctx.restore();

    this._drawNameplates();
    this._drawFloaters();
    this._drawOverlays(state);
  }

  // ---- ground -----------------------------------------------------------

  _drawBlocks(world, view) {
    const ctx = this.ctx;
    const pal = world.palette;
    for (const b of world.blocks) {
      if (b.x > view.x1 || b.y > view.y1 || b.x + b.w < view.x0 || b.y + b.h < view.y0) continue;
      const park = b.district === 'park';
      ctx.fillStyle = park ? pal.grass : pal.block;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      // Sidewalk band around each block reads as a kerb line from above.
      ctx.strokeStyle = pal.sidewalk;
      ctx.lineWidth = 8;
      ctx.strokeRect(b.x + 4, b.y + 4, b.w - 8, b.h - 8);
    }
  }

  _drawRoads(world, view) {
    const ctx = this.ctx;
    const pal = world.palette;
    ctx.fillStyle = pal.road;
    for (const r of world.roads.vertical) {
      if (r.c + r.w < view.x0 || r.c - r.w > view.x1) continue;
      ctx.fillRect(r.c - r.w / 2, view.y0, r.w, view.y1 - view.y0);
    }
    for (const r of world.roads.horizontal) {
      if (r.c + r.w < view.y0 || r.c - r.w > view.y1) continue;
      ctx.fillRect(view.x0, r.c - r.w / 2, view.x1 - view.x0, r.w);
    }

    // Lane markings — skipped when zoomed far out, where they'd be noise.
    if (this.camera.zoom > 0.35) {
      ctx.strokeStyle = pal.roadLine;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([22, 26]);
      ctx.beginPath();
      for (const r of world.roads.vertical) {
        if (r.c < view.x0 || r.c > view.x1) continue;
        ctx.moveTo(r.c, view.y0);
        ctx.lineTo(r.c, view.y1);
      }
      for (const r of world.roads.horizontal) {
        if (r.c < view.y0 || r.c > view.y1) continue;
        ctx.moveTo(view.x0, r.c);
        ctx.lineTo(view.x1, r.c);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // ---- props and buildings ---------------------------------------------

  _drawObjects(state, view) {
    const ctx = this.ctx;
    const grid = state.grid;
    const list = grid.queryRect(view.x0, view.y0, view.x1, view.y1, this.visible);
    // Painter's algorithm: things lower on screen draw last so they overlap
    // correctly against the buildings behind them.
    list.sort((a, b) => a.y - b.y);

    const cam = this.camera;
    const zoomed = cam.zoom;
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (!o.alive) continue;
      // At extreme zoom-out, tiny props are sub-pixel; skip them entirely.
      if (zoomed < 0.28 && o.size < 18) continue;

      const s = o.scale;
      if (s <= 0.02) continue;
      const lift = o.height + (o.zBase || 0);
      const offX = (o.x - cam.x) * lift * EXTRUDE;
      const offY = (o.y - cam.y) * lift * EXTRUDE;

      ctx.save();
      ctx.translate(o.x, o.y);
      ctx.rotate(o.rot + o.spin);
      ctx.scale(s, s);
      ctx.globalAlpha = o.eating > 0 ? clamp(1 - o.eating * 0.35, 0.25, 1) : 1;

      if (o.shape === 'tree') this._drawTree(o, offX, offY);
      else if (o.shape === 'circle') this._drawCylinder(o, offX, offY);
      else this._drawBox(o, offX, offY, zoomed);

      ctx.globalAlpha = 1;
      ctx.restore();
    }
  }

  _drawBox(o, offX, offY, zoom) {
    const ctx = this.ctx;
    const hw = o.w / 2;
    const hh = o.h / 2;
    const tint = 0.9 + o.v * 0.2;
    const base = shade(o.color, -0.45);
    const roof = shade(o.color, (tint - 1) * 0.6 + 0.06);

    // Footprint / shadow
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.fillRect(-hw, -hh, o.w, o.h);

    if (o.height > 2) {
      // Extruded sides: quad from the footprint corner to the roof corner.
      ctx.fillStyle = base;
      ctx.beginPath();
      ctx.moveTo(-hw, -hh);
      ctx.lineTo(hw, -hh);
      ctx.lineTo(hw + offX, -hh + offY);
      ctx.lineTo(-hw + offX, -hh + offY);
      ctx.closePath();
      ctx.moveTo(-hw, hh);
      ctx.lineTo(hw, hh);
      ctx.lineTo(hw + offX, hh + offY);
      ctx.lineTo(-hw + offX, hh + offY);
      ctx.closePath();
      ctx.moveTo(-hw, -hh);
      ctx.lineTo(-hw, hh);
      ctx.lineTo(-hw + offX, hh + offY);
      ctx.lineTo(-hw + offX, -hh + offY);
      ctx.closePath();
      ctx.moveTo(hw, -hh);
      ctx.lineTo(hw, hh);
      ctx.lineTo(hw + offX, hh + offY);
      ctx.lineTo(hw + offX, -hh + offY);
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = roof;
    ctx.fillRect(-hw + offX, -hh + offY, o.w, o.h);

    // Lit windows on anything tall enough to have floors.
    if (o.height > 40 && zoom > 0.42) {
      const cols = Math.max(2, Math.floor(o.w / 22));
      const rows = Math.max(2, Math.floor(o.h / 22));
      const cw = o.w / cols;
      const ch = o.h / rows;
      ctx.fillStyle = 'rgba(255, 226, 150, 0.55)';
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          // Deterministic "is this window lit" from the instance variation.
          const n = Math.sin((c * 12.9898 + r * 78.233 + o.v * 100) * 43758.5453);
          if (n - Math.floor(n) > 0.62) continue;
          ctx.fillRect(
            -o.w / 2 + offX + c * cw + cw * 0.28,
            -o.h / 2 + offY + r * ch + ch * 0.28,
            cw * 0.44,
            ch * 0.44
          );
        }
      }
    }

    if (o.isLandmark) {
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 3;
      ctx.strokeRect(-hw + offX, -hh + offY, o.w, o.h);
    }
  }

  _drawCylinder(o, offX, offY) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.arc(0, 0, o.size, 0, TAU);
    ctx.fill();

    if (o.height > 2) {
      ctx.fillStyle = shade(o.color, -0.45);
      ctx.beginPath();
      ctx.moveTo(-o.size, 0);
      ctx.lineTo(-o.size + offX, offY);
      ctx.lineTo(o.size + offX, offY);
      ctx.lineTo(o.size, 0);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = shade(o.color, 0.05);
    ctx.beginPath();
    ctx.arc(offX, offY, o.size, 0, TAU);
    ctx.fill();
  }

  _drawTree(o, offX, offY) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.arc(0, 0, o.size * 0.8, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#40372c';
    ctx.beginPath();
    ctx.arc(offX * 0.5, offY * 0.5, o.size * 0.28, 0, TAU);
    ctx.fill();
    const canopy = shade(o.color, (o.v - 0.5) * 0.25);
    ctx.fillStyle = canopy;
    ctx.beginPath();
    ctx.arc(offX, offY, o.size * 0.95, 0, TAU);
    ctx.fill();
    ctx.fillStyle = shade(canopy, 0.12);
    ctx.beginPath();
    ctx.arc(offX - o.size * 0.22, offY - o.size * 0.22, o.size * 0.5, 0, TAU);
    ctx.fill();
  }

  // ---- voids ------------------------------------------------------------

  _drawVoids(state) {
    for (const v of state.voids) {
      if (!v.alive) continue;
      this._drawVoid(v, v === state.player);
    }
  }

  _drawVoid(v, isPlayer) {
    const ctx = this.ctx;
    const r = v.displayRadius * (1 + v.pulse * 0.06);
    ctx.save();
    ctx.translate(v.x, v.y);

    // Outer suction haze — shows the player their reach.
    const reach = v.suctionRadius;
    const haze = ctx.createRadialGradient(0, 0, r * 0.9, 0, 0, reach);
    haze.addColorStop(0, v.godzilla ? 'rgba(255,80,60,0.20)' : 'rgba(150,120,255,0.12)');
    haze.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = haze;
    ctx.beginPath();
    ctx.arc(0, 0, reach, 0, TAU);
    ctx.fill();

    // The hole itself.
    const g = ctx.createRadialGradient(0, 0, r * 0.1, 0, 0, r);
    g.addColorStop(0, '#000000');
    g.addColorStop(0.68, '#05040a');
    g.addColorStop(0.92, v.color);
    g.addColorStop(1, v.rimColor);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();

    // Swirl: three arcs rotating at different rates sell the "vortex".
    ctx.strokeStyle = v.godzilla ? 'rgba(255,140,90,0.55)' : 'rgba(255,255,255,0.18)';
    ctx.lineWidth = Math.max(1, r * 0.045);
    for (let i = 0; i < 3; i++) {
      const a = v.spin * (1 + i * 0.35) + (i * TAU) / 3;
      ctx.beginPath();
      ctx.arc(0, 0, r * (0.42 + i * 0.18), a, a + 1.7);
      ctx.stroke();
    }

    // Rim
    ctx.strokeStyle = v.rimColor;
    ctx.lineWidth = Math.max(1.5, r * 0.07);
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.99, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();

    if (!isPlayer) {
      // Queued, not drawn: nameplates live in screen space so they stay legible
      // at any zoom. Mixing transforms mid-pass would corrupt the world draw.
      this._nameplates.push({
        wx: v.x,
        wy: v.y - r - 12 / this.camera.zoom,
        label: `${v.name} ${formatNumber(v.score)}`,
        color: v.rimColor,
      });
    }
  }

  _drawNameplates() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.font = '600 12px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    for (const n of this._nameplates) {
      const p = this.camera.worldToScreen(n.wx, n.wy);
      if (p.x < -60 || p.x > this.width + 60 || p.y < -20 || p.y > this.height + 20) continue;
      const w = ctx.measureText(n.label).width + 12;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(p.x - w / 2, p.y - 13, w, 17);
      ctx.fillStyle = n.color;
      ctx.fillText(n.label, p.x, p.y);
    }
    ctx.textAlign = 'left';
  }

  // ---- effects ----------------------------------------------------------

  _drawParticles() {
    const ctx = this.ctx;
    const ps = this.particles;
    for (let i = 0; i < ps.particles.length; i++) {
      const p = ps.particles[i];
      if (!p.active) continue;
      const a = clamp(p.life / p.max, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      if (p.shape === 'shard') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size, -p.size * 0.35, p.size * 2, p.size * 0.7);
        ctx.restore();
      } else {
        const s = p.size * a;
        ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      }
    }
    ctx.globalAlpha = 1;

    for (const w of ps.waves) {
      const a = clamp(w.life / w.maxLife, 0, 1);
      ctx.globalAlpha = a * 0.6;
      ctx.strokeStyle = w.color;
      ctx.lineWidth = w.width;
      ctx.beginPath();
      ctx.arc(w.x, w.y, w.r, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  _drawFloaters() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.textAlign = 'center';
    for (const f of this.particles.floaters) {
      const p = this.camera.worldToScreen(f.x, f.y);
      if (p.x < -80 || p.x > this.width + 80 || p.y < -40 || p.y > this.height + 40) continue;
      const a = clamp(f.life / f.max, 0, 1);
      ctx.globalAlpha = a;
      ctx.font = `700 ${f.size}px system-ui, -apple-system, sans-serif`;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillText(f.text, p.x + 1, p.y + 1);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, p.x, p.y);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  _drawOverlays(state) {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    if (state.godzilla) {
      // Warm vignette while the city is being erased.
      const g = ctx.createRadialGradient(
        this.width / 2,
        this.height / 2,
        Math.min(this.width, this.height) * 0.25,
        this.width / 2,
        this.height / 2,
        Math.max(this.width, this.height) * 0.72
      );
      g.addColorStop(0, 'rgba(255,60,30,0)');
      g.addColorStop(1, 'rgba(255,60,30,0.3)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.width, this.height);
    }

    if (state.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${clamp(state.flash, 0, 1) * 0.85})`;
      ctx.fillRect(0, 0, this.width, this.height);
    }

    this._drawMinimap(state);
  }

  _drawMinimap(state) {
    const ctx = this.ctx;
    const world = state.world;
    const size = this.width < 600 ? 78 : 124;
    const pad = this.width < 600 ? 10 : 18;
    const x = this.width - size - pad;
    const y = pad + (this.width < 600 ? 54 : 0);
    const sx = size / world.width;
    const sy = size / world.height;

    ctx.globalAlpha = 0.82;
    ctx.fillStyle = 'rgba(8,10,16,0.78)';
    ctx.fillRect(x, y, size, size);
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);

    // Landmarks are the things worth navigating toward.
    ctx.fillStyle = world.palette.accent;
    for (const l of world.landmarks) {
      ctx.globalAlpha = l.consumed ? 0.25 : 0.9;
      ctx.fillRect(x + l.x * sx - 1.5, y + l.y * sy - 1.5, 3, 3);
    }

    ctx.globalAlpha = 0.9;
    for (const v of state.voids) {
      if (!v.alive) continue;
      const isP = v === state.player;
      ctx.fillStyle = isP ? '#ffffff' : v.rimColor;
      const r = isP ? 3.2 : 2.2;
      ctx.beginPath();
      ctx.arc(x + v.x * sx, y + v.y * sy, r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
