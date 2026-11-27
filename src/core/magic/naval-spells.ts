/**
 * The naval adventure spells' rules (docs/design/NAVAL.md 7.1, bead
 * bzc.154): where Call the Boat brings a ship, which ships Scuttle can
 * reach and what Fair Wind gives. The casting itself (mana, once a day,
 * scrolls) is adventure.ts's; Lily Road is a day flag that pathfinding.ts
 * reads (MoveContext.lily).
 *
 * Every rule refuses on a map that is not naval except Lily Road, which
 * crosses shallow water anywhere (the spell is only drawn on naval maps).
 */
import {
  CALL_THE_BOAT_REACH,
  FAIR_WIND,
  SCUTTLE_REACH,
  SHIP_PRICE,
} from "../../data/naval.ts";
import { dockOccupant } from "../game/harbour.ts";
import {
  findShip,
  isAfloat,
  isMoored,
  isNavalMap,
  isSeaCell,
  isShoreCell,
  shipsOf,
} from "../game/naval.ts";
import { canAfford } from "../game/resources.ts";
import { findPlayer } from "../game/state.ts";
import type { GameState, HeroState, ShipState } from "../game/types.ts";

function chebyshev(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

/** Straight neighbours first, so a called ship is boarded without a corner. */
const BERTH_ORDER: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
  [1, -1],
  [1, 1],
  [-1, 1],
  [-1, -1],
];

/**
 * The free sea cells beside the hero where a called ship can moor: sea, and
 * nothing on them (no ship, hero, sea guard, pickup or entrance; harbour.ts
 * dockOccupant), straight neighbours first.
 */
export function callBerths(
  state: GameState,
  hero: HeroState,
): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (const [dx, dy] of BERTH_ORDER) {
    const c = { x: hero.x + dx, y: hero.y + dy };
    if (!isSeaCell(state.map, c.x, c.y)) continue;
    if (dockOccupant(state, c) !== null) continue;
    out.push(c);
  }
  return out;
}

/** Call the Boat's reach at Power `p`: 10 + 5 x P cells. */
export function callReach(p: number): number {
  return CALL_THE_BOAT_REACH.base + CALL_THE_BOAT_REACH.per * p;
}

/** What Call the Boat would do: bring a ship, or build one. */
export type CallPlan =
  | {
      readonly kind: "move";
      readonly ship: ShipState;
      readonly x: number;
      readonly y: number;
    }
  | { readonly kind: "build"; readonly x: number; readonly y: number };

/**
 * Call the Boat at Power `p` (NAVAL 7.1): the hero, ashore on a shore
 * cell, calls its player's nearest moored ship within reach (Chebyshev;
 * ties to the first in ship order) to a free sea cell beside it, `at` when
 * given, else the first berth; with no ship in reach a new one is built
 * there for the shipyard price. A sentence when it is refused.
 */
export function callTheBoat(
  state: GameState,
  hero: HeroState,
  p: number,
  at: { readonly x?: number; readonly y?: number } = {},
): CallPlan | string {
  if (!isNavalMap(state.map)) return "there is no sea on this map";
  if (isAfloat(state, hero)) return "the hero is already afloat";
  if (!isShoreCell(state.map, hero.x, hero.y))
    return "the hero must stand on a shore beside the sea";
  const berths = callBerths(state, hero);
  let berth = berths[0];
  if (at.x !== undefined && at.y !== undefined) {
    berth = berths.find((b) => b.x === at.x && b.y === at.y);
    if (berth === undefined) return "choose free water next to the hero";
  }
  if (berth === undefined) return "no free water next to the hero";
  const reach = callReach(p);
  let best: ShipState | undefined;
  let bestDist = Infinity;
  for (const ship of shipsOf(state)) {
    if (ship.owner !== hero.owner || !isMoored(state, ship)) continue;
    const d = chebyshev(ship.x, ship.y, hero.x, hero.y);
    if (d <= reach && d < bestDist) {
      best = ship;
      bestDist = d;
    }
  }
  if (best !== undefined) return { kind: "move", ship: best, ...berth };
  const player = findPlayer(state, hero.owner);
  if (player === undefined || !canAfford(player.resources, SHIP_PRICE))
    return `no ship of yours within ${reach} cells, and a new one costs ${SHIP_PRICE.gold} gold and ${SHIP_PRICE.wood} wood`;
  return { kind: "build", ...berth };
}

/** Scuttle's reach at Power `p`: 6 + P cells. */
export function scuttleReach(p: number): number {
  return SCUTTLE_REACH.base + SCUTTLE_REACH.per * p;
}

/** The ships Scuttle can sink from here: moored (empty), any owner, in reach. */
export function scuttleTargets(
  state: GameState,
  hero: HeroState,
  p: number,
): ShipState[] {
  if (!isNavalMap(state.map)) return [];
  const reach = scuttleReach(p);
  return shipsOf(state).filter(
    (s) => isMoored(state, s) && chebyshev(s.x, s.y, hero.x, hero.y) <= reach,
  );
}

/** Why Scuttle at Power `p` cannot sink this ship, or null. */
export function scuttleError(
  state: GameState,
  hero: HeroState,
  p: number,
  shipId: string | undefined,
): string | null {
  if (!isNavalMap(state.map)) return "there is no sea on this map";
  const ship = shipId === undefined ? undefined : findShip(state, shipId);
  if (ship === undefined) return "choose a ship";
  if (!isMoored(state, ship)) return "a hero is aboard that ship";
  const reach = scuttleReach(p);
  if (chebyshev(ship.x, ship.y, hero.x, hero.y) > reach)
    return `the ship is more than ${reach} cells away`;
  return null;
}

/** Fair Wind's gain at Power `p`: 200 + 50 x P sea points, at most 700. */
export function fairWindGain(p: number): number {
  return Math.min(FAIR_WIND.max, FAIR_WIND.base + FAIR_WIND.per * p);
}
