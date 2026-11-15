/**
 * Movement on the generator's state, following GAME_DESIGN.md section 7.1:
 * 8-way steps, a diagonal costs the entered cell's cost x 1.414 (rounded),
 * a step with road on both cells costs the road value, and a diagonal step
 * between two impassable cells (cutting a corner) is not allowed.
 */
import { at, MinHeap, N8 } from "./grid.ts";
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

/** Cells reachable from `from` (1) under the movement rules. */
export function reachable(
  st: GenState,
  from: number,
  walk: (k: number) => boolean = (k) => isWalkable(st, k),
): Uint8Array {
  const { g } = st;
  const seen = new Uint8Array(g.n);
  if (from < 0) return seen;
  seen[from] = 1;
  const stack = [from];
  while (stack.length > 0) {
    const i = stack.pop() as number;
    const x = g.x(i);
    const y = g.y(i);
    for (const [dx, dy] of N8) {
      const nx = x + dx;
      const ny = y + dy;
      if (!g.inside(nx, ny)) continue;
      const j = g.idx(nx, ny);
      if (at(seen, j) || !walk(j) || !canStep(st, i, dx, dy, walk)) continue;
      seen[j] = 1;
      stack.push(j);
    }
  }
  return seen;
}

/** Straight-step cost of entering a land cell (the native Chieftain). */
export function enterCost(st: GenState, j: number): number {
  const t = TERRAIN_OF[at(st.terrain, j)] ?? "grass";
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
    at(st.road, i) && at(st.road, j) ? st.cfg.movement.road : enterCost(st, j);
  return diagonal ? Math.round(base * 1.414) : base;
}

/** Movement cost from `from` to every cell (Infinity where unreachable). */
export function movementCost(
  st: GenState,
  from: number,
  /** Charge every step this straight cost instead (e.g. a road everywhere). */
  flat?: number,
): Float64Array {
  const { g } = st;
  const dist = new Float64Array(g.n).fill(Infinity);
  if (from < 0) return dist;
  const walk = (k: number): boolean => isWalkable(st, k);
  const heap = new MinHeap();
  dist[from] = 0;
  heap.push(0, from);
  while (heap.size > 0) {
    const { priority, value: i } = heap.pop();
    if (priority > at(dist, i)) continue;
    const x = g.x(i);
    const y = g.y(i);
    for (const [dx, dy] of N8) {
      const nx = x + dx;
      const ny = y + dy;
      if (!g.inside(nx, ny)) continue;
      const j = g.idx(nx, ny);
      if (!walk(j) || !canStep(st, i, dx, dy, walk)) continue;
      const diagonal = dx !== 0 && dy !== 0;
      const d =
        priority +
        (flat === undefined
          ? stepCost(st, i, j, diagonal)
          : diagonal
            ? Math.round(flat * 1.414)
            : flat);
      if (d < at(dist, j)) {
        dist[j] = d;
        heap.push(d, j);
      }
    }
  }
  return dist;
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
  wobble: Float64Array,
  maxCells = Infinity,
): number[] | undefined {
  const { g, cfg } = st;
  const rc = cfg.roads;
  const walk = (k: number): boolean => isWalkable(st, k);
  const S = 9;
  const dist = new Float64Array(g.n * S).fill(Infinity);
  const steps = new Int32Array(g.n * S);
  const prev = new Int32Array(g.n * S).fill(-1);
  const heap = new MinHeap();
  for (const s of sources) {
    dist[s * S + 8] = 0;
    heap.push(0, s * S + 8);
  }
  while (heap.size > 0) {
    const { priority, value: state } = heap.pop();
    if (priority > at(dist, state)) continue;
    const i = Math.floor(state / S);
    const dir = state % S;
    if (isGoal(i) && !sources.includes(i)) {
      const path: number[] = [];
      for (let k = state; k >= 0; k = at(prev, k)) path.push(Math.floor(k / S));
      return path.reverse();
    }
    if (at(steps, state) >= maxCells) continue;
    const x = g.x(i);
    const y = g.y(i);
    N8.forEach(([dx, dy], nd) => {
      const nx = x + dx;
      const ny = y + dy;
      if (!g.inside(nx, ny)) return;
      const j = g.idx(nx, ny);
      if (!walk(j) || !canStep(st, i, dx, dy, walk)) return;
      const diag = dx !== 0 && dy !== 0;
      let c = enterCost(st, j) * (diag ? 1.414 : 1);
      c *= 1 + 0.5 * at(wobble, j);
      if (at(st.road, j)) c *= rc.reuse;
      let hug = 0;
      for (const [ax, ay] of N8) {
        const k = g.idx(nx + ax, ny + ay);
        if (g.inside(nx + ax, ny + ay) && !walk(k)) hug++;
      }
      c += hug * rc.hugPenalty;
      if (at(st.terrain, j) === T.water) return;
      if (dir !== 8) {
        const turn = Math.min((nd - dir + 8) % 8, (dir - nd + 8) % 8);
        c += turn * turn * rc.turnPenalty;
      }
      const ns = j * S + nd;
      const d = priority + c;
      if (d < at(dist, ns)) {
        dist[ns] = d;
        prev[ns] = state;
        steps[ns] = at(steps, state) + 1;
        heap.push(d, ns);
      }
    });
  }
  return undefined;
}
