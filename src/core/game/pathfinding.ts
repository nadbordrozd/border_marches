/**
 * Adventure-map pathfinding (GAME_DESIGN.md section 7.1 and 7.2).
 *
 * - 8 directions. A step costs the entered cell's terrain cost (Road 70 when
 *   both cells have a road; the hero's native terrain costs 100); a diagonal
 *   step costs that x 1.414 rounded to the nearest integer, except a
 *   road-to-road diagonal with a road corner cell: 141, more than the two
 *   road steps round the corner (140), so heroes follow the road as drawn.
 * - Water, mountains, forests and object-blocked cells are impassable. A
 *   diagonal step between two impassable cells (corner cutting) is not
 *   allowed.
 * - Stop cells: a path may end on, but never pass through, a cell guarded by
 *   a neutral stack (zone of control: the 8 cells around it) or the entrance
 *   of an object whose visit does something (a site, a mine or town not
 *   owned by the hero's player).
 * - A neutral stack's own cell can only be the last step of a path: the
 *   attack. That step costs nothing and the hero does not move onto it.
 * - An uncollected pickup (RULES_V2 5.6, bead bzc.49) blocks its cell. It
 *   can only be the last step of a path, taken from a next cell: the
 *   pickup step costs nothing and the hero does not move onto it. Paths
 *   take it from a cell that is not a stop cell whenever there is one;
 *   from a stop cell the walk stops there first (a fight in a zone of
 *   control, a visit) and the pickup waits for the next click.
 * - Buildings stay beside the way (bead bzc.107): a path steps onto the
 *   entrance of a visitable building (a mine, town, dwelling, site, bank
 *   or waystone still on the map, whether or not its visit would stop the
 *   hero) only when it is the target or when no way round exists; such a
 *   step carries PathStep.building so the preview can mark it. Pickups are
 *   not buildings: they may lie on the way.
 * - Opt-in `throughGuards` (bead bzc.77, the player's clicks): a target
 *   that only lies beyond zones of control gets the walk to the first
 *   guard on the way, ending with the fight (Path.blockedBy); one beyond a
 *   stack in a gap, a visit or a pickup gets the walk to that (bead
 *   bzc.79, Path.blockedBy or Path.stopsAt).
 *
 * - Naval maps (NAVAL 2.3-2.7, bead bzc.149; `map.naval`): the sea is a
 *   second graph. A hero ashore boards a moored ship by stepping onto it
 *   from a shore cell (100, 141 diagonally, in land points; the rest is
 *   converted to sea points); afloat it sails sea cells (100 / 141 in sea
 *   points; a diagonal never squeezes between two closed corners) and
 *   lands by stepping onto a free land cell (the rest of the day without
 *   Seafaring; with it, the points are converted back and the step costs
 *   the ordinary land cost). Zones of control cover only cells of the
 *   stack's own element. Attacks and pickups reach across the shore both
 *   ways. The search counts sea steps in land-equivalent points (x landMax
 *   / seaMax) and a day-ending landing as the rest of that day, so a mixed
 *   path is ordered by time; findPath then replays it step by step with
 *   the exact conversions for the days and the points left. Dry maps take
 *   none of these branches and plan exactly as before.
 *
 * A* with an admissible octile heuristic; ties break by insertion order, so
 * results are deterministic.
 */
import {
  DIAGONAL_DEN,
  DIAGONAL_NUM,
  NATIVE_MOVE_COST,
  ROAD_CORNER_DIAGONAL_COST,
  ROAD_MOVE_COST,
  TERRAIN_MOVE_COST,
} from "../../data/movement.ts";
import {
  armyFightValue,
  parleyPercent,
  terrainProfile,
  type TerrainProfile,
} from "./effects.ts";
import { getCreature } from "../../data/creatures.ts";
import { fightValue } from "./progression.ts";
import {
  DIRECTIONS_8,
  type GameMap,
  type Terrain,
  inBounds,
  isPassable,
} from "../map/types.ts";
import {
  BOARD_STEP_COST,
  LILY_ROAD_COST,
  SEA_STEP_COST,
} from "../../data/naval.ts";
import {
  isAfloat,
  isMoored,
  isNavalMap,
  seaMask,
  seaMaxOf,
  seafaringRank,
  shipsOf,
  toLandPoints,
  toSeaPoints,
} from "./naval.ts";
import { gateOpen, inSanctuary, isPickup } from "./site-state.ts";
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
  /**
   * The final step onto a pickup (bead bzc.49): the hero takes it from the
   * cell before and does not move. Absent: false.
   */
  pickup?: boolean;
  /**
   * Set when the hero stands on this step's cell and it is the entrance of
   * a visitable building that is not the path's target (bead bzc.107): the
   * id of that building. Paths only do this when no way round exists, so
   * the preview marks the step. Absent: no building.
   */
  building?: string;
  /**
   * Naval paths only (bead bzc.149): the hero is afloat after this step,
   * and the step's cost is in sea points (a boarding's cost is in land
   * points, a landing's in the points it used up). Absent: ashore.
   */
  afloat?: boolean;
  /** Naval: this step boards the moored ship of this id (an anchor mark). */
  board?: string;
  /** Naval: this step lands from the ship. */
  land?: boolean;
  /** Naval: the landing ends the day (no Seafaring; "lands: day ends"). */
  endsDay?: boolean;
  /**
   * Naval paths only: points left after this step on its day, in the
   * element the hero is then in (exact conversions applied).
   */
  left?: number;
}

/** Whether the hero ends up standing on this step's cell. */
export function standsOn(step: {
  readonly attack: boolean;
  readonly pickup?: boolean;
}): boolean {
  return !step.attack && step.pickup !== true;
}

