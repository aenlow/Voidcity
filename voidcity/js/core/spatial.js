/**
 * spatial.js — Uniform grid spatial hash.
 *
 * With 1000+ props on screen a naive O(n²) suction check melts phones. Every
 * world object is bucketed into a cell; suction, consumption and rendering all
 * query only the handful of cells they overlap. Objects that move (while being
 * sucked in) re-register themselves when they cross a cell boundary.
 *
 * A quadtree would also work, but a uniform grid is faster to rebuild and the
 * city is evenly populated, so the grid's weakness (clustering) never bites.
 */
export class SpatialHash {
  /**
   * @param {number} width  world width in px
   * @param {number} height world height in px
   * @param {number} cellSize length of one square cell
   */
  constructor(width, height, cellSize = 256) {
    this.cellSize = cellSize;
    this.cols = Math.max(1, Math.ceil(width / cellSize));
    this.rows = Math.max(1, Math.ceil(height / cellSize));
    this.cells = new Array(this.cols * this.rows);
    for (let i = 0; i < this.cells.length; i++) this.cells[i] = [];
    this._stamp = 0;
  }

  _col(x) {
    const c = Math.floor(x / this.cellSize);
    return c < 0 ? 0 : c >= this.cols ? this.cols - 1 : c;
  }

  _row(y) {
    const r = Math.floor(y / this.cellSize);
    return r < 0 ? 0 : r >= this.rows ? this.rows - 1 : r;
  }

  /** Insert an object. Stores its cell index on the object as `_cell`. */
  insert(obj) {
    const idx = this._col(obj.x) + this._row(obj.y) * this.cols;
    obj._cell = idx;
    this.cells[idx].push(obj);
  }

  /** Remove an object from its current cell. */
  remove(obj) {
    const bucket = this.cells[obj._cell];
    if (!bucket) return;
    const i = bucket.indexOf(obj);
    if (i !== -1) bucket.splice(i, 1);
    obj._cell = -1;
  }

  /** Call after an object moves; cheap no-op if it stayed in the same cell. */
  update(obj) {
    const idx = this._col(obj.x) + this._row(obj.y) * this.cols;
    if (idx === obj._cell) return;
    this.remove(obj);
    obj._cell = idx;
    this.cells[idx].push(obj);
  }

  /**
   * Every object whose cell overlaps the circle (x, y, r).
   * Results are approximate (cell granularity) — callers do the exact test.
   */
  queryCircle(x, y, r, out = []) {
    out.length = 0;
    const c0 = this._col(x - r);
    const c1 = this._col(x + r);
    const r0 = this._row(y - r);
    const r1 = this._row(y + r);
    for (let row = r0; row <= r1; row++) {
      const base = row * this.cols;
      for (let col = c0; col <= c1; col++) {
        const bucket = this.cells[base + col];
        for (let i = 0; i < bucket.length; i++) out.push(bucket[i]);
      }
    }
    return out;
  }

  /** Every object in an axis-aligned rect — used for render culling. */
  queryRect(x0, y0, x1, y1, out = []) {
    out.length = 0;
    const c0 = this._col(x0);
    const c1 = this._col(x1);
    const r0 = this._row(y0);
    const r1 = this._row(y1);
    for (let row = r0; row <= r1; row++) {
      const base = row * this.cols;
      for (let col = c0; col <= c1; col++) {
        const bucket = this.cells[base + col];
        for (let i = 0; i < bucket.length; i++) out.push(bucket[i]);
      }
    }
    return out;
  }

  clear() {
    for (let i = 0; i < this.cells.length; i++) this.cells[i].length = 0;
  }
}
