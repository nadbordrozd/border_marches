/**
 * Movement on the generator's state, following GAME_DESIGN.md section 7.1:
 * 8-way steps, a diagonal costs the entered cell's cost x 1.414 (rounded),
 * a step with road on both cells costs the road value, and a diagonal step
 * between two impassable cells (cutting a corner) is not allowed.
 *
 * The searches run on flat typed arrays (a walk mask and per-cell step
 * costs built once per call) because they are the generator's hot loops.
 */
import { MinHeap, N8 } from "./grid.ts";
import { T, isWalkable } from "./state.ts";
import type { GenState } from "./state.ts";
import { TERRAIN_OF } from "./state.ts";

/** Whether a step from i by (dx, dy) to j is allowed (j must be walkable). */
export function canStep(
  st: GenState,
  i: number,
  dx: number,
  dy: number,
  walk: (k: number) => boolean,
): boolean {
  if (dx === 0 || dy === 0) return true;
  const { g } = st;
  const x = g.x(i);
  const y = g.y(i);
  return walk(g.idx(x + dx, y)) || walk(g.idx(x, y + dy));
}

/** 1 where the hero can stand (open ground, no object footprint). */
export function walkMask(st: GenState): Uint8Array {
  const out = new Uint8Array(st.g.n);
  for (let i = 0; i < st.g.n; i++) out[i] = isWalkable(st, i) ? 1 : 0;
  return out;
}

/** Cells reachable from `from` (1) under the movement rules. */
export function reachable(
  st: GenState,
  from: number,
  walk?: (k: number) => boolean,
): Uint8Array {
  let mask: Uint8Array;
  if (walk) {
    mask = new Uint8Array(st.g.n);
    for (let k = 0; k < st.g.n; k++) if (walk(k)) mask[k] = 1;
  } else mask = walkMask(st);
  return reachMask(st, from, mask);
}

/** Cells reachable from `from` over a walk mask (1 = walkable). */
export function reachMask(
  st: GenState,
  from: number,
  mask: Uint8Array,
): Uint8Array {
  const { g } = st;
  const w = g.w;
  const h = g.h;
  const seen = new Uint8Array(g.n);
  if (from < 0) return seen;
  // Inland Sea and Islands (bead bzc.155): ships sail the seas.
  if (st.seaPass !== undefined) mask = withSea(st, mask);
  seen[from] = 1;
  const stack = new Int32Array(g.n);
  let top = 0;
  stack[top++] = from;
  while (top > 0) {
    const i = stack[--top] ?? 0;
    const x = i % w;
    const y = (i - x) / w;
    for (let d = 0; d < 8; d++) {
      const dx = DX[d] ?? 0;
      const dy = DY[d] ?? 0;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = i + dy * w + dx;
      if (seen[j] === 1 || mask[j] !== 1) continue;
      if (dx !== 0 && dy !== 0 && mask[i + dx] !== 1 && mask[i + dy * w] !== 1)
        continue;
      seen[j] = 1;
      stack[top++] = j;
    }
  }
  return seen;
}

/**
 * A copy of a walk mask with the sea cells of an Inland Sea or Islands map
 * open (bead bzc.155): a ship takes a hero from any shore, so the
 * generator's reachability counts sailing.
 */
export function withSea(st: GenState, mask: Uint8Array): Uint8Array {
  const sea = st.seaPass;
  if (sea === undefined) return mask;
  const out = mask.slice();
  for (let i = 0; i < st.g.n; i++) {
    if (sea[i] === 1 && st.terrain[i] === T.water) out[i] = 1;
  }
  return out;
}

/** 1 on the sea cells a ship sails now (Inland Sea and Islands maps). */
export function sailMask(st: GenState): Uint8Array | undefined {
  const sea = st.seaPass;
  if (sea === undefined) return undefined;
  const out = new Uint8Array(st.g.n);
  for (let i = 0; i < st.g.n; i++) {
    if (sea[i] === 1 && st.terrain[i] === T.water) out[i] = 1;
  }
  return out;
}

const DX = Int8Array.from(N8.map(([dx]) => dx));
const DY = Int8Array.from(N8.map(([, dy]) => dy));

/** Straight cost of a step at sea (NAVAL 2.4: 1500 sea points a day). */
export const SAIL_STEP = 100;

/** Straight-step cost of entering a land cell (the native Chieftain). */
export function enterCost(st: GenState, j: number): number {
  const t = TERRAIN_OF[st.terrain[j] ?? 0] ?? "grass";
  if (t === "water") return Infinity;
  return st.cfg.movement.cost[t];
}

/** Cost of one step from i to j (adjacent; j walkable). */
export function stepCost(
  st: GenState,
  i: number,
  j: number,
  diagonal: boolean,
): number {
  const base =
    st.road[i] === 1 && st.road[j] === 1
      ? st.cfg.movement.road
      : enterCost(st, j);
  return diagonal ? Math.round(base * 1.414) : base;
}

/**
 * Movement cost from the nearest of `from` (one cell or several) to every
 * cell (Infinity where unreachable).
 */