export interface Path {
  /** Steps after the hero's cell, in order. */
  steps: PathStep[];
  /** Total movement cost. */
  total: number;
  /**
   * Set only on a walk planned with `throughGuards` (bead bzc.77): the
   * target lies beyond this neutral stack's zone of control, and the path
   * ends with the fight against it instead of reaching the target.
   */
  blockedBy?: string;
  /**
   * Set only on a walk planned with `throughGuards` (bead bzc.79): the
   * target lies beyond this object (a visit that stops the hero, or a
   * pickup in the way), and the path ends with visiting or taking it
   * instead of reaching the target. With `blockedBy` too (a pickup in a
   * zone of control), the fight comes first.
   */
  stopsAt?: string;
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
  /**
   * Entrance cell -> the visitable building there (bead bzc.107; first in
   * map order): every mine, town, dwelling, site, bank or waystone still
   * on the map, whether or not its visit stops this hero (own towns and
   * mines, spent sites too). Paths go round them unless they are the
   * target. Pickups and gone objects are not buildings.
   */
  buildings: Map<number, string>;
  /**
   * Cell index -> uncollected pickup lying there (bead bzc.49). Those cells
   * are also in objectBlocked: taken from a next cell, never entered.
   */
  pickupAt: Map<number, string>;
  /** Explored flags of the hero's player, or null to ignore fog. */
  explored: boolean[] | null;
  /**
   * Move cost of a forest cell while the hero walks the Green Road
   * (RULES_V2 2.8), or null: forests are impassable.
   */
  forestCost: number | null;
  /** The sea graph on a naval map (bead bzc.149); absent or null: dry. */
  naval?: NavalMove | null;
  /**
   * Lily Road today (NAVAL 7.1, bead bzc.154), or absent / null: shallow
   * water cells ({@link isLilyCell}) are crossed on lily pads at `cost` a
   * step (283 diagonally) but never stood on at a walk's end, and the
   * whole crossing, the step back onto land included, must fit in `mp`,
   * the hero's points now (the spell ends with the day).
   */
  lily?: { readonly cost: number; readonly mp: number } | null;
}

/** What planning at sea needs (MoveContext.naval). */
export interface NavalMove {
  /** Per cell 1 when it is sea (naval.ts seaMask). */
  sea: Uint8Array;
  /** Cell -> moored ship there (boardable from a shore, closed to ships). */
  moored: Map<number, string>;
  /** Today's maxima: land (hero.maxMp) and sea (seaMaxOf). */
  landMax: number;
  seaMax: number;
  /** Points now, in the element of the hero's cell. */
  mp: number;
  /** The hero is aboard a ship now. */
  afloat: boolean;
  /** Seafaring rank: from 1 a landing is an ordinary step. */
  seafaring: number;
}

/** Green Road: forest cells cost this much today (RULES_V2 2.8). */
export const GREEN_ROAD_MOVE_COST = 200;

export interface PathOptions {
  /** Plan through unexplored cells too (tests, AI). Default false. */
  ignoreFog?: boolean;
  /**
   * When no single walk reaches the target (bead bzc.77): plan the walk up
   * to the first guard on the cheapest way that crosses as few zone
   * cells as it can, ending with the fight against it (a stop in its zone
   * plus the attack step onto it; `Path.blockedBy` names the stack). The
   * walk stops there, as moveHeroAlong does for any path. Stacks standing
   * in a gap, visits and pickups in the way end the planned walk the same
   * way (bead bzc.79: `Path.blockedBy` or `Path.stopsAt`), so every target
   * the hero can get to over several walks gets a plan. Default false: the
   * AI and every other caller still get null.
   */
  throughGuards?: boolean;
}

/**
 * Object kinds whose entrance can be a visit stop; the same kinds are the
 * buildings paths go round (see moveContext).
 */
