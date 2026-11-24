/**
 * Battle field geometry: a 15 x 11 hex field in "odd-r" offset coordinates.
 *
 * - A hex is (col, row): col 0 is the left edge (attacker's deployment
 *   column), col 14 the right edge (defender's); row 0 is the top row.
 * - Hexes are pointy-topped. Odd rows (1, 3, 5, ...) are shifted half a hex
 *   to the right.
 * - The compact index of a hex is `row * BATTLE_WIDTH + col` (0..164).
 * - Neighbours are always listed in the same clockwise order starting East:
 *   E, SE, SW, W, NW, NE. Path finding and the AI rely on that order for
 *   deterministic tie-breaks.
 *
 * Distances convert to cube coordinates: x = col - (row - (row & 1)) / 2,
 * z = row, y = -x - z; distance = max(|dx|, |dy|, |dz|).
 */

export const BATTLE_WIDTH = 15;
export const BATTLE_HEIGHT = 11;
export const BATTLE_HEX_COUNT = BATTLE_WIDTH * BATTLE_HEIGHT;

export interface Hex {
  readonly col: number;
  readonly row: number;
}

export function hex(col: number, row: number): Hex {
  return { col, row };
}

export function inBounds(h: Hex): boolean {
  return (
    Number.isInteger(h.col) &&
    Number.isInteger(h.row) &&
    h.col >= 0 &&
    h.col < BATTLE_WIDTH &&
    h.row >= 0 &&
    h.row < BATTLE_HEIGHT
  );
}

export function hexIndex(h: Hex): number {
  return h.row * BATTLE_WIDTH + h.col;
}

export function hexFromIndex(index: number): Hex {
  return { col: index % BATTLE_WIDTH, row: Math.floor(index / BATTLE_WIDTH) };
}

export function sameHex(a: Hex, b: Hex): boolean {
  return a.col === b.col && a.row === b.row;
}

// [dcol, drow] for E, SE, SW, W, NW, NE.
const EVEN_ROW_STEPS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
];
const ODD_ROW_STEPS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 0],
  [0, -1],
  [1, -1],
];

/** In-bounds neighbours in the fixed order E, SE, SW, W, NW, NE. */
export function neighbors(h: Hex): Hex[] {
  const steps = (h.row & 1) === 1 ? ODD_ROW_STEPS : EVEN_ROW_STEPS;
  const out: Hex[] = [];
  for (const [dc, dr] of steps) {
    const n = { col: h.col + dc, row: h.row + dr };
    if (inBounds(n)) out.push(n);
  }
  return out;
}

function toCube(h: Hex): [number, number, number] {
  const x = h.col - (h.row - (h.row & 1)) / 2;
  const z = h.row;
  return [x, -x - z, z];
}

/** Cube steps in the fixed order E, SE, SW, W, NW, NE. */
const CUBE_STEPS: ReadonlyArray<readonly [number, number, number]> = [
  [1, -1, 0],
  [0, -1, 1],
  [-1, 0, 1],
  [-1, 1, 0],
  [0, 1, -1],
  [1, 0, -1],
];

/**
 * The hex one step from `h` in direction `dir` (0..5: E, SE, SW, W, NW,
 * NE), possibly out of bounds. Steps in one direction form a straight line.
 */
export function stepHex(h: Hex, dir: number): Hex {
  const [x, , z] = toCube(h);
  const [dx, , dz] = CUBE_STEPS[dir] as readonly [number, number, number];
  const nz = z + dz;
  const nx = x + dx;
  return { col: nx + (nz - (nz & 1)) / 2, row: nz };
}

export function hexDistance(a: Hex, b: Hex): number {
  const [ax, ay, az] = toCube(a);
  const [bx, by, bz] = toCube(b);
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by), Math.abs(az - bz));
}

/** True when the two hexes share an edge. */
export function isAdjacent(a: Hex, b: Hex): boolean {
  return hexDistance(a, b) === 1;
}

/**
 * Pixel centre of a hex for a renderer (pointy-top, odd rows shifted right),
 * with `size` = centre-to-corner radius. Rendering only: game logic never
 * uses pixels.
 */
export function hexCenter(h: Hex, size: number): { x: number; y: number } {
  const w = Math.sqrt(3) * size;
  return {
    x: w * (h.col + 0.5 * (h.row & 1)) + w / 2,
    y: 1.5 * size * h.row + size,
  };
}
