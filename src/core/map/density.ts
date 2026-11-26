/**
 * Object density of a map: objects per 100 passable cells, for the map and
 * per generator zone (bead bzc.3: "something to do every few steps").
 *
 * Passable cells are open ground (no water, no obstacle; object footprints
 * count as passable ground). "All" counts every object except hero starts;
 * "visitable" leaves out the neutral stacks too.
 */
import type { GameMap } from "./types.ts";
import { isPassable } from "./types.ts";

export interface DensityStats {
  passable: number;
  all: number;
  visitable: number;
}

function stats(passable: number, all: number, visitable: number): DensityStats {
  const per = (n: number): number => (passable > 0 ? (100 * n) / passable : 0);
  return { passable, all: per(all), visitable: per(visitable) };
}

export function mapDensity(map: GameMap): DensityStats {
  let passable = 0;
  for (const c of map.cells) if (isPassable(c)) passable++;
  const counted = map.objects.filter((o) => o.kind !== "hero-start");
  const visitable = counted.filter((o) => o.kind !== "monster");
  return stats(passable, counted.length, visitable.length);
}

/** Density per zone id (maps without zones give an empty map). */
export function zoneDensity(map: GameMap): Map<number, DensityStats> {
  const out = new Map<number, DensityStats>();
  const zones = map.zones;
  if (!zones) return out;
  const passable = new Map<number, number>();
  const all = new Map<number, number>();
  const visitable = new Map<number, number>();
  map.cells.forEach((c, i) => {
    const z = zones[i] ?? 0;
    if (isPassable(c)) passable.set(z, (passable.get(z) ?? 0) + 1);
  });
  for (const o of map.objects) {
    if (o.kind === "hero-start") continue;
    const z = zones[o.y * map.width + o.x] ?? 0;
    all.set(z, (all.get(z) ?? 0) + 1);
    if (o.kind !== "monster") visitable.set(z, (visitable.get(z) ?? 0) + 1);
  }
  for (const [z, n] of passable) {
    out.set(z, stats(n, all.get(z) ?? 0, visitable.get(z) ?? 0));
  }
  return out;
}

/**
 * How a map is composed (bead bzc.96, docs/design/MAP_COMPOSITION.md):
 * shares of open land, obstacles and water, the obstacle masses, and how
 * empty the open ground is.
 */
export interface CompositionStats {
  /** Open land (passable cells) as a share of all cells. */
  passable: number;
  /** Open land as a share of the land (water left out). */
  landPassable: number;
  /** Mountain, forest and prop cells as a share of all cells. */
  obstacle: number;
  /** Water as a share of all cells. */
  water: number;
  /** 8-connected masses of mountain and forest. */
  masses: number;
  /** Masses of up to {@link SMALL_MASS} cells (lone clumps). */
  smallMasses: number;
  /** Obstacle cells per mass. */
  meanMass: number;
  /**
   * Radius (cells) of the largest disc of open ground with no object,
   * obstacle, prop or water in it (roads and passable decorations count
   * as open: they are nothing to do).
   */
  largestEmpty: number;
  /** Share of the open land at least four cells from anything. */
  emptyShare: number;
}

/** A mass of at most this many cells counts as a small clump. */
export const SMALL_MASS = 8;

/** Chamfer distance (1, sqrt 2) to the nearest cell with `busy` set. */
export function emptyDistance(
  W: number,
  H: number,
  busy: Uint8Array,
): Float64Array {
  const n = W * H;
  const dist = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const x = i % W;
    const y = (i - x) / W;
    // The map's rim counts as busy just outside the map.
    dist[i] = busy[i] === 1 ? 0 : Math.min(x + 1, y + 1, W - x, H - y);
  }
  const D = Math.SQRT2;
  const relax = (i: number, x: number, y: number, cost: number): void => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const d = (dist[y * W + x] ?? 0) + cost;
    if (d < (dist[i] ?? 0)) dist[i] = d;
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      relax(i, x - 1, y, 1);
      relax(i, x, y - 1, 1);
      relax(i, x - 1, y - 1, D);
      relax(i, x + 1, y - 1, D);
    }
  }
  for (let y = H - 1; y >= 0; y--) {
    for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x;
      relax(i, x + 1, y, 1);
      relax(i, x, y + 1, 1);
      relax(i, x + 1, y + 1, D);
      relax(i, x - 1, y + 1, D);
    }
  }
  return dist;
}

export function mapComposition(map: GameMap): CompositionStats {
  const W = map.width;
  const H = map.height;
  const n = W * H;
  let passable = 0;
  let water = 0;
  let obstacle = 0;
  const busy = new Uint8Array(n);
  map.cells.forEach((c, i) => {
    if (c.terrain === "water") water++;
    else if (isPassable(c)) passable++;
    else obstacle++;
    if (!isPassable(c)) busy[i] = 1;
  });
  for (const o of map.objects) {
    if (o.kind === "hero-start") continue;
    for (const [x, y] of [[o.x, o.y] as const, ...o.blocked]) {
      if (x >= 0 && y >= 0 && x < W && y < H) busy[y * W + x] = 1;
    }
  }
  // Masses of mountain and forest (props left out: they are decoration).
  const solid = (i: number): boolean => {
    const c = map.cells[i];
    return c !== undefined && c.terrain !== "water" && c.obstacle !== "none";
  };
  const seen = new Uint8Array(n);
  let masses = 0;
  let small = 0;
  let massCells = 0;
  for (let s = 0; s < n; s++) {
    if (seen[s] === 1 || !solid(s)) continue;
    seen[s] = 1;
    const stack = [s];
    let size = 0;
    while (stack.length > 0) {
      const i = stack.pop() as number;
      size++;
      const x = i % W;
      const y = (i - x) / W;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const j = ny * W + nx;
          if (seen[j] === 1 || !solid(j)) continue;
          seen[j] = 1;
          stack.push(j);
        }
      }
    }
    masses++;
    massCells += size;
    if (size <= SMALL_MASS) small++;
  }
  const dist = emptyDistance(W, H, busy);
  let largest = 0;
  let empty = 0;
  for (let i = 0; i < n; i++) {
    if (busy[i] === 1) continue;
    const d = dist[i] ?? 0;
    largest = Math.max(largest, d);
    if (d >= 4) empty++;
  }
  return {
    passable: passable / n,
    landPassable: passable / Math.max(1, n - water),
    obstacle: obstacle / n,
    water: water / n,
    masses,
    smallMasses: small,
    meanMass: masses > 0 ? massCells / masses : 0,
    largestEmpty: largest,
    emptyShare: passable > 0 ? empty / passable : 0,
  };
}