const VISIT_KINDS: ReadonlySet<string> = new Set([
  "mine",
  "town",
  "dwelling",
  "site",
  "bank",
  "artifact",
  "teleport",
]);

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
  const buildings = new Map<number, string>();
  const pickupAt = new Map<number, string>();
  const collected = new Set(state.collected);
  // Adventure magic (src/core/magic/adventure.ts): Parley and Green Road.
  const magic = state.magic?.heroes[hero.id];
  const parley = new Set(
    magic?.parleyDay === state.day ? (magic.parley ?? []) : [],
  );
  const forestCost =
    magic?.greenRoadDay === state.day ? GREEN_ROAD_MOVE_COST : null;
  // Lily Road (NAVAL 7.1): shallow water on lily pads, today only.
  const lily =
    magic?.lilyRoadDay === state.day
      ? { cost: LILY_ROAD_COST, mp: hero.mp }
      : null;
  // Silver Tongue: neutral stacks at most this share of the army's FV
  // have no zone of control against the hero (fight values, never chance).
  const parleyPct = parleyPercent(hero);
  const armyFv = parleyPct > 0 ? armyFightValue(hero) : 0;
  // Naval maps: zones of control cover only their own element (2.7).
  const sea = isNavalMap(map) ? seaMask(map) : null;
  for (const obj of map.objects) {
    for (const [x, y] of obj.blocked) objectBlocked.add(y * map.width + x);
    const entrance = obj.y * map.width + obj.x;
    if (isPickup(obj)) {
      if (!collected.has(obj.id)) {
        objectBlocked.add(entrance);
        pickupAt.set(entrance, obj.id);
      }
      continue;
    }
    if (
      VISIT_KINDS.has(obj.kind) &&
      !collected.has(obj.id) &&
      !buildings.has(entrance)
    ) {
      buildings.set(entrance, obj.id);
    }
    switch (obj.kind) {
      case "monster": {
        const monster = state.monsters[obj.id];
        if (monster === undefined) break;
        monsterAt.set(monster.y * map.width + monster.x, monster.id);
        if (parley.has(monster.id)) break;
        if (
          parleyPct > 0 &&
          monster.count * fightValue(getCreature(monster.creature)) * 100 <=
            armyFv * parleyPct
        )
          break;
        for (const [dx, dy] of DIRECTIONS_8) {
          const gx = monster.x + dx;
          const gy = monster.y + dy;
          if (!inBounds(map, gx, gy)) continue;
          const i = gy * map.width + gx;
          if (sea !== null && sea[i] !== sea[monster.y * map.width + monster.x])
            continue;
          const list = guards.get(i);
          if (list === undefined) guards.set(i, [monster.id]);
          else list.push(monster.id);
        }
        break;
      }
      case "pickup":
        break;
      case "mine":
        if (state.mines[obj.id]?.owner !== hero.owner) stops.add(entrance);
        break;
      case "town":
        if (state.towns[obj.id]?.owner !== hero.owner) stops.add(entrance);
        break;
      case "dwelling":
      case "site":
      case "bank":
      case "artifact":
      case "teleport":
        if (!collected.has(obj.id)) stops.add(entrance);
        break;
      case "gate":
        // A closed gate is a wall for this player (bead bzc.13).
        if (!gateOpen(state, obj, hero.owner)) objectBlocked.add(entrance);
        break;
      case "hero-start":
      case "buried":
      case "boat":
        break;
    }
  }
  const enemyHeroAt = new Map<number, string>();
  const friendAt = new Set<number>();
  for (const other of state.heroes) {
    if (!other.alive || other.id === hero.id) continue;
    const i = other.y * map.width + other.x;
    if (other.owner === hero.owner) friendAt.add(i);
    else if (inSanctuary(state, other.x, other.y)) objectBlocked.add(i);
    else enemyHeroAt.set(i, other.id);
  }
  const player = state.players.find((p) => p.id === hero.owner);
  let naval: NavalMove | null = null;
  if (sea !== null) {
    const moored = new Map<number, string>();
    for (const ship of shipsOf(state)) {
      if (isMoored(state, ship))
        moored.set(ship.y * map.width + ship.x, ship.id);
    }
    naval = {
      sea,
      moored,
      landMax: hero.maxMp,
      seaMax: seaMaxOf(state, hero),
      mp: hero.mp,
      afloat: isAfloat(state, hero),
      seafaring: seafaringRank(hero),
    };
  }
  return {
    map,
    nativeTerrain: terrainProfile(hero),
    objectBlocked,
    monsterAt,
    enemyHeroAt,
    friendAt,
    guards,
    stops,
    buildings,
    pickupAt,
    explored: options.ignoreFog === true ? null : (player?.explored ?? null),
    forestCost,
    ...(naval === null ? {} : { naval }),
    ...(lily === null ? {} : { lily }),
  };
}

/**
 * Whether Lily Road lets the hero cross (x, y) today (NAVAL 7.1): shallow
 * water (not deep), explored, with no object (a whirlpool, a sea site's
 * entrance, a pickup), stack, hero or moored ship on it, outside every
 * zone of control. Such a cell is crossed, never the end of a walk.
 */
export function isLilyCell(ctx: MoveContext, x: number, y: number): boolean {
  if (ctx.lily === undefined || ctx.lily === null) return false;
  if (!inBounds(ctx.map, x, y)) return false;
  const i = y * ctx.map.width + x;
  const cell = ctx.map.cells[i];
  if (cell === undefined || cell.terrain !== "water" || cell.deep === true)
    return false;
  if (cell.obstacle !== "none" || cell.prop === true) return false;
  if (
    ctx.objectBlocked.has(i) ||
    ctx.monsterAt.has(i) ||
    ctx.enemyHeroAt.has(i) ||
    ctx.friendAt.has(i) ||
    ctx.guards.has(i) ||
    ctx.stops.has(i) ||
    ctx.buildings.has(i) ||
    ctx.pickupAt.has(i) ||
    ctx.naval?.moored.has(i) === true
  )
    return false;
  return ctx.explored === null || ctx.explored[i] === true;
}

/** A Lily Road step onto a water cell: 200, or 283 diagonally. */
export function lilyStepCost(
  ctx: MoveContext,
  fx: number,
  fy: number,
  tx: number,
  ty: number,
): number {
  const base = ctx.lily?.cost ?? LILY_ROAD_COST;
  return fx !== tx && fy !== ty ? diagonalCost(base) : base;
}

