/**
 * objectTypes.js — The catalogue of everything the void can eat.
 *
 * Each entry is a *type*; the world generator stamps out instances that point
 * back at their type, so 1200 traffic cones share one definition object.
 *
 * Fields
 *   id        stable key, used by custom map JSON
 *   name      shown in floating text and the "largest object" stat
 *   cls       light | medium | heavy | massive — drives suction resistance
 *   size      collision radius in world px (half the footprint)
 *   w, h      footprint for box-shaped objects (defaults to size * 2)
 *   mass      how much the void grows, and how hard the object is to drag
 *   value     score awarded
 *   shape     box | circle | tree | poly
 *   height    pseudo-3D extrusion in px — 0 is flat on the road
 *   color     base fill; the renderer derives roof/side shades from it
 *   tags      used by achievements and challenges ('car', 'building', ...)
 */

/** Suction resistance per weight class. Lower = harder to move. */
export const CLASS_PULL = { light: 1, medium: 0.68, heavy: 0.46, massive: 0.3 };

/** How big the void must be, relative to an object, to nudge / eat it. */
export const MOVE_RATIO = 0.42;
export const EAT_RATIO = 0.78;

/** Score multiplier applied on top of `value` per class — big fish pay better. */
export const CLASS_BONUS = { light: 1, medium: 1.1, heavy: 1.25, massive: 1.6 };

function def(o) {
  return Object.assign(
    {
      shape: 'box',
      height: 0,
      cls: 'light',
      tags: [],
      color: '#7a8296',
    },
    o,
    {
      w: o.w || o.size * 2,
      h: o.h || o.size * 2,
    }
  );
}

