/**
 * Coordinate hashes for the map renderer. Ported from Pulp Wars
 * (src/render/canvas/chibi-forest-packing-v7.ts `forestHashV7` and
 * src/render/canvas/fog-of-war-v7.ts `fogHashV7`): everything the renderer
 * picks (piece variants, specks, puffs) is a pure function of coordinates,
 * so a map draws the same at every zoom, frame and reload.
 */

/** A 32-bit unsigned hash of four integers. */
export function hash4(a: number, b: number, c: number, d: number): number {
  let h =
    Math.imul(a | 0, 0x9e3779b1) ^
    Math.imul(b | 0, 0x85ebca6b) ^
    Math.imul(c | 0, 0xc2b2ae35) ^
    Math.imul(d | 0, 0x27d4eb2f);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return h >>> 0;
}

/** A hash of (x, y, salt) in [0, 1). */
export function hashUnit(x: number, y: number, salt: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1);
  h = Math.imul(h ^ (salt | 0), 0x9e3779b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export const modulo = (value: number, by: number): number =>
  ((value % by) + by) % by;