/** Whether (x, y) is a water cell (a hero on foot there is on lily pads). */
export function isWaterCell(map: GameMap, x: number, y: number): boolean {
  return map.cells[y * map.width + x]?.terrain === "water";
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

/**
 * Whether a walk planned through guards (PathOptions.throughGuards) may
 * cross (x, y): as canEnter, but a neutral stack's cell and an uncollected
 * pickup's cell count as open ground, since beating the stack or taking
 * the pickup frees them (bead bzc.79: a stack or a pickup in a one-cell gap
 * is the only way on, and the planned walk ends at it anyway).
 */
function canCrossPlanning(ctx: MoveContext, x: number, y: number): boolean {
  if (canEnter(ctx, x, y)) return true;
  if (!inBounds(ctx.map, x, y)) return false;
  const i = y * ctx.map.width + x;
  const cell = ctx.map.cells[i];
  if (cell === undefined) return false;
  if (ctx.explored !== null && ctx.explored[i] !== true) return false;
  if (ctx.monsterAt.has(i)) {
    return (
      !isImpassableCell(ctx, x, y) &&
      !ctx.enemyHeroAt.has(i) &&
      !ctx.friendAt.has(i)
    );
  }
  // A pickup cell is in objectBlocked; the ground under it must be open.
  return ctx.pickupAt.has(i) && isPassable(cell);
}

/**
 * True when a diagonal step from (fx, fy) to (tx, ty) cuts a blocked corner.
 * Naval maps (bead bzc.149): at sea a corner is closed when it is not sea
 * or an object blocks it (a ship never squeezes between two coasts); a
 * step across the shore (boarding, landing, an attack or a pickup across
 * it) is cut only by corners closed to both a walker and a ship.
 */
export function cutsCorner(
  ctx: MoveContext,
  fx: number,
  fy: number,
  tx: number,
  ty: number,
): boolean {
  if (fx === tx || fy === ty) return false;
  const nav = ctx.naval;
  if (nav === undefined || nav === null) {
    return isImpassableCell(ctx, tx, fy) && isImpassableCell(ctx, fx, ty);
  }
  const w = ctx.map.width;
  const fromSea = nav.sea[fy * w + fx] === 1;
  const toSea = nav.sea[ty * w + tx] === 1;
  const closed = (x: number, y: number): boolean => {
    if (fromSea && toSea) return closedToShip(ctx, nav, x, y);
    if (!fromSea && !toSea) return isImpassableCell(ctx, x, y);
    return isImpassableCell(ctx, x, y) && closedToShip(ctx, nav, x, y);
  };
  return closed(tx, fy) && closed(fx, ty);
}

/** Not sea, or blocked by an object: closed to a ship (corners). */
function closedToShip(
  ctx: MoveContext,
  nav: NavalMove,
  x: number,
  y: number,
): boolean {
  if (!inBounds(ctx.map, x, y)) return true;
  const i = y * ctx.map.width + x;
  return nav.sea[i] !== 1 || ctx.objectBlocked.has(i);
}

/**
 * What an ordinary step does on a naval map (bead bzc.149); "lily" is a
 * step on foot onto shallow water under Lily Road (bead bzc.154).
 */
export type NavalStepKind = "walk" | "sail" | "board" | "land" | "lily";

/**
 * The kind of an ordinary step (not an attack or a pickup step) on a
 * naval map, or null when it may not be taken: walk (land to land), sail
 * (sea to sea, onto a free sea cell), board (a shore cell onto a moored
 * ship), land (the ship onto a free land cell) or lily (on foot onto a
 * Lily Road water cell). `planning` lets stacks and pickups count as open
 * ground, as canCrossPlanning does. `onFoot`: the hero stands on lily pads
 * on (fx, fy), not aboard a ship; from there it may only go on over lily
 * pads or step onto land.
 */
export function navalStepKind(
  ctx: MoveContext,
  fx: number,
  fy: number,
  tx: number,
  ty: number,
  planning = false,
  onFoot = false,
): NavalStepKind | null {
  const nav = ctx.naval;
  if (nav === undefined || nav === null) return null;
  if (!inBounds(ctx.map, tx, ty)) return null;
  const w = ctx.map.width;
  const ti = ty * w + tx;
  const fromSea = !onFoot && nav.sea[fy * w + fx] === 1;
  if (!fromSea && isLilyCell(ctx, tx, ty)) {
    return cutsCorner(ctx, fx, fy, tx, ty) ? null : "lily";
  }
  if (onFoot && isWaterCell(ctx.map, tx, ty)) return null;
  if (nav.sea[ti] !== 1) {
    const ok = planning ? canCrossPlanning(ctx, tx, ty) : canEnter(ctx, tx, ty);
    if (!ok || cutsCorner(ctx, fx, fy, tx, ty)) return null;
    return fromSea ? "land" : "walk";
  }
  if (ctx.explored !== null && ctx.explored[ti] !== true) return null;
  if (ctx.enemyHeroAt.has(ti) || ctx.friendAt.has(ti)) return null;
  const crossable = planning && (ctx.monsterAt.has(ti) || ctx.pickupAt.has(ti));
  if (!crossable && (ctx.objectBlocked.has(ti) || ctx.monsterAt.has(ti))) {
    return null;
  }
  if (cutsCorner(ctx, fx, fy, tx, ty)) return null;
  if (fromSea) return nav.moored.has(ti) ? null : "sail";
  return nav.moored.has(ti) && !crossable ? "board" : null;
}

/**
 * The cost of a step of a kind, in the points it is paid in: land points
 * for a walk or a boarding, sea points for sailing; a landing costs the
 * ordinary land cost with Seafaring and -1 ("all that is left") without.
 */
export function navalStepCost(
  ctx: MoveContext,
  kind: NavalStepKind,
  fx: number,
  fy: number,
  tx: number,
  ty: number,
): number {
  const diagonal = fx !== tx && fy !== ty;
  if (kind === "lily") return lilyStepCost(ctx, fx, fy, tx, ty);
  if (kind === "sail") {
    return diagonal ? diagonalCost(SEA_STEP_COST) : SEA_STEP_COST;
  }
  if (kind === "board") {
    return diagonal ? diagonalCost(BOARD_STEP_COST) : BOARD_STEP_COST;
  }
  if (kind === "land" && (ctx.naval?.seafaring ?? 0) < 1) return -1;
  return stepCost(ctx.map, ctx.nativeTerrain, fx, fy, tx, ty, ctx.forestCost);
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
  else if (from.road && to.road) {
    // A diagonal across a road corner costs more than the two road steps
    // round it, so heroes walk the road as drawn (RULES_V2 3.9).
    if (
      fx !== tx &&
      fy !== ty &&
      (map.cells[fy * map.width + tx]?.road === true ||
        map.cells[ty * map.width + fx]?.road === true)
    )
      return ROAD_CORNER_DIAGONAL_COST;
    base = ROAD_MOVE_COST;
  } else if (to.terrain === profile.native) base = NATIVE_MOVE_COST;
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

/** Search-order cost of taking a pickup from a stop cell (see findPath). */
const STOP_BEFORE_PICKUP = 1_000_000;

/**
 * Search-order cost of standing on a building's entrance that is not the
 * target (bead bzc.107): more than any walk round it, so a path passes a
 * building only when no way round exists; less than a zone crossing
 * (ZONE_CROSSING), which planning through guards counts first. The AI's
 * reach (src/core/ai/reach.ts) uses it the same way.
 */
export const BUILDING_DETOUR = 10_000_000;

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
 * an `attack` step onto it; targeting an uncollected pickup gives a path
 * to the best next cell plus a `pickup` step onto it (just that step when
 * the hero already stands next to it).
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
  let steps = findPathInContext(ctx, hero.x, hero.y, tx, ty);
  let blockedBy: string | undefined;
  let stopsAt: string | undefined;
  if (steps === null && options.throughGuards === true) {
    const planned = pathToFirstStop(state, ctx, hero, tx, ty);
    if (planned !== null) ({ steps, guard: blockedBy, stopsAt } = planned);
  }
  if (steps === null) return null;
  const nav = ctx.naval;
  // Naval maps: days and points left by replaying the exact conversions.
  if (nav !== undefined && nav !== null) steps = replayNavalSteps(steps, nav);
  const days =
    nav !== undefined && nav !== null
      ? steps.map((s) => s.day)
      : assignDays(
          steps.map((s) => s.cost),
          hero.mp,
          hero.maxMp,
        );
  const goal = ty * state.map.width + tx;
  const withDays = steps.map((s, i) => {
    const at = s.y * state.map.width + s.x;
    const building =
      at !== goal && standsOn(s) ? ctx.buildings.get(at) : undefined;
    return {
      ...s,
      day: days[i] ?? 0,
      ...(building === undefined ? {} : { building }),
    };
  });
  const last = withDays[withDays.length - 1];
  return {
    steps: withDays,
    total: last?.total ?? 0,
    ...(blockedBy === undefined ? {} : { blockedBy }),
    ...(stopsAt === undefined ? {} : { stopsAt }),
  };
}

/** The visited object whose entrance is cell `i` (first in map order). */
function entranceAt(ctx: MoveContext, i: number): string | undefined {
  const w = ctx.map.width;
  return ctx.map.objects.find(
    (o) => VISIT_KINDS.has(o.kind) && o.y * w + o.x === i,
  )?.id;
}

/**
 * The walk to the first thing that ends it on the way to (tx, ty)
 * (PathOptions.throughGuards): the cheapest path that may cross zones of
 * control, stacks, visits and pickups (as few as it can), cut at the first
 * one it meets:
 * - a zone cell: the walk stops there and ends with the attack step onto
 *   the stack that moveHeroAlong would fight (the cell's first guard in map
 *   object order); `guard` names it;
 * - a stack with no zone against the hero (Parley, Silver Tongue) standing
 *   in the way: the attack step onto it; `guard` names it;
 * - an entrance whose visit stops the hero: the walk ends with the visit;
 *   `stopsAt` names the object;
 * - an uncollected pickup in the way: the pickup step; `stopsAt` names it.
 * Null when even that path does not exist.
 */
function pathToFirstStop(
  state: GameState,
  ctx: MoveContext,
  hero: HeroState,
  tx: number,
  ty: number,
): { steps: PathStep[]; guard?: string; stopsAt?: string } | null {
  const through = findPathInContext(ctx, hero.x, hero.y, tx, ty, true);
  if (through === null) return null;
  const w = ctx.map.width;
  const k = through.findIndex((s) => {
    if (!standsOn(s)) return false;
    const i = s.y * w + s.x;
    return (
      ctx.guards.has(i) ||
      ctx.monsterAt.has(i) ||
      ctx.stops.has(i) ||
      ctx.pickupAt.has(i)
    );
  });
  const crossed = through[k];
  if (crossed === undefined) return null;
  const at = crossed.y * w + crossed.x;
  const before = through[k - 1];
  const onStack = ctx.monsterAt.get(at);
  if (onStack !== undefined) {
    // A stack with no zone against this hero (Parley, Silver Tongue) that
    // still stands in the way: walk up to it and fight it.
    return {
      steps: [
        ...through.slice(0, k),
        { ...crossed, cost: 0, total: before?.total ?? 0, attack: true },
      ],
      guard: onStack,
    };
  }
  const pickup = ctx.pickupAt.get(at);
  if (pickup !== undefined) {
    // Taken from the cell before, as a pickup target is (bead bzc.49); in
    // a zone of control its guard attacks first (moveHeroAlong).
    const guard = ctx.guards.get(at)?.[0];
    return {
      ...(guard === undefined ? {} : { guard }),
      steps: [
        ...through.slice(0, k),
        {
          ...crossed,
          cost: 0,
          total: before?.total ?? 0,
          attack: false,
          pickup: true,
        },
      ],
      stopsAt: pickup,
    };
  }
  const stop = crossed;
  if (!ctx.guards.has(at)) {
    const visit = entranceAt(ctx, at);
    const steps = through.slice(0, k + 1);
    return visit === undefined ? { steps } : { steps, stopsAt: visit };
  }
  const guard = ctx.guards.get(at)?.[0];
  const monster = guard === undefined ? undefined : state.monsters[guard];
  if (guard === undefined || monster === undefined) return null;
  const steps = through.slice(0, k + 1);
  if (!cutsCorner(ctx, stop.x, stop.y, monster.x, monster.y)) {
    steps.push({
      x: monster.x,
      y: monster.y,
      cost: 0,
      total: stop.total,
      day: 0,
      attack: true,
    });
  }
  return { steps, guard };
}

/**
 * Search-order cost of entering a zone of control, a stack's cell, a
 * visit or a pickup when planning through guards: more than any walk, so
 * the path crosses as few of them as it can, and only then is cheapest.
 */
const ZONE_CROSSING = 100_000_000;

/**
 * A* in a prepared context; `day` is left 0. Building entrances other
 * than the target are stood on only when no way round exists (bead
 * bzc.107; findPath marks them). With `throughGuards` no zone
 * of control or visit ends the walk, and stacks and pickups in the way can
 * be crossed (see pathToFirstStop): callers cut the result at the first.
 */
export function findPathInContext(
  ctx: MoveContext,
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  throughGuards = false,
): PathStep[] | null {
  if (ctx.naval !== undefined && ctx.naval !== null) {
    return findNavalPath(ctx, ctx.naval, sx, sy, tx, ty, throughGuards);
  }
  const { map } = ctx;
  if (!inBounds(map, tx, ty) || (sx === tx && sy === ty)) return null;
  const w = map.width;
  const start = sy * w + sx;
  const goal = ty * w + tx;
  const attackGoal = ctx.monsterAt.has(goal) || ctx.enemyHeroAt.has(goal);
  const pickupGoal = !attackGoal && ctx.pickupAt.has(goal);
  if (ctx.explored !== null && ctx.explored[goal] !== true) return null;
  if (!attackGoal && !pickupGoal && !canEnter(ctx, tx, ty)) return null;

  const g = new Map<number, number>([[start, 0]]);
  const parent = new Map<number, number>();
  const closed = new Set<number>();
  const open = new MinHeap();
  const shrink = attackGoal || pickupGoal ? 1 : 0;
  open.push(heuristic(sx, sy, tx, ty, shrink), start);
  // Lily Road (bead bzc.154): points really spent, to keep a crossing
  // within today; absent unless the spell is on.
  const lily = ctx.lily ?? null;
  const real = lily === null ? null : new Map<number, number>([[start, 0]]);

  while (open.size > 0) {
    const cur = open.pop();
    if (closed.has(cur)) continue;
    if (cur === goal) break;
    closed.add(cur);
    const cx = cur % w;
    const cy = (cur - cx) / w;
    const stop = cur !== start && isStopCell(ctx, cx, cy);
    // Planning through guards nothing ends the walk: callers cut it at the
    // first stop (pathToFirstStop).
    const halt = !throughGuards && stop;
    const gc = g.get(cur) ?? 0;
    // On lily pads: only on over the water or back onto land, today.
    const onPads = lily !== null && isWaterCell(map, cx, cy);
    for (const [dx, dy] of DIRECTIONS_8) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!inBounds(map, nx, ny)) continue;
      const ni = ny * w + nx;
      if (closed.has(ni)) continue;
      let cost: number;
      let spent = 0;
      if (attackGoal && ni === goal) {
        if (onPads || cutsCorner(ctx, cx, cy, nx, ny)) continue;
        cost = 0;
      } else if (pickupGoal && ni === goal) {
        // Taken from where the hero stands; from a cell whose zone or
        // visit stops the walk first only when no other cell will do
        // (the search order only: the step itself costs nothing).
        if (onPads || cutsCorner(ctx, cx, cy, nx, ny)) continue;
        cost = stop ? STOP_BEFORE_PICKUP : 0;
      } else {
        if (halt) continue;
        const pads = lily !== null && ni !== goal && isLilyCell(ctx, nx, ny);
        if (
          !pads &&
          !(throughGuards ? canCrossPlanning : canEnter)(ctx, nx, ny)
        ) {
          continue;
        }
        if (cutsCorner(ctx, cx, cy, nx, ny)) continue;
        cost = pads
          ? lilyStepCost(ctx, cx, cy, nx, ny)
          : stepCost(map, ctx.nativeTerrain, cx, cy, nx, ny, ctx.forestCost);
        spent = cost;
        // A crossing and the step off it happen today.
        if (
          lily !== null &&
          (pads || onPads) &&
          (real?.get(cur) ?? 0) + cost > lily.mp
        )
          continue;
        // Round buildings that are not the target (bead bzc.107).
        if (ni !== goal && ctx.buildings.has(ni)) cost += BUILDING_DETOUR;
        if (
          throughGuards &&
          (ctx.guards.has(ni) ||
            ctx.monsterAt.has(ni) ||
            ctx.stops.has(ni) ||
            ctx.pickupAt.has(ni))
        ) {
          cost += ZONE_CROSSING;
        }
      }
      const ng = gc + cost;
      const old = g.get(ni);
      if (old !== undefined && old <= ng) continue;
      g.set(ni, ng);
      real?.set(ni, (real.get(cur) ?? 0) + spent);
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
    const pickup = pickupGoal && c === goal;
    const px = prev % w;
    const py = Math.floor(prev / w);
    const cx = c % w;
    const cy = Math.floor(c / w);
    const cost =
      attack || pickup
        ? 0
        : lily !== null && isWaterCell(map, cx, cy)
          ? lilyStepCost(ctx, px, py, cx, cy)
          : stepCost(map, ctx.nativeTerrain, px, py, cx, cy, ctx.forestCost);
    total += cost;
    steps.push({
      x: c % w,
      y: Math.floor(c / w),
      cost,
      total,
      day: 0,
      attack,
      ...(pickup ? { pickup: true } : {}),
    });
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
  if (ctx.naval !== undefined && ctx.naval !== null) {
    return reachableNaval(ctx, ctx.naval, hero.x, hero.y, limit);
  }
  const { map } = ctx;
  const w = map.width;
  const start = hero.y * w + hero.x;
  out.set(start, 0);
  const open = new MinHeap();
  open.push(0, start);
  const closed = new Set<number>();
  // Lily Road (bead bzc.154): crossings within today, never a stand.
  const lily = ctx.lily ?? null;
  while (open.size > 0) {
    const cur = open.pop();
    if (closed.has(cur)) continue;
    closed.add(cur);
    const cx = cur % w;
    const cy = (cur - cx) / w;
    if (cur !== start && isStopCell(ctx, cx, cy)) continue;
    const gc = out.get(cur) ?? 0;
    const onPads = lily !== null && isWaterCell(map, cx, cy);
    for (const [dx, dy] of DIRECTIONS_8) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!inBounds(map, nx, ny)) continue;
      const ni = ny * w + nx;
      if (closed.has(ni)) continue;
      const pads = lily !== null && isLilyCell(ctx, nx, ny);
      if (!pads && !canEnter(ctx, nx, ny)) continue;
      if (cutsCorner(ctx, cx, cy, nx, ny)) continue;
      const ng =
        gc +
        (pads
          ? lilyStepCost(ctx, cx, cy, nx, ny)
          : stepCost(map, ctx.nativeTerrain, cx, cy, nx, ny, ctx.forestCost));
      if (ng > limit) continue;
      if (lily !== null && (pads || onPads) && ng > lily.mp) continue;
      const old = out.get(ni);
      if (old !== undefined && old <= ng) continue;
      out.set(ni, ng);
      open.push(ng, ni);
    }
  }
  if (lily !== null)
    for (const i of [...out.keys()])
      if (i !== start && isWaterCell(map, i % w, Math.floor(i / w)))
        out.delete(i);
  return out;
}

