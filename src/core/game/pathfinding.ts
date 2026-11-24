/**
 * Adventure-map pathfinding (GAME_DESIGN.md section 7.1 and 7.2).
 *
 * - 8 directions. A step costs the entered cell's terrain cost (Road 75 when
 *   both cells have a road; the hero's native terrain costs 100); a diagonal
 *   step costs that x 1.414 rounded to the nearest integer.
 * - Water, mountains, forests and object-blocked cells are impassable. A
 *   diagonal step between two impassable cells (corner cutting) is not
 *   allowed.
 * - Stop cells: a path may end on, but never pass through, a cell guarded by
 *   a neutral stack (zone of control: the 8 cells around it) or the entrance
 *   of an object whose visit does something (uncollected pickup, mine or town
 *   not owned by the hero's player).
 * - A neutral stack's own cell can only be the last step of a path: the
 *   attack. That step costs nothing and the hero does not move onto it.
 *
 * A* with an admissible octile heuristic; ties break by insertion order, so
 * results are deterministic.
 */
import {
  DIAGONAL_DEN,
  DIAGONAL_NUM,
  NATIVE_MOVE_COST,
  ROAD_MOVE_COST,
  TERRAIN_MOVE_COST,
} from "../../data/movement.ts";
import { terrainProfile, type TerrainProfile } from "./effects.ts";
import {
  DIRECTIONS_8,
  type GameMap,
  type Terrain,
  inBounds,
  isPassable,
} from "../map/types.ts";
import { findHero } from "./state.ts";
import type { GameState, HeroState } from "./types.ts";

export interface PathStep {
  x: number;
  y: number;
  /** Movement cost of this step (0 for the attack step). */
  cost: number;
  /** Cumulative cost from the start, including this step. */
  total: number;
  /**
   * 0 = reachable with today's movement points, 1 = tomorrow, and so on
   * (HoMaM-style arrows: draw day 0 in one colour, the rest in another).
   */
  day: number;
  /** The final step onto a neutral stack: the hero attacks, it does not move. */
  attack: boolean;
}

export interface Path {
  /** Steps after the hero's cell, in order. */
  steps: PathStep[];
  /** Total movement cost. */
  total: number;
}

/** Everything a step check needs, precomputed from a state for one hero. */
export interface MoveContext {
  map: GameMap;
  /**
   * How terrain costs the hero: a native terrain, or the hero's full
   * profile (native terrain and Trailcraft-like reductions, RULES_V2 3.9).
   */
  nativeTerrain: Terrain | null | TerrainProfile;
  /** Cells blocked by objects (not the entrances). */
  objectBlocked: Set<number>;
  /** Cell index -> live monster id standing there. */
  monsterAt: Map<number, string>;
  /**
   * Cell index -> another player's hero standing there: like a monster, it
   * can only be the attack step at the end of a path (RULES_V2 5.2).
   */
  enemyHeroAt: Map<number, string>;
  /** Cells of the moving player's other heroes (one hero per cell). */
  friendAt: Set<number>;
  /** Cell index -> ids of live monsters guarding it, in map object order. */
  guards: Map<number, string[]>;
  /** Entrances whose visit stops the hero. */
  stops: Set<number>;
  /** Explored flags of the hero's player, or null to ignore fog. */
  explored: boolean[] | null;
  /**
   * Move cost of a forest cell while the hero walks the Green Road
   * (RULES_V2 2.8), or null: forests are impassable.
   */
  forestCost: number | null;
}

/** Green Road: forest cells cost this much today (RULES_V2 2.8). */
export const GREEN_ROAD_MOVE_COST = 200;

export interface PathOptions {
  /** Plan through unexplored cells too (tests, AI). Default false. */
  ignoreFog?: boolean;
}