export const OBJECT_TYPES = {
  // ---- small / light ----------------------------------------------------
  cone: def({ id: 'cone', name: 'Traffic cone', size: 6, mass: 5, value: 8, cls: 'light', shape: 'circle', height: 7, color: '#e4763a', tags: ['street'] }),
  trashcan: def({ id: 'trashcan', name: 'Trash can', size: 8, mass: 10, value: 14, cls: 'light', shape: 'circle', height: 12, color: '#4f5a6b', tags: ['street'] }),
  bench: def({ id: 'bench', name: 'Bench', size: 12, w: 34, h: 12, mass: 18, value: 22, cls: 'light', height: 8, color: '#6b543c', tags: ['park'] }),
  mailbox: def({ id: 'mailbox', name: 'Mailbox', size: 7, mass: 9, value: 12, cls: 'light', height: 14, color: '#3f7ea8', tags: ['street'] }),
  streetsign: def({ id: 'streetsign', name: 'Street sign', size: 6, w: 6, h: 6, mass: 7, value: 11, cls: 'light', height: 20, color: '#8e98aa', tags: ['street'] }),
  hydrant: def({ id: 'hydrant', name: 'Fire hydrant', size: 6, mass: 12, value: 16, cls: 'light', shape: 'circle', height: 11, color: '#c8473f', tags: ['street'] }),
  bikerack: def({ id: 'bikerack', name: 'Bike rack', size: 11, w: 26, h: 8, mass: 14, value: 18, cls: 'light', height: 9, color: '#5d6878', tags: ['street'] }),
  planter: def({ id: 'planter', name: 'Planter', size: 10, mass: 22, value: 20, cls: 'light', shape: 'circle', height: 10, color: '#556b46', tags: ['park'] }),
  lamppost: def({ id: 'lamppost', name: 'Lamp post', size: 5, mass: 16, value: 19, cls: 'light', height: 34, color: '#96a0b2', tags: ['street'] }),

  // ---- medium -----------------------------------------------------------
  tree: def({ id: 'tree', name: 'Tree', size: 16, mass: 44, value: 40, cls: 'medium', shape: 'tree', height: 42, color: '#3f6b46', tags: ['park'] }),
  foodcart: def({ id: 'foodcart', name: 'Food cart', size: 15, w: 32, h: 22, mass: 58, value: 62, cls: 'medium', height: 24, color: '#cf8a3c', tags: ['commercial'] }),
  statue: def({ id: 'statue', name: 'Statue', size: 14, mass: 74, value: 90, cls: 'medium', shape: 'circle', height: 40, color: '#9aa3ae', tags: ['landmark'] }),
  playset: def({ id: 'playset', name: 'Play structure', size: 22, w: 46, h: 38, mass: 66, value: 70, cls: 'medium', height: 26, color: '#b85d7a', tags: ['park'] }),
  shed: def({ id: 'shed', name: 'Garden shed', size: 18, w: 38, h: 32, mass: 92, value: 88, cls: 'medium', height: 30, color: '#7c6a52', tags: ['residential'] }),
  busstop: def({ id: 'busstop', name: 'Bus shelter', size: 18, w: 44, h: 18, mass: 70, value: 66, cls: 'medium', height: 26, color: '#4b6a7d', tags: ['street'] }),
  dumpster: def({ id: 'dumpster', name: 'Dumpster', size: 16, w: 36, h: 24, mass: 88, value: 64, cls: 'medium', height: 20, color: '#3e6b5a', tags: ['industrial'] }),
  kiosk: def({ id: 'kiosk', name: 'News kiosk', size: 14, w: 28, h: 26, mass: 60, value: 58, cls: 'medium', height: 28, color: '#8a5f8e', tags: ['commercial'] }),

  // ---- large / heavy ----------------------------------------------------
  car: def({ id: 'car', name: 'Car', size: 22, w: 42, h: 22, mass: 170, value: 150, cls: 'heavy', height: 18, color: '#d0d6e2', tags: ['vehicle', 'car'] }),
  van: def({ id: 'van', name: 'Van', size: 26, w: 52, h: 26, mass: 230, value: 200, cls: 'heavy', height: 26, color: '#c3ccd9', tags: ['vehicle', 'car'] }),
  bus: def({ id: 'bus', name: 'City bus', size: 38, w: 82, h: 28, mass: 420, value: 360, cls: 'heavy', height: 32, color: '#d6a742', tags: ['vehicle', 'car'] }),
  truck: def({ id: 'truck', name: 'Semi truck', size: 44, w: 96, h: 30, mass: 520, value: 440, cls: 'heavy', height: 34, color: '#b0bac9', tags: ['vehicle', 'car'] }),
  house: def({ id: 'house', name: 'House', size: 48, w: 92, h: 78, mass: 780, value: 620, cls: 'heavy', height: 56, color: '#8b7f70', tags: ['building', 'residential'] }),
  container: def({ id: 'container', name: 'Shipping container', size: 30, w: 70, h: 30, mass: 460, value: 380, cls: 'heavy', height: 30, color: '#a8572f', tags: ['industrial'] }),
  garage: def({ id: 'garage', name: 'Parking garage', size: 90, w: 178, h: 150, mass: 2600, value: 2000, cls: 'heavy', height: 88, color: '#6e7686', tags: ['building'] }),
  apartment: def({ id: 'apartment', name: 'Apartment block', size: 78, w: 150, h: 132, mass: 2100, value: 1700, cls: 'heavy', height: 130, color: '#7b6f82', tags: ['building', 'residential'] }),
  warehouse: def({ id: 'warehouse', name: 'Warehouse', size: 105, w: 220, h: 150, mass: 2800, value: 2200, cls: 'heavy', height: 62, color: '#6a7280', tags: ['building', 'industrial'] }),
  watertower: def({ id: 'watertower', name: 'Water tower', size: 34, mass: 900, value: 900, cls: 'heavy', shape: 'circle', height: 110, color: '#5f7f90', tags: ['landmark'] }),

  // ---- massive ----------------------------------------------------------
  office: def({ id: 'office', name: 'Office tower', size: 100, w: 180, h: 180, mass: 4200, value: 3400, cls: 'massive', height: 210, color: '#5b6a86', tags: ['building', 'downtown'] }),
  skyscraper: def({ id: 'skyscraper', name: 'Skyscraper', size: 130, w: 230, h: 230, mass: 7600, value: 6400, cls: 'massive', height: 340, color: '#4f5f7e', tags: ['building', 'downtown'] }),
  factory: def({ id: 'factory', name: 'Factory', size: 150, w: 320, h: 240, mass: 8200, value: 6800, cls: 'massive', height: 120, color: '#6b6560', tags: ['building', 'industrial', 'landmark'] }),
  powerplant: def({ id: 'powerplant', name: 'Power plant', size: 165, w: 330, h: 280, mass: 9600, value: 8200, cls: 'massive', height: 150, color: '#78706a', tags: ['building', 'industrial', 'landmark'] }),
  mall: def({ id: 'mall', name: 'Shopping centre', size: 175, w: 380, h: 280, mass: 9000, value: 7600, cls: 'massive', height: 84, color: '#7a6a82', tags: ['building', 'commercial', 'landmark'] }),
  stadium: def({ id: 'stadium', name: 'Stadium', size: 200, mass: 13000, value: 11000, cls: 'massive', shape: 'circle', height: 120, color: '#4d7364', tags: ['building', 'landmark'] }),
  monument: def({ id: 'monument', name: 'Monument', size: 60, mass: 5200, value: 5000, cls: 'massive', shape: 'circle', height: 220, color: '#a9a392', tags: ['landmark'] }),
  cityblock: def({ id: 'cityblock', name: 'City block', size: 230, w: 440, h: 400, mass: 16000, value: 14000, cls: 'massive', height: 160, color: '#5a5f74', tags: ['building', 'downtown', 'landmark'] }),
  railyard: def({ id: 'railyard', name: 'Rail yard', size: 190, w: 420, h: 240, mass: 8800, value: 7200, cls: 'massive', height: 40, color: '#5e5a55', tags: ['industrial', 'landmark'] }),
  school: def({ id: 'school', name: 'School', size: 130, w: 280, h: 180, mass: 5400, value: 4600, cls: 'massive', height: 70, color: '#8a7b6a', tags: ['building', 'residential', 'landmark'] }),
};

/** Lookup helper with a friendly error for custom maps. */
export function getType(id) {
  const t = OBJECT_TYPES[id];
  if (!t) throw new Error(`Unknown object type "${id}"`);
  return t;
}

export const TYPE_IDS = Object.keys(OBJECT_TYPES);