// ------------------------------------------------------------ the sea

/** Land points per sea point today (landMax / seaMax; 1 when unknown). */
export function seaToLand(nav: NavalMove): number {
  return nav.seaMax > 0 && nav.landMax > 0 ? nav.landMax / nav.seaMax : 1;
}

/**
 * The rest of the day at `real` land-equivalent points spent (the day's
 * start budget `mp0`, then landMax a day): what a day-ending landing uses
 * up. A day spent to the last point waits for the next whole day.
 */
export function restOfDay(real: number, mp0: number, landMax: number): number {
  const day = landMax > 0 ? landMax : 1;
  const left = real < mp0 ? mp0 - real : day - ((real - mp0) % day);
  return left > 0 ? left : day;
}

/** Whether a plain (not attack or pickup) goal can ever be stood on. */
function navalGoalOpen(
  ctx: MoveContext,
  nav: NavalMove,
  goal: number,
): boolean {
  const w = ctx.map.width;
  const x = goal % w;
  const y = (goal - x) / w;
  if (nav.sea[goal] !== 1) return canEnter(ctx, x, y);
  return (
    !ctx.objectBlocked.has(goal) &&
    !ctx.friendAt.has(goal) &&
    !ctx.enemyHeroAt.has(goal) &&
    !ctx.monsterAt.has(goal)
  );
}

