/**
 * Multi-day reach for the AI (bead bzc.19): Dijkstra under the movement
 * rules of src/core/game/pathfinding.ts, with one difference: an object
 * entrance that only stops a walk (a site, a mine) does not end the
 * search. A hero walking through it stops there, visits, and walks on
 * with its next move, so the ground behind it is reachable. Pickups block
 * their cell (bead bzc.49) but are taken for free from a next cell, after
 * which the cell is open: the search walks on through an uncollected
 * pickup at its cell's cost, a path through one ends by reaching for it
 * (the hero plans again from beside it), and pickup cells are left out of
 * `cost` (no hero stands there before taking it). Waystones (iteration 3, bead bzc.23) carry the
 * search to their exit (a one-way waystone's exit, a two-way waystone's
 * twin) when the hero could stand there; a path through one ends on the
 * waystone (the hero is carried and plans again from the exit). Zones of control and entrances that
 * start a fight (another player's town, a guarded bank) still end a walk.
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
  /** Cells reached by a waystone (their parent is the waystone). */
  jumps: Set<number>;
}

/** Whether the search may enter the cell: standable, or a pickup to take. */
function enterable(ctx: MoveContext, x: number, y: number): boolean {
  if (canEnter(ctx, x, y)) return true;
  const i = y * ctx.map.width + x;
  return (
    ctx.pickupAt.has(i) && (ctx.explored === null || ctx.explored[i] === true)
  );
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
      case "mine":
      case "dwelling":
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

/** Waystone entrance cell -> the cell it carries a hero to. */
export function waystoneExits(state: GameState): Map<number, number> {
  const w = state.map.width;
  const out = new Map<number, number>();
  for (const obj of state.map.objects) {
    if (obj.kind !== "teleport") continue;
    const type = obj.data["type"];
    let to: { x: number; y: number } | undefined;
    if (type === "one-way-waystone") {
      const exit = obj.data["exit"];
      if (Array.isArray(exit)) {
        to = { x: Number(exit[0]), y: Number(exit[1]) };
      }
    } else if (type === "two-way-waystone") {
      const twin = state.map.objects.find(
        (o) =>
          o.id !== obj.id &&
          o.data["type"] === "two-way-waystone" &&
          o.data["pair"] === obj.data["pair"],
      );
      if (twin !== undefined) to = { x: twin.x, y: twin.y };
    }
    if (to === undefined || !inBounds(state.map, to.x, to.y)) continue;
    out.set(obj.y * w + obj.x, to.y * w + to.x);
  }
  return out;
}

/**
 * Extra planning cost of walking through an entrance that stops the walk
 * and gives the hero nothing (iteration 4): about a cell and a half, so a
 * route beside such a site wins whenever one exists at a similar cost.
 */
export const POINTLESS_STOP_COST = 150;

/**
 * Every cell the hero can reach within `budget` movement points.
 * `pointless` (iteration 4, bead bzc.41) lists entrances whose visit
 * stops the walk and gives this hero nothing (a well it is already
 * blessed by, a spent site): routes go beside them when they can, at
 * POINTLESS_STOP_COST extra each in the planning order; the costs kept
 * are the real movement costs of the routes chosen.
 */
export function reachFor(
  state: GameState,
  hero: HeroState,
  budget: number,
  pointless: ReadonlySet<number> = new Set(),
): Reach {
  const ctx = moveContext(state, hero);
  const { map } = state;
  const w = map.width;
  const start = hero.y * w + hero.x;
  const cost = new Map<number, number>([[start, 0]]);
  // Planning order: the real cost plus the pointless stops passed.
  const prio = new Map<number, number>([[start, 0]]);
  const parent = new Map<number, number>();
  const through = passThrough(state, hero);
  const exits = waystoneExits(state);
  const jumps = new Set<number>();
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
      // A stack's own cell is a fight, never a way through (iteration 2:
      // a hero starting inside a zone walked "through" the stack, a fight
      // its estimate never saw).
      if (ctx.monsterAt.has(cur)) continue;
      // A waystone carries the hero to its exit at no extra cost; the
      // exit (even a twin waystone) is where it walks on from.
      const exit = jumps.has(cur) ? undefined : exits.get(cur);
      if (exit !== undefined) {
        const ex = exit % w;
        const ey = (exit - ex) / w;
        const g = cost.get(cur) ?? 0;
        const gp = prio.get(cur) ?? g;
        const old = prio.get(exit);
        if (
          !closed.has(exit) &&
          (old === undefined || gp < old) &&
          canEnter(ctx, ex, ey)
        ) {
          cost.set(exit, g);
          prio.set(exit, gp);
          parent.set(exit, cur);
          jumps.add(exit);
          open.push(gp, exit);
        }
        continue;
      }
      if (ctx.stops.has(cur) && !through.has(cur) && !jumps.has(cur)) {
        continue;
      }
    }
    const gc = cost.get(cur) ?? 0;
    const gp = prio.get(cur) ?? gc;
    for (const [dx, dy] of DIRECTIONS_8) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!inBounds(map, nx, ny)) continue;
      const ni = ny * w + nx;
      if (closed.has(ni) || !enterable(ctx, nx, ny)) continue;
      if (cutsCorner(ctx, cx, cy, nx, ny)) continue;
      const step = stepCost(
        map,
        ctx.nativeTerrain,
        cx,
        cy,
        nx,
        ny,
        ctx.forestCost,
      );
      const ng = gc + step;
      if (ng > budget) continue;
      const np = gp + step + (pointless.has(ni) ? POINTLESS_STOP_COST : 0);
      const old = prio.get(ni);
      if (old !== undefined && old <= np) continue;
      cost.set(ni, ng);
      prio.set(ni, np);
      parent.set(ni, cur);
      jumps.delete(ni);
      open.push(np, ni);
    }
  }
  // A pickup's cell is a way through, never a place to stand (bead bzc.49).
  for (const cell of ctx.pickupAt.keys()) cost.delete(cell);
  return { cost, parent, ctx, start, jumps };
}

/** The steps from the hero to `cell` (with days), or null if unreached. */
export function pathIn(
  reach: Reach,
  hero: HeroState,
  cell: number,
): PathStep[] | null {
  if (!reach.cost.has(cell) || cell === reach.start) return null;
  const w = reach.ctx.map.width;
  let cells: number[] = [];
  for (let c = cell; c !== reach.start;) {
    cells.push(c);
    const p = reach.parent.get(c);
    if (p === undefined) return null;
    c = p;
  }
  cells.reverse();
  // Through a waystone: the walk ends on it (the hero is carried on).
  const jump = cells.findIndex((c) => reach.jumps.has(c));
  if (jump >= 0) cells = cells.slice(0, jump);
  // Through a pickup (bead bzc.49): the walk ends reaching for it.
  const take = cells.findIndex((c) => reach.ctx.pickupAt.has(c));
  if (take >= 0) cells = cells.slice(0, take + 1);
  if (cells.length === 0) return null;
  const steps: PathStep[] = [];
  let prev = reach.start;
  let total = 0;
  for (const c of cells) {
    const pickup = reach.ctx.pickupAt.has(c);
    const cost = pickup
      ? 0
      : stepCost(
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
      ...(pickup ? { pickup: true } : {}),
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