export function movementCost(
  st: GenState,
  from: number | readonly number[],
  /** Charge every step this straight cost instead (e.g. a road everywhere). */
  flat?: number,
): Float64Array {
  const { g, cfg } = st;
  const w = g.w;
  const h = g.h;
  const dist = new Float64Array(g.n).fill(Infinity);
  const sources = typeof from === "number" ? [from] : from;
  const land = walkMask(st);
  // Inland Sea and Islands (bead bzc.155): sailing costs 100 a step, a
  // landing the configured share of a day.
  const sail = sailMask(st);
  const mask = sail === undefined ? land : withSea(st, land);
  const landing = cfg.sea.landingCost;
  // Straight and diagonal cost of entering each cell, off road.
  const straight = new Float64Array(g.n);
  const diag = new Float64Array(g.n);
  for (let j = 0; j < g.n; j++) {
    if (mask[j] !== 1) continue;
    const base = sail?.[j] === 1 ? SAIL_STEP : (flat ?? enterCost(st, j));
    straight[j] = base;
    diag[j] = Math.round(base * 1.414);
  }
  const road = flat === undefined ? st.road : new Uint8Array(g.n);
  const roadStraight = cfg.movement.road;
  const roadDiag = Math.round(roadStraight * 1.414);
  const heap = new MinHeap();
  for (const s of sources) {
    if (s < 0) continue;
    dist[s] = 0;
    heap.push(0, s);
  }
  while (heap.size > 0) {
    const { priority, value: i } = heap.pop();
    if (priority > (dist[i] ?? Infinity)) continue;
    const x = i % w;
    const y = (i - x) / w;
    const onRoad = road[i] === 1;
    for (let d = 0; d < 8; d++) {
      const dx = DX[d] ?? 0;
      const dy = DY[d] ?? 0;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = i + dy * w + dx;
      if (mask[j] !== 1) continue;
      const diagonal = dx !== 0 && dy !== 0;
      if (diagonal && mask[i + dx] !== 1 && mask[i + dy * w] !== 1) continue;
      const step =
        onRoad && road[j] === 1
          ? diagonal
            ? roadDiag
            : roadStraight
          : diagonal
            ? (diag[j] ?? 0)
            : (straight[j] ?? 0);
      const nd =
        priority +
        step +
        (sail !== undefined && sail[i] === 1 && sail[j] !== 1 ? landing : 0);
      if (nd < (dist[j] ?? Infinity)) {
        dist[j] = nd;
        heap.push(nd, j);
      }
    }
  }
  return dist;
}

/** Per-cell road-building costs, built once for a batch of road searches. */
export interface RoadCosts {
  walk: Uint8Array;
  /** Cost of entering a cell straight (before turns and re-use). */
  enter: Float64Array;
}

/** Road costs for the current state (rebuild after footprints change). */
export function roadCosts(st: GenState, wobble: Float64Array): RoadCosts {
  const { g, cfg } = st;
  const walk = walkMask(st);
  const enter = new Float64Array(g.n).fill(Infinity);
  for (let j = 0; j < g.n; j++) {
    if (walk[j] !== 1 || st.terrain[j] === T.water) continue;
    let hug = 0;
    const x = g.x(j);
    const y = g.y(j);
    for (let d = 0; d < 8; d++) {
      const nx = x + (DX[d] ?? 0);
      const ny = y + (DY[d] ?? 0);
      if (g.inside(nx, ny) && walk[g.idx(nx, ny)] !== 1) hug++;
    }
    enter[j] =
      enterCost(st, j) * (1 + 0.5 * (wobble[j] ?? 0)) +
      hug * cfg.roads.hugPenalty;
  }
  return { walk, enter };
}

/**
 * Road search: Dijkstra over (cell, heading) with a turning penalty so roads
 * run in long, gently bending lines. Existing road is cheap to re-use.
 * Returns the cell path from a source to the first goal reached, or
 * undefined. `isGoal` is tested on popped cells.
 */
export function roadPath(
  st: GenState,
  sources: readonly number[],
  isGoal: (i: number) => boolean,
  costs: RoadCosts,
  maxCells = Infinity,
): number[] | undefined {
  const { g, cfg } = st;
  const rc = cfg.roads;
  const w = g.w;
  const h = g.h;
  const { walk, enter } = costs;
  const S = 9;
  const dist = new Float64Array(g.n * S).fill(Infinity);
  const steps = new Int32Array(g.n * S);
  const prev = new Int32Array(g.n * S).fill(-1);
  const heap = new MinHeap();
  const isSource = new Uint8Array(g.n);
  for (const s of sources) {
    isSource[s] = 1;
    dist[s * S + 8] = 0;
    heap.push(0, s * S + 8);
  }
  const SQ = Math.SQRT2;
  while (heap.size > 0) {
    const { priority, value: state } = heap.pop();
    if (priority > (dist[state] ?? Infinity)) continue;
    const i = Math.floor(state / S);
    const dir = state % S;
    if (isSource[i] === 0 && isGoal(i)) {
      const path: number[] = [];
      for (let k = state; k >= 0; k = prev[k] ?? -1)
        path.push(Math.floor(k / S));
      return path.reverse();
    }
    if ((steps[state] ?? 0) >= maxCells) continue;
    const x = i % w;
    const y = (i - x) / w;
    for (let nd = 0; nd < 8; nd++) {
      const dx = DX[nd] ?? 0;
      const dy = DY[nd] ?? 0;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = i + dy * w + dx;
      if (walk[j] !== 1) continue;
      const diagonal = dx !== 0 && dy !== 0;
      if (diagonal && walk[i + dx] !== 1 && walk[i + dy * w] !== 1) continue;
      let c = (enter[j] ?? Infinity) * (diagonal ? SQ : 1);
      if (st.road[j] === 1) c *= rc.reuse;
      if (dir !== 8) {
        const turn = Math.min((nd - dir + 8) % 8, (dir - nd + 8) % 8);
        c += turn * turn * rc.turnPenalty;
      }
      const ns = j * S + nd;
      const d = priority + c;
      if (d < (dist[ns] ?? Infinity)) {
        dist[ns] = d;
        prev[ns] = state;
        steps[ns] = (steps[state] ?? 0) + 1;
        heap.push(d, ns);
      }
    }
  }
  return undefined;
}