/**
 * findPathInContext on a naval map (bead bzc.149): A* over land and sea
 * with boardings and landings (navalStepKind), the same stop, attack,
 * pickup, building-detour and through-guards rules as on land. Search
 * costs are land-equivalent points (see the module comment); the steps'
 * `cost` is in the points each is paid in and `day` is left 0 (findPath
 * replays the path with replayNavalSteps).
 */
function findNavalPath(
  ctx: MoveContext,
  nav: NavalMove,
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  throughGuards: boolean,
): PathStep[] | null {
  const { map } = ctx;
  if (!inBounds(map, tx, ty) || (sx === tx && sy === ty)) return null;
  const w = map.width;
  const start = sy * w + sx;
  const goal = ty * w + tx;
  const attackGoal = ctx.monsterAt.has(goal) || ctx.enemyHeroAt.has(goal);
  const pickupGoal = !attackGoal && ctx.pickupAt.has(goal);
  if (ctx.explored !== null && ctx.explored[goal] !== true) return null;
  if (!attackGoal && !pickupGoal && !navalGoalOpen(ctx, nav, goal)) {
    return null;
  }
  const ratio = seaToLand(nav);
  const mp0 = nav.afloat ? nav.mp * ratio : nav.mp;
  // The heuristic at the cheapest step anywhere (a road, or the sea).
  const hScale = Math.min(1, (SEA_STEP_COST * ratio) / ROAD_MOVE_COST);

  // Search nodes: a cell index, or N + a cell index for the hero on foot
  // on that water cell's lily pads (Lily Road, bead bzc.154), so a sea
  // cell crossed on foot and the same cell sailed are different states.
  const N = w * map.height;
  const g = new Map<number, number>([[start, 0]]);
  const real = new Map<number, number>([[start, 0]]);
  const parent = new Map<number, number>();
  const closed = new Set<number>();
  const open = new MinHeap();
  const shrink = attackGoal || pickupGoal ? 1 : 0;
  open.push(heuristic(sx, sy, tx, ty, shrink) * hScale, start);

  while (open.size > 0) {
    const cur = open.pop();
    if (closed.has(cur)) continue;
    if (cur === goal) break;
    closed.add(cur);
    const onFoot = cur >= N;
    const cell = onFoot ? cur - N : cur;
    const cx = cell % w;
    const cy = (cell - cx) / w;
    const stop = cur !== start && isStopCell(ctx, cx, cy);
    const halt = !throughGuards && stop;
    const gc = g.get(cur) ?? 0;
    const rc = real.get(cur) ?? 0;
    for (const [dx, dy] of DIRECTIONS_8) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!inBounds(map, nx, ny)) continue;
      const ni = ny * w + nx;
      let node = ni;
      let cost: number;
      let spent: number;
      if (attackGoal && ni === goal) {
        if (onFoot || cutsCorner(ctx, cx, cy, nx, ny)) continue;
        cost = 0;
        spent = 0;
      } else if (pickupGoal && ni === goal) {
        if (onFoot || cutsCorner(ctx, cx, cy, nx, ny)) continue;
        cost = stop ? STOP_BEFORE_PICKUP : 0;
        spent = 0;
      } else {
        if (halt) continue;
        const kind = navalStepKind(ctx, cx, cy, nx, ny, throughGuards, onFoot);
        if (kind === null) continue;
        const c = navalStepCost(ctx, kind, cx, cy, nx, ny);
        spent =
          kind === "sail"
            ? c * ratio
            : c < 0
              ? restOfDay(rc, mp0, nav.landMax)
              : c;
        // Lily pads: the crossing and the step off it happen today.
        if ((kind === "lily" || onFoot) && rc + spent > mp0) continue;
        if (kind === "lily") node = N + ni;
        cost = spent;
        if (ni !== goal && ctx.buildings.has(ni)) cost += BUILDING_DETOUR;
        if (
          throughGuards &&
          (ctx.guards.has(ni) ||
            ctx.monsterAt.has(ni) ||
            ctx.stops.has(ni) ||
            ctx.pickupAt.has(ni))
        ) {
          cost += ZONE_CROSSING;
        }
      }
      if (closed.has(node)) continue;
      const ng = gc + cost;
      const old = g.get(node);
      if (old !== undefined && old <= ng) continue;
      g.set(node, ng);
      real.set(node, rc + spent);
      parent.set(node, cur);
      open.push(ng + heuristic(nx, ny, tx, ty, shrink) * hScale, node);
    }
  }

  if (!g.has(goal)) return null;
  const nodes: number[] = [];
  for (let c = goal; c !== start; c = parent.get(c) ?? start) nodes.push(c);
  nodes.reverse();
  const steps: PathStep[] = [];
  let total = 0;
  let prev = start;
  let afloat = nav.afloat;
  for (const node of nodes) {
    const c = node >= N ? node - N : node;
    const prevCell = prev >= N ? prev - N : prev;
    const px = prevCell % w;
    const py = Math.floor(prevCell / w);
    const x = c % w;
    const y = Math.floor(c / w);
    const attack = attackGoal && node === goal;
    const pickup = pickupGoal && node === goal;
    let cost = 0;
    const flags: { board?: string; land?: boolean; endsDay?: boolean } = {};
    if (!attack && !pickup) {
      const kind =
        navalStepKind(ctx, px, py, x, y, throughGuards, prev >= N) ?? "walk";
      const raw = navalStepCost(ctx, kind, px, py, x, y);
      cost = Math.max(0, raw);
      if (kind === "board") {
        const ship = nav.moored.get(c);
        if (ship !== undefined) flags.board = ship;
      }
      if (kind === "land") {
        flags.land = true;
        if (raw < 0) flags.endsDay = true;
      }
      afloat = kind === "sail" || kind === "board";
    }
    total += cost;
    steps.push({
      x,
      y,
      cost,
      total,
      day: 0,
      attack,
      ...(pickup ? { pickup: true } : {}),
      ...(afloat ? { afloat: true } : {}),
      ...flags,
    });
    prev = node;
  }
  return steps;
}

