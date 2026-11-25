/**
 * Multi-day reach for the AI (bead bzc.19): Dijkstra under the movement
 * rules of src/core/game/pathfinding.ts, with one difference: an object
 * entrance that only stops a walk (a site, a pickup, a mine) does not end
 * the search. A hero walking through it stops there, visits, and walks on
 * with its next move, so the ground behind it is reachable. Zones of
 * control, teleports and entrances that start a fight (another player's
 * town, a guarded bank) still end a walk.
 */
import { DIRECTIONS_8, inBounds } from "../map/types.ts";
import {
  assignDays,
  canEnter,
  moveContext,
  stepCost,
  type GameState,
  type HeroState,
  type MoveContext,
  type PathStep,
} from "../game/index.ts";
import { cutsCorner } from "../game/pathfinding.ts";

export interface Reach {
  /** Cell index -> cheapest movement cost. */
  cost: Map<number, number>;
  /** Cell index -> previous cell on the cheapest way. */
  parent: Map<number, number>;
  ctx: MoveContext;
  start: number;
}

/** Binary min-heap of (priority, insertion order) -> cell. */
class Heap {
  private readonly items: Array<[number, number, number]> = [];
  private seq = 0;
  get size(): number {
    return this.items.length;
  }
  private less(a: number, b: number): boolean {
    const x = this.items[a];
    const y = this.items[b];
    if (x === undefined || y === undefined) return false;
    return x[0] < y[0] || (x[0] === y[0] && x[1] < y[1]);
  }
  private swap(a: number, b: number): void {
    const t = this.items[a];
    const u = this.items[b];
    if (t === undefined || u === undefined) return;
    this.items[a] = u;
    this.items[b] = t;
  }
  push(prio: number, cell: number): void {
    this.items.push([prio, this.seq++, cell]);
    let i = this.items.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      this.swap(i, p);
      i = p;
    }
  }
  pop(): number {
    const top = this.items[0];
    const last = this.items.pop();
    if (top === undefined || last === undefined) return -1;
    if (this.items.length > 0) {
      this.items[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.items.length && this.less(l, m)) m = l;
        if (r < this.items.length && this.less(r, m)) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top[2];
  }
}

/** Entrances a walk may pass through (visiting them on the way). */
function passThrough(state: GameState, hero: HeroState): Set<number> {
  const w = state.map.width;
  const out = new Set<number>();
  for (const obj of state.map.objects) {
    const i = obj.y * w + obj.x;
    switch (obj.kind) {
      case "pickup":
      case "mine":
      case "dwelling":
      case "artifact":
        out.add(i);
        break;
      case "site": {
        const guard = obj.data["guard"];
        const beaten = state.sites[obj.id]?.guard?.length === 0;
        if (!Array.isArray(guard) || guard.length === 0 || beaten) out.add(i);
        break;
      }
      case "town":
        if (state.towns[obj.id]?.owner === hero.owner) out.add(i);
        break;
      default:
        break;
    }
  }
  return out;
}

/** Every cell the hero can reach within `budget` movement points. */
export function reachFor(
  state: GameState,
  hero: HeroState,
  budget: number,
): Reach {
  const ctx = moveContext(state, hero);
  const { map } = state;
  const w = map.width;
  const start = hero.y * w + hero.x;
  const cost = new Map<number, number>([[start, 0]]);
  const parent = new Map<number, number>();
  const through = passThrough(state, hero);
  const open = new Heap();
  open.push(0, start);
  const closed = new Set<number>();
  while (open.size > 0) {
    const cur = open.pop();
    if (closed.has(cur)) continue;
    closed.add(cur);
    const cx = cur % w;
    const cy = (cur - cx) / w;
    if (cur !== start) {
      if (ctx.guards.has(cur)) continue;
      if (ctx.stops.has(cur) && !through.has(cur)) continue;
    }
    const gc = cost.get(cur) ?? 0;
    for (const [dx, dy] of DIRECTIONS_8) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!inBounds(map, nx, ny)) continue;
      const ni = ny * w + nx;
      if (closed.has(ni) || !canEnter(ctx, nx, ny)) continue;
      if (cutsCorner(ctx, cx, cy, nx, ny)) continue;
      const ng =
        gc + stepCost(map, ctx.nativeTerrain, cx, cy, nx, ny, ctx.forestCost);
      if (ng > budget) continue;
      const old = cost.get(ni);
      if (old !== undefined && old <= ng) continue;
      cost.set(ni, ng);
      parent.set(ni, cur);
      open.push(ng, ni);
    }
  }
  return { cost, parent, ctx, start };
}

/** The steps from the hero to `cell` (with days), or null if unreached. */
export function pathIn(
  reach: Reach,
  hero: HeroState,
  cell: number,
): PathStep[] | null {
  if (!reach.cost.has(cell) || cell === reach.start) return null;
  const w = reach.ctx.map.width;
  const cells: number[] = [];
  for (let c = cell; c !== reach.start;) {
    cells.push(c);
    const p = reach.parent.get(c);
    if (p === undefined) return null;
    c = p;
  }
  cells.reverse();
  const steps: PathStep[] = [];
  let prev = reach.start;
  let total = 0;
  for (const c of cells) {
    const cost = stepCost(
      reach.ctx.map,
      reach.ctx.nativeTerrain,
      prev % w,
      Math.floor(prev / w),
      c % w,
      Math.floor(c / w),
      reach.ctx.forestCost,
    );
    total += cost;
    steps.push({
      x: c % w,
      y: Math.floor(c / w),
      cost,
      total,
      day: 0,
      attack: false,
    });
    prev = c;
  }
  const days = assignDays(
    steps.map((s) => s.cost),
    hero.mp,
    hero.maxMp,
  );
  return steps.map((s, i) => ({ ...s, day: days[i] ?? 0 }));
}