/** Builds the movement context for a hero. */
export function moveContext(
  state: GameState,
  hero: HeroState,
  options: PathOptions = {},
): MoveContext {
  const { map } = state;
  const objectBlocked = new Set<number>();
  const monsterAt = new Map<number, string>();
  const guards = new Map<number, string[]>();
  const stops = new Set<number>();
  const collected = new Set(state.collected);
  // Adventure magic (src/core/magic/adventure.ts): Parley and Green Road.
  const magic = state.magic?.heroes[hero.id];
  const parley = new Set(
    magic?.parleyDay === state.day ? (magic.parley ?? []) : [],
  );
  const forestCost =
    magic?.greenRoadDay === state.day ? GREEN_ROAD_MOVE_COST : null;
  for (const obj of map.objects) {
    for (const [x, y] of obj.blocked) objectBlocked.add(y * map.width + x);
    const entrance = obj.y * map.width + obj.x;
    switch (obj.kind) {
      case "monster": {
        const monster = state.monsters[obj.id];
        if (monster === undefined) break;
        monsterAt.set(monster.y * map.width + monster.x, monster.id);
        if (parley.has(monster.id)) break;
        for (const [dx, dy] of DIRECTIONS_8) {
          const gx = monster.x + dx;
          const gy = monster.y + dy;
          if (!inBounds(map, gx, gy)) continue;
          const i = gy * map.width + gx;
          const list = guards.get(i);
          if (list === undefined) guards.set(i, [monster.id]);
          else list.push(monster.id);
        }
        break;
      }
      case "pickup":
        if (!collected.has(obj.id)) stops.add(entrance);
        break;
      case "mine":
        if (state.mines[obj.id]?.owner !== hero.owner) stops.add(entrance);
        break;
      case "town":
        if (state.towns[obj.id]?.owner !== hero.owner) stops.add(entrance);
        break;
      case "hero-start":
        break;
    }
  }
  const enemyHeroAt = new Map<number, string>();
  const friendAt = new Set<number>();
  for (const other of state.heroes) {
    if (!other.alive || other.id === hero.id) continue;
    const i = other.y * map.width + other.x;
    if (other.owner === hero.owner) friendAt.add(i);
    else enemyHeroAt.set(i, other.id);
  }
  const player = state.players.find((p) => p.id === hero.owner);
  return {
    map,
    nativeTerrain: terrainProfile(hero),
    objectBlocked,
    monsterAt,
    enemyHeroAt,
    friendAt,
    guards,
    stops,
    explored: options.ignoreFog === true ? null : (player?.explored ?? null),
    forestCost,
  };
}

/** Ground or object makes the cell impassable (used for corner cutting). */
export function isImpassableCell(
  ctx: MoveContext,
  x: number,
  y: number,
): boolean {
  if (!inBounds(ctx.map, x, y)) return true;
  const i = y * ctx.map.width + x;
  const cell = ctx.map.cells[i];
  if (cell === undefined || ctx.objectBlocked.has(i)) return true;
  if (
    ctx.forestCost !== null &&
    cell.obstacle === "forest" &&
    cell.terrain !== "water"
  )
    return false;
  return !isPassable(cell);
}

/** Whether the hero may stand on (x, y): passable, free and explored. */
export function canEnter(ctx: MoveContext, x: number, y: number): boolean {
  if (isImpassableCell(ctx, x, y)) return false;
  const i = y * ctx.map.width + x;
  if (ctx.monsterAt.has(i) || ctx.enemyHeroAt.has(i) || ctx.friendAt.has(i)) {
    return false;
  }
  return ctx.explored === null || ctx.explored[i] === true;
}

/** True when a diagonal step from (fx, fy) to (tx, ty) cuts a blocked corner. */
export function cutsCorner(
  ctx: MoveContext,
  fx: number,
  fy: number,
  tx: number,
  ty: number,
): boolean {
  if (fx === tx || fy === ty) return false;
  return isImpassableCell(ctx, tx, fy) && isImpassableCell(ctx, fx, ty);
}

/** Rounds base x 1.414 to the nearest integer, exactly. */
export function diagonalCost(base: number): number {
  return Math.floor(
    (base * DIAGONAL_NUM * 2 + DIAGONAL_DEN) / (2 * DIAGONAL_DEN),
  );
}

/**
 * Cost of one step between adjacent cells (the entered cell must be
 * passable). Road: both cells have a road. `nativeTerrain` is a native
 * terrain (100 per straight step) or a hero's terrain profile: terrain
 * that costs more than 100 costs its reduction less, never below 100.
 */