/**
 * Replays planned naval steps from the hero's points now (bead bzc.149):
 * each step's day, its cost in the points it is paid in (a day-ending
 * landing uses up what is left), the running total and the points `left`
 * after it. A boarding converts what is left to sea points, a Seafaring
 * landing converts back; a new day gives the maximum of the element the
 * hero is in.
 */
export function replayNavalSteps(
  steps: readonly PathStep[],
  nav: NavalMove,
): PathStep[] {
  const { landMax, seaMax } = nav;
  let afloat = nav.afloat;
  let left = nav.mp;
  let day = 0;
  let total = 0;
  return steps.map((s) => {
    let cost = s.cost;
    if (s.attack || s.pickup === true) {
      cost = 0;
    } else if (!afloat && s.afloat === true) {
      // A boarding: land points, the rest converted to sea points.
      if (cost > left) {
        day++;
        left = landMax;
      }
      left = toSeaPoints(left - cost, landMax, seaMax);
      afloat = true;
    } else if (afloat && s.afloat !== true) {
      // A landing.
      if (nav.seafaring >= 1) {
        let land = toLandPoints(left, landMax, seaMax);
        if (cost > land) {
          day++;
          land = toLandPoints(seaMax, landMax, seaMax);
        }
        left = land - cost;
      } else {
        if (left <= 0) {
          day++;
          left = seaMax;
        }
        cost = left;
        left = 0;
      }
      afloat = false;
    } else {
      const max = afloat ? seaMax : landMax;
      if (cost > left) {
        day++;
        left = max;
      }
      left -= cost;
    }
    total += cost;
    return { ...s, cost, total, day, left };
  });
}

