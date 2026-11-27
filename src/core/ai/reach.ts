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
 * Like the player's paths (bead bzc.107), routes go round every building
 * entrance (MoveContext.buildings) whenever a way round exists: walking
 * on beyond one costs BUILDING_DETOUR in the planning order, so the hero
 * visits only what it targets. Reaching the entrance itself costs nothing
 * extra, and a waystone the search is carried by is not a detour.
 *
 * Naval maps (NAVAL 12, bead bzc.156): the search runs over land and sea
 * with the player's planning rules (pathfinding.ts navalStepKind): boarding
 * any moored ship (own, neutral or an enemy's), sailing and landing, and
 * Lily Road's crossings on foot when the spell is on. Costs are in
 * land-equivalent points (sea points x landMax / seaMax; a landing without
 * Seafaring costs the rest of that day), so a day is `hero.maxMp` on land
 * and at sea alike; pathIn replays the exact conversions for the days.
 * A dry map runs the land search unchanged.
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
import {
  BUILDING_DETOUR,
  cutsCorner,
  navalStepCost,
  navalStepKind,
  replayNavalSteps,
  restOfDay,
  seaToLand,
  type NavalMove,
} from "../game/pathfinding.ts";
import { isAfloat, seaMaxOf } from "../game/naval.ts";

export interface Reach {
  /**
   * Cell index -> cheapest movement cost (land-equivalent points on a
   * naval map).
   */
  cost: Map<number, number>;
  /**
   * Cell index -> previous cell on the cheapest way. On a naval map with
   * Lily Road a node `cells + i` is the hero on foot on water cell i.
   */
  parent: Map<number, number>;
  ctx: MoveContext;
  start: number;
  /** Cells reached by a waystone (their parent is the waystone). */
  jumps: Set<number>;
}

export interface ReachOptions {
  /**
   * Naval maps: extra moored ships to plan with (cell -> a ship id), as if
   * they lay there now: a ship the player could buy at a dock or call to
   * the shore (bead bzc.156).
   */
  moored?: ReadonlyMap<number, string>;
}

/**
 * The hero's points now in land-equivalent points (bead bzc.156): afloat,
 * its sea points x landMax / seaMax; ashore (and on every dry map) its
 * points as they are.
 */
export function landPointsNow(state: GameState, hero: HeroState): number {
  if (state.ships === undefined || !isAfloat(state, hero)) return hero.mp;
  const sea = seaMaxOf(state, hero);
  return sea > 0 ? Math.floor((hero.mp * hero.maxMp) / sea) : hero.mp;
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
  options: ReachOptions = {},
): Reach {
  const ctx = moveContext(state, hero);
  if (ctx.naval !== undefined && ctx.naval !== null) {
    if (options.moored !== undefined) {
      const moored = new Map(ctx.naval.moored);
      for (const [cell, id] of options.moored) moored.set(cell, id);
      ctx.naval = { ...ctx.naval, moored };
    }
    return navalReach(state, hero, ctx, ctx.naval, budget, pointless);
  }
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
    // Walking on beyond a building's entrance passes it (bead bzc.107):
    // only when no way round exists.
    const past =
      cur !== start && !jumps.has(cur) && ctx.buildings.has(cur)
        ? BUILDING_DETOUR
        : 0;
    const gp = (prio.get(cur) ?? gc) + past;
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

/**
 * reachFor on a naval map (bead bzc.156): the same rules over land and sea.
 * Steps are pathfinding.ts's ordinary naval steps (walk, sail, board,
 * land, and Lily Road's crossings when the spell is on); costs are
 * land-equivalent points, a sail step its sea cost x landMax / seaMax and a
 * landing without Seafaring the rest of that day. Lily pads are crossed
 * within today and never stood on: a node `cells + i` is the hero on foot
 * on water cell i, and only land and sea cells (where the hero stands, on
 * foot or aboard) are in `cost`.
 */
function navalReach(
  state: GameState,
  hero: HeroState,
  ctx: MoveContext,
  nav: NavalMove,
  budget: number,
  pointless: ReadonlySet<number>,
): Reach {
  const { map } = state;
  const w = map.width;
  const cells = w * map.height;
  const start = hero.y * w + hero.x;
  const ratio = seaToLand(nav);
  // Today's points in land-equivalent points (what a landing ends).
  const mp0 = nav.afloat ? nav.mp * ratio : nav.mp;
  const dist = new Map<number, number>([[start, 0]]);
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
    const onFoot = cur >= cells;
    const cell = onFoot ? cur - cells : cur;
    const cx = cell % w;
    const cy = (cell - cx) / w;
    if (cur !== start && !onFoot) {
      if (ctx.guards.has(cur) || ctx.monsterAt.has(cur)) continue;
      const exit = jumps.has(cur) ? undefined : exits.get(cur);
      if (exit !== undefined) {
        const ex = exit % w;
        const ey = (exit - ex) / w;
        const g = dist.get(cur) ?? 0;
        const gp = prio.get(cur) ?? g;
        const old = prio.get(exit);
        if (
          !closed.has(exit) &&
          (old === undefined || gp < old) &&
          canEnter(ctx, ex, ey)
        ) {
          dist.set(exit, g);
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
    const gc = dist.get(cur) ?? 0;
    const past =
      cur !== start && !onFoot && !jumps.has(cur) && ctx.buildings.has(cur)
        ? BUILDING_DETOUR
        : 0;
    const gp = (prio.get(cur) ?? gc) + past;
    for (const [dx, dy] of DIRECTIONS_8) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!inBounds(map, nx, ny)) continue;
      const ni = ny * w + nx;
      if (ctx.monsterAt.has(ni)) continue;
      // An uncollected pickup is a way through (taken from the cell
      // before it, bead bzc.49), on land or at sea.
      const pickup = ctx.pickupAt.has(ni);
      if (pickup && ctx.explored !== null && ctx.explored[ni] !== true) {
        continue;
      }
      const kind = navalStepKind(ctx, cx, cy, nx, ny, pickup, onFoot);
      if (kind === null) continue;
      const node = kind === "lily" ? cells + ni : ni;
      if (closed.has(node)) continue;
      const c = navalStepCost(ctx, kind, cx, cy, nx, ny);
      const step =
        kind === "sail"
          ? c * ratio
          : c < 0
            ? restOfDay(gc, mp0, nav.landMax)
            : c;
      const ng = gc + step;
      if (ng > budget) continue;
      // Lily pads: the crossing and the step off it happen today.
      if ((kind === "lily" || onFoot) && ng > mp0) continue;
      const np = gp + step + (pointless.has(ni) ? POINTLESS_STOP_COST : 0);
      const old = prio.get(node);
      if (old !== undefined && old <= np) continue;
      dist.set(node, ng);
      prio.set(node, np);
      parent.set(node, cur);
      jumps.delete(node);
      open.push(np, node);
    }
  }
  const cost = new Map<number, number>();
  for (const [node, c] of dist) {
    if (node < cells && !ctx.pickupAt.has(node)) cost.set(node, c);
  }
  return { cost, parent, ctx, start, jumps };
}

/**
 * pathIn on a naval map: the cells as reached (lily nodes on foot), cut
 * at a waystone or a pickup as on land, as the player's naval steps
 * (board, land, sail flags) with the exact conversions and days
 * (pathfinding.ts replayNavalSteps).
 */
function navalPathIn(
  reach: Reach,
  nav: NavalMove,
  cell: number,
): PathStep[] | null {
  const { ctx } = reach;
  const w = ctx.map.width;
  const cells = w * ctx.map.height;
  let nodes: number[] = [];
  for (let c = cell; c !== reach.start;) {
    nodes.push(c);
    const p = reach.parent.get(c);
    if (p === undefined) return null;
    c = p;
  }
  nodes.reverse();
  const jump = nodes.findIndex((c) => reach.jumps.has(c));
  if (jump >= 0) nodes = nodes.slice(0, jump);
  const take = nodes.findIndex((c) => c < cells && ctx.pickupAt.has(c));
  if (take >= 0) nodes = nodes.slice(0, take + 1);
  if (nodes.length === 0) return null;
  const steps: PathStep[] = [];
  let prev = reach.start;
  let afloat = nav.afloat;
  for (const node of nodes) {
    const c = node >= cells ? node - cells : node;
    const p = prev >= cells ? prev - cells : prev;
    const x = c % w;
    const y = Math.floor(c / w);
    const pickup = node < cells && ctx.pickupAt.has(c);
    if (pickup) {
      steps.push({
        x,
        y,
        cost: 0,
        total: 0,
        day: 0,
        attack: false,
        pickup: true,
        ...(afloat ? { afloat: true } : {}),
      });
      prev = node;
      continue;
    }
    const px = p % w;
    const py = Math.floor(p / w);
    const kind = navalStepKind(ctx, px, py, x, y, false, prev >= cells);
    if (kind === null) return null;
    const raw = navalStepCost(ctx, kind, px, py, x, y);
    const flags: { board?: string; land?: boolean; endsDay?: boolean } = {};
    if (kind === "board") {
      const ship = nav.moored.get(c);
      if (ship !== undefined) flags.board = ship;
    }
    if (kind === "land") {
      flags.land = true;
      if (raw < 0) flags.endsDay = true;
    }
    afloat = kind === "sail" || kind === "board";
    steps.push({
      x,
      y,
      cost: Math.max(0, raw),
      total: 0,
      day: 0,
      attack: false,
      ...(afloat ? { afloat: true } : {}),
      ...flags,
    });
    prev = node;
  }
  return replayNavalSteps(steps, nav);
}

/** The steps from the hero to `cell` (with days), or null if unreached. */
export function pathIn(
  reach: Reach,
  hero: HeroState,
  cell: number,
): PathStep[] | null {
  if (!reach.cost.has(cell) || cell === reach.start) return null;
  const nav = reach.ctx.naval;
  if (nav !== undefined && nav !== null) return navalPathIn(reach, nav, cell);
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