export function stepCost(
  map: GameMap,
  nativeTerrain: Terrain | null | TerrainProfile,
  fx: number,
  fy: number,
  tx: number,
  ty: number,
  forestCost: number | null = null,
): number {
  const from = map.cells[fy * map.width + fx];
  const to = map.cells[ty * map.width + tx];
  if (from === undefined || to === undefined) {
    throw new RangeError(`stepCost: (${tx},${ty}) out of bounds`);
  }
  const profile =
    nativeTerrain === null || typeof nativeTerrain === "string"
      ? { native: nativeTerrain, reduce: 0, perTerrain: {} }
      : nativeTerrain;
  let base: number;
  if (forestCost !== null && to.obstacle === "forest") base = forestCost;
  else if (from.road && to.road) base = ROAD_MOVE_COST;
  else if (to.terrain === profile.native) base = NATIVE_MOVE_COST;
  else {
    const c = TERRAIN_MOVE_COST[to.terrain];
    if (c === null) throw new RangeError(`stepCost: (${tx},${ty}) impassable`);
    const reduce = Math.max(
      profile.reduce,
      profile.perTerrain[to.terrain] ?? 0,
    );
    base = c > NATIVE_MOVE_COST ? Math.max(NATIVE_MOVE_COST, c - reduce) : c;
  }
  return fx !== tx && fy !== ty ? diagonalCost(base) : base;
}

/** Whether entering this cell stops the hero (zone of control or a visit). */
export function isStopCell(ctx: MoveContext, x: number, y: number): boolean {
  const i = y * ctx.map.width + x;
  return ctx.guards.has(i) || ctx.stops.has(i);
}

/** Assigns `day` to each step given today's MP and the daily maximum. */
export function assignDays(
  costs: readonly number[],
  mp: number,
  maxMp: number,
): number[] {
  let left = mp;
  let day = 0;
  return costs.map((c) => {
    if (c > left) {
      day++;
      left = maxMp;
    }
    left -= c;
    return day;
  });
}

/** Binary min-heap of cell indices keyed by (priority, insertion order). */
class MinHeap {
  private prio: number[] = [];
  private order: number[] = [];
  private value: number[] = [];
  private seq = 0;

  get size(): number {
    return this.value.length;
  }

  private less(i: number, j: number): boolean {
    const pi = this.prio[i] ?? 0;
    const pj = this.prio[j] ?? 0;
    return (
      pi < pj || (pi === pj && (this.order[i] ?? 0) < (this.order[j] ?? 0))
    );
  }

  private swap(i: number, j: number): void {
    for (const a of [this.prio, this.order, this.value]) {
      const t = a[i] ?? 0;
      a[i] = a[j] ?? 0;
      a[j] = t;
    }
  }

  push(priority: number, cell: number): void {
    this.prio.push(priority);
    this.order.push(this.seq++);
    this.value.push(cell);
    let i = this.value.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      this.swap(i, p);
      i = p;
    }
  }

  /** Removes and returns the smallest cell (call only when size > 0). */
  pop(): number {
    const top = this.value[0] ?? -1;
    const n = this.value.length - 1;
    this.swap(0, n);
    this.prio.pop();
    this.order.pop();
    this.value.pop();
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < n && this.less(l, m)) m = l;
      if (r < n && this.less(r, m)) m = r;
      if (m === i) break;
      this.swap(i, m);
      i = m;
    }
    return top;
  }
}

const ROAD_DIAGONAL = diagonalCost(ROAD_MOVE_COST);

/**
 * Octile distance at road prices. `shrink` = 1 measures to the ring around
 * the target (attack paths end next to it), keeping the heuristic consistent
 * with the free attack step.
 */
function heuristic(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  shrink: number,
): number {
  const dx = Math.max(0, Math.abs(ax - bx) - shrink);
  const dy = Math.max(0, Math.abs(ay - by) - shrink);
  const diag = Math.min(dx, dy);
  return ROAD_MOVE_COST * (Math.max(dx, dy) - diag) + ROAD_DIAGONAL * diag;
}

/**
 * The cheapest path for a hero to (tx, ty), or null when there is none.
 * Targeting a neutral stack's cell gives a path that ends next to it plus
 * an `attack` step onto it.
 */
export function findPath(
  state: GameState,
  heroId: string,
  tx: number,
  ty: number,
  options: PathOptions = {},
): Path | null {
  const hero = findHero(state, heroId);
  if (hero === undefined || !hero.alive) return null;
  const ctx = moveContext(state, hero, options);
  const steps = findPathInContext(ctx, hero.x, hero.y, tx, ty);
  if (steps === null) return null;
  const days = assignDays(
    steps.map((s) => s.cost),
    hero.mp,
    hero.maxMp,
  );
  const withDays = steps.map((s, i) => ({ ...s, day: days[i] ?? 0 }));
  const last = withDays[withDays.length - 1];
  return { steps: withDays, total: last?.total ?? 0 };
}