/**
 * reachableCells on a naval map: the same rules as findNavalPath, costs in
 * land-equivalent points (sea points x landMax / seaMax; a day-ending
 * landing costs the rest of the day, so nothing beyond it is reachable
 * today). `limit` is in the points of the hero's element now.
 */
function reachableNaval(
  ctx: MoveContext,
  nav: NavalMove,
  sx: number,
  sy: number,
  limit: number,
): Map<number, number> {
  const out = new Map<number, number>();
  const { map } = ctx;
  const w = map.width;
  const ratio = seaToLand(nav);
  const budget = nav.afloat ? limit * ratio : limit;
  const mp0 = nav.afloat ? nav.mp * ratio : nav.mp;
  const start = sy * w + sx;
  // Nodes as findNavalPath's: N + cell is the hero on lily pads there
  // (Lily Road), crossed but never reached as a place to stand.
  const N = w * map.height;
  const dist = new Map<number, number>([[start, 0]]);
  const open = new MinHeap();
  open.push(0, start);
  const closed = new Set<number>();
  while (open.size > 0) {
    const cur = open.pop();
    if (closed.has(cur)) continue;
    closed.add(cur);
    const onFoot = cur >= N;
    const cell = onFoot ? cur - N : cur;
    const cx = cell % w;
    const cy = (cell - cx) / w;
    if (cur !== start && isStopCell(ctx, cx, cy)) continue;
    const gc = dist.get(cur) ?? 0;
    for (const [dx, dy] of DIRECTIONS_8) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!inBounds(map, nx, ny)) continue;
      const ni = ny * w + nx;
      const kind = navalStepKind(ctx, cx, cy, nx, ny, false, onFoot);
      if (kind === null) continue;
      const node = kind === "lily" ? N + ni : ni;
      if (closed.has(node)) continue;
      const c = navalStepCost(ctx, kind, cx, cy, nx, ny);
      const ng =
        gc +
        (kind === "sail"
          ? c * ratio
          : c < 0
            ? restOfDay(gc, mp0, nav.landMax)
            : c);
      if (ng > budget) continue;
      if ((kind === "lily" || onFoot) && ng > mp0) continue;
      const old = dist.get(node);
      if (old !== undefined && old <= ng) continue;
      dist.set(node, ng);
      open.push(ng, node);
    }
  }
  for (const [node, cost] of dist) if (node < N) out.set(node, cost);
  return out;
}