/** A* in a prepared context; `day` is left 0. */
export function findPathInContext(
  ctx: MoveContext,
  sx: number,
  sy: number,
  tx: number,
  ty: number,
): PathStep[] | null {
  const { map } = ctx;
  if (!inBounds(map, tx, ty) || (sx === tx && sy === ty)) return null;
  const w = map.width;
  const start = sy * w + sx;
  const goal = ty * w + tx;
  const attackGoal = ctx.monsterAt.has(goal) || ctx.enemyHeroAt.has(goal);
  if (ctx.explored !== null && ctx.explored[goal] !== true) return null;
  if (!attackGoal && !canEnter(ctx, tx, ty)) return null;

  const g = new Map<number, number>([[start, 0]]);
  const parent = new Map<number, number>();
  const closed = new Set<number>();
  const open = new MinHeap();
  const shrink = attackGoal ? 1 : 0;
  open.push(heuristic(sx, sy, tx, ty, shrink), start);

  while (open.size > 0) {
    const cur = open.pop();
    if (closed.has(cur)) continue;
    if (cur === goal) break;
    closed.add(cur);
    const cx = cur % w;
    const cy = (cur - cx) / w;
    const stop = cur !== start && isStopCell(ctx, cx, cy);
    const gc = g.get(cur) ?? 0;
    for (const [dx, dy] of DIRECTIONS_8) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!inBounds(map, nx, ny)) continue;
      const ni = ny * w + nx;
      if (closed.has(ni)) continue;
      let cost: number;
      if (attackGoal && ni === goal) {
        if (cutsCorner(ctx, cx, cy, nx, ny)) continue;
        cost = 0;
      } else {
        if (stop || !canEnter(ctx, nx, ny)) continue;
        if (cutsCorner(ctx, cx, cy, nx, ny)) continue;
        cost = stepCost(map, ctx.nativeTerrain, cx, cy, nx, ny, ctx.forestCost);
      }
      const ng = gc + cost;
      const old = g.get(ni);
      if (old !== undefined && old <= ng) continue;
      g.set(ni, ng);
      parent.set(ni, cur);
      open.push(ng + heuristic(nx, ny, tx, ty, shrink), ni);
    }
  }

  if (!g.has(goal)) return null;
  const cells: number[] = [];
  for (let c = goal; c !== start; c = parent.get(c) ?? start) cells.push(c);
  cells.reverse();
  const steps: PathStep[] = [];
  let total = 0;
  let prev = start;
  for (const c of cells) {
    const attack = attackGoal && c === goal;
    const cost = attack
      ? 0
      : stepCost(
          map,
          ctx.nativeTerrain,
          prev % w,
          Math.floor(prev / w),
          c % w,
          Math.floor(c / w),
          ctx.forestCost,
        );
    total += cost;
    steps.push({ x: c % w, y: Math.floor(c / w), cost, total, day: 0, attack });
    prev = c;
  }
  return steps;
}

/**
 * Every cell the hero can reach with at most `budget` movement points
 * (default: today's), with its cheapest cost: Dijkstra under the same
 * rules as findPath (stop cells end a walk, fog respected unless
 * ignoreFog). Attack steps are not included. Deterministic.
 */
export function reachableCells(
  state: GameState,
  heroId: string,
  budget?: number,
  options: PathOptions = {},
): Map<number, number> {
  const out = new Map<number, number>();
  const hero = findHero(state, heroId);
  if (hero === undefined || !hero.alive) return out;
  const limit = budget ?? hero.mp;
  const ctx = moveContext(state, hero, options);
  const { map } = ctx;
  const w = map.width;
  const start = hero.y * w + hero.x;
  out.set(start, 0);
  const open = new MinHeap();
  open.push(0, start);
  const closed = new Set<number>();
  while (open.size > 0) {
    const cur = open.pop();
    if (closed.has(cur)) continue;
    closed.add(cur);
    const cx = cur % w;
    const cy = (cur - cx) / w;
    if (cur !== start && isStopCell(ctx, cx, cy)) continue;
    const gc = out.get(cur) ?? 0;
    for (const [dx, dy] of DIRECTIONS_8) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!inBounds(map, nx, ny)) continue;
      const ni = ny * w + nx;
      if (closed.has(ni) || !canEnter(ctx, nx, ny)) continue;
      if (cutsCorner(ctx, cx, cy, nx, ny)) continue;
      const ng =
        gc + stepCost(map, ctx.nativeTerrain, cx, cy, nx, ny, ctx.forestCost);
      if (ng > limit) continue;
      const old = out.get(ni);
      if (old !== undefined && old <= ng) continue;
      out.set(ni, ng);
      open.push(ng, ni);
    }
  }
  return out;
}
